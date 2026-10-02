# Catálogo sobre el carril de Mi estilo: plan maestro

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado)
> o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas
> (`- [ ]`) para el seguimiento.

> **Nota de ejecución (2026-09-30, 19:23).** Antes de implementar, la rama se actualizó sobre `dev`
> (`c007e008`, PR #91 de animación de escenas) con la aprobación del dueño. Los planes de los
> frentes se verificaron sobre `e50be2a1`. Donde el PR #91 cambió un archivo que el plan edita, el
> ejecutor aplica la misma intención sobre el código de `dev`, conserva lo que trajo el PR y lo anota
> en su informe. La ADR de esta entrega pasa a ser la ADR-0048, y la de la Entrega 3 será la
> siguiente libre (hoy, la ADR-0049), porque `dev` ya usa de la ADR-0041 a la ADR-0047.

**Goal:** Implementar la Entrega 1 del spec con tres frentes en paralelo que no se pisan: gemas por
secciones, marco de Vimo, agente reconstructor con registro, flags de acceso y UI de Mi estilo. Dejar
trazadas las Entregas 2 y 3 y el retiro del carril viejo.

**Architecture:** Hay tres frentes y cada uno toca solo sus propios archivos: sidecar (`pipeline/`),
servidor (`vimo-landing`) y app (`src/`). Un contrato común (tipos, endpoint e interruptores) se
congela en la Ola 0, antes de abrir el trabajo en paralelo. El orquestador (la sesión principal) hace
la integración, la documentación, los commits de VIMO-TAURI y el log del vault.

**Tech Stack:** React 19, TypeScript, Vite y Tauri 2 (app). Sidecar Node SEA con guards
`node --test`. Cloudflare Pages Functions, zod y vitest (`vimo-landing`). Supabase: Postgres, RLS y
pg_cron.

**Spec:** [design.md](design.md). Lo leen todos los ejecutores junto con este plan.

**Planes de cada frente:**

- Frente A, sidecar: [plan-e1-sidecar.md](plan-e1-sidecar.md). Incluye la Tarea 0 de la Ola 0.
- Frente B, servidor: [plan-e1-server.md](plan-e1-server.md).
- Frente C, app: [plan-e1-app.md](plan-e1-app.md).

## Global Constraints

- **Código:** en inglés (nombres, archivos, tipos, constantes). Comentarios y documentación en español
  (CLAUDE.md).
- **TypeScript:**
  - Sin `enum`: objetos `as const` con su tipo derivado (`erasableSyntaxOnly`).
  - En `src/`, imports con `@/` y sin barriles fuera de las excepciones de CLAUDE.md.
  - Guard clauses, nombres completos y sin casts que el compilador no necesite.
- **Textos visibles:**
  - Ninguno en el código. Todos van a `public/locales/{es,en,pt}.json`, con la misma clave en los
    tres archivos en el mismo cambio.
  - Las claves se agrupan por vista (`create.*`, `customStyle.*` o la que ya use el modal).
- **Cadena de datos de la UI:** componente → hook (TanStack Query) → `api/` del módulo → exterior. Nada
  de `fetch` fuera de `api/` y del cliente común de vimo.click.
- **`pipeline/`:** no lee `process.env` ni escribe a consola. Los fallos son
  `PipelineFailure(code, message)` con `code` estable.
- **Límites** (spec §4.1):
  - Cada sección hasta 12 000 caracteres y la suma hasta 30 000.
  - `character` hasta 700.
  - `promptStart` y `promptEnd` hasta 600 cada una.
- Una gema tiene `sections` o `systemPrompt`, nunca los dos.
- Un `customStyle` sin `sections` produce exactamente los mismos mensajes que hoy (byte por byte).
- Sin `features.gemTemplate`, la UI de Mi estilo queda exactamente como hoy.
- **Cada commit deja verde:**
  - VIMO-TAURI: `pnpm format:check`, `pnpm lint`, `pnpm build` y `pnpm check:locales`.
  - `vimo-landing`: `pnpm test` y `pnpm build` en verde, y
    `pnpm exec eslint functions tests vitest.config.ts` sin errores. `pnpm lint` completo ya falla en
    `main` por 3 errores de la SPA que este trabajo no toca: el criterio es cero errores nuevos.
- **Commits:**
  - Título en Conventional Commits, en inglés. Cuerpo en español: qué, por qué y con qué interactúa.
  - Última línea: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Sin aprobación explícita del dueño:** no se hace push, merge, rebase, PR ni deploy. Tampoco se
  aplica SQL en Supabase.
- Los scripts de verificación local y las capturas no se commitean.

## Review Focus

1. **Una gema con el personaje metido dentro del texto del estilo.** Después de reconstruirla, en modo
   cinemático no debe aparecer ese personaje. Lo cubren el guard de composición `none` (Tarea A3) y la
   comparación de modelos con claves reales (Ola 3).
2. **Una gema vieja con el servidor caído.** Tiene que seguir generando por el camino viejo, sin
   bloquear al usuario. Lo cubren el guard byte a byte del camino viejo (Tarea A4) y la Tarea C5.
3. **Doble clic en «Preparar con IA».** Tiene que salir una sola llamada. Lo cubre el botón
   deshabilitado mientras la mutación está pendiente (Tarea C4).
4. **Una respuesta de `verificar-acceso` sin `features`** (servidor viejo o desplegado a medias). La
   app se comporta como hoy. Lo cubre la normalización a `false` (Tarea C1).
5. **`promptEnd` o `character` escritos en español.** El modal avisa y el sidecar igual los usa tal
   cual. Lo cubren la heurística de inglés (Tarea C4) y la Tarea A6.

---

## Cómo se ejecuta en paralelo sin pisarse

### Frentes y archivos

| Frente          | Plan                 | Puede tocar                                                                                                                                                                    | No toca                                          |
| --------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Ola 0 (Tarea 0) | `plan-e1-sidecar.md` | `pipeline/types/*` y los arreglos mínimos de compilación que liste la tarea, en `pipeline/` y `src/`                                                                           | Todo lo demás                                    |
| A · sidecar     | `plan-e1-sidecar.md` | `pipeline/**` y los guards nuevos `scripts/test/check-gem-*.mjs`                                                                                                               | `src/`, `public/`, `docs/`, `package.json`       |
| B · servidor    | `plan-e1-server.md`  | `/Users/sebas/Documents/vimo-landing/**`, en la rama `feat/reconstructor-gemas` creada desde `origin/main` con `--no-track` (el `main` local va 10 commits atrás y no se toca) | VIMO-TAURI                                       |
| C · app         | `plan-e1-app.md`     | `src/**`, `public/locales/*.json`, los guards nuevos `scripts/test/check-app-*.mjs` y la enmienda de `docs/adr/ADR-0006-*.md`                                                  | `pipeline/`, el resto de `docs/`, `package.json` |
| Orquestador     | este plan            | `docs/**` (salvo la ADR-0006), `scripts/test/README.md`, `package.json`, commits de VIMO-TAURI y el vault                                                                      | —                                                |

### Olas

```
Ola 0  Tarea 0 (contratos) + ADR-0048  ──►  commit del orquestador
Ola 1  A1…A8c  ║  B0…B8  ║  C1…C6b       (tres frentes en paralelo; C6b después de A8c)
Ola 2  I1…I4  integración (orquestador)
Ola 3  pasos del dueño: SQL, variables de entorno, push/deploy aprobados, pruebas con claves reales
```

### Reglas de la ejecución en paralelo

1. Un frente solo edita los archivos de su columna «Puede tocar». Si necesita cambiar un contrato
   congelado (sección siguiente), se detiene y avisa al orquestador: no lo cambia por su cuenta.
2. **En VIMO-TAURI los agentes no corren `git add` ni `git commit`.** Tampoco corren comandos que
   escriban sobre todo el repo (`pnpm format`, `pnpm build`, `pnpm lint:fix`). Solo usan:
   - `pnpm exec prettier --write <sus archivos>`
   - `pnpm exec eslint <sus archivos>`
   - `pnpm exec tsc -p <tsconfig> --noEmit`
   - `node --test scripts/test/<su guard>`
3. El orquestador revisa cada tarea terminada, corre la verificación completa y hace el commit con el
   mensaje que trae el plan.
4. En `vimo-landing` trabaja un solo frente, así que su ejecutor sí commitea en
   `feat/reconstructor-gemas`, siempre local.
5. El log del vault lo escribe el orquestador después de cada commit.

---

## Contratos congelados

### Tipos del sidecar (los escribe la Tarea 0)

`pipeline/types/styles.ts`:

```ts
/** Secciones de una gema de plantilla (ADR-0048). */
export interface GemSections {
  visualStyle: string
  character?: string
  dynamism?: string
  camera?: string
  rules?: string
  promptStart?: string
  promptEnd?: string
}

export type GemSectionKey = keyof GemSections

/** Orden canónico de las secciones: el mismo en el marco, en el modal y en el agente. */
export const GEM_SECTION_KEYS = [
  'visualStyle',
  'character',
  'dynamism',
  'camera',
  'rules',
  'promptStart',
  'promptEnd',
] as const satisfies readonly GemSectionKey[]

/** Versión de la estructura de secciones que entienden este sidecar y esta app. */
export const GEM_TEMPLATE_VERSION = 1

export const COLOR_FILTER_IDS = ['none', 'fantasy', 'horror-bw'] as const
export type ColorFilterId = (typeof COLOR_FILTER_IDS)[number]

/** Solo en las copias de «Pasar a mi estilo» (Entrega 2). */
export interface GemOrigin {
  kind: 'catalog'
  catalogStyleId: string
  name: string
}
```

En el mismo archivo cambian estas interfaces existentes. Se muestran solo los campos nuevos o que
cambian; el resto sigue igual:

```ts
export interface CustomStyleSummary {
  // …campos actuales…
  /** Solo gemas viejas (sin secciones). */
  systemPrompt?: string
  sections?: GemSections
  templateVersion?: number
  sourcePrompt?: string
  colorFilter?: ColorFilterId
  origin?: GemOrigin
  updatedAt?: string
}

export interface StyleSavePayload {
  // …campos actuales…
  /** Gema vieja. Excluyente con `sections`. */
  systemPrompt?: string
  /** Gema de plantilla. Excluyente con `systemPrompt`. */
  sections?: GemSections
  templateVersion?: number
  /** Ausente = conservar el guardado. */
  sourcePrompt?: string
  /** Ausente = conservar el guardado. */
  colorFilter?: ColorFilterId
  /** Ausente = conservar el guardado. */
  origin?: GemOrigin
}

export interface GenerateStyleSamplesPayload {
  // …campos actuales…
  /** Modelo de Ajustes para las gemas de plantilla. Ausente = el de la casa. */
  promptModel?: string
}
```

`pipeline/types/video-project.ts`:

```ts
export interface ProjectCustomStyle {
  // …campos actuales…
  /** Gema vieja. Excluyente con `sections`. */
  systemPrompt?: string
  sections?: GemSections
  templateVersion?: number
  colorFilter?: ColorFilterId
  /** Entrega 2: estilo del catálogo del que sale esta copia. */
  catalogStyleId?: string
}

// StyleProtagonistSource suma 'style-section': el protagonista sale de la sección `character`.
```

`pipeline/types/scenes.ts`: `Scene` suma `treatment?: SceneTreatment` (el tratamiento que declaró la
etiqueta `[T:…]`).

`DesignStyleCharacterPayload` (`pipeline/types/styles.ts`) acepta `gem?: string` o
`sections?: GemSections`, excluyentes (spec §5.6 bis). No es parte de la Tarea 0: lo agrega la
sub-tarea A8c del sidecar y lo consume el frente C.

### Tipos de la app (los escribe el frente C)

`src/modules/auth/types/access.ts`:

```ts
export interface AccessFeatures {
  gemTemplate: boolean
  newCatalog: boolean
}

export interface VerifyAccessResponse {
  // …campos actuales…
  admin?: boolean
  features?: Partial<AccessFeatures>
}

export interface AccessStatus {
  // …campos actuales…
  admin: boolean
  /** Ausente o incompleto en la respuesta = false. */
  features: AccessFeatures
}
```

`src/modules/videos/types/gemRebuild.ts` (nuevo):

```ts
import type { GemSections, StyleCharacterMode } from '@pipeline/types/styles.ts'

export type GemRebuildOrigin = 'mi-estilo' | 'catalogo' | 'migracion'

export interface GemRebuildRequest {
  text: string
  origin: GemRebuildOrigin
  appVersion: string
  locale: 'es' | 'en' | 'pt'
}

export interface GemRebuildResponse {
  templateVersion: number
  sections: GemSections
  suggestions: {
    allowedModes?: StyleCharacterMode[]
    characterMode?: StyleCharacterMode
  }
  warnings: string[]
}
```

`src/` importa los tipos de `pipeline/` solo con `import type` y el alias
`@pipeline/types/<archivo>.ts`.

### Endpoint del agente (lo implementa el frente B y lo consume el frente C)

- `POST https://vimo.click/api/estilos/reconstruir`, más `OPTIONS` para CORS con el mismo criterio que
  `verificar-acceso`.
- Headers: `Authorization: Bearer <access_token>` y `Content-Type: application/json`.
- Cuerpo: `GemRebuildRequest`. Respuesta 200: `GemRebuildResponse`.
- Error: el HTTP de la tabla del spec §6.1 con cuerpo `{ "code": string, "retryAfterSeconds"?: number }`.
  Los códigos son `sin-token`, `token-invalido`, `sin-acceso`, `funcion-desactivada`,
  `pedido-invalido`, `texto-invalido`, `cupo-agotado`, `error-interno`, `modelo-fallo` y
  `modelo-timeout`, más `sin-estilo-visual` (422), sumado en la Ola 3 a pedido del dueño
  (2026-10-01): el texto no describe un estilo visual.
- El endpoint vuelve a comprobar el interruptor: sin `features.gemTemplate` para ese usuario, o con
  `origin: "catalogo"` sin ser admin, responde 403 `funcion-desactivada`.
- La sección `character` termina con una oración que empieza con «Outfit:», el formato que ya exige la
  Fase 1 (`CHARACTER_OUTFIT_SENTENCE_RULE`). Así `splitOutfit` la separa sin cambios.
- El servidor tarda como máximo 120 s. El cliente espera 150 s y además distingue sus propios
  `network` y `timeout`.

### Acceso e interruptores

- Las respuestas autorizadas de `verificar-acceso` suman:
  - `admin: true`, solo para los correos de `admins`. Los demás no reciben la clave.
  - `features: { gemTemplate: boolean, newCatalog: boolean }`, siempre.
- `VIMO_FLAG_GEM_TEMPLATE` y `VIMO_FLAG_NEW_CATALOG` valen `off`, `admins` o `all`. Si una variable no
  está definida o trae otro valor, cuenta como `off`. El dueño las pone en `admins` al desplegar.
- `admins` enciende el interruptor para los admins. `all`, para todos los autorizados.

### Números

- Límites: los de Global Constraints.
- Cupo: 30 reconstrucciones con `status = 'ok'` por usuario en las últimas 24 h. Los admins no tienen
  cupo.
- Presets de color: los de spec §5.5, con los filtros de FFmpeg copiados tal cual de
  `VISUAL_STYLES`.

---

## Ola 0

### Tarea O1: ADR-0048 (orquestador, antes del commit de la Tarea 0)

**Files:**

- Create: `docs/adr/ADR-0048-gemas-por-secciones-y-agente-reconstructor.md`
- Modify: `docs/adr/README.es.md` y `docs/adr/README.md` (índice)

- [ ] **Paso 1:** escribir la ADR con la plantilla `docs/adr/TEMPLATE.es.md`:
  - Estado Aceptada, fecha 2026-09-30, área pipeline / app / servidor.
  - Problema: dos carriles, gemas sin estructura y personaje controlado solo por instrucción (spec §1).
  - Decisión: secciones fijas, marco en la app, agente en el servidor con registro, interruptores y
    gemas viejas por el camino viejo hasta reconstruirse. Resume spec §4, §5 y §6 y las decisiones B1
    a B6, C6, F5, F6 y L1.
  - Alternativas descartadas: dos carriles, solo el tejido del personaje en el catálogo y prompt
    reescrito entero.
  - Consecuencias: el control determinístico del personaje, el costo del agente por gema y la excepción
    de texto frente a la ADR-0038. También que `GEM_SECTION_KEYS`, `GEM_TEMPLATE_VERSION` y
    `COLOR_FILTER_IDS` viven en `pipeline/` y la app los copia con una anotación `typeof`, porque `src/`
    solo importa tipos del sidecar.
  - Verificación: los guards de las Tareas A1 a A8 y los tests de B.
  - Relación: retoma la ADR-0039 y extiende las ADR-0018, 0019 y 0020.
- [ ] **Paso 2:** agregar la fila de la ADR-0048 a los dos índices.
- [ ] **Paso 3:** `pnpm exec prettier --write docs/adr/ADR-0048-*.md docs/adr/README*.md`.
- [ ] **Paso 4:** la ADR viaja en el mismo commit que la Tarea 0.

### Tarea 0: contratos

Está en `plan-e1-sidecar.md`. Es la única tarea de ese plan que puede tocar `src/`, y solo para los
arreglos mínimos de compilación que lista, sin cambiar comportamiento. Cuando se commitea, se abre la
Ola 1.

---

## Ola 1: frentes en paralelo

- **Frente A:** tareas A1 a A8 de `plan-e1-sidecar.md`. A8 se parte en A8a, A8b y A8c.
- **Frente B:** tareas B0 a B8 de `plan-e1-server.md`, en `/Users/sebas/Documents/vimo-landing`.
- **Frente C:** tareas C1, C2, C3, C4a, C4b, C4c, C5, C6 y C6b de `plan-e1-app.md`.

Dentro de un frente las tareas van en orden. El frente C programa contra el contrato del endpoint, sin
esperar a que B lo despliegue. Hay una sola dependencia entre frentes después de la Ola 0: **C6b va
después del commit de A8c**, porque usa `DesignStyleCharacterPayload.sections`. Si A8c no se hiciera,
C6b se omite y «Crear personaje con mi estilo» sigue con el experto de la casa, sin error.

### Decisiones tomadas al cerrar los planes

- `src/` no puede importar valores de `pipeline/`. `GEM_SECTION_KEYS`, `GEM_TEMPLATE_VERSION` y
  `COLOR_FILTER_IDS` se copian en la app con una anotación `typeof`, que deja de compilar si se
  desalinean. Se menciona en la ADR-0048.
- El frente C lee los interruptores con `useAccessFeature` en `common`. La clave de caché del veredicto
  pasa a `commonQueryKeys.access`, y `videos` no importa nada de `auth`. Es una enmienda de la ADR-0006.
- La memoria sin red de los flags conserva la clave `vimo:demo:access:v1`, así que nadie pierde lo ya
  recordado.
- La migración de una gema vieja suma sus `shots` al texto que va al agente, con el bloque
  `# ALLOWED SHOTS` de hoy, y el agente los pasa a `camera`. No se pierden.
- Los textos de la UI siguen la voz de la app (voseo: «Pegá tu gema»).
- `suggestions` del agente no se usa en la Entrega 1. Queda para el catálogo administrado.

---

## Ola 2: integración (orquestador)

### Tarea I1: verificación completa en VIMO-TAURI

- [ ] Correr en orden `pnpm format:check`, `pnpm lint`, `pnpm build` y `pnpm check:locales`.
      Esperado: todo en verde.
- [ ] Correr cada guard nuevo y los existentes del carril verbatim:
      `node --test scripts/test/check-gem-*.mjs scripts/test/check-app-*.mjs`,
      `check-preview-regressions.mjs`, `check-style-character-video.mjs`, `check-scene-wardrobe.mjs`,
      `check-verbatim-prompt-persistence.mjs`, `check-verbatim-prompt-language.mjs` y
      `check-editor-character-selection.mjs`. Esperado: todos pasan.
- [ ] Si algo falla, se devuelve la tarea al frente dueño del archivo.

### Tarea I2: documentación del repo

- [ ] `docs/ARCHITECTURE.md`:
  - §1: el servidor de vimo.click pasa a tener el agente reconstructor, además del acceso y los
    diagnósticos.
  - §5: el párrafo «Con un estilo propio» explica las gemas por secciones y el marco.
  - §6: la fila de `videos` menciona la Entrega 1.
- [ ] `docs/adr/ADR-0038-*.md`: nota posterior sobre `gem_rebuild_logs` (tabla aparte, guarda texto
      por decisión del dueño, 30 días; 60 desde el 2026-10-01).
- [ ] `scripts/test/README.md`: los guards nuevos.
- [ ] `pnpm exec prettier --write` sobre los archivos tocados. Commit
      `docs: document section-based gems and the rebuild agent`.

### Tarea I3: vault

- [ ] `Recursos/APIs y Servicios Externos.md`: el agente reconstructor (endpoint, proveedor
      compatible con OpenAI, timeout, reintento, cupo y errores).
- [ ] `Recursos/Variables de Entorno.md`: `RECONSTRUCTOR_API_URL`, `RECONSTRUCTOR_API_KEY`,
      `RECONSTRUCTOR_MODEL`, `RECONSTRUCTOR_EXTRA_BODY`, `VIMO_FLAG_GEM_TEMPLATE` y
      `VIMO_FLAG_NEW_CATALOG`.
- [ ] `Recursos/Costos Operativos Mensuales.md`: el costo por reconstrucción, que se completa con la
      medición de la Ola 3.
- [ ] `Recursos/Supabase Schema Completo.md`: `gem_rebuild_logs`.
- [ ] `Proyectos/VIMO-TAURI/ADR - Gemas por secciones y agente reconstructor.md`, con el diagrama
      Mermaid del flujo (regla global 6).

### Tarea I4: prueba de punta a punta sin claves

- [ ] `pnpm pipeline:harness`: crear un proyecto con un `customStyle` de plantilla. Esperado:
      `job-completed`.
- [ ] Con `systemPrompt` y `sections` a la vez. Esperado: `invalid_payload`.
- [ ] Con un `customStyle` viejo. Esperado: `job-completed`, sin cambios respecto de hoy.
- [ ] En `tauri dev`, con la respuesta de acceso simulada con `features.gemTemplate` en `true`, recorrer
      el modal: pegar, error de red, reintento, cajas y guardado. Sin claves el agente no responde, así que
      se prueba el camino de error.

---

## Ola 3: pasos del dueño

1. Aplicar en Supabase el SQL de `gem_rebuild_logs` que deja la Tarea B8 en
   `vimo-landing/SETUP_RECONSTRUCTOR_GEMAS.md`.
2. Cargar en Cloudflare Pages las variables `RECONSTRUCTOR_*` (proveedor según spec §15) y los
   interruptores en `admins`.
3. Aprobar el push de `feat/reconstructor-gemas` y el despliegue de `vimo-landing`.
4. Aprobar el push de `feat/catalogo-estilos`.
5. Comparación de modelos del agente (spec §6.3), con las 10 gemas. El dueño elige el modelo.
6. Prueba con claves reales en la app instalada: crear, editar, migrar una gema vieja y generar un
   video en los tres modos.
7. Visto bueno: `VIMO_FLAG_GEM_TEMPLATE` pasa a `all`.

---

## Entrega 2: esquema

Detallada el 2026-10-02 en [plan-e2.md](plan-e2.md), con las decisiones del dueño de ese día (las
5 gemas actuales más las 34 de `estilos/`, muestras generadas reusando las que existen, «Ver» sin
texto, misma rama). Esta tabla es el esquema original.

| #    | Tarea                                                                                                                                                                                 | Archivos principales                                                                     | Verificación                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------- |
| E2-1 | Contrato de la gema de catálogo (`CatalogGem`: id, nombre y descripción en 3 idiomas, secciones, `allowedModes`, `sampleMode`, `colorFilter`, muestras) y resultado de `catalog-list` | `pipeline/types/catalog.ts`                                                              | build                         |
| E2-2 | Escribir las 5 gemas: pasar cada estilo por el agente con las reglas del director y del reparto, y ajustarlas a mano                                                                  | `pipeline/prompts/catalog-gems/*.ts`                                                     | guard de límites y estructura |
| E2-3 | `catalog-list`, `catalog-copy-to-custom`, preview de personaje con gemas del catálogo, `catalogStyleId` en `create-video-project`                                                     | `pipeline/commands/catalog/`, `create-video-project.ts`, `generate-character-preview.ts` | guards                        |
| E2-4 | Pestaña Catálogo nueva: tarjetas, menú, «Ver», modo recordado, chip, segundos por escena, modelo de prompts y un solo personaje                                                       | `src/modules/videos/components/*`, `formPayload.ts`                                      | build y QA manual             |
| E2-5 | «Pasar a mi estilo»                                                                                                                                                                   | `src/modules/videos/*`                                                                   | QA manual                     |
| E2-6 | ADR-0039 pasa a Aceptada, ARCHITECTURE y locales                                                                                                                                      | `docs/`, `public/locales/`                                                               | `check:locales`               |
| E2-7 | QA con claves reales: guiones × 5 estilos × 3 modos, medición de costo y tiempo, y visto bueno                                                                                        | —                                                                                        | aprobación del dueño          |
| E2-8 | `VIMO_FLAG_NEW_CATALOG` pasa a `all`. Arranca el plazo de 7 días del retiro                                                                                                           | Cloudflare (dueño)                                                                       | —                             |

## Entrega 3: esquema

Se detalla en `plan-e3.md` al cerrar la Entrega 2.

| #    | Tarea                                                                                                                                                     | Archivos principales                                                        | Verificación         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------- |
| E3-1 | SQL de `catalog_styles`, bucket `catalog-samples` y semilla de las 5 gemas (lo aplica el dueño)                                                           | `vimo-landing` (setup)                                                      | revisión del dueño   |
| E3-2 | `GET /api/catalogo` y endpoints de admin (crear, editar, muestras, publicar, ocultar, eliminar)                                                           | `vimo-landing/functions/api/catalogo.ts`, `functions/api/admin/catalogo/**` | vitest               |
| E3-3 | `catalog-sync` (muestras a `_catalog/`) y `catalog-list` con caché y semilla                                                                              | `pipeline/commands/catalog/`, `pipeline/project/paths.ts`                   | guard con HTTP local |
| E3-4 | Sincronización en la app y UI del admin: borradores, crear, editar, muestras, publicar, ocultar, eliminar, posición, nombres en 3 idiomas, modos y filtro | `src/modules/videos/*`                                                      | build y QA manual    |
| E3-5 | ADR-0049, ARCHITECTURE y vault                                                                                                                            | `docs/`, vault                                                              | —                    |
| E3-6 | QA con admins reales                                                                                                                                      | —                                                                           | aprobación del dueño |

## Retiro del carril viejo: esquema

A los 7 días de E2-8, un PR elimina:

- La biblia visual, el reparto de presencia, el director y el redactor por escena.
- `identity-lock` y `catalog-llm`.
- Los `systemPrompt` de `VISUAL_STYLES`.
- Los guards de todo eso.

En el mismo PR, `resolveProjectStyle` mapea el `options.styleId` de un proyecto viejo a su gema del
catálogo. Un guard abre un proyecto de catálogo viejo y verifica que regenera por el carril nuevo sin
tocar sus imágenes. La ADR-0039 y ARCHITECTURE registran el retiro.
