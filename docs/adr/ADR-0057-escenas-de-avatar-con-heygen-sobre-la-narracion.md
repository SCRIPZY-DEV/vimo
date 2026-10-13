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
cortada en fronteras de frase (desde la 2g arranca en un inicio de frase y termina entre dos palabras), cuya imagen es el fondo y cuyo clip es el video de HeyGen normalizado
al cuadro del render, mudo, sobre la narración de siempre.

1. **Frases como unidad** (`pipeline/narration/sentences.ts`): `words.json` gana un `sentenceEnd?`
   opcional por palabra (Deepgram con `punctuate=true`, `word` sigue limpio); sin él, pausas ≥ 0,35 s.
2. **Planificador propio** (`pipeline/avatar/planner.ts`): apariciones × segundos del usuario, ajuste
   a frases enteras, mínimo 7 s (5 s desde la 2d), reparto parejo con hueco mínimo de 10 s, determinista;
   desde la 2f, «3 veces en 2 minutos» y una apertura que siempre abre; desde la 2g, cada aparición
   termina en la pausa más cercana a lo elegido y no en frases enteras.
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

> Esta es la forma original: con la enmienda del 2026-10-10 ya no hay decorado ni fondo generado
> (ver «Forma, con la enmienda», más abajo).

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

- ✅ Continuidad real: cada aparición empieza en una frase y, desde la 2g, termina en la pausa más cercana a
  lo elegido, con la narración de siempre.
- ✅ Costo exacto y visible antes de pagar (apariciones × segundos × tarifa) y nunca dos veces.
- ✅ Todo lo que ya sabe de escenas (galería, fronteras, render, visor, subtítulos) funciona sin
  aprender nada; un proyecto sin avatar es byte-idéntico.
- ⚠️ Una escena de avatar puede durar hasta 60 s: más que cualquier escena de Kie. Todo lo que suponía
  escenas de 3–12 s debe tratarla como cubierta (`coveredIntervals`), no como candidata.
- ⚠️ Reemplazar la narración deja los avatares desactualizados y hay que pagar de nuevo para
  regenerarlos; el fondo se conserva (con la enmienda del 2026-10-10 no hay fondo generado: lo que
  se conserva es la vista previa del look, `avatar/look.<ext>`).
- ⚠️ Los renders de HeyGen tardan minutos; la pantalla de progreso muestra el tiempo transcurrido.
- 🔒 Ningún recibo de HeyGen entra en `animations[]`; ninguna escena de avatar se anima con Kie.
- 🔒 El clip de avatar nunca se retima ni conserva su audio: la narración es el único reloj.
- 🔒 El estado «desactualizado» se deriva al leer; no existe un `stale` persistido.

## Verificación de cumplimiento

- **Guards** (`scripts/test/`): en la entrega 1, `check-heygen-client.mjs` (el cliente de HeyGen y
  el mapeo de errores `avatar_*`) y `check-avatar-library.mjs` (los subcomandos de la biblioteca,
  con el modelo por grupo de la enmienda del 2026-10-09); en la entrega 2, en orden alfabético
  (§15 del diseño): `check-app-avatar-blocks.mjs` (el bloque de avatar en el editor),
  `check-app-avatar-create.mjs` (el avatar presentador de Crear), `check-avatar-blocks.mjs` (Kie y
  render), `check-avatar-create-project.mjs` (`create-video-project` con avatar),
  `check-avatar-lane.mjs` (el carril de una escena), `check-avatar-planner.mjs` (el planificador de
  apariciones), `check-avatar-progress-ui.mjs` (la fase `avatar` en la pantalla de progreso, en
  Chrome), `check-avatar-scene-model.mjs` (el modelo de la escena),
  `check-avatar-scenes-skip-images.mjs` (sin prompt ni imagen), `check-avatar-stage.mjs` (la fase y
  el comando del editor), `check-clip-preview-video.mjs` (el visor con un clip real),
  `check-create-avatar-ui.mjs` (la tarjeta de Crear en Chrome), `check-diagnostic-module.mjs` (el
  módulo del log de soporte de cada subcomando real), `check-editor-character-ui.mjs` (el panel y la
  galería del editor no encolan una escena de avatar), `check-narration-sentences.mjs` (las frases),
  `check-scene-pins.mjs` (los cortes alrededor del avatar) y `check-timeline-avatar-ui.mjs` (el
  timeline en Chrome).
- **Rust** (`pnpm test:tauri`): `src-tauri/src/api_keys/tests/validation.rs` (rama `heygen`) y, para el
  log de soporte (ADR-0038), `src-tauri/src/diagnostics/tests/`: `redaction.rs` (qué sube cada evento
  del avatar), `subject.rs` (`avatar-render-scenes` se registra bajo su proyecto) y `recorder.rs`
  (el progreso de un render se muestrea uno cada 30 s, por tipo de evento y no por escena).
- **Greps ejecutables:**
  - `grep -rn "heygen" pipeline/animation` → vacío (el carril de Kie no conoce a HeyGen).
  - `grep -rn "setpts" pipeline/avatar` → vacío (nunca se retima).
  - `grep -rn "'stale'" pipeline/types` → vacío (no se persiste).
- **Build/lint:** `pnpm format && pnpm lint && pnpm build && pnpm check:locales` en verde.
- **Verificación de la entrega 2 (2026-10-10, tras la ola final):** los guards de Node de arriba y
  sus vecinos (`check-catalog-prompts.mjs`, `check-silent-scene-images.mjs`,
  `check-gem-verbatim-lane.mjs`, `check-animation-fallback.mjs`, `check-timeline-layout.mjs` y
  `check-demo.mjs`) pasan con `node --test` desde la raíz (20 archivos, 542 tests); los de Chrome
  (los cuatro del avatar y los cuatro de interfaz anteriores) pasan corridos uno por uno con
  `node scripts/test/<script>` (progreso 90 checks, Crear 45, timeline 28, visor 6 corridas, editor
  5 casos, cabecera de exportar 10, claves 20, personajes 3). `pnpm test:tauri` (69 tests),
  `pnpm check:locales` (2000 claves), `pnpm lint` y `pnpm build` en verde, y los tres greps de
  abajo vacíos. Todo con HeyGen simulado: la QA del dueño, con la cuenta real, es lo que falta, y
  hay comportamientos de HeyGen que solo ella confirma. **A confirmar en la QA del dueño:** (1) si
  `GET /v3/videos?title=` encuentra un render que HeyGen todavía tiene en `waiting` o `pending` (de
  eso depende adoptar por título un pedido cuya respuesta se perdió, en vez de repetir la clave);
  (2) si HeyGen guarda 24 h el error de una clave de idempotencia (un 402 repetido con la misma
  clave tras recargar); (3) cuándo descuenta, al crear o al terminar el render (la spec supone que
  un render `failed` no se cobra); y (4) el orden de las comprobaciones de HeyGen en una repetición
  (cuenta y saldo antes que la clave), ya nombrado en las notas de abajo.
- **Manual:** la QA del dueño por entrega (§15 del diseño), en macOS y Windows.
- **Cómo se vería una regresión:** un proyecto sin avatar cuyo `scenes.json` o render cambia; una
  escena de avatar animada con Kie; un avatar con los labios fuera de sincronía tras reemplazar la
  narración sin aviso de desactualizado; un POST a HeyGen sin intento `creating` persistido antes.

## Modos de falla

- HeyGen falla o rechaza (moderación, motor): la escena renderiza estática con su fondo (con la
  enmienda del 2026-10-10, con la vista previa del look: no hay fondo generado), el bloque lo muestra,
  no se cobra y se puede reintentar. Un rechazo para siempre (moderación o look no soportado) no se
  vuelve a pedir solo al reanudar: la salida es renderizar desde el editor o cambiar el look.
- Se pierde la respuesta del POST: intento `ambiguous`; la próxima corrida busca el `title` (que
  HeyGen encuentre un render todavía `waiting` o `pending` se confirma en la QA del dueño) o repite
  con la misma clave de idempotencia. Nunca se paga dos veces.
- Clave de HeyGen rechazada: al crear, el proyecto no se crea (`avatar_invalid_key`, sin haber
  pagado voz ni imágenes); a mitad de corrida, la fase termina con ese mismo código y no con
  `avatar_incomplete`.
- Vence el plazo: el recibo queda `pending` y se cosecha después (desde la 2d, lo cosecha sin pagar el
  «Regenerar» del editor; reanudar solo si la fase no terminó).
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
  motor por ahora (superado por la 2e: sirve un look que admita algún motor con tarifa y el motor se
  elige en Crear). Un refresco conserva el principal mientras HeyGen no confirme que desapareció y, si
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

## Enmienda 2026-10-10 — el look es el escenario (sin fondo generado)

Decisión del dueño del 2026-10-10 (con una captura de un look 16:9 de HeyGen) que reemplaza el punto
4 de la decisión, la composición del fondo del punto 5 y el respaldo del punto 6:

- **El clip del avatar es la escena.** HeyGen renderiza el look tal cual, con el fondo que el look
  ya tiene (un look «en una cocina» para un video de cocina) y en el formato del proyecto: el pedido
  no lleva `background`, `remove_background` ni `fit`. Las sondas del 2026-10-10 que midieron la
  composición sobre un fondo propio (§17 del diseño) quedan como dato de reserva.
- **Vimo no escribe prompt ni genera imagen para una escena de avatar** (sería una imagen que nadie
  ve): las fases `scene-prompts` e `images` la saltean —sin presencia, director, redactor, juez,
  respaldo ni rescates— y el editor no le regenera imagen (`avatar_scene_without_image`). No existe
  `pipeline/prompts/avatar-backdrop.ts`.
- **La imagen fija de la escena de avatar es la vista previa del look elegido**, copiada al crear el
  proyecto a `<proyecto>/avatar/look.<ext real>`: miniatura en la confirmación, la grilla y el
  timeline, y respaldo estático del render (con el movimiento de cámara de siempre) si el clip falta
  o quedó desactualizado.
- **El look tiene la orientación del formato** (`landscape` para 16:9, `portrait` para 9:16): Crear
  ofrece esos looks (por defecto el principal) y `create-video-project` rechaza otro
  (`avatar_look_orientation_mismatch`).

Forma, con la enmienda:

```
voz → transcripción (+sentenceEnd) → cortes (planifica el avatar y corta alrededor)
    → prompts e imágenes (solo las escenas sin avatar)
    → AVATAR (wav → asset → POST /v3/videos con el look tal cual → poll → mp4 → normalizar)
    → animación (Kie, nunca encima) → render (clip mudo sobre la narración; estático con el look si falta)
```

## Notas de implementación de la entrega 2

- **Sin prompt ni imagen** (tarea 5, enmienda del 2026-10-10): una escena con `avatar` no pasa por
  la presencia, el director, el redactor, el juez, la fase de imágenes, el respaldo ni los rescates
  por política de contenido, y queda en `scenes.json` como la dejó el corte. Su narración sigue en
  las ventanas vecinas: la fase de imágenes decide la época de la escena siguiente con el mismo
  texto que la redacción. El editor no le regenera imagen: en un pedido con escenas de imagen la
  saltea con un aviso (`warn`) y regenera las demás; un pedido que solo trae escenas de avatar se
  rechaza con `avatar_scene_without_image` antes de tocar el disco. Un proyecto sin avatar sale
  byte por byte igual (lo fijan las huellas de `check-gem-verbatim-lane`).
- **Crear** (tarea 12): `create-video-project` valida `options.avatar` (forma, rangos con las
  constantes, motor fijo —desde la 2e, uno de los tres— y `placement`), rechaza la demo con avatar y,
  antes de crear la carpeta, exige que el look elegido —el principal u otro del mismo avatar— sea del
  avatar, esté listo con Avatar III (desde la 2e, con el motor elegido: `avatarEngineAvailable`;
  `isUsableLook`, nunca deducido de `status: 'ready'`) y tenga la orientación del formato: 16:9
  horizontal y 9:16 vertical, según `lookOrientationFit` sobre
  `AVATAR_LOOK_ORIENTATION_BY_FORMAT` (un look sin orientación conocida pasa con un aviso). La
  vista previa de ESE look se lee y se valida antes de crear nada y se copia a
  `<proyecto>/avatar/look.<ext>` con la extensión de sus bytes; si el look no tiene una legible se
  usa la propia del avatar (el `previewFile` de su carpeta, no la del look principal) y, si
  tampoco hay, el proyecto no se crea (`avatar_look_unavailable`). Un avatar cuyo grupo HeyGen ya
  no tiene (`errorCode` `avatar_group_missing`, que conserva `avatar-refresh`) se rechaza con ese
  código antes de crear la carpeta: se mira el código y no `metadata.status`, porque el estado de
  la ficha sale del look principal y otro look del mismo avatar puede estar listo. La lectura de la
  vista previa propia del avatar (`readAvatarPreview`) vive en la biblioteca
  (`pipeline/commands/avatars/avatar-library.ts`), junto a la del look (`readLookPreview`). El
  avatar se persiste en lista blanca (los nueve campos), con el nombre del look de la biblioteca.
  `lookOrientationFit` es puro y browser-safe (`pipeline/avatar/look-orientation.ts`): la sección
  de Crear ofrece los looks con la misma regla con la que el sidecar los acepta. Con todo lo
  local validado y antes de crear la carpeta, el comando lee una vez la cuenta de HeyGen (ver «Ola
  final: la cuenta de HeyGen», más abajo).
- **Kie nunca anima una escena de avatar** (tarea 9): además de viajar como `coveredIntervals`, sus
  ids salen de las marcas (`pipeline/animation/avatar-coverage.ts`), porque el planificador rechaza
  por larga una escena marcada de más de 12 s antes de mirar la cobertura (`slot_out_of_range`) y
  compraría como clip una de 12 s o menos. Vale para `hasAnimationWork`, `generateSceneAnimations`,
  la marca del prefijo (`needsPrefixMarker`) y las cuatro utilidades de la UI (rango del editor y
  su costo de reanudación, galería, panel de la escena y tarjetas del progreso). Con el avatar
  cubierto, dos imágenes del prefijo separadas por él no forman pareja, y una vecina que lo pise no
  invade su tramo. La cobertura cuenta TODA escena de avatar, sin importar su estado (planeada,
  con el pedido en curso, fallida, desactualizada o lista): Kie nunca cubre un avatar. El
  planificador, el render (diseño §10.1) y el visor descartan un clip de Kie heredado bajo cualquier
  avatar: `timelineBlocks` y `clipAt` aplican la misma regla (`overlapsAnySpan`), alineados en la
  ola final (`c765bc18`).
- **Fronteras y edición de una escena de avatar en `update-scenes`** (tarea 9): las fronteras de
  una escena de avatar con clip o con recibos se bloquean (`avatar_timing_locked`, espejo de
  `animation_timing_locked`), la suya y la que comparte con su vecina, también si llega una sola
  mitad de la frontera: mover solo la vecina invadiría el tramo del clip. La UI bloquea las de toda
  escena de avatar (`sceneTimingLocked`), porque no ve los recibos. Además rechaza con
  `avatar_scene_without_image` cualquier edición del prompt, la descripción o los personajes de una
  escena de avatar, sin tocar el disco ni aplicar el resto del lote; la transición estática sí
  pasa, porque el interruptor global la manda a todas las escenas.
- **Render** (tarea 10): `collectRenderScenes` arma primero la candidata de cada escena de avatar
  con la MISMA vista que usan el timeline y el visor (`toSceneAvatarView`: lista, en disco y sin
  `stale` por narración o por tramo) y exige que el clip sea legible. La declara con el hueco
  cuantizado al cuadro (`clipSeconds = slotDurationSeconds`), así el chunk la usa a velocidad 1
  aunque el clip dure unas décimas más o menos y aunque las fronteras hayan quedado al milisegundo
  tras reemplazar la narración. El tramo de TODA escena de avatar, en cualquier estado
  (`avatarCoveredIntervals`), es suyo: un clip de Kie heredado que lo pise se descarta con un
  aviso, esté o no listo el clip del avatar. Sin clip que sirva (planeada, fallida, sin archivo,
  desactualizada, ilegible o más corta que su tramo menos 1 s) la escena sale estática con la vista
  previa del look (`avatar/look.<ext>`) y un `warn`; sin esa vista previa, el render y el export de
  clips fallan con `avatar_render_look_unavailable` (no con `avatar_look_unavailable`, el código de
  Crear: acá el proyecto ya existe): una escena de avatar no tiene `scenes/scene_<id>.jpg`, así que
  nunca cuenta como `render_missing_images`; si además faltan imágenes de escenas comunes, gana
  `render_missing_images` (`clips_no_images` en el export), el camino de siempre. Los subtítulos de
  una escena de avatar van por frase (`detectSentences`), recortados a su tramo; los de las demás
  escenas, y todo lo de un proyecto sin avatar, salen byte por byte como antes. Reemplazar la
  narración conserva `scene.text`: después de reemplazarla, los subtítulos de una escena de avatar
  salen de la transcripción nueva y los de sus vecinas del texto viejo, así que en el borde del
  avatar puede repetirse una palabra o faltar un subtítulo (la regla del punto medio lo amortigua).
- **Frases, planificador y cortes** (tareas 2 a 4): `detectSentences` cierra la frase donde
  Deepgram marca `sentenceEnd` (`punctuate`, también con los terminadores de ja/zh) o, sin él, en
  una pausa de 0,35 s, y parte toda frase de más de 15 s en su pausa más larga. `planAvatarSpans`
  ajusta cada aparición a frases enteras (de 7 a 60 s —de 5 a 60 desde la 2d—, con 10 s de imágenes entre una y otra) y lo
  que no cabe va a `dropped` sin fallar. Un tramo libre de menos de 3 s lo absorbe el avatar, así
  que la última aparición puede pasar hasta 2,99 s del plan: el costo sale de los `avatarSpans` y
  no del plan. La cantidad confirmada se reparte entre los tramos libres por promedios mayores y,
  con prefijo animado, la fuente sobrante de menos de 3 s se une a la anterior. **Riesgo
  residual:** sin prefijo animado, el carril de segundos y la cantidad automática no dan imágenes
  de menos de 3 s; con prefijo y avatar quedan la única fuente corta de un tramo que arranca menos
  de 3 s antes del fin del rango y un resto corto que termina en una aparición (a lo sumo una vez
  cada uno por video), y la cola final del audio, igual que sin avatar.
- **Fase y carril de HeyGen** (tareas 6 a 8 y 15b): el recibo se guarda `creating` antes del POST
  y `pending` después. Un 409 `request_in_progress` se repite con la misma clave (a los 2, 4 y
  8 s) y un 409 o un 429 agotado dejan el recibo `ambiguous`: la próxima corrida lo busca por
  `title` o repite la misma clave. Un rechazo definitivo (un 4xx que no es 409 ni 429, o el
  rechazo local del cliente) lo cierra `failed` y el reintento usa la clave siguiente; en una
  repetición, un 401, un 402, un 403, un 408 o un 425 (o un rechazo por saldo) lo dejan
  `ambiguous`, porque se supone que HeyGen resuelve la cuenta y el saldo antes de mirar la clave de
  idempotencia (a confirmar en la QA del dueño, con red); lo mismo cualquier rechazo que llega
  después de un `409 request_in_progress` del mismo pedido (`sawRequestInProgress`: el original
  sigue en vuelo). El render se sondea a los 5 s y cada vez más espaciado hasta 20 s, con un
  plazo de 30 min: pasado el plazo el recibo queda `pending` y se cosecha después. La fase corre
  de a tres, cosecha antes de pagar y mira el saldo antes de cada pago nuevo (diseño §8): la
  relectura no cuenta las escenas ya admitidas que todavía no se cobraron, así que detecta un
  gasto ajeno mayor que lo que está en vuelo y uno menor lo ataja HeyGen con un 402. La
  cosecha puede repetir un POST con la misma clave antes del saldo, porque HeyGen deduplica: si el
  original nunca llegó es el primer pago, y sin saldo HeyGen lo rechaza con un 402 y la fase
  pausa. `avatar-render-scenes` es la misma operación bajo el lease compartido de animación: una
  escena lista con el mismo pedido no se vuelve a pagar.
- **Diagnóstico** (tarea 16): `avatar-render-scenes` es un job del proyecto (Rust por su
  `projectId`; el webview por la palabra `scene`); `dropped` entró a `ALLOWED_EVENT_KEYS` con la
  tarea 1 y `avatar-scene-progress` no se ignora: se muestrea uno cada 30 s por tipo de evento
  (no por escena) como todo progreso sin porcentaje; un test de Rust lo fija con tres escenas
  intercaladas.
- **Ola final: lo que la persona tiene que saber antes de pagar** (2026-10-10): `scene-cuts` emite
  `avatar-planned { sceneIds, dropped }` antes de la pausa de confirmación, con las descartadas del
  plan (una vez por corrida; la interfaz lo toma como un valor, no suma) y, en el job que corta o
  reusa el corte, con las pedidas que le faltan a ESE corte (`droppedAppearances`): un corte reusado
  tras reemplazar la narración no da por descartadas apariciones que siguen en el video.
  `video-project-status` devuelve `avatarSpans` y `avatarDropped` recalculados desde `words.json` (el
  planificador es puro; no se persisten) dentro de un `try`: un `words.json` roto omite los dos campos
  en vez de impedir abrir el proyecto. Así la pausa rearmada tras reiniciar la app trae la línea del
  avatar, su costo y las descartadas. La
  interfaz dice «Ninguna aparición del avatar entra en esta narración» antes de pagar las imágenes,
  suma «N apariciones no entraron», deja la nota de descartadas en el progreso aunque la fase se
  saltee, muestra «≈ N escenas · M imágenes» en el diálogo por cantidad y, si HeyGen se degrada,
  un aviso pasajero. Reanudar no pide saldo de HeyGen si ninguna aparición entró.
- **Ola final: la cuenta de HeyGen**: `create-video-project` hace UNA lectura gratis de la cuenta
  antes de crear la carpeta (401 o 403 → `avatar_invalid_key`; sin clave → `missing_api_key`; red
  caída, 429, 5xx o más de 8 s solo avisan: la lectura lleva su propio plazo y no repite el 429; el
  saldo no frena), para no descubrir una clave muerta con la voz y las imágenes ya pagadas. La fase
  lanza el código de la cuenta (`avatar_invalid_key`, `missing_api_key`,
  `avatar_insufficient_credits`) si alguna escena falló por ella, en vez de `avatar_incomplete`: ese
  código manda sobre cualquier otro fallo, sea cual sea el orden en que terminan las escenas; el
  saldo se compara en millonésimas de dólar; y Crear apaga el avatar del formulario (no solo la
  tarjeta) cuando falta la clave.
- **Ola final: lo incierto y los rechazos**: el cliente marca `sawRequestInProgress` y el carril deja
  `ambiguous` todo rechazo posterior a un `409 request_in_progress`; 408 y 425 se suman a los status
  que no dicen nada de una repetición; `listVideos` conserva un render de estado desconocido con id y
  título; un render que HeyGen rechazó para siempre (moderación o look no soportado) no se vuelve a
  pedir solo —la cabecera de la interfaz manda a renderizar desde el editor o cambiar el look,
  `avatarRejected`— salvo cuando lo pide la persona con `avatar-render-scenes`
  (`retryFinalRejection`; su botón en el editor, «Regenerar», es de la entrega 2d); el mp4 se marca desactualizado
  solo cuando una escena recibe un clip nuevo; `requestedAvatarSceneIds` es la única validación de
  los `sceneIds` del comando; al entrar al carril se barren los temporales de un job matado.
- **Ola final: look, render y editor**: un look generado con «Crear escenario» guarda la orientación
  del formato pedido si HeyGen no informa la suya (`preferredOrientation`; 1:1 queda `square`, que no
  sirve en 16:9 ni en 9:16); el render y el export emiten `avatar_render_look_unavailable` (con su
  texto propio) y un clip más corto que su tramo menos 1 s sale estático con el aviso
  `avatar clip is too short`; `update-scenes` rechaza también `imageModel` e `imageQuality` en una
  escena de avatar; el panel muestra su In/Out de solo lectura sin la sección de animación, y la
  galería, el aviso de imágenes faltantes y «Regenerar imagen» no la cuentan (la galería, desde la
  entrega 2f, igual la muestra con su propia tarjeta, sin dejarla elegir para las acciones de
  imágenes).
- **Ola final: cortes y frases**: en el carril de segundos, la cantidad confirmada se traduce a
  segundos sobre el audio libre y las escenas libres, no sobre los pines; ninguna frase dura 0
  cuadros (la palabra recortada al fin del audio se une a la anterior); `TIME_EPSILON`
  (`pipeline/animation/timing.ts`) es único para frases, planificador y pines (los planificadores de Kie conservan los suyos), y `avatarSceneSpan`
  (`pipeline/types/avatar.ts`) es la única regla de «avatar de largo cero», en el carril, la
  cobertura de Kie, la pista y el visor.

## Enmienda 2026-10-11 — entrega 2b (la QA del dueño de la entrega 2)

Pedidos del dueño del 2026-10-11 tras probar la app `0.9.3-editor.4`, con capturas de HeyGen y de
Vimo. Los hechos de las dos sondas gratis de ese día y la tabla de decisiones están en §18 del
diseño; los rulings numerados de la ejecución (R10 a R38) están en
`docs/handoff/2026-10-09-avatar-heygen/execution-e2b/ledger.md` (interno). Nada de esto agrega un pedido que
cobre: todo lo nuevo de HeyGen son `GET` gratis. Donde el diseño dice otra cosa que esta enmienda
(cuándo se descarta el borrador de Crear, §9, y desde cuándo se piden los looks del stock al pasar
el mouse, §12.2), manda esta enmienda.

- **Planificador (§5).** Cada aparición arranca en la frase más cercana a su ancla **desde la que
  cabe** (antes, la más cercana y, si no cabía, se descartaba). Una aparición nunca carga más de
  `AVATAR_MAX_PAUSE_SECONDS` = 2 s de silencio después de la última palabra de una frase:
  `NarrationSentence` trae `lastWordEndSeconds` y el fin recortado de una frase es
  `min(endSeconds, cuadro(lastWordEndSeconds + 2 s))`; una frase recortada cierra la aparición y el
  silencio que sobra pasa a la escena de imagen siguiente (una escena sin palabras ya era un caso
  del corte). El tope no deja una cola corta ni pasa el máximo después del corte (rulings R10, R34 y
  R37): si el fin recortado queda a menos de `MIN_SECONDS_PER_SCENE` del fin del audio, el tramo
  llega a su fin nominal, porque `pinnedTimeline` absorbería esa cola igual; el **mínimo** de 7 s (5 s desde la 2d) se
  mide hasta el fin recortado (una última frase casi muda no es una aparición) y el **máximo** de 60
  s con lo que deja el corte: una aparición que terminaría a menos de 3 s del fin del audio se mide
  hasta el fin del audio, con tope de silencio o sin él, y si ni así entra se queda una frase antes
  o, sin otra frase desde la que quepa, va a `dropped`. Esto precisa la nota de la entrega 2 («la
  última aparición puede pasar hasta 2,99 s del plan»): sigue pudiendo alargarse hasta 3 s respecto
  del plan, pero nunca por encima de los 60 s. Una pausa larga adentro de una frase de 15 s o menos
  se carga entera (límite deliberado). Sin avatar nada cambia.
- **Subtítulos (§10.1).** Una frase es de la escena de avatar por el punto medio de su parte hablada
  (de su inicio a `lastWordEndSeconds`): con el tope, la última frase de una aparición puede
  terminar después de la escena y, medida entera, sus palabras no salían en ningún subtítulo.
- **Biblioteca (§12.2).** Los filtros de HeyGen no existen en su API: Vimo deriva «Profesional»
  (estudio), «Comunidad» (gemelos) y «Estilo de vida» (los demás, de foto) del tipo de look con el
  subcomando `avatar-stock-types` (dos barridas gratis de `GET /v3/avatars/looks` por `avatar_type`,
  caché de 24 h en `avatars/.stock-types.json`). Una barrida sin ningún grupo se toma por un
  `data: []` pasajero: no se guarda y, si hay una caché legible, sirve esa (R29); en la app, una
  clasificación vacía no se cachea (`staleTime` 0): reabrir el stock la pide otra vez y el diálogo
  dice «Clasificando…» mientras tanto (R30 y R35). «Favoritos» es una lista local (store
  `avatars.json` de la app): se guarda con escrituras en cola (si una falla, avisa y relee el store
  cuando la cola se vacía) y un favorito que el listado público completo de HeyGen ya no trae no se
  borra del store (R38): solo se oculta y en la sesión deja de contar para la auto-carga de
  «Favoritos». «UGC» no se ofrece. La tarjeta del stock reproduce al pasar el mouse el video del
  look de portada cuando el grupo no trae video; la de la biblioteca, el de cada una de sus tres
  imágenes, compacta y con la misma altura en su fila. Los looks se piden recién cuando el mouse
  queda quieto 250 ms sobre la tarjeta (`HOVER_FETCH_DELAY_MS`) o con el foco del teclado: cruzar
  una grilla no lanza un proceso del sidecar por tarjeta. Un clic en un look abre su reproductor
  (`LookPlayerDialog`: sin autoplay —superado por la 2d: arranca solo—, con sonido solo desde un clic, línea de tiempo, velocidad,
  silencio y pantalla completa) con «Cargar a la biblioteca» en el stock y «Usar como principal» en
  el panel; las fichas de looks siguen del mismo tamaño aunque el look sea vertical.
- **Crear (§9).** El look se elige en un desplegable con el principal de la biblioteca por defecto y
  la vista previa del elegido al lado (la de disco o, si falta, la del listado de HeyGen, con su
  video al pasar el mouse; superado por la 2c: tarjetas y botón «Look», en la enmienda de abajo);
  el aviso de moderación es un recuadro destacado con título. El
  formulario vive también en un borrador en memoria del módulo: «Crear escenario» y los demás
  enlaces que salen de Crear ya no lo pierden; un formulario intacto no se guarda, «Crear otro» y
  cerrar la confirmación de escenas lo guardan, y en la demo no se usa. Se descarta cuando el
  proyecto de la generación ya existe (`onProjectCreated` de `startCreation`), no antes: un
  pre-chequeo que frena, una cancelación o un `createProject` que falla lo dejan (R36). Lo que
  ninguna pantalla de Crear edita y solo siembra Ajustes (la duración de escena de las gemas y su
  pausa) sale siempre de la preferencia actual y no del borrador (R32). Cerrar sesión no lo borra
  (un reinicio sí): residual aceptado, como la tarea en curso.
- **Módulos (R33).** Crear (`videos`) consume hooks y componentes del módulo `avatars`
  (`LookPreview`, `useStockLooks`) como ya lo hace con `voices`, `api-keys` y `settings`: es la
  práctica del repo para esa pantalla. Costo si estuviera mal: mover `LookPreview` a `common`.
- **Verificación.** Guards nuevos: `check-avatar-library-ui.mjs` (la biblioteca en Chrome),
  `check-create-draft.mjs` (el módulo del borrador, 5) y `check-create-draft-ui.mjs` (Crear entera
  en Chrome). Ampliados: `check-avatar-library.mjs` (90, con `avatar-stock-types`),
  `check-avatar-planner.mjs` (25), `check-scene-pins.mjs` (39), `check-avatar-blocks.mjs` (44),
  `check-narration-sentences.mjs` (24) y `check-create-avatar-ui.mjs` (57 checks). Todo con HeyGen
  simulado. **A confirmar en la QA del dueño, con la app real:** las capas de WebKit sobre el video
  (la barra del reproductor y el corazón de la tarjeta), la pantalla completa en la WebView de
  Tauri, `play()` con sonido tras un clic en la WKWebView y «Cargar a la biblioteca» de punta a
  punta.

Costo si estuviera mal: las categorías son una aproximación por tipo de look (un mapeo distinto es
un cambio de constantes) y la frase más cercana, el tope de silencio y el máximo son reglas puras
del planificador (`planner.ts`). La ADR sigue en «Propuesta»: pasa a Aceptada con la QA del dueño.

## Enmienda 2026-10-11 (tarde) — entrega 2c

Pedidos del dueño tras la 2b (hechos y decisiones: §19 del diseño; rulings:
`docs/handoff/2026-10-09-avatar-heygen/execution-e2c/ledger.md` (interno)). El único `DELETE` nuevo es gratis:
nada cobra de más.

- **Borrar de verdad (G1).** «Mis avatares» elimina el avatar en HeyGen
  (`DELETE /v3/avatars/{group_id}`, con sus looks) tras una confirmación en dos pasos (superada
  por la 2d: un menú con dos opciones, en la enmienda de abajo); solo los propios (HeyGen no borra los
  públicos). HeyGen primero, el disco después, y un 404 cuenta como
  borrado: un fallo de HeyGen nunca saca de la biblioteca un avatar que sigue existiendo.
- **Formato de la ficha (G2).** Manda la orientación de HeyGen; sin ella, el formato más cercano a
  las medidas de la imagen; sin datos, sin chip.
- **Título del render (H1).** `<nombre del video> · <marca>`: la marca sigue siendo la clave de
  recuperación y el recibo guarda el título exacto. Se adopta primero el render de título exacto
  (pedido también por él, por si HeyGen filtra por igualdad) y, sin él, uno que termina en la marca
  y no está `failed` (R-H1 a R-H4); una copia hecha en HeyGen nunca le gana al exacto.
- **Coral legible (I1).** `text-coral-text` (`5 85% 42%` en claro: ≥ 4,71:1, contra 2,31:1 a 2,86:1
  del coral pleno) para texto e íconos de aviso; el coral pleno queda en fondos, bordes y adornos
  (R-I3 y R-I4 lo extendieron a los rellenos con texto blanco).
- **Tarjetas y botón «Look» (J1).** Las tarjetas de la fila tienen el formato del video; el botón
  «Look» abre la grilla de todos los looks, los de otro formato visibles pero no elegibles.

**A confirmar en la QA del dueño:** cómo filtra `GET /v3/videos?title=` (la sonda gratis del
2026-10-11 no encontró renders para probarlo), si HeyGen conserva el final del título (hasta unos
170 caracteres) y en qué orden lista renders y copias. La ADR sigue en «Propuesta».

## Enmienda 2026-10-11 (noche) — entrega 2d

Pedidos del dueño tras la 2c, con una captura de la grilla «Look» de Crear (hechos y decisiones: §20
del diseño; rulings: `docs/handoff/2026-10-09-avatar-heygen/execution-e2d/ledger.md` (interno)). Lo único
nuevo que puede cobrar es el «Regenerar» del editor, que pide el mismo `POST /v3/videos` que la fase
`avatar` —con el costo y el saldo a la vista antes de confirmar—; el `DELETE` de la 2c sigue siendo
gratis. Donde el diseño o las enmiendas de arriba dicen otra cosa que esta, manda esta.

- **Crear: el look se mira en el reproductor y se elige con «Usar» (R-2d-1).** Un clic en una ficha
  de la grilla «Look» abre el `LookPlayerDialog` de Avatares, con la acción nueva `use` («Usar»), y
  ya no elige. «Usar» elige el look, cierra el reproductor y la grilla y deja el foco en el botón
  «Look»; el look que no sirve abre igual y dice por qué, con una frase propia por motivo
  (`LOOK_PLAYER_REASON_KEYS`) y sin «Usar». La grilla deja de ser un `radiogroup` (un clic ya no
  elige): es una lista de botones, con `aria-current` y «Elegido» en el look elegido. El reproductor
  arranca solo al abrirse, en los tres lugares donde se usa (stock, panel y Crear): con sonido y, si
  el navegador rechaza la reproducción automática, silenciado y con «Activar el sonido». Reemplaza
  el «sin autoplay» de la 2b y el «elegir con el clic» de la 2c (J1).
- **Eliminar con dos opciones (R-2d-2).** El botón de eliminar abre, en la misma tarjeta, «Eliminar
  de la lista» (saca el avatar de la biblioteca de Vimo sin otro paso; sigue en HeyGen y se puede
  volver a agregar) y, solo en un avatar propio (`ownership: 'own'`; el `'private'` es el del
  listado de HeyGen), «Eliminar permanentemente de HeyGen», que se vuelve «Seguro» en su mismo lugar
  y deja «Cancelar» en el de la lista: la revisión midió que, con «Seguro» donde estaba la lista, un
  clic de corrección borraba de HeyGen para siempre. Va en la tarjeta y el panel de la biblioteca y
  en «Mis avatares» (donde «de la lista» aparece solo si el avatar está en la biblioteca). Siguen
  las guardas de la 2c (ni una tecla sostenida ni el segundo clic de un doble clic confirman, ni
  abren lo que queda debajo), el foco entra a la primera opción sin desplazar la grilla, Escape
  cierra solo el menú y hay un
  borrado de HeyGen a la vez. Reemplaza la confirmación en dos pasos de la 2c (G1).
- **Los textos de avatares sin HeyGen (R-2d-3).** Los mensajes de avatares, Crear, progreso, editor
  y errores dejan de nombrar al proveedor («el servicio de avatares», «tu saldo de avatares», «la
  clave del avatar presentador»). El nombre queda en Claves API, donde identifica la clave, en el
  borrado en HeyGen y en las filas del aviso de saldo y de «Faltan claves», que dicen qué cuenta
  recargar o qué clave cargar. Un guard permanente (`check-avatar-texts-without-provider.mjs`) falla
  si el valor de una clave de los catálogos lo nombra fuera de cuatro claves permitidas.
- **Una aparición que falla no frena el video (pregunta 6, R-2d-4 y R-P2).** La fase `avatar` deja
  de lanzar `avatar_incomplete` por el fallo de una escena (render fallido, plazo vencido,
  moderación, look no soportado, descarga, HeyGen caído): termina con un aviso en el log y el render
  deja esa escena con la imagen fija del look (§10.1, ya existía). Los códigos de la cuenta
  (`avatar_invalid_key`, `missing_api_key`, `avatar_insufficient_credits`) siguen lanzando el suyo y
  pausando, y una pausa de la cuenta no completa la fase. Terminada, la fase no vuelve a correr al
  reanudar: las apariciones con la imagen fija se regeneran desde el editor, que también cosecha sin
  pagar un recibo `pending` vencido (antes lo hacía reanudar). Una sola regla, `isAvatarFallback`,
  decide cuáles cuentan —las fallidas y la lista que perdió su clip; la desactualizada nunca; la
  planeada solo en un proyecto ya hecho— para la fila del progreso, el aviso del final de Crear, el
  del reproductor de la biblioteca y el del editor. `avatar_incomplete` queda solo en proyectos de
  antes de la 2d.
- **La desactualizada no se paga sola (R-2d-5).** Una escena lista y desactualizada no es pendiente
  aunque le falte el clip (`isAvatarScenePending`, con `isAvatarClipStale`): reanudar no la paga y
  el render la muestra estática con la vista previa del look. El costo de reanudar cuenta
  exactamente lo que la fase va a pagar. La vista marca `stale` también en la que perdió su clip, y
  el bloque y el panel del editor la muestran «desactualizada» antes que «fallida» (regenerarla paga
  otro render; el texto de la descarga decía que ya estaba paga).
- **Mínimo de 5 s (pregunta 4).** `AVATAR_MIN_APPEARANCE_SECONDS` baja de 7 a 5; el máximo (60 s),
  el hueco (10 s) y las 10 apariciones no cambian. Las preguntas 1, 2, 3 y 5 del 2026-10-10 ya
  regían como se recomendó.
- **Regenerar desde el editor (R-2d-6, adelantado de la entrega 3).** Sin esto, las escenas quietas
  de los dos puntos anteriores no tenían salida. El panel de una escena de avatar ofrece «Generar
  avatar» (planeada), «Regenerar avatar» (fallida, desactualizada o lista sin clip; la 2e suma la
  lista al día) y «Regenerar todos (N)» (todas las de avatar sin clip válido o desactualizadas), con
  una confirmación que muestra la cantidad, el costo (el de Crear, por la duración real de cada
  tramo y, desde la 2e, con el motor de cada escena) y el saldo de avatares, releído antes de pagar. Corre `avatar-render-scenes { projectId, sceneIds }` como una
  tarea del editor, exclusiva (Crear espera: no lanza ni reanuda el pipeline de un proyecto con una
  tarea del editor en curso) y cancelable, con el avance en el bloque del timeline; al terminar
  relee el proyecto y el video exportado queda desactualizado como con cualquier cambio. Arriba del
  editor, el aviso de lo que sale con la imagen fija regenera exactamente lo que cuenta
  («Regenerarlas (N)»; el «Regenerar todos (N)» del panel cuenta además las desactualizadas).
  «Cambiar avatar», «Avatar aquí», mover y estirar siguen en la entrega 3.
- **Módulos (R-2d-7).** La práctica de la 2b (R33) pasa a una excepción escrita: `videos` puede
  importar la `api/`, los hooks, los tipos, las constantes públicas, las utilidades puras y los
  componentes de selección o vista previa de otros módulos (`CLAUDE.md` y la enmienda del 2026-10-11
  de la ADR-0005); ningún otro módulo la tiene.
- **Verificación.** Guards nuevos: `check-editor-avatar-regenerate-ui.mjs` (194 checks) y
  `check-avatar-texts-without-provider.mjs` (12 tests). Ampliados o reescritos:
  `check-create-avatar-ui.mjs` (181), `check-avatar-library-ui.mjs` (45), `check-avatar-stage.mjs`
  (39), `check-avatar-planner.mjs` (27), `check-avatar-scene-model.mjs` (12),
  `check-avatar-create-project.mjs` (62), `check-avatar-progress-ui.mjs` (134) y
  `check-timeline-avatar-ui.mjs` (31). Todo con HeyGen simulado: la ejecución no gastó saldo.

**A confirmar en la QA del dueño, con la app real:** el reproductor que arranca solo con sonido en
la WKWebView y su respaldo silenciado (también cuando el listado de Crear llega después del clic);
el anillo de foco en la primera opción del menú de eliminar al abrirlo con el mouse y la tarjeta de
«Mis avatares» que queda «activa» al salir con el puntero; el aspecto del panel con las opciones en
dos celdas iguales y los dos temas; un «Regenerar» con un render real. Y dos decisiones de producto:
la confirmación del editor muestra el costo completo aunque recuperar un render ya pagado y sin
cosechar sea gratis (la vista no expone los recibos), y una caída total de HeyGen deja el video sin
avatar y reanudar no lo reintenta.

Costo si estuviera mal: el arranque automático es una condición de `useLookPlayback`; el menú de
eliminar, el texto y el efecto de un botón; que reanudar reintente las fallidas es quitar la línea
del `skip` de la fase que mira `completedStages` y volver a contar el avatar en
`estimateResumeCost`; «Regenerar» son botones sobre un comando que ya existía. La ADR sigue en
«Propuesta»: pasa a Aceptada con la QA del dueño.

## Enmienda 2026-10-12 — entrega 2e

Pedidos del dueño tras la 2d, con tres capturas (la grilla «Imágenes» del progreso, el panel «Generando
el avatar» y la guía de movimiento del proveedor); hechos y decisiones: §21 del diseño; rulings
(`R-2e-N`, y `R-U-N`, `R-X-N` de cada paquete): `docs/handoff/2026-10-09-avatar-heygen/execution-e2e/` (interno)
(`ledger.md` (interno) e informes). El dueño pidió construir todo sin preguntar («no preguntes nada y haz todo lo
necesario»): donde un pedido admitía dos lecturas, la decisión dice cuál se tomó para que la corrija en
la QA. Lo nuevo que puede cobrar: un video con Avatar IV o V (más caros por minuto que III) y el
«Regenerar» de una escena lista, un render nuevo con el costo y el saldo a la vista antes de confirmar;
el prompt de movimiento y «más expresivo» no suman costo en la tabla del proveedor (R-2e-3). Antes de
empezar, el estado de la 2d quedó marcado con la etiqueta local `avatar-2d-funcional` (`550e7f14`, sin
push). Donde el diseño o las enmiendas de arriba dicen otra cosa que esta, manda esta.

- **El motor se elige en Crear (R-2e-5, §21.3).** Con un look elegido, la tarjeta ofrece Avatar V, IV y
  III en el orden del dueño (`CreateAvatarEngine`: un `radiogroup` propio fuera de la grilla de looks),
  cada uno con su nombre, la descripción que dictó el dueño y el costo de este video a su tarifa por
  minuto; el que el look no admite queda apagado y dice por qué; por defecto, Avatar III (lo de hasta
  ahora y lo más barato). El motor elegido es una **preferencia**: el que sale es `selectedAvatarEngine`
  (`avatarEngineFor` sobre los `supportedEngines` que `SelectedAvatar` copia del look al elegirlo), el
  preferido si el look lo admite y, si no, el primero en el orden III, IV, V, derivado en el render:
  elegir otro look nunca parchea el motor. Ese es el `options.avatar.engine` que viaja y el que cobran la
  tarjeta del costo, el chequeo de saldo, la pausa de confirmación de escenas y el costo de reanudar
  (R-2e-12: `avatarEngine` llega a la tarea, a la pausa y a `AvatarSpansNote`, y la pausa rearmada desde
  el disco lo lee de `options.avatar.engine`; una tarea guardada antes de la 2e no lo trae y cobra a la
  tarifa de III, como antes). `create-video-project` lo revalida contra la biblioteca antes de pagar
  (`avatarEngineAvailable`: el look lo admite y Vimo tiene tarifa para su tipo; si no,
  `avatar_look_unavailable`), y la elección guardada deja de valer si el look ya no admite alguno de los
  motores de su copia (el selector avisa y el envío se frena; al elegirla de nuevo la copia trae los motores
  de hoy y la preferencia no se toca). Reemplaza el motor fijo de la enmienda del 2026-10-09 y lo que la
  entrega 2 decía de él.
- **Un look sirve con cualquier motor (§21.3, WP-Y).** Un look es compatible si está listo y admite al
  menos un motor con tarifa (`lookEngines`, `isUsableLook` del sidecar): Crear, agregar un avatar, el look
  principal y «Cargar a la biblioteca» ya no exigen Avatar III, y `VIMO_AVATAR_ENGINE` desaparece. Las
  fichas de looks, el reproductor, la tarjeta de la biblioteca y el encabezado del panel muestran una
  pastilla por motor admitido (V, IV, III) dentro de un grupo con nombre (`LookEngineChips`; las
  pastillas van con `aria-hidden` para que el lector de pantalla diga cada motor una sola vez); «No
  compatible con Vimo» solo si no admite ninguno y está listo. Los motores de la tarjeta y del encabezado
  son los del look principal.
- **Tarifas (R-2e-2, R-2e-3, §21.1).** Avatar V pasa a 7,20 USD por minuto con cualquier tipo de look: el
  proveedor solo publica V con gemelo digital, y con looks de foto o de estudio se estima a esa tarifa
  como **techo** (el plan web cobra V igual con looks de foto y de video) hasta medir el cobro real en la
  QA; IV, 4,83 con gemelo o estudio y 2,31 con foto; III no cambia. El prompt de movimiento y
  `expressiveness` no suman costo (la tabla del proveedor no los cobra): la interfaz dice «No suma
  costo» y la QA lo mide. Un motor o un tipo de look fuera de la tabla no tiene tarifa (`null`, no
  `undefined`) y no cuenta como disponible.
- **Avatar III sale como siempre (R-2e-1).** El pedido lleva `engine: { type: 'avatar_iii' }` y nada
  más: `AvatarIIIEngineConfig` solo acepta `type` y la API no tiene la opción «movimiento de cuerpo
  entero» del estudio web (que la guía del proveedor marca como la opción por defecto de III). El
  cuerpo, la huella, la clave, el título, `options.avatar` y los recibos guardados de un video con
  Avatar III son byte a byte los de antes de la 2e (los recibos se siguen cosechando sin pagar): lo fijan
  los guards, con huellas y un cuerpo crudo calculados con el código de antes del cambio, y la revisión de
  WP-S lo comprobó contra el carril de `avatar-2d-funcional`.
- **Movimiento automático con V e IV (R-2e-4, R-2e-9, R-2e-10, R-2e-13, §21.2).**
  `pipeline/avatar/motion-prompt.ts` escribe el `motion_prompt` de cada aparición cuyo motor y look lo
  admiten (V con cualquier look; IV con uno de foto: `avatarMotionSupport`) en un solo llamado antes del
  primer pedido de la escena, en inglés y con la estructura de la guía del proveedor: parte del cuerpo,
  acción e intensidad, hasta 160 caracteres, solo cara, manos, postura, mirada y quietud, y un porte
  sostenido en una aparición de más de 10 s (el proveedor repite el movimiento propio). Usa el cliente de
  texto de movimiento de las animaciones (`createAnimationLlm`, tier `balanced`); sin la clave de
  DeepInfra, con el modelo caído o con una respuesta que no pasa la validación, la escena usa una
  plantilla profesional por posición (abre, medio, cierra, larga), con o sin «más expresivo»: nunca frena
  el render y lo único que propaga es la cancelación. La validación rechaza lo vacío, lo largo y los 47
  términos de lo que el proveedor no controla (cámara, lugar, objetos, pararse o caminar, fondo y luz, con
  sus flexiones; sin `tilt`, porque «head tilt» es postura). Se guarda en la escena (`autoMotionPrompt`,
  `motionPrompt` con `motionSource: 'auto'`, `autoMotionTextHash`) y un prompt que escribió la persona
  (`'user'`) nunca se toca. Se reescribe si cambia el texto de la escena o «más expresivo» (la huella del
  automático incluye el tono, R-2e-10: con V es la única forma de que el interruptor cambie el pedido) y
  **no** mientras el pedido actual de la escena tenga un recibo que el carril cosecharía, en vuelo o ya
  pagado: cambiarlo cambiaría el pedido y pagaría otro render (R-U-1, R-U-2). Un `motionPrompt` vacío sin
  automático no es una elección de la persona: Vimo escribe el suyo (R-2e-9). El prompt no llega al log de
  soporte: los logs del sidecar dicen ids y conteos, y viaja solo dentro de la vista de la escena de
  `avatar-scene-ready` (como ya viajaba `imagePrompt`), que el diagnóstico de Rust descarta entera.
- **«Movimiento más expresivo» (R-2e-3, R-2e-10, R-2e-14).** Un interruptor con su ayuda en Crear y en el
  editor (desde la 2g, solo con IV y un look de foto), visible con V o IV y apagado, con el motivo, con IV y un look de video (donde no haría nada y
  donde Crear tampoco dice «Vimo escribe el movimiento…», porque el proveedor no acepta `motion_prompt` y
  la frase sería falsa); viaja como `options.avatar.expressive: true`, solo si el motor y el look lo
  admiten. Con IV y un look de foto el pedido manda `expressiveness: 'high'`; V rechaza `expressiveness`,
  así que ahí el interruptor cambia el prompt que escribe Vimo y, sobre un prompt de la persona, el pedido
  le suma al final «More energy and clearer gestures.» —o la lleva sola si el prompt está vacío— (R-2e-14;
  entra en la huella y en el recibo, y el prompt de la escena queda como lo escribió).
- **El pedido lleva el movimiento y la huella lo sabe (WP-S, §7.1 y §7.2).** `createVideo` suma
  `motion_prompt` y `expressiveness` al final del cuerpo y solo cuando vienen. `avatarRequestHash` suma al
  final, solo cuando van, `['motion', prompt]`, `['expressiveness', 'high']` y `['take', n]` con n > 0;
  `avatarRenderHash` no cambia (editar el movimiento no deja la escena desactualizada). El recibo guarda
  el movimiento que salió y una repetición manda el mismo cuerpo bajo la misma clave.
- **Un rechazo del movimiento no frena la escena (§14).** Un 400 con `param` `motion_prompt` o
  `expressiveness` (la 2f lo amplía al 400 sin `param` cuyo mensaje nombra el campo, abajo) es
  `avatar_motion_unsupported` (después del saldo, antes que la moderación, sin copiar
  el texto de HeyGen, que podría repetir el prompt, y sin ser un rechazo definitivo): el intento queda
  `failed`, la escena `motionUnsupported` y el carril pide enseguida, en la misma corrida, el mismo pedido
  sin movimiento (otra huella, otra clave); en la cosecha, que no tiene permiso para pagar, lo pide
  después de leer el saldo (`needs-request`). Si ese también falla, sigue el camino de siempre, sin un
  tercer pedido. Una escena `motionUnsupported` no vuelve a pedir movimiento con el mismo prompt y el
  editor lo dice; desde la revisión final (`9021f835`, `009a1654`), un prompt distinto escrito en el
  editor borra la marca y vuelve a intentarlo, porque el rechazo pudo ser del prompt (su largo) y no del
  look.
- **Regenerar una escena lista (R-U-1 a R-U-3, C1 de la revisión de WP-U, §21.4).** Toda escena de avatar
  lista, al día y con su clip ofrece «Regenerar avatar» (`retake`), con su costo al motor de la escena
  (hasta la 2d el editor cobraba todo a la tarifa de III). `avatar-render-scenes` acepta
  `regenerateSceneIds` y `motion: [{ sceneId, motionPrompt, expressive }]`, validados antes de hablar con
  HeyGen. Es un render nuevo pagado aunque nada cambie: la **toma** (`take`) sube en uno, y entra en la
  huella, cuando el render cobrado del pedido actual de la escena **es el clip que se ve** (su clave es la
  del nombre de `clipFile`), así el carril no lo cosecha gratis. Un recibo en vuelo de la toma actual se
  cosecha sin pagar otro, y si el render nuevo se cobró pero no se pudo bajar (falló la descarga o la
  normalización, o la persona canceló al bajar) la toma **no** sube: el próximo «Regenerar» lo baja sin
  POST, sin audio y sin leer el saldo, como promete el aviso («ya está pago y no se vuelve a cobrar»);
  efecto aceptado: si la persona vuelve a un prompt anterior cuyo render ya está pago y nunca se vio,
  «Regenerar» se lo devuelve sin cobrar, y regenerar otra vez sí paga. Corta la misma parte de la
  narración (la misma voz). **El clip anterior queda**
  hasta que el nuevo esté listo: con `forceNewRender` el carril salta el atajo de «lista con el mismo
  pedido», conserva el clip y el estimado en cada recibo intermedio y, si el nuevo falla (rechazo, render
  `failed`, plazo, descarga) o la cuenta pausa, la escena vuelve a su estado listo con los recibos y los
  ajustes nuevos; `avatar-scene-failed` sale igual y el editor dice «Quedó el clip anterior» (también si
  el job cae entero con `job-failed`, no al cancelar). `regenerateSceneIds` solo regenera una lista con su
  clip (R-U-3): una pedida que no lo está se trabaja como cualquiera, para cosechar lo ya pagado en vez
  de subir la toma y pagar otro.
- **Editor: la sección «Movimiento» (R-2e-8, R-2e-9, WP-X, §21.4).** Con V, o con IV y un look de foto,
  el panel de la escena muestra antes del costo el motor con su descripción, el prompt en un campo de
  una sola línea (hasta 300 caracteres, con contador y «Usar el automático»), el interruptor con su
  tooltip y el desplegable «Qué podés pedir» con las dos listas de la guía (lo que se controla y lo que
  no); con `motionUnsupported`, una nota arriba del campo, que sigue editable. El borrador vive por escena y los ajustes
  viajan con «Generar» o «Regenerar» de esa escena —o con «Regenerar todos» si la incluye— **solo si la
  persona cambió algo** (así una escena a la que Vimo todavía no le escribió el movimiento no queda como
  «sin movimiento propio»); el sidecar los guarda antes de pedir (`auto` si es el de Vimo, `user` si no).
  El editor no cambia el motor de una escena (no se pidió): regenera con el del proyecto.
- **Progreso (R-2e-6, R-2e-7, §21.5).** Junto al tiempo de cada aparición que se genera, un spinner y el
  porcentaje simulado con la curva del editor (`avatarActivityPercent`; nunca dice 100, sin barra; al
  terminar, «Lista»); el spinner del paso pasa al lado del porcentaje, uno por fila. En la grilla
  «Imágenes», cada escena del avatar es una tarjeta propia (`AvatarSceneCell`: borde y fondo morados, el
  ícono del avatar, número y tramo como una imagen, su estado, sin imagen ni «Ampliar»), y el conteo
  «Imágenes (n/m)», el encabezado y el visor de «Ampliar» cuentan solo imágenes. Cada tarjeta que se
  genera corre su reloj, para no repintar la grilla ni quitarle el foco al visor.
- **Estacionado (R-2e-15).** Cambiar el movimiento de una escena con un recibo en vuelo (`ambiguous`, o
  el `pending` que deja un `avatar_timeout`) paga un render nuevo y deja el anterior sin cosechar,
  porque el movimiento entra en la huella. Es raro (plazo vencido o un POST sin respuesta), lo pide la
  persona con el costo completo a la vista y la alternativa —ignorar en silencio el prompt que editó— es
  peor; avisarlo exige exponer los recibos en la vista y queda para la entrega 3. También quedan
  estacionados el pedido sin movimiento que vuelve a subir el mismo audio (no paga un render), un
  reintento sin movimiento que cae en un recibo `succeeded` viejo de la misma huella al «Regenerar» y un
  render en vuelo que queda escondido tras una regeneración fallida o cancelada: la vista no expone los
  recibos, otro «Regenerar» lo cosecha gratis, pero la confirmación anuncia el costo completo.
- **Verificación.** Guard nuevo: `check-avatar-motion-prompt.mjs` (27 tests). Ampliados:
  `check-heygen-client.mjs` (59), `check-avatar-lane.mjs` (88), `check-avatar-create-project.mjs` (70),
  `check-avatar-library.mjs` (102), `check-scene-pins.mjs` (40), `check-avatar-scene-model.mjs` (14),
  `check-avatar-stage.mjs` (57), `check-create-avatar-ui.mjs` (323 checks), `check-app-avatar-create.mjs`
  (24), `check-create-draft-ui.mjs` (32; solo ajustó su fixture), `check-avatar-progress-ui.mjs` (209),
  `check-editor-avatar-regenerate-ui.mjs` (297) y `check-avatar-library-ui.mjs` (51 pruebas). Cada paquete
  corrió mutantes sobre una copia (S 26 de 27, T 56 de 59 —los tres restantes mueren con las pruebas que
  sumó R-2e-13—, U 33 de 36 con 3 equivalentes y 10 más en su ronda, V 15 de 15 y 6 y 12 más en sus dos
  rondas, W 41 de 41, X 28 de 28, Y 18 de 18 y 14 de 15 en su ronda —`size` queda vivo a propósito—) y la
  suite de Node pasó en verde con el árbol de cada paquete (85 archivos, 1725 pruebas al cerrar WP-U,
  antes de sus rondas). Todo con HeyGen y el modelo de texto simulados: la ejecución no gastó saldo.

**A confirmar en la QA del dueño, con la app real** (lista: `execution-e2e/qa-2e.md`): cuánto cobra
Avatar V con un look de foto o de estudio (Vimo estima 7,20 USD por minuto como techo) y si «más
expresivo» suma costo, mirando el saldo antes y después (R-2e-2 y R-2e-3); si el cuerpo de Avatar III
acompaña sin la opción «movimiento de cuerpo entero» (R-2e-1; si no, es un pedido al proveedor y no un
campo que falte); el movimiento de verdad con V e IV (la cara y las manos acompañan lo que dice sin
exagerar, y «más expresivo» se nota); cuánto texto acepta HeyGen en `motion_prompt` (con el sufijo de
R-2e-14 viaja hasta con 334 caracteres, y un rechazo por largo se leería como «el look no admite
movimiento»: se genera sin él); si el proveedor rechaza el movimiento con otro status que 400 (por
ejemplo un 422), la escena queda fallida y no se reintenta sin movimiento; el Enter sostenido sobre «Usar
el automático» y el pegado de texto con saltos de línea en la WKWebView; y un «Regenerar» de una lista con
un render real (el clip nuevo cubre la misma parte con la misma voz y, si falla, queda el anterior con
su aviso). La lista de la 2d sigue vigente.

Costo si estuviera mal: V a 7,20 con cualquier look (R-2e-2) y «más expresivo» sin costo (R-2e-3) son una
cifra de `AVATAR_USD_PER_MINUTE` y un sumando de los estimadores (si el cobro real es otro, se muestra
más caro o más corto hasta corregirla); los prompts automáticos menos naturales (R-2e-4) se cambian en
el editor y el prompt del sistema es una constante de `motion-prompt.ts`; el motor derivado (R-2e-5) es
`avatarEngineFor`; el spinner junto al porcentaje (R-2e-6) vuelve a la línea del paso; la tarjeta propia
y el conteo (R-2e-7) son `GenerationProgress` y `SceneImagesGrid`; la frase de V con un prompt propio
(R-2e-14) es `AVATAR_EXPRESSIVE_PROMPT_SUFFIX` y la línea de `requestMotionPrompt` que la suma; R-2e-15 es
un render de más en un caso raro; que Avatar III no mueva el cuerpo entero (R-2e-1) es un pedido al
proveedor. La ADR sigue en «Propuesta»: pasa a Aceptada con la QA del dueño.

## Enmienda 2026-10-12 (tarde) — entrega 2f

Pedidos del dueño después de probar la 2e con Avatar V (hechos y decisiones: §22 del diseño; rulings `R-2f-N`
en `docs/handoff/2026-10-09-avatar-heygen/execution-e2f/ledger.md` (interno), y los de cada paquete —WP-A el
planificador, WP-B Crear, WP-C la galería del editor— en sus informes de esa carpeta). Donde un pedido admitía
dos lecturas, la decisión dice cuál se tomó para que el dueño la corrija en la QA. Lo que puede cobrar más que
antes: «3 veces en 2 minutos», que sube a 3 las apariciones si la persona eligió menos (más renders, con el
costo a la vista en Crear y la fase comparándolo con el saldo antes de pagar), y una apertura que antes se
descartaba por el tope de silencio y ahora se genera (Crear ya la contaba entre las pedidas); no hay
endpoints, tarifas ni cobros nuevos. En la ejecución, la única llamada real a HeyGen fue una sonda gratis (un
audio inválido a propósito, que el proveedor rechaza sin crear video ni cobrar). Donde el diseño o las
enmiendas de arriba dicen otra cosa que esta, manda esta.

- **El rechazo de Avatar V sin `param` (§22.1, `067d00a4`).** El dueño generó un video con Avatar V, «más
  expresivo» y un avatar de foto propio, y las cuatro apariciones fallaron con «El servicio de avatares
  respondió algo inesperado» (`avatar_invalid_request`). La sonda gratis del 2026-10-12 mostró el rechazo
  exacto: con un avatar de foto propio cuyo grupo no tiene gemelo digital, V más `motion_prompt` da un 400
  `invalid_parameter` («motion_prompt requires a reference look to drive motion, and this avatar's group has no
  digital twin…») **sin `param`**; V sin `motion_prompt`, IV con `motion_prompt` y `expressiveness`, y V con
  `motion_prompt` en los looks del stock (Dante, Hayes) pasan la validación. El carril solo reconocía el
  rechazo del movimiento con `param` (enmienda de la 2e), así que tomaba este por un pedido inválido y no
  reintentaba sin movimiento. `heygenFailure` clasifica ahora como `avatar_motion_unsupported` también un 400
  de sobre JSON sin `param` cuyo mensaje nombra `motion_prompt` o `expressiveness` por palabra completa, con
  ese campo como `param` y sin copiar el texto de HeyGen; un 400 que habla de otra cosa (el del audio de la
  misma sonda), una palabra parecida, un texto sin sobre o un 422 siguen siendo `avatar_invalid_request`. El
  resto del camino no cambia: la escena queda `motionUnsupported`, el carril pide enseguida sin movimiento
  (otra clave) y el render sale con el movimiento propio de V; el 400 no se cobra.
- **Crear avisa antes que V no puede mover a un avatar propio sin gemelo digital (R-2f-1, §22.1; la 2g saca
  el interruptor con V y con él el aviso apagado, queda la línea del movimiento automático).**
  `SelectedAvatar` copia al elegirlo `motionReference` (`avatarHasMotionReference`: un avatar del stock, o uno
  propio con algún look de gemelo digital, la tiene; un borrador de antes de la 2f no trae el campo y cuenta
  como que sí). Con Avatar V, un look de foto y `motionReference === false` (`avatarMotionReferenceMissing`,
  en `selectableAvatar.ts`), «Movimiento más expresivo» se ve apagado y deshabilitado con el motivo
  (`expressiveNoReference`: «Con Avatar V, este look usa su propio movimiento: su avatar no tiene un gemelo
  digital»), sin la línea «Vimo escribe el movimiento de cada aparición…» (el render sale con el movimiento
  propio de V, y la frase sería falsa) y `expressive` no viaja. Es una sola regla
  (`selectedAvatarExpressiveAvailable`) que comparten el interruptor y `createProjectPayload`; la preferencia
  de la persona queda en el formulario y con IV el interruptor vuelve prendido. Es un aviso y no un bloqueo: el
  primer pedido de cada escena todavía puede llevar el prompt automático y recibir el 400 gratis antes del
  reintento, porque evitarlo exigiría pasar la biblioteca al carril. `motionReference` es una copia hecha al
  elegir, como `supportedEngines`: si el avatar gana un gemelo mientras Crear guarda la elección, el
  interruptor sigue apagado con V hasta volver a elegirlo (`isSelectedAvatarCurrent` no la invalida por eso).
  El editor no avisa nada de esto (R-2f-1 es de Crear): el panel y la tarjeta de la galería siguen ofreciendo
  «Movimiento más expresivo» con V y un avatar propio sin gemelo, y el 400 gratis con su reintento lo cubren.
- **«3 veces en 2 minutos» (R-2f-2, R-2f-7, §22.2).** Una casilla en la tarjeta del avatar de Crear, debajo de
  «Empieza con el avatar», apagada por defecto y con su ayuda en un tooltip (`CreateAvatarThreeInTwo`, sobre la
  `CheckboxRow` de siempre; manda solo `{ avatarThreeInTwoMinutes }`). Prendida viaja como
  `options.avatar.threeInFirstTwoMinutes: true`: `create-video-project` valida que sea booleano (si no,
  `invalid_payload`) y la guarda solo en `true`, al final y detrás de `expressive`, así que apagada o ausente las
  opciones son byte a byte las de la 2e y el plan también, salvo la apertura (abajo). Pide **al menos 3 apariciones** aunque la persona haya elegido menos
  (`max(elegidas, AVATAR_EARLY_APPEARANCES)`) y que **las tres primeras, contando la apertura, arranquen dentro
  de los primeros 120 s** (`AVATAR_EARLY_WINDOW_SECONDS`, o del fin del audio si es más corto; arrancar justo a
  los 120 s ya no cuenta y un cuadro antes sí), repartidas con la regla de anclas de siempre dentro de esa
  ventana y con el hueco mínimo de 10 s. Si la apertura no cupo, no ocupa lugar y la ventana intenta las tres
  (R-2f-7; con la casilla apagada, la apertura que no cupo sigue contando como una de las pedidas y como
  descartada). Las demás usan los segundos elegidos y se reparten parejas en la zona que queda después de la
  tercera. Lo que no entra va a `dropped` y no se corre a otro lugar: con 5 elegidas y la tercera de las
  primeras afuera salen 4 y 1 descartada. Con `placement: 'manual'` la casilla se guarda y no tiene efecto (el
  planificador no corre; Crear siempre manda `'auto'`). Crear avisa lo que cambia (`threeInTwoMinimum` con menos
  de 3 elegidas, `threeInTwoCapped` con más segundos que el tope) y esos avisos son la descripción de la casilla
  (`aria-describedby`; `CheckboxRow` acepta `describedBy`).
- **El tope de las tres primeras: de 45 a 40 y a 35 s (R-2f-3, R-2f-5, R-2f-8; la 2g lo baja a 32 s).** R-2f-3 decía que las tres
  primeras apuntan a lo sumo a 45 s para entrar en la ventana. El planificador lo toma como máximo y no solo
  como objetivo (Crear dice que «duran hasta» ese tope): con solo el objetivo y frases de 8 s el ajuste elegía
  48 s y la tercera quedaba afuera. El dueño pidió que las tres salgan «obligatoriamente», así que se midió con
  10 000 narraciones simuladas tipo TTS por corpus (la tabla vive en el comentario de la constante
  `AVATAR_EARLY_MAX_SECONDS` y en el §22 del diseño): con 45 s las tres arrancaban dentro de la ventana en el
  86,8 % de los casos sin apertura y en el 99,1 % con ella (74,8 % y 96,3 % con frases más largas); con 40 s,
  en el 99,7 % y el 100 % (96,9 % y 99,97 %); con 35 s, en el 100 % y el 100 % (99,95 % y 100 %). R-2f-5 bajó
  el tope a 40 s, el valor más alto que daba al menos 98 % sin apertura y 99 % con ella en el primer corpus, y
  R-2f-8 a **35 s** porque con frases largas 40 s no llegaba al 98 %. **El respaldo a 60 s queda**
  (`targetsToTry`; la 2g lo quita): solo si desde ninguna frase de su zona cabe una aparición de 35 s o menos se prueba con el
  máximo de siempre —mejor una de 48 s que perderla—; en las narraciones simuladas tipo TTS no se usó nunca, y
  en un corpus con frases de hasta 65 s sumó una aparición dentro de la ventana en el 5,6 % de los casos y
  nunca restó. La revisión de la 2f midió que solo corre con frases de más de 30 s, que `detectSentences` no
  produce (parte toda frase de más de 15 s): con narraciones reales no corre. Precio, si alguna vez corre: una
  de las tres primeras pasa el tope y la estimación de Crear la da corta unos segundos.
- **«Empieza con el avatar» abre siempre el video (R-2f-4, R-2f-6, §22.3).** Había un caso real en que no
  abría: una primera frase corta seguida de un silencio largo, que el tope de silencio de 2 s cerraba antes del
  mínimo de 5 s y descartaba la apertura. Con la casilla prendida, si el ajuste desde la frase 0 no cabe,
  `openingSpan` lo vuelve a probar sin el tope (`pauseRule: 'carried'`: cada frase se mide hasta su fin, así la
  apertura carga ese silencio y suma frases hasta el mínimo, sin pasar el máximo después del corte), pero
  **cargando a lo sumo 6 s de silencio después de la última palabra de cada frase**
  (`AVATAR_OPENING_MAX_PAUSE_SECONDS`, R-2f-6): sin ese límite, una palabra y 19 s de silencio daban una
  apertura de 20 s que HeyGen cobra entera. «Hola» con 5,2 s de silencio abre de 0 a 11 s; justo 6 s se cargan
  y 6,04 no. Solo la dejan afuera un audio de menos de 5 s, una apertura que no llega al mínimo sin pasar el
  máximo después del corte (una primera frase de más de 60 s, una corta seguida de una que lo pasa, o una de
  59 s con una cola de 2 s) o más silencio del que carga; si el ajuste normal cabe, la apertura es la de
  siempre. **Rige también con «3 veces en 2 minutos» apagada** (aceptado): es el arreglo de «Empieza con el
  avatar» y la única excepción a «apagada, el plan es el de la 2e»; solo cambia los videos cuya apertura antes
  se descartaba por el tope de silencio (diferencial de WP-A contra el planificador de `2eb974b0`: 120 000
  casos aleatorios, 0 diferencias fuera de ese caso).
- **Una cuenta para Crear y para reanudar (WP-B).** `avatarRequestedAppearances` y `avatarRequestedSeconds`
  (`avatarCostEstimate.ts`), a partir de la forma de `ProjectAvatarOptions`, dan lo que de verdad sale: con la
  casilla, `max(n, 3)` apariciones y las tres primeras a `min(s, AVATAR_EARLY_MAX_SECONDS)`; sin ella, `n × s`
  como siempre; solo `true` la prende, igual que el planificador. `createAvatarAppearances` y
  `createAvatarSeconds` las arman desde el formulario y alimentan el total de la tarjeta (que cuenta las
  apariciones que salen: con 1 elegida dice 3), el costo de cada motor, el pre-check y las imágenes libres de
  `estimateCreateCost`; `estimateResumeCost` las usa antes del corte (la línea del avatar y las imágenes
  libres), así que reanudar no subestima el avatar ni sobrestima las imágenes. Una prueba de paridad de 180
  combinaciones fija que el mismo pedido cuesta lo mismo por las dos vías, y los guards de Crear leen el tope
  de la constante en vez de escribirlo.
- **El avatar en la vista ampliada del editor (§22.4; R-C-1 a R-C-6 de WP-C).** La galería «Vista ampliada de
  imágenes» (`EditorImageGallery`) lista también las escenas de avatar, en el orden del video, con una tarjeta
  propia (`EditorAvatarGalleryCard`): su clip (un `<video>` mudo con «Reproducir» / «Pausar»; la galería pausa
  el que andaba antes de arrancar otro, así que nunca andan dos a la vez, R-C-3) o, sin clip, la imagen del
  look con «Sin clip todavía»; su número y su tramo como las de imagen; su estado en una pastilla con etiquetas
  cortas que no se cortan —«Lista», «Desactualizado» (el texto del bloque de la pista, igual que la caja de las
  acciones), «Generando el avatar…» con el porcentaje cuando su render arrancó y «Con imagen fija» en una
  planeada o una fallida—, con el título largo del bloque de tooltip; y debajo, `EditorAvatarSceneActions` de
  esa escena: las mismas acciones del panel, con el costo al motor de la escena, la confirmación y, con V o IV,
  «Movimiento». El clip se muestra si la escena tiene uno, también en una desactualizada (R-C-2); las acciones
  se ven con «Seleccionar» activo (R-C-5); y las etiquetas de los botones compartidos se parten en dos líneas
  en vez de cortarse (R-C-6). No tiene botón para elegirla: «Regenerar imágenes» y «Animar» en lote siguen
  siendo de escenas de imagen (la selección sale de `imageScenes`). La descripción de la galería cuenta todas
  las tarjetas y solo dice que también se regenera el avatar si el proyecto tiene alguna
  (`descriptionWithAvatar`; un proyecto sin avatar conserva el texto de antes). Las acciones esperan con el
  mismo `busy` que el panel (`busy || savingChanges`, que `LibraryEditor` le pasa a la galería) y al envío de
  un lote de la galería; al terminar una regeneración el foco vuelve a la tarjeta (R-C-4, `focusFallback` de
  `EditorAvatarSceneActions`), porque el panel queda detrás del modal y el foco mandado ahí se escapa del
  diálogo (medido en Chrome).
- **Aceptado y estacionado.** El clip de la tarjeta se ve mudo: el normalizado no trae audio (`-an`) y la voz la
  pone la narración; oírla pediría un `<audio>` sincronizado con el clip y pausar el visor del editor al abrir
  la galería (hoy, si estaba sonando, sigue detrás del modal: ya pasaba). La pastilla de una planeada y la de
  una fallida dicen lo mismo («Con imagen fija»); el motivo de una fallida lo dice la caja de las acciones. Con
  la galería abierta sobre la escena que tiene el panel hay dos avances de esa escena (el de la tarjeta y el
  del panel, detrás del modal): es lo esperado, y el foco va siempre al de la tarjeta. El editor no avisa lo de
  V sin gemelo digital (arriba).
- **Verificación.** Guard nuevo: `check-editor-avatar-gallery-ui.mjs` (112 checks). Ampliados:
  `check-avatar-planner.mjs` (37 tests; antes 27), `check-scene-pins.mjs` (43; 40),
  `check-avatar-create-project.mjs` (75; 70), `check-heygen-client.mjs` (59: los rechazos sin `param` y sus
  bordes caben en su test de clasificación), `check-app-avatar-create.mjs` (34; 24), `check-create-avatar-ui.mjs`
  (381 checks; 323), `check-create-draft-ui.mjs` (33; 32) y `check-timeline-avatar-ui.mjs` (43 checks;
  31, con la aserción de que la galería lista solo escenas de imagen cambiada a propósito). Los guards de Crear
  leen el tope de `AVATAR_EARLY_MAX_SECONDS` en vez de fijar un número y corrieron con la constante en 30, 35,
  40, 45, 50 y 55 s. Cada paquete corrió mutantes sobre una copia (WP-A 27 de 27, WP-B 41 de 41 y 25 de 25 en
  su ronda, WP-C 30 de 30); WP-A, un diferencial de 120 000 casos aleatorios contra el planificador de la 2e
  (con la casilla apagada, 0 diferencias fuera de la apertura de R-2f-4; prendida, 0 fallas de invariantes), y
  WP-B, un cruce del planificador con la cuenta de Crear en 240 combinaciones (las apariciones planeadas más
  las descartadas son las pedidas; un chequeo que no entra al repo). La revisión de toda la 2f corrió, sobre
  `cb3857e1`, `pnpm lint`, `pnpm build`, el `tsc` del pipeline y la suite de Node completa (86 archivos,
  1764/1764), y `pnpm check:locales` cuenta 2132 claves desde `fd0aca8a`. Todo con HeyGen simulado: la
  ejecución no gastó saldo (la sonda del §22.1 fue gratis).

**A confirmar en la QA del dueño, con la app real** (lista: `execution-e2f/qa-2f.md`): (1) Avatar V con un
avatar de foto propio sin gemelo digital: que Crear apague «Movimiento más expresivo» con su motivo, que el
video salga con el movimiento propio de V (el primer pedido de cada aparición recibe el 400 gratis y se
reintenta sin movimiento) y cuánto cobra V en ese caso, mirando el saldo antes y después (R-2e-2 sigue
abierto); (2) «3 veces en 2 minutos» con una narración real, con y sin «Empieza con el avatar»: que las tres
primeras arranquen dentro de los 2 minutos y duren hasta 35 s (las simulaciones usaron narraciones sintéticas,
no un `words.json` de Deepgram real), que el total y el costo de Crear coincidan con lo que cobra HeyGen y que
reanudar antes del corte muestre el mismo costo; (3) que «Empieza con el avatar» abra siempre el video, también
con una primera frase corta y unos segundos de silencio (hasta 6 s), y que con más silencio siga sin apertura;
(4) la vista ampliada del editor con la app real: el clip mudo (¿alcanza o se quiere oír la voz?), «Reproducir»
/ «Pausar», que ninguna pastilla de estado se corte con la ventana mínima de 1024 px, regenerar desde la
tarjeta con su costo y su confirmación, el foco al terminar y que «Seleccionar» no marque la tarjeta del
avatar; (5) si hace falta que el panel y la tarjeta del editor avisen lo de V sin gemelo digital (hoy solo
avisa Crear).

Costo si estuviera mal: el tope de 35 s (R-2f-8) es la constante `AVATAR_EARLY_MAX_SECONDS` —si se quieren
tramos más largos se sube, y Crear, reanudar y los guards la leen— y el precio es que las tres entren menos
veces (con 40 s y frases largas, el 96,9 % sin apertura); el respaldo a 60 s es `targetsToTry` y sin él una de
las tres se pierde en narraciones raras; el límite de 6 s de la apertura (R-2f-6) es
`AVATAR_OPENING_MAX_PAUSE_SECONDS` (sin él, una apertura casi muda se cobra entera); que R-2f-4 rija con la
casilla apagada es el reintento sin tope de `openingSpan`, que se puede atar a la casilla; el mínimo de 3
(R-2f-2) es `AVATAR_EARLY_APPEARANCES`; el aviso de V sin gemelo (R-2f-1) es `avatarMotionReferenceMissing`
(quitarlo devuelve el interruptor, y el 400 gratis con su reintento ya cubre el caso); la tarjeta de la galería
es un componente que `EditorImageGallery` monta en vez de saltear la escena (volver a `imageScenes` la quita); y
el clip mudo es un `<video muted>`. La ADR sigue en «Propuesta»: pasa a Aceptada con la QA del dueño.

## Enmienda 2026-10-12 (noche) — entrega 2g

Pedidos del dueño después de probar la 2f (hechos y decisiones: §23 del diseño; rulings `R-2g-N` en
`docs/handoff/2026-10-09-avatar-heygen/execution-e2g/ledger.md` (interno), y los de cada paquete —WP-A el corte y el
planificador, WP-B la duración en el sidecar, WP-C el editor, WP-D Crear y la biblioteca— en sus informes y
revisiones de esa carpeta). Donde un pedido admitía dos lecturas, la decisión dice cuál se tomó para que el
dueño la corrija en la QA. Lo que puede cobrar más que antes: alargar una aparición desde el editor es un
render nuevo y pago del trozo nuevo de la narración (con el costo de la duración nueva y la confirmación a la
vista), y las apariciones duran lo elegido en vez de frases enteras, así que el costo de Crear se acerca a lo
que dice la tarjeta (con 5 s elegidos salían de 6 a 13 s). Recortar una aparición es gratis. No hay
endpoints, tarifas ni cobros nuevos; lo único que cambia de precios es que «Crear escenario» ahora dice lo
que cuesta (0,93 US$, medido). En la ejecución no se gastó saldo: los agentes no usaron la clave y el
controlador solo hizo dos consultas gratis a HeyGen (el saldo, que confirmó los 9,67 US$, y la lista de
renders). El precio sale de la lectura de saldo del dueño (10,60 → 9,67 US$). Donde el diseño o las enmiendas
de arriba dicen otra cosa que esta, manda esta.

- **La aparición dura lo elegido y termina en la pausa más cercana (§23.2; R-2g-8, R-2g-10 a R-2g-12,
  R-2g-16, R-2g-17).** Cada aparición arranca donde arrancaba (un inicio de frase; la apertura, en 0) y
  termina donde corta `avatarCutEnd` (`pipeline/avatar/appearance-cut.ts`, puro y browser-safe): en el fin
  de frase o la pausa de 0,25 s o más más cercana a inicio + segundos elegidos si está a 0,5 s o menos y, si
  no, en el hueco entre dos palabras más cercano; siempre en el inicio de la palabra que sigue, al cuadro de
  25 fps (la pausa corta queda con el avatar, R-2g-8), y nunca adentro de una palabra. Medido sobre las dos
  narraciones del dueño, con 5 y con 10 s: 0,1 s de diferencia con lo elegido de mediana, 0,3 s o menos en el
  90 % y nunca más de 0,5 s; la apertura de «Video-3-avatar» queda en 0–4,72, justo en «…durante una hora.».
  Se fueron la suma de frases, el mínimo por frases y el fin recortado de cada frase de la 2b. Lo que la
  ejecución decidió además:
  - **Las pausas largas cortan la aparición, no descartan su inicio (R-2g-11).** La regla escrita decía que
    un inicio con una pausa de más de 2 s adentro no sirve. Medida, hacía caer «3 veces en 2 minutos» al
    64–83 % con narraciones con pausas de 2 a 5 s, y una pausa de más de 6 s al final de la apertura la
    perdía. `avatarCutLimit` arma el límite que recibe `avatarCutEnd`: la última palabra antes de la primera
    pausa de más de 2 s, o del silencio después de la última del audio, más esos 2 s, al cuadro hacia abajo;
    el planificador y el cambio de duración lo comparten. Precio aceptado: con pausas largas una aparición
    queda más corta que lo elegido (en narraciones simuladas con el 5 % de silencios de 2 a 5 s, el 4 % de
    las de 10 s y el 15 % de las del tope; nunca menos de 4,5 s). En las narraciones TTS del dueño la pausa
    más larga es de 1,34 s y no pasa.
  - **El tope de las tres primeras baja a 32 s (R-2g-10).** Con el corte exacto las tres duran justo el
    tope y, con 35 s, la tercera entraba en el 95,7 % de los casos con frases de hasta 15 s. Medido con 10 000
    narraciones simuladas tipo TTS por corpus (frases de 2 a 12 s / de 2 a 15 s), el porcentaje de casos en
    que las tres arrancan dentro de la ventana, sin apertura (con apertura da 100 % con todos los topes),
    es: 35 s, 99,39 % / 95,72 %; 34 s, 99,86 % / 97,80 %; 33 s, 99,99 % / 99,15 %; 32 s, 100 % / 99,74 %;
    30 s, 100 % / 99,98 %. Se eligió el valor más alto que cumple el criterio de R-2f-8 (al menos 99 %
    con frases largas). Como el corte no pasa inicio + el tope, el respaldo a 60 s de la 2f
    (`targetsToTry`) se fue.
  - **La apertura (R-2g-16, R-2g-17).** El primer intento corta en las pausas de más de 2 s; si así no llega
    a 4,5 s, el segundo carga las de hasta 6 s, y una más larga la corta igual, 2 s después de la palabra que
    la precede. La primera lectura de R-2g-16 (no hay apertura si el corte del segundo intento cae adentro de
    una pausa de más de 6 s) hacía depender la apertura de los segundos elegidos: «Hola», 3 s de pausa, tres
    palabras y 8 s de pausa abría con 5 y 6 s y no con 10. La regla vigente es la misma que para cualquier
    aparición. «Hola.» con 5,2 s de silencio y una frase después abre de 0 a 10; con 19,2 s, no: la pausa la
    corta a los 2,8 s y una palabra con un silencio largo no es una apertura muda que HeyGen cobra.
  - **El empate (R-2g-12).** Con empate gana el natural, y en cualquier otro, el primero: así no corta antes
    de la última palabra de una frase cuando el fin de esa frase queda a la misma distancia. Cuesta hasta
    0,6 s más en el 0,3 % de las apariciones.
  - **El piso de 4,5 s y el «como hoy» (D1 y D3 de WP-A, ratificados).** Una aparición dura al menos 4,5 s
    (el mínimo elegible menos el medio segundo del corte), medido hasta el corte y sin la cola que el corte
    de escenas le pega; un inicio que dejaría menos de 3 s antes del fin del audio no sirve. Si ningún
    inicio sirve se acepta la cola corta, como hasta la 2f, pero cortando 3 s antes del fin cuando pegarla
    pasaría el máximo: 61 s con 60 elegidos dan 0–58 en vez de perder la aparición. Desde la revisión final
    (R-2g-21) el piso vale también para la duración elegida en el editor (abajo).
- **La duración de una aparición se elige en el editor (§23.3; R-2g-2 a R-2g-5, R-2g-18, R-2g-19).** El
  panel de la escena de avatar y su tarjeta desplegada suman «Duración»: «−» y «+» de a un segundo, de 5 s
  al máximo que entra en ese lugar. El tramo lo calcula el mismo código en la interfaz y en el sidecar
  (`avatarResizeLimits` y `avatarResizePlan`, puros y browser-safe): el inicio no se mueve, el fin sale de
  la regla de arriba, y el máximo es lo primero que llegue entre 60 s, la próxima aparición menos 3 s, la
  primera escena bloqueada que la sigue (con una animación o un recibo de animación) y el fin del audio.
  - **Más larga, o una escena sin clip listo, o con el movimiento cambiado: un render nuevo y pago.**
    `avatar-render-scenes` acepta `durations: [{ sceneId, seconds }]`, validadas y planeadas antes de hablar
    con HeyGen y antes que la clave. El carril trabaja una copia de la escena con el tramo y el texto
    nuevos (su corte de audio, su huella, su costo, su movimiento automático) y la escena real conserva su
    tramo y su clip. **Se aplica cuando el clip nuevo está listo,** en la misma escritura de `scenes.json`:
    el avatar listo con su clip, el tramo nuevo, los textos de las escenas tocadas, las escenas de imagen
    del plan y el video desactualizado. Si el render falla, se cancela o vence, no cambia nada (la lista
    conserva su clip, D5 de WP-B) y pedir la misma duración otra vez cosecha el render pago sin pagar otro.
    Si al terminar el plan ya no entra (otra escena se bloqueó mientras tanto), el clip queda en disco, la
    escena no cambia y sale el código del plan (D6 de WP-B). Un corte que no se mueve hacia lo pedido no
    paga (D4 de WP-B). La confirmación dice «¿Generar el avatar?», la duración nueva y cuántas escenas de
    imagen tapa (D6 de WP-C: es otro trozo de la narración, así que no va `regenerateSceneIds` y «con la
    misma parte» sería falso).
  - **Más corta, con un clip listo y sin cambios en el movimiento: «Recortar a N s», gratis, al instante y
    sin confirmación (R-2g-2).** `avatar-trim-scene { projectId, sceneId, seconds }` no habla con el
    proveedor ni lee su clave: vuelve a ajustar al tramo nuevo el crudo del clip actual (o el clip) en un
    archivo nuevo con la huella del tramo nuevo, y guarda el tramo, el clip y la escena que sigue en una
    escritura; el clip anterior queda en disco. Sin un clip listo y al día sale `avatar_trim_unavailable`;
    si el pedido no achica de verdad, `avatar_resize_out_of_range`, el código del render para el mismo caso
    (m-1 de la revisión final: el clip está listo, y el texto de `avatar_trim_unavailable` decía que no).
    Si al guardar la escena ya no tiene el clip que se ajustó, o el plan ya no da el mismo tramo, el
    recorte se rechaza y borra el clip nuevo (m-3). Lo que no cuesta no necesita confirmación; con una sola,
    quien recorta sin querer tendría que volver a pagar para alargar.
  - **Los errores nuevos** son `avatar_resize_out_of_range` (esa duración ya no entra ahí: el proyecto
    cambió, el corte no se mueve hacia lo pedido o la aparición quedaría de menos de 4,5 s),
    `avatar_resize_locked` (la escena que sigue está animada) y `avatar_trim_unavailable` (no hay un clip
    listo y al día para recortar), cada uno con su texto.
  - **Una escena de avatar que es la última del video no cambia de duración (R-2g-18):** lo que soltara no
    tendría imagen y alargarla pasa el fin del audio, así que el mínimo y el máximo son lo que dura,
    redondeado, y el selector lo explica. Igual con la escena que sigue bloqueada. Dos avatares pegados (el
    planificador no los arma) no se achican.
  - **El piso y la apertura, como en el planificador (R-2g-21, I-1 de la revisión final).** El plan cortaba
    siempre con la regla de 2 s, y una apertura que el planificador armó cargando una pausa de 2 a 6 s se
    recortaba a menos de 3 s («Recortar a 8 s» dejaba en 2,88 s la de 0 a 9,92 de «Hola.», 3 s de silencio
    y una frase cada 2 s); después ninguna duración la recuperaba. Ahora, si con 2 s el plan deja la apertura
    (la escena de avatar que arranca en 0) por debajo de 4,5 s, prueba como el segundo intento de
    `openingSpan` (pausas de hasta 6 s, la cola de 2 s), y ningún plan deja una aparición de menos de 4,5 s:
    sale `avatar_resize_out_of_range` antes de recortar o pagar. Esa apertura se recorta a 7,92 s con 8 y se
    alarga a 11,92 y 15,12 s con 12 y 15. Una escena que no abre el video con una pausa de 2 a 6 s adentro
    (solo a mano) no cambia de duración, aunque el selector le ofrezca su rango.
  - **Al alargar, el avatar puede quedarse con el resto de una escena de imagen (D1 de WP-B):** si nada puede
    empezar antes (era la última del video o la que sigue está bloqueada), como hace el corte con los tramos
    libres cortos; así, cerca del fin del audio, puede durar hasta casi 3 s más que lo elegido y cargar más
    de los 2 s de silencio final.
  - **El render con `durations` toma el lease exclusivo del proyecto (R-2g-19),** no el compartido de
    animación: la duración nueva saca y mueve escenas de imagen, que es lo que solo hacen los comandos
    exclusivos. Con el compartido, otro generador podía comprar el mismo tramo o pagar por una escena que
    acababa de salir. Mientras una duración nueva renderiza no se puede animar nada en ese proyecto; la app
    ya serializa las tareas del editor, así que desde ella no cambia nada. Con `durations` vacío o ausente
    sigue el lease compartido de siempre. El recorte también toma el exclusivo.
- **Las escenas de imagen que salen (R-2g-3).** Al alargar, las escenas de imagen que la aparición tapa
  entera salen de `scenes.json` (sus imágenes quedan en disco), la que contiene el fin empieza ahí y, si le
  quedarían menos de 3 s, también sale y la que sigue empieza en el fin. El editor no borra escenas en
  ningún otro lugar, así que los ids quedan con huecos. Ningún consumidor supone ids contiguos (`id - 1`
  solo aparece en `verbatim-writer.ts`, al escribir prompts en lote, y con un hueco la escena que sigue no
  hereda el vestuario de la anterior); lo visible es que la interfaz rotula cada escena por su id y, tras
  alargar un avatar, la galería dice «Escena 2», «Escena 4»…
- **El editor: controles compactos y la tarjeta plegada (§23.4; D1 a D13 de WP-C).** «Movimiento» pierde la
  caja grande y el párrafo del motor (el nombre del motor lleva la descripción en un tooltip), el prompt
  pasa a tres renglones con su contador, «Usar el automático» es un enlace y «Qué podés pedir» abre la guía
  en un globo. La tarjeta del avatar en la vista ampliada abre **plegada**, con el borde de una de imagen
  (el morado la hacía parecer elegida) y sin acciones; «Ajustar avatar», o un clic en la tarjeta, la
  despliega a la fila entera, con el clip a la izquierda y los controles en dos columnas, y «Cerrar» la
  pliega. Una sola desplegada a la vez; el foco va al primer control al desplegar, a «Ajustar avatar» al
  plegar y a la tarjeta al terminar un render. Medida con el CSS real en Chrome y en un `WKWebView` a 1024 ×
  640 y 1280 × 800, en los tres idiomas y los dos formatos, sin scroll propio (el peor caso mide 410 px en
  un área de 410). Las notas de estado de la tarjeta desplegada van enteras y sin caja, no «en una línea»:
  una línea cortaría el motivo de un fallo.
- **Avatar V sin «Movimiento más expresivo» (§23.1; R-2g-7, R-2g-14, R-2g-20).** El interruptor se ofrece solo
  donde el proveedor tiene `expressiveness`: Avatar IV con un look de foto (`avatarMotionSupport`). Con V y
  con III no se ve, ni en Crear ni en el editor (con V era una frase que Vimo sumaba al prompt, R-2e-14, y
  con una foto propia sin gemelo digital V ni acepta el prompt). `expressive` no viaja con V aunque la
  persona lo hubiera prendido antes con IV; el aviso `expressiveNoReference` de la 2f se fue, y la línea
  «Vimo escribe el movimiento…» sigue con V y una referencia de animación y con IV y una foto. Una escena de
  V que ya guardó `expressive: true` (videos de la 2e y la 2f) lo conserva (R-2g-20, que revierte R-2g-6):
  el editor no la manda apagada, así que sin cambios no viaja `motion` y, con el prompt editado, la marca
  viaja como estaba. Apagarla, como hacía la ejecución en cualquier pedido del editor, cambiaba la huella de
  una escena V con prompt propio (pierde la frase de `AVATAR_EXPRESSIVE_PROMPT_SUFFIX`): un render ya pedido
  o pagado que no llegó a clip dejaba de cosecharse y se pagaba de nuevo (I-2 de la revisión final). El
  sidecar no cambia y honra lo guardado; esas escenas siguen sumando la frase a su prompt, que no se ve.
  Con IV y un look de gemelo digital o de estudio, Crear sigue mostrando el
  interruptor apagado con su motivo (2e) y el editor no muestra la sección: el motivo informa, y esconderlo
  también en Crear son dos líneas.
- **La biblioteca (§23.5; R-2g-1).** Todo texto que decía «look principal» dice «escenario principal» (la
  pastilla «N looks» y los demás «look» quedan). **«Crear escenario» dice lo que cuesta: 0,93 US$**
  (`AVATAR_LOOK_GENERATION_USD`, en el sidecar y en su espejo de la interfaz, con una insignia
  `LookPriceBadge` en el pie del diálogo y en la ficha del panel de un avatar propio; la ficha apagada por
  cualquier motivo, también mientras responde el llavero, no promete una cifra). El proveedor no lo publica:
  sale del saldo del dueño, que bajó de 10,60 a 9,67 US$ al
  crear un escenario (9,67 confirmado con una consulta gratis del saldo), así que es una medición que la QA
  vuelve a hacer. **El velo de «Eliminar»** de la tarjeta de la biblioteca cubre la imagen entera y sus
  opciones quedan centradas. Salía cortado porque WebKit, el motor de la app, le resta el relleno
  horizontal a una capa absoluta con `inset-x-0` y `aspect-ratio` y sin ancho (422 en vez de 446 px a 450
  px de tarjeta, y el alto sale del 4:5 de ese ancho), y Chrome la estira bien, por eso los guards en
  Chrome pasaban. La capa lleva ancho explícito y es una grilla de tres filas que centra las opciones; la
  advertencia de «Seguro» (11 px) crece hacia arriba sin mover los botones, y «Seguro» queda centrado
  dentro del lugar de «Eliminar permanentemente de HeyGen». «Mis avatares» y el panel conservan sus clases.
- **Aceptado y estacionado.** Los subtítulos de una aparición que termina a mitad de frase siguen yendo por
  frases enteras y pueden repetir o saltear palabras de esa frase (el dueño pidió no tocarlos por ahora,
  §23.6). Con pausas largas la aparición queda más corta que lo elegido y Crear estima de más en esos casos
  (con TTS no pasa). La hora que dice «toma más narración» y las escenas que tapa la confirmación son
  aproximadas (inicio + segundos, no el corte entre dos palabras); el saldo sí se mira con el costo real.
  El movimiento automático escrito para el tramo nuevo queda guardado aunque el render falle (pedir lo
  mismo lo reusa y cosecha). Mientras recorta, el store del editor no marca el proyecto ocupado: otra tarea
  que arranque recibe `animation_project_busy` del sidecar. Sin la clave de HeyGen el editor muestra solo
  el aviso de la clave, así que tampoco se puede recortar aunque sea gratis. `create-video-project` sigue
  guardando `expressive: true` si le llega con V (ningún camino lo manda desde la 2g), y
  `CreatePhotoAvatarDialog` todavía repite el markup de la insignia del precio. Siguen fuera de la 2g
  cambiar «looks» por «escenarios» en el resto de la app y medir el precio de un escenario en cada creación.
- **Verificación.** Guards nuevos: `check-avatar-appearance-cut.mjs` (28 tests: el corte, su límite, los
  límites de la duración y las escenas que tapa) y `check-avatar-resize.mjs` (38: el plan, con el piso y la
  apertura de R-2g-21, el render con `durations` y el recorte, con HeyGen simulado y ffmpeg real). Reescrito: `check-avatar-planner.mjs` (31
  tests; antes 37, sobre frases enteras). Ampliados: `check-scene-pins.mjs` (43), `check-diagnostic-module.mjs`
  (5: el subcomando nuevo), `check-app-avatar-create.mjs` (34), `check-create-avatar-ui.mjs` (399 checks; antes
  381), `check-avatar-library-ui.mjs` (52 pruebas; antes 51, con el escenario 11c del velo),
  `check-editor-avatar-regenerate-ui.mjs` (392 checks; antes 297) y `check-editor-avatar-gallery-ui.mjs`
  (197 checks; antes 112). Cada paquete corrió mutantes sobre una copia y los que sobreviven son
  equivalentes (WP-A, 46 de 47 y, en sus rondas siguientes, 7 de 8, 4 de 4, 3 de 3 y 15 de 17; WP-B, 53 de 57;
  WP-C, 28 de 29 y los de su ronda de arreglos, todos; WP-D, 14 de 14). WP-A, WP-B y WP-C tuvieron una revisión de tarea aparte (el controlador revisó WP-D) y sus hallazgos se
  cerraron en una ronda: ninguno crítico; los importantes, ambos de WP-B, fueron el lease de `durations`
  (R-2g-19) y un caso de «no paga» sin escenario. `pnpm check:locales` cuenta 2155 claves. Todo con HeyGen simulado: la ejecución no gastó saldo.
  La revisión final de toda la 2g dio «lista con arreglos» (dos importantes, I-1 e I-2, y cinco menores); sus
  arreglos (R-2g-20, R-2g-21, m-1 a m-5 y las observaciones) entraron con un caso que falla antes de cada uno,
  23 de 23 mutantes muertos sobre una copia y la suite de Node completa en verde (88 archivos, 1825/1825);
  detalle en `execution-e2g/final-fix-report.md` (interno).

**A confirmar en la QA del dueño, con la app real** (lista: `execution-e2g/qa-2g.md`): (1) alargar una
aparición con el saldo a la vista: cuánto cobra el trozo nuevo, que el clip nuevo siga la narración con la
misma voz, que las escenas de imagen que tapa salgan y la que sigue empiece donde termina el avatar, y que
los ids con huecos no confundan; (2) recortar una aparición: gratis, al instante y terminando en una
pausa; (3) las apariciones de tu narración real, con 5 y con 10 s, a ±0,5 s de lo elegido, y «3 veces en 2
minutos» con las tres primeras de hasta 32 s; (4) la tarjeta plegada y desplegada en la app real con las
fuentes reales (entra sin scroll a 1024 × 640, el foco con el teclado, el globo de «Qué podés pedir»);
(5) Avatar V sin «Movimiento más expresivo» e IV con un look de foto con él; (6) el precio de «Crear escenario», mirando el saldo antes y
después; (7) el velo de «Eliminar» a todo el ancho de la imagen en la ventana grande y en la mínima;
(8) los subtítulos de una aparición que termina a mitad de frase; (9) una narración con una pausa al
principio: la apertura carga el silencio y se recorta y se alarga cerca de lo pedido, nunca por debajo de
4,5 s (R-2g-21).

Costo si estuviera mal: el tope de 32 s (R-2g-10) es la constante `AVATAR_EARLY_MAX_SECONDS` —si se quiere
más largo se sube, y las tres entran menos veces (35 s: el 95,7 % con frases largas)—; la pausa larga que corta
(R-2g-11) es `avatarCutLimit` y su alternativa, descartar el inicio, perdía «3 veces en 2 minutos» con pausas
de 2 a 5 s; la lectura de la apertura (R-2g-17) es `openingSpan`, y el empate (R-2g-12) el comparador de
`avatarCutEnd`; el piso de 4,5 s es `AVATAR_SHORTEST_APPEARANCE_SECONDS`, el mismo en el planificador y en el
cambio de duración (R-2g-21), y el segundo intento de la apertura en el editor es `loadedPausesOf` de
`resize-plan.ts`; recortar sin confirmación (R-2g-2) es la
acción de recortar de `useAvatarSceneRender` —si el dueño quiere confirmarlo, es abrir la confirmación que ya
existe para el render—; que el máximo pare en la primera escena animada (R-2g-4) y que la última del video
no cambie (R-2g-18) son `avatarResizeLimits`; el lease exclusivo (R-2g-19) es `changesSceneTimes` en
`pipeline/commands/videos/subcommands.ts` y el precio es que no se anima nada en el proyecto mientras una
duración nueva renderiza; los ids con huecos (R-2g-3) fallarían donde algo supusiera ids contiguos (no se
encontró ninguno); los 0,93 US$ son una constante en dos archivos; que una V conserve el «más expresivo»
que tenía guardado (R-2g-20) es no mandarlo desde el editor —apagarlo, como R-2g-6, pagaba de nuevo un
render ya pedido o pagado de esa escena—; y el velo es `panelClassName` y `warningClassName` de
`avatarDeleteMenuClasses.ts`. La ADR sigue en «Propuesta»: pasa a Aceptada con la QA del dueño.
