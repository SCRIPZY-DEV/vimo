# ADR-0057 — Escenas de avatar con HeyGen sobre la narración

- **Estado:** Propuesta (diseño acordado con el dueño el 2026-10-08; pasa a Aceptada con su QA de la
  entrega 2).
- **Fecha:** 2026-10-09
- **Área:** pipeline / app / providers
- **Relacionada con:** [ADR-0013](ADR-0013-modulo-create-runner-de-stages-y-binarios.md) (confirmación
  de escenas), [ADR-0014](ADR-0014-modulo-library-edicion-sobre-stages.md) (edición sobre stages),
  [ADR-0033](ADR-0033-personajes-con-foto-la-imagen-subida-como-identidad.md) (biblioteca con foto),
  [ADR-0042](ADR-0042-animacion-kie-por-intervalos-y-recibos.md) (clips como bloque, recibos),
  [ADR-0056](ADR-0056-layout-propio-del-editor-a-pantalla-completa.md) (el editor donde vive el bloque).
- **Diseño:** [docs/handoff/2026-10-09-avatar-heygen/design.md](../handoff/2026-10-09-avatar-heygen/design.md).

## Problema

El dueño quiere un **avatar presentador** en los videos: una persona generada por HeyGen que aparece
varias veces hablando con nuestra narración, a pantalla completa y sobre un fondo relacionado con el
tema, y que el usuario decida cuántas veces y cuántos segundos. Lo que hay hoy casi sirve y casi no:

- El render, el visor y el timeline ya aceptan «un clip que reemplaza un tramo de escenas» (ADR-0042),
  pero esa mecánica está cableada a Kie: planificador por ventanas de escena de 3–12 s, normalización
  que reencoda a 480p y retima, recibos en `animations[]` que todos los consumidores suponen de Kie.
- Las escenas son ventanas de tiempo, no frases: un avatar que empieza a mitad de una frase rompe la
  continuidad que el dueño exige («misma voz, mismo tema, solo cambia que no se ve la imagen»).
- Generar imágenes debajo del avatar es plata tirada («para eso está el clip del avatar»).
- HeyGen cobra por minuto, produce un video que dura lo que dura el audio y no tiene SDK: solo REST v3,
  sin webhooks útiles para una app de escritorio.

Restricciones: no tocar el contrato de las escenas ni el render para un proyecto sin avatar
(byte-idéntico); pagar una sola vez aunque el job muera; la clave es del usuario y Vimo intermedia;
nada visible fuera de i18n; el editor sigue en el modelo de pistas de la ADR-0056.

## Decisión

**El avatar es una escena.** Cada aparición es una escena del video con un campo aditivo `avatar`,
cortada en fronteras de frase, cuya imagen es el fondo y cuyo clip es el video de HeyGen normalizado
al cuadro del render, mudo, sobre la narración de siempre.

1. **Frases como unidad** (`pipeline/narration/sentences.ts`): `words.json` gana un `sentenceEnd?`
   opcional por palabra (Deepgram con `punctuate=true`, `word` sigue limpio); sin él, pausas ≥ 0,35 s.
2. **Planificador propio** (`pipeline/avatar/planner.ts`): apariciones × segundos del usuario, ajuste
   a frases enteras, mínimo 7 s, reparto parejo con hueco mínimo de 10 s, determinista.
3. **Pines en el corte** (`pipeline/stages/scene-cuts/pins.ts`): la fase `scene-cuts` planifica el
   avatar antes de cortar y corta el resto alrededor; las escenas siguen contiguas y con una imagen
   cada una. El diálogo de confirmación muestra las apariciones.
4. **El fondo lo escriben y generan las fases de siempre** con un pedido de decorado para las
   escenas de avatar (`pipeline/prompts/avatar-backdrop.ts`): sin personas, centro despejado, estilo
   del proyecto. Una imagen más por aparición; nada nuevo en imágenes.
5. **Proveedor y carril propios** (`pipeline/providers/avatar/heygen.ts`, `pipeline/avatar/lane.ts`)
   con recibos en `scene.avatar.attempts`, intención persistida antes de cada POST, `Idempotency-Key`,
   `title` recuperable, pre-chequeo de saldo y familia de errores `avatar_*`. HeyGen compone el fondo
   (`background` de imagen, `mp4`, 1080p, formato del proyecto). Nada entra en los arrays de Kie; el
   planificador de Kie recibe los tramos como `coveredIntervals`.
6. **La narración manda:** el audio de HeyGen se descarta; el clip se recorta o rellena al tramo
   exacto a 25 fps, nunca se retima. `metadata.narrationVersion` sube al reemplazar la narración y
   deja todo avatar **desactualizado** (derivado al leer, nunca persistido); el render lo salta y
   renderiza el fondo estático.
7. **Una fase `avatar`** entre `images` y `animation`; desde el editor, `avatar-render-scenes`,
   `avatar-insert-scene` y `avatar-remove-scene` con el lease de animación.
8. **En el timeline, un bloque morado en la pista de escenas** (`--amethyst`), con la tarjeta
   compartida `TimelineBlockCard` que también adopta el clip animado (diseño de VidRush: borde blanco
   al seleccionar, ficha del tipo, asas solo donde se puede estirar). Sin cuarta pista.
9. **Biblioteca de avatares** como la de personajes (`<projectsRoot>/avatars/<id>/`), con stock de
   HeyGen y creación desde foto con aviso de moderación y casilla obligatoria; clave `heygen` en una
   categoría nueva `avatar` de Claves API.

### Forma

```
voz → transcripción (+sentenceEnd) → cortes (planifica el avatar y corta alrededor)
    → prompts (decorado para el avatar) → imágenes (fondo = imagen de la escena)
    → AVATAR (wav → assets → POST /v3/videos → poll → mp4 → normalizar) → animación (Kie, nunca encima)
    → render (clip mudo sobre la narración; estático con el fondo si falta)
```

| Componente                                | Estado  | Ubicación                                                                  |
| ----------------------------------------- | ------- | -------------------------------------------------------------------------- |
| `Scene.avatar`, `SceneAvatarView`         | nuevo   | `pipeline/types/scenes.ts`, `pipeline/types/avatar.ts`                     |
| `detectSentences`                         | nuevo   | `pipeline/narration/sentences.ts`                                          |
| `planAvatarSpans`                         | nuevo   | `pipeline/avatar/planner.ts`                                               |
| `cutScenesAroundPins`                     | nuevo   | `pipeline/stages/scene-cuts/pins.ts`                                       |
| Proveedor y carril HeyGen                 | nuevo   | `pipeline/providers/avatar/`, `pipeline/avatar/`                           |
| Fase `avatar`                             | nuevo   | `pipeline/stages/avatar/avatar.ts`                                         |
| `collectRenderScenes`                     | reusado | `pipeline/stages/render/animated-scenes.ts` (candidatas de avatar primero) |
| `timelineBlocks`, `clipAt`                | reusado | `src/modules/videos/utilities/`                                            |
| `TimelineBlockCard`, `TimelineAvatarItem` | nuevo   | `src/modules/videos/components/`                                           |
| Biblioteca `avatars`                      | nuevo   | `src/modules/avatars/`, `pipeline/commands/avatars/`                       |

## Alternativas consideradas

- **Fragmentos por tiempo encima de las escenas** (la primera propuesta del camino A): el avatar como
  clip que cubre un tramo y las escenas siguen debajo. Descartada por el dueño («sin escenas debajo»):
  paga imágenes que nadie ve, deja escenas sin sentido en la galería y obliga a un modelo de bloque
  aparte del de las escenas. Si algún día el avatar deja de ser pantalla completa, vuelve como capa.
- **Capa superpuesta** (PixiJS en el visor, `overlay` en ffmpeg, `webm` con alfa): permite mover y
  recortar desde el inicio. Pospuesta al sub-proyecto 3: duplica la vía de render y de visor y hoy no
  hace falta; el audio cortado y el fondo quedan guardados para rehacer los clips con alfa.
- **El modo «studio» de HeyGen** (varias escenas en un pedido): solo fondos de color, mp4 opaco,
  todo o nada. Descartado.
- **Guardar los recibos en `animations[]` con `provider: 'heygen'`**: obliga a filtrar por proveedor
  en todos los consumidores de Kie (regeneración, deshacer, migración de legados). Descartado: un
  campo propio aísla sin tocar nada.
- **Lotes (`/v3/videos/batches`)**: menos viajes, pero un recibo por aparición es lo que hace posible
  pagar una sola vez y reintentar solo lo que falló. Se piden de a tres, uno por uno.
- **Vimo compone el fondo** (pedir `webm` con alfa y `overlay` en ffmpeg): control del encuadre, pero
  WKWebView no reproduce VP9 con alfa y el ffmpeg de Windows no está confirmado. HeyGen compone ahora;
  reconsiderar en el sub-proyecto 3.

## Consecuencias

- ✅ Continuidad real: cada aparición empieza y termina en una frase, con la narración de siempre.
- ✅ Costo exacto y visible antes de pagar (apariciones × segundos × tarifa) y nunca dos veces.
- ✅ Todo lo que ya sabe de escenas (galería, fronteras, render, visor, subtítulos) funciona sin
  aprender nada; un proyecto sin avatar es byte-idéntico.
- ⚠️ Una escena de avatar puede durar hasta 60 s: más que cualquier escena de Kie. Todo lo que suponía
  escenas de 3–12 s debe tratarla como cubierta (`coveredIntervals`), no como candidata.
- ⚠️ Reemplazar la narración deja los avatares desactualizados y hay que pagar de nuevo para
  regenerarlos; el fondo se conserva.
- ⚠️ Los renders de HeyGen tardan minutos; la pantalla de progreso muestra el tiempo transcurrido.
- 🔒 Ningún recibo de HeyGen entra en `animations[]`; ninguna escena de avatar se anima con Kie.
- 🔒 El clip de avatar nunca se retima ni conserva su audio: la narración es el único reloj.
- 🔒 El estado «desactualizado» se deriva al leer; no existe un `stale` persistido.

## Verificación de cumplimiento

- **Guards** (`scripts/test/`): en la entrega 1, `check-heygen-client.mjs` (el cliente de HeyGen y
  el mapeo de errores `avatar_*`) y `check-avatar-library.mjs` (los subcomandos de la biblioteca,
  con el modelo por grupo de la enmienda del 2026-10-09); de la entrega 2 en adelante, `check-narration-sentences.mjs`,
  `check-avatar-planner.mjs`, `check-scene-pins.mjs` y `check-avatar-blocks.mjs` (§15 del diseño).
- **Rust:** `src-tauri/src/api_keys/tests/validation.rs` (rama `heygen`).
- **Greps ejecutables:**
  - `grep -rn "heygen" pipeline/animation` → vacío (el carril de Kie no conoce a HeyGen).
  - `grep -rn "setpts" pipeline/avatar` → vacío (nunca se retima).
  - `grep -rn "'stale'" pipeline/types` → vacío (no se persiste).
- **Build/lint:** `pnpm format && pnpm lint && pnpm build && pnpm check:locales` en verde.
- **Manual:** la QA del dueño por entrega (§15 del diseño), en macOS y Windows.
- **Cómo se vería una regresión:** un proyecto sin avatar cuyo `scenes.json` o render cambia; una
  escena de avatar animada con Kie; un avatar con los labios fuera de sincronía tras reemplazar la
  narración sin aviso de desactualizado; un POST a HeyGen sin intento `creating` persistido antes.

## Modos de falla

- HeyGen falla o rechaza (moderación, motor): la escena renderiza estática con su fondo, el bloque lo
  muestra, no se cobra y se puede reintentar.
- Se pierde la respuesta del POST: intento `ambiguous`; la próxima corrida busca el `title` o repite
  con la misma clave de idempotencia. Nunca se paga dos veces.
- Vence el plazo: el recibo queda `pending` y se cosecha después.
- Sin saldo: pausa con el patrón de voz/imágenes antes de subir nada.

## Fuera de alcance

- Mover, recortar en círculo y animar el avatar; transiciones (sub-proyecto 3).
- Gemelo digital desde video, avatares desde texto, voces de HeyGen, subtítulos de HeyGen.
- Limpieza de clips viejos en `avatar/`.
- Acuerdo formal con HeyGen sobre el uso de la clave del usuario por una app de terceros.

## Referencias

- [Diseño](../handoff/2026-10-09-avatar-heygen/design.md) ·
  [Investigación §7 HeyGen](../handoff/2026-10-07-ai-editor/library-research.md) ·
  especificación OpenAPI de HeyGen (`https://developers.heygen.com/openapi/external-api.json`).

## Enmienda 2026-10-09 — la biblioteca guarda un avatar con sus looks

En la QA de la entrega 1 el dueño pidió ver y guardar los avatares como en HeyGen: un avatar es un
**grupo** con varios looks (el mismo avatar con otra ropa, otro fondo u otro encuadre). La
biblioteca deja de guardar una entrada por look y pasa a guardar **un avatar = un grupo de HeyGen
con sus looks**, con un **look principal**, que es el que usan los videos:

- `metadata.json` guarda `groupId`, `mainLookId` y `looks[]`, cada uno con su `origin` (`heygen` si
  venía del grupo, `vimo` si se generó desde Vimo); la vista previa de cada look vive en
  `looks/<lookId>.<ext>` y se deriva al listar.
- Al agregar un avatar y al elegir su principal, el look tiene que estar listo y soportar
  `avatar_iii` (`AVATAR_DEFAULT_ENGINE`): por decisión del dueño del 2026-10-09, Vimo usa solo ese
  motor por ahora. Un refresco conserva el principal mientras HeyGen no confirme que desapareció y, si
  desaparece sin otro compatible, puede dejar uno listo que no lo soporta: la entrega 2 mira los
  motores del principal, no deduce la compatibilidad de `status: 'ready'`.
- La metadata la reescriben procesos distintos (el sondeo de 15 s, una generación, el principal): se
  escribe con un temporal único por escritura y se relee justo antes con un cambio puro, sin E/S
  entre la relectura y la escritura, para que ninguno pise lo que otro guardó. Las vistas previas
  de `looks/` se escriben antes; lo que depende del cambio va después: la cara del avatar
  (`preview.<ext>`) recién cuando el principal se confirma, y la vista previa de un look generado que
  llega listo, después de registrarlo (lo pagado se guarda primero).
- `avatar-add` recibe `{ groupId, ownership, mainLookId?, gender?, name? }` y guarda el grupo
  entero (`name`, el del listado, es solo para el log de soporte de ADR-0038: el nombre guardado es
  el que da HeyGen); `avatar-refresh` relee el grupo: suma looks, sigue los que procesan y recalcula
  el principal.
- La metadata de la entrega 1 (un look por entrada) se descarta al listar con un aviso en el log: no
  hay videos que dependan de ella y el dueño vuelve a agregar sus avatares, sin costo.
- Tres subcomandos nuevos sobre ese modelo: `avatar-set-main-look` (elegir el principal),
  `avatar-generate-look` («Crear escenario»: un look nuevo desde un prompt con `POST /v3/avatars`
  `type: 'prompt'`, a partir del look principal, con `Idempotency-Key`; HeyGen no publica el precio
  por look, así que la interfaz no promete cifra y muestra el saldo) y `avatar-balance` (el saldo
  de la billetera de la API, que nunca tumba la vista).

Costo si estuviera mal: rehacer la biblioteca local. La entrega 2 (el avatar en el video) toma el
look principal de esta forma. Detalle en el diseño, §12.2.
