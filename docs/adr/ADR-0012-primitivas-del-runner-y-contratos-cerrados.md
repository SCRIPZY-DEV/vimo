# ADR-0012 — Primitivas del runner y contratos cerrados en el pipeline

- **Estado:** Propuesta
- **Fecha:** 2026-08-20
- **Área:** pipeline
- **Completa a:** [ADR-0010](ADR-0010-pipeline-por-stages-y-migracion-por-modulos.md)

## Problema

La ADR-0010 fijó los **contratos** del sidecar (`PipelineJob` entra, `PipelineEvent` sale)
y dejó deliberadamente libre el **interior** de cada subcomando: «cada handler valida su
forma» (`pipeline/runner/job.ts:20`). Con un dominio eso era prudencia. Con tres, el
resultado medible es que cada dominio reescribe el mismo esqueleto.

**El esqueleto de biblioteca en disco está escrito tres veces.** `music-history.ts` (110
líneas) y `voice-history.ts` (105) son **≈92 % estructuralmente idénticos**: normalizando
`Music`↔`Voice`, divergen en 7 líneas —el `cover.jpg` de música y el prefijo de id `m-`/`v-`—.
`*-history-list.ts` y `*-history-delete.ts` tienen **diff normalizado de 0 líneas**. Y
`characters/character-library.ts:20-60`, escrito esta semana, repite otra vez
`newCharacterId`, `/^[a-zA-Z0-9_-]+$/`, `assertValidCharacterId`, `fileExists` y un
`charactersRoot` que lanza el mismo `missing_projects_root`.

**El cliente HTTP también.** `authHeaders`, `requestSignal` y `rethrowIfCancelled` son
byte-idénticos en `tts/dubvoice.ts:25-46`, `music/evolink.ts:60-75` e `image/`, y
`llm/deepinfra.ts:22,42` los reinlinea sin helper. Los tres bucles de polling
(`music/evolink.ts:188-249`, `tts/elevenlabs.ts:136-187`, `image/evolink.ts:172-232`) son
~60 líneas cada uno con el mismo cuerpo.

**Y ya costó un defecto real:** `tts/elevenlabs.ts:141-147` hace `fetch` crudo en lugar de
pasar por `dubvoiceFetch`, así que el polling de ElevenLabs **perdió el reintento de 429**
que el resto del cliente sí tiene. No es un riesgo hipotético: es la clase de bug que
produce copiar un esqueleto y olvidar una rama.

**Los contratos del borde están abiertos donde deberían estar cerrados:**

| Contrato              | Hoy                                                    | Consecuencia medida                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Código de error       | `code: string` (`runner/failure.ts:5`, `events.ts:50`) | **90 sitios** de construcción, **37 códigos** distintos, ninguna unión; los catálogos de la app son `Record<string, string>` y un código sin mapear cae al genérico en silencio                                                                 |
| Payload               | `payload?: JsonValue` + cast                           | **12 casts** `job.payload as X`, con validación artesanal desigual: `generate-voice.ts` chequea largo de texto pero nunca los 9 campos de `settings`; `choose-music.ts` valida `audioUrl` con `assertHttpUrl` y descarga `coverUrl` sin validar |
| Provider de TTS       | ninguna interfaz                                       | cadenas de `if` en `generate-voice.ts:77-105` y `list-voices.ts:13-32`, más `new Set(['minimax','elevenlabs','edge'])` duplicado literal en ambos archivos, redeclarando en runtime la unión de `types/voices.ts:3`                             |
| Respuesta de provider | `json() as T`                                          | **16 casts** sin validación en `providers/`                                                                                                                                                                                                     |

Restricciones que achican el campo:

- `src/` solo puede hacer `import type` de `pipeline/` (🔒 ADR-0010): cualquier solución
  basada en un **valor** runtime compartido entre ambos lados está descartada de entrada.
- `pipeline/` hoy no tiene **ninguna** dependencia runtime; el bundle viaja dentro de un
  Node SEA.
- No hay framework de tests: un refactor grande y simultáneo no tiene red que lo atrape.

## Decisión

**El `runner/` deja de ser un catálogo de tipos y pasa a ofrecer primitivas: lo que hoy
cada dominio reescribe —biblioteca en disco, cliente HTTP, polling, lectura de payload,
despacho de providers— se extrae a `pipeline/runner/`, y los contratos abiertos del borde
se cierran con uniones y registros exhaustivos.**

La regla que gobierna la extracción: **se extrae con tres copias a la vista, no antes**.
Las cinco primitivas califican hoy; una sexta espera a tener su tercer duplicado.

| Primitiva                          | Archivo                 | Reemplaza                                                                            | Qué varía (y por eso es parámetro)                                                                            |
| ---------------------------------- | ----------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `createDiskLibrary`                | `runner/library.ts`     | 3 copias del esqueleto de historial/biblioteca                                       | subcarpeta, prefijo de id, y `toEntry()` —que deriva rutas absolutas y decide si la entrada es válida—        |
| `requestJson<T>` / `requestBinary` | `runner/http.ts`        | 3 copias de `authHeaders`/`requestSignal`/`rethrowIfCancelled`, 16 casts de `json()` | URL base, headers, timeout, familia de códigos, política de 429                                               |
| `pollUntil<S, R>`                  | `runner/http.ts`        | 3 bucles de ~60 líneas                                                               | endpoint, intervalo, criterio de corte (contador vs reloj) y un `decide(state)` que devuelve unión etiquetada |
| `readPayload`                      | `runner/payload.ts`     | 12 casts `job.payload as X`                                                          | el lector por campo (`requiredString`, `oneOf`, `numberInRange`)                                              |
| `TtsProvider` + registro           | `types/tts-provider.ts` | 2 cadenas de `if` y el `Set` duplicado                                               | cada motor implementa la interfaz; el registro es `Record<VoiceProviderId, TtsProvider>`                      |

### Forma

Las firmas que fijan el contrato —lo demás es implementación:

```ts
// runner/codes.ts — la unión cerrada que conecta los dos lados del borde.
export const PIPELINE_ERROR_CODES = [
  'invalid_job',
  'invalid_payload',
  'unknown_subcommand',
  'cancelled',
  'unknown',
  'missing_api_key',
  'missing_projects_root',
  'network',
  'timeout',
  'rate_limited',
  'invalid_api_key',
  'provider_error',
  // …los específicos que sí son de dominio: 'voice_text_too_long', 'character_not_found'…
] as const
export type PipelineErrorCode = (typeof PIPELINE_ERROR_CODES)[number]

// runner/failure.ts y runner/events.ts pasan a `code: PipelineErrorCode`.

// runner/library.ts — la variación es de datos, no de comportamiento.
export function createDiskLibrary<Stored, Entry>(spec: {
  subdirectory: string // '_history/music' | 'characters'
  idPrefix: string // 'm-' | 'v-' | slug del nombre
  toEntry(
    directory: string,
    id: string,
    metadata: Stored,
  ): Promise<Entry | null>
}): DiskLibrary<Stored, Entry>

// runner/http.ts — `decide` es la unión etiquetada que hoy son 5 campos opcionales.
export type PollDecision<R> =
  | { state: 'pending'; percent?: number; label?: string }
  | { state: 'done'; result: R }
  | { state: 'failed'; code: PipelineErrorCode; message: string }
```

**Los prefijos de dominio en los códigos desaparecen.** `music_network`, `voice_network`,
`llm_network` e `image_network` son el mismo concepto cuatro veces; el dominio ya lo aporta
el catálogo que traduce (`MUSIC_ERROR_MESSAGE_KEYS` vs `VOICE_ERROR_MESSAGE_KEYS`), que es
por módulo. Sobrevive solo el código que nombra algo que **de verdad** es de un dominio
(`voice_text_too_long`, `character_not_found`).

### Orden de adopción

Por primitiva, nunca todas a la vez: sin tests, el tamaño del cambio es el riesgo.

1. `runner/codes.ts` y `runner/payload.ts` — mecánicos, tocan muchos archivos apenas.
   Los catálogos de la app pasan a `Record<PipelineErrorCode, string>` en el mismo paso.
2. `runner/library.ts` — el ahorro más grande (3 copias → 1 + tres `toEntry`).
3. `runner/http.ts` — cierra de paso el 429 perdido de ElevenLabs.
4. `TtsProvider` + registro — el más invasivo; va último.

**Characters, que está en curso, no se bloquea:** entra como está y es el primer cliente
de la extracción, que arranca antes de Library (paso 5 de la ADR-0010). Pagar la extracción
con las tres copias delante es más barato que diseñarla en abstracto.

## Alternativas consideradas

- **Dejarlo como está y aceptar la copia** — descartada: el costo ya no es hipotético.
  Tres esqueletos, 90 sitios de error sin tipar y un reintento de 429 perdido por copiar
  mal. El cuarto dominio (Library) multiplica lo mismo.
- **zod / valibot para el payload** — descartada: un esquema es un **valor** runtime, y
  `src/` solo puede `import type` de `pipeline/` (🔒 ADR-0010), así que el beneficio
  principal —un esquema, dos lados— no está disponible acá; quedaría validación solo del
  lado del sidecar, que es justo lo que hacen 60 líneas de lectores sin sumar la primera
  dependencia runtime de `pipeline/`. Se reconsideraría si los payloads pasaran a formas
  anidadas o recursivas, donde escribir lectores a mano deja de pagar.
- **Clase base abstracta (`abstract class HistoryCommand`) e herencia** — descartada: lo
  que varía entre los tres dominios son **datos** (una subcarpeta, un prefijo, una
  proyección), no comportamiento. Una factoría parametrizada se lee entera en el sitio de
  uso; una superclase obliga a saltar de archivo para entender qué hace un comando.
- **Unificar `MusicHistoryEntry` con `VoiceHistoryEntry` en un genérico** — descartada:
  comparten `{ id, createdAt, audioPath }`, pero `customMode`/`instrumental`/`style` y
  `provider`/`voiceId`/`charsCount` son irreductibles; el tipo unificado sería mitad campos
  opcionales. **Se unifica el mecanismo, no el dominio.**
- **Codegen del `ProviderId` compartido con Rust** — descartada por ahora: los seis ids
  están escritos cuatro veces (`config/api-keys.ts:4`, `src/modules/api-keys/providers.ts`,
  y dos tablas en `api_keys/provider.rs`), pero eso se resuelve con un guard barato que
  compare las listas, no con un generador. Es otra decisión.

## Consecuencias

- ✅ Agregar un dominio pasa a ser **declarar qué varía**: una subcarpeta, un `toEntry`, un
  registro. La receta de la §4 de `ARCHITECTURE.md` se acorta en lugar de crecer.
- ✅ Un código de error nuevo **rompe el build** hasta que los tres catálogos lo mapeen: es
  el guard que hoy no existe y que hace fallar en silencio a un código sin traducir.
- ✅ Los 16 casts sobre `response.json()` quedan en un solo sitio tipado.
- ✅ Arreglar la política de 429 —o el timeout, o el manejo de cancelación— se hace una vez
  y vale para todos los providers.
- ⚠️ La extracción toca ~15 archivos y no hay tests que la respalden. Por eso va por
  primitiva y en el orden de arriba, no en un solo PR.
- ⚠️ Una primitiva mal dimensionada es peor que la duplicación que reemplaza: obliga a
  todos a doblarse a una forma que no era. De ahí la regla de las tres copias.
- 🔒 Un subcomando nuevo **no** vuelve a declarar `fileExists`, `authHeaders`,
  `requestSignal` ni `rethrowIfCancelled`, ni a castear `context.job.payload`.
- 🔒 `PipelineFailure` no acepta un código fuera de `PipelineErrorCode`.

## Verificación de cumplimiento

- **Guards (greps ejecutables):**
  - `grep -rn "async function fileExists" pipeline/` → **1** (hoy 3).
  - `grep -rnE "function (authHeaders|requestSignal|rethrowIfCancelled)" pipeline/` → **3**
    (hoy 9, en tres archivos distintos).
  - `grep -rn "job.payload as" pipeline/` → **vacío** (hoy 12).
  - `grep -rn "new Set(\['minimax'" pipeline/` → **vacío** (hoy 2).
  - `grep -rn "Record<string, string>" src/modules/*/constants.ts` → **vacío** para los
    catálogos de errores.
- **Guard de tipos (lo hace `pnpm build`):** los catálogos declarados como
  `Record<PipelineErrorCode, string>` fallan a compilar si falta un código. Es la
  verificación central de esta ADR: conecta el borde del sidecar con la i18n de la app.
- **Tests:** cuando exista framework (ver CLAUDE.md), `createDiskLibrary` y `readPayload`
  son los dos primeros candidatos — lógica pura, sin red ni disco real en el caso de
  `readPayload`.
- **Cómo se vería una regresión:** una carpeta nueva en `commands/` que declare su propio
  `<dominio>Root(context)` lanzando `missing_projects_root`; un provider nuevo con su
  propio `authHeaders`; un `new PipelineFailure('algo_nuevo', …)` con un literal que no
  esté en `PIPELINE_ERROR_CODES`.

## Fuera de alcance

- **El runner de stages.** `Stage`, `STAGE_IDS` y los eventos `stage-*` siguen declarados
  sin uso en runtime por decisión explícita de la ADR-0010 (llegan con Create, paso 6).
  Esta ADR no los adelanta ni los borra.
- **Unificar los tipos de dominio** entre música, voces y personajes (ver Alternativas).
- **El espejo de `ProviderId` con Rust**, que necesita su propia decisión.
- Limpieza menor que entra de arriba: `CancelMessage` (`runner/job.ts:23`) está declarado
  y sin usar mientras `main.ts:31` reimplementa su forma inline; se usa o se borra.

## Referencias

- ADR-0010 (fija los contratos que esta ADR completa hacia adentro), ADR-0009 (carpeta raíz
  de proyectos, que las tres bibliotecas en disco resuelven por su cuenta hoy).
- Defecto que motiva la primitiva HTTP: `pipeline/providers/tts/elevenlabs.ts:141-147`.
