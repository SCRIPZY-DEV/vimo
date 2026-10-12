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
   a frases enteras, mínimo 7 s (5 s desde la 2d), reparto parejo con hueco mínimo de 10 s, determinista.
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

- ✅ Continuidad real: cada aparición empieza y termina en una frase, con la narración de siempre.
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
  constantes, motor fijo y `placement`), rechaza la demo con avatar y, antes de crear la carpeta,
  exige que el look elegido —el principal u otro del mismo avatar— sea del avatar, esté listo con
  Avatar III (`isUsableLook`, nunca deducido de `status: 'ready'`) y tenga la orientación del
  formato: 16:9 horizontal y 9:16 vertical, según `lookOrientationFit` sobre
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
  galería, el aviso de imágenes faltantes y «Regenerar imagen» no la cuentan.
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
`docs/handoff/2026-10-09-avatar-heygen/execution-e2b/ledger.md`. Nada de esto agrega un pedido que
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
`docs/handoff/2026-10-09-avatar-heygen/execution-e2c/ledger.md`). El único `DELETE` nuevo es gratis:
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
del diseño; rulings: `docs/handoff/2026-10-09-avatar-heygen/execution-e2d/ledger.md`). Lo único
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
  avatar» (planeada), «Regenerar avatar» (fallida, desactualizada o lista sin clip) y «Regenerar
  todos (N)» (todas las de avatar sin clip válido o desactualizadas), con una confirmación que
  muestra la cantidad, el costo (el de Crear, por la duración real de cada tramo) y el saldo de
  avatares, releído antes de pagar. Corre `avatar-render-scenes { projectId, sceneIds }` como una
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
