# ADR-0014 — Módulo Library: edición sobre las stages, regeneración selectiva y un solo escritor por proyecto

- **Estado:** Aceptada
- **Fecha:** 2026-08-25
- **Área:** pipeline / app
- **Completa a:** [ADR-0010](ADR-0010-pipeline-por-stages-y-migracion-por-modulos.md)
  (pasos 5 y 7, fusionados) · **Actualiza a:** [ADR-0009](ADR-0009-preferencias-nativas-y-carpeta-raiz.md)
  (carpeta `clips/`) y [ADR-0013](ADR-0013-modulo-create-runner-de-stages-y-binarios.md)
  (materializa el merge por id que difirió)

## Problema

La ADR-0010 dejó Library en dos pasos (lectura y acciones) y Create (paso 6) se
adelantó dejando el contrato preparado: `scenes.json` congelado con
`userPrompt`/`imageModel`/`imageQuality` reservados, `untilStage` en
`run-video-pipeline`, `explicitNewImage` en los lanes de imagen y el merge por
id designado para `pipeline/project/scenes-file.ts`. Faltaba decidir cómo la
biblioteca lista/edita proyectos sin repetir la infraestructura del origen
(broadcaster SSE con replay, locks por proyecto, env mutable) y sin romper los
guards de gasto que Create ya paga.

## Decisión

**Library se implementa completo en un paso (lectura + editor), como vistas del
módulo `videos`, con la edición montada sobre las MISMAS stages del runner:
rebanadas del registro con configuración por contexto, merge por id en la
persistencia de escenas, y un único escritor de jobs por proyecto en la UI.**

Materialización:

1. **Vistas del módulo `videos`** (Library, LibraryPlayer, LibraryProgress,
   LibraryEditor): comparten `api/`, `constants.ts` y tipos con Create — es el
   mismo dominio (proyectos de video). Claves i18n del grupo `library.*` en
   inglés (convención de `create.*`).
2. **Listado derivado del disco**: `list-video-projects` escanea la carpeta
   raíz; «es un proyecto» = carpeta con `project.json` válido con la forma
   nueva. `hasVideo`, `imageCount` y la miniatura (imagen de la escena de menor
   id) se derivan del filesystem al listar — jamás se persisten rutas
   absolutas. Entradas corruptas se saltan sin romper el listado (patrón de
   `music-history`). **Los proyectos del Vimo original no se listan** (ids con
   `_`/mayúsculas y metadata en español no pasan los guards): no es un bug, es
   formato viejo.
3. **`videoOutdated` explícito en `VideoProjectMetadata`** (campo aditivo; el
   formato congelado es `scenes.json`, no la metadata). `markVideoOutdated`
   solo marca si HAY un mp4 válido y **nunca lo borra** (paridad con el
   origen); lo limpian los jobs que completan un render. Descartado derivarlo
   por mtimes: el drag de tiempos no toca archivos comparables con el mp4.
   Sin «versiones anteriores» de render: re-render sobreescribe `<slug>.mp4`
   (decisión de producto).
4. **Regeneración selectiva = runner sobre `[scene-prompts, images]`** con
   `regenerateSceneIds` en el `CreateVideoContext`:
   - `imagesStage` no se saltea y pasa esos ids como `forceRegenerate` **y**
     `explicitNewImage` — el ÚNICO bypass de la cosecha de una tarea Evolink ya
     pagada, exclusivamente con pedido explícito del usuario. Las pasadas de
     recuperación de Create siguen cosechando `imageTask` intactas.
   - «Reescribir prompt» = borrar `imagePrompt` antes de correr: scene-prompts
     rellena SOLO lo que falta priorizando el `userPrompt` persistido.
   - El proveedor de imagen del payload es un **override transitorio** del job
     (clon de options); modelo/calidad por escena sí persisten
     (`update-scenes`).
   - El comando **no toca `metadata.state`**: es cirugía de editor — un job
     muerto no deja un `generating` huérfano. El resultado
     (`regenerated`/`failed`) se deriva comparando mtimes de las imágenes:
     el lane conserva el archivo viejo hasta que el nuevo sale OK.
5. **Merge por id en `pipeline/project/scenes-file.ts`** (lo que ADR-0013
   difirió): `mergeScenesById` re-lee el disco y reemplaza solo lo propio;
   `writeScenesOwned` es la escritura de las stages — sin `ownedIds` (pipeline
   completo) escribe entero como siempre; con ellos (regen) hace merge. Una
   edición del usuario durante una regen no se pisa.
6. **Concurrencia sin broadcaster**: el disco es la verdad; el `Channel` del
   invoke solo pinta el vivo; al rehidratar se **refetchea, no se re-reproduce**.
   - **Un pipeline completo/render a la vez en toda la app** (store
     `useCreateTask` compartido con Create; simplificación consciente frente al
     «uno por proyecto» del origen, reversible con un map de tasks).
   - **Regens coalescidas**: la cola de la UI junta escenas y lanza UN job de
     regen por proyecto; lo encolado durante el job sale en el siguiente lote.
     El paralelismo del origen se conserva DENTRO del job (semáforos de los
     lanes), pero en disco hay un solo escritor de regen.
   - Exclusión por proyecto en el store del editor (`useLibraryEditorTask`,
     sin localStorage): regen ⊻ render ⊻ export ⊻ audio.
   - **Huérfanos `generating`** (job muerto con la app; no hay proceso
     residente): se derivan EN LA UI como «interrumpido» con CTA Reanudar —
     `run-video-pipeline` corrige el disco al relanzar (cache-hit). Un comando
     de lectura jamás escribe estado.
7. **Render-only** (`render-video`): depura `render` de `completedStages` y
   corre `[renderStage]` — el cache por manifest de chunks re-renderiza solo lo
   cambiado. Un fallo NO marca el proyecto en error: el mp4 anterior queda
   intacto (mezcla a temporal + rename atómico) y `completedStages` ya cuenta
   la verdad.
8. **Narración**: `upload-narration` (Create) invalida words/scenes;
   `replace-narration` (Library) **preserva** las escenas — re-transcribe con
   el runner sobre `[transcription]` y **redistribuye los tiempos uniformes**
   sobre la duración nueva (imágenes y prompts intactos). Dos comandos a
   propósito.
9. **Música**: la generación IA **reusa los subcomandos del dominio music**
   (`generate-music`, `suggest-music-prompt`) — providers una sola vez;
   `set-project-music` solo recibe la URL ganadora (validación http(s) + cap
   50 MB), la vía YouTube (yt-dlp), un archivo local o el quitado.
   `bgmOffsetSeconds` entra a `VideoProjectOptions` y a la mezcla final
   (`-ss` como opción de input).
10. **Export de clips** a `clips/` (actualiza el layout de ADR-0009): un mp4
    mudo por escena vía `renderChunk` de UNA escena (mismo Ken Burns por índice
    global) + narración/música copiadas. Carpeta regenerable, se limpia en cada
    export; la abre la UI con el opener — el sidecar jamás spawnea `open`.
11. **`get-image-credits`**: saldos Fal/Evolink por separado (uno caído no
    tumba al otro); el billing de Fal exige key tipo Admin → código propio
    `fal_admin_key_required`.
12. **Reordenar escenas (retirado).** Existió `swap-scene-visuals` — drag &
    drop del timeline que intercambiaba lo visual entre dos tramos dejando
    narración, texto y tiempos en su lugar. Se retiró del sidecar y de la UI:
    no funcionaba de forma fiable y el editor no lo necesita. Si vuelve, la
    regla sigue siendo la misma: lo atado al audio jamás se mueve.

Rust no se tocó: los comandos genéricos `start_pipeline_job`/`cancel_pipeline_job`
cubrieron los 12 subcomandos nuevos.

13. **Un fallo de regeneración es visible y persistente por escena.** El
    carril de imagen emite `scene-image-failed` con `code` + `detail` (motivo
    técnico del proveedor) y lo espeja como `log` warn — el emitter vuelca los
    warn/error a stderr, que Rust registra como `sidecar stderr` en el log de
    la app. La UI guarda el motivo por escena (`sceneErrors`) hasta el
    próximo intento y lee `result.failed` del `job-completed` para el banner.
    En la stage `images`, un objetivo de regeneración cuenta como listo solo
    cuando ESTE job produjo su imagen nueva (la vieja queda en disco): así entra
    a las pasadas de recuperación como en el origen, pero el gate final no lo
    trata como hueco (su imagen anterior sigue siendo válida para el render).
    El borrador de la descripción sobrevive a los refetches y se persiste al
    salir de la textarea; `rewritePrompt` se decide con ese borrador. Y
    «Re-renderizar» nunca genera imágenes (solo `render`, paridad con el
    origen): la imagen nueva sale de «Regenerar imagen».

## Alternativas consideradas

- **Derivar «desactualizado» por mtimes** — descartada: el drag de tiempos no
  toca ningún archivo comparable con el mp4 y la mezcla de señales da falsos
  positivos/negativos. El flag explícito es lo que el origen validó.
- **Un lock en disco por proyecto** (como el broadcaster del origen) —
  descartada: con un único despachador en la UI (el store) y el merge por id,
  el lock solo agregaría estados huérfanos que alguien debería limpiar.
- **Normalizar los `generating` huérfanos desde `list-video-projects`** —
  descartada: un comando de lectura no debe escribir, y el sidecar (proceso por
  job) no puede saber si otro job sigue vivo.
- **Regens con N jobs paralelos por proyecto** (como el origen) — descartada:
  N procesos escribiendo `scenes.json` completo multiplican la ventana de
  carrera; la cola coalescida da la misma UX con un solo escritor.
- **Duplicar la generación de música en el dominio videos** — descartada: los
  providers viven UNA vez (ADR-0010); el editor consume los subcomandos de
  music y solo persiste el resultado elegido.

## Consecuencias

- ✅ El editor completo (regen, re-render, export, narración, música, mezcla,
  timeline) montado sobre las stages existentes: cero lógica de proveedores
  duplicada, guards de gasto intactos.
- ✅ La biblioteca funciona aunque la app se cierre a mitad de cualquier job:
  todo estado rehidratable desde disco.
- ✅ `convertFileSrc` con cache-buster por mtime provisto por el sidecar: la
  imagen regenerada se ve sin cambiar de ruta.
- ⚠️ Un solo pipeline completo a la vez en la app (el origen permitía uno por
  proyecto): guard con toast. Decisión reversible.
- ⚠️ Ventana residual de read-modify-write entre `update-scenes` y una regen en
  vuelo: aceptada y acotada (merge pegado al write, un solo job de regen).
- 🔒 `explicitNewImage` SOLO se llena con ids pedidos por el usuario; ninguna
  pasada automática lo usa.

## Verificación de cumplimiento

- Los guards de ADR-0010/0013 siguen vacíos: `grep -rn "process.env" pipeline/`,
  `console.log` fuera del emitter, `stage-*` emitido por stages, `spawn` fuera
  de `utils/ffmpeg.ts` y `providers/ytdlp/`, import runtime de `@pipeline` en
  `src/`.
- `grep -rn "explicitNewImage" pipeline/` → solo `lane.ts`, `images.ts` (y los
  lanes que lo consumen): ningún caller nuevo lo llena fuera de
  `regenerateSceneIds`.
- Harness (`pnpm pipeline:harness`, corrido en la implementación):
  `list-video-projects` salta corruptos/reservados/ids inválidos;
  `update-scenes` de una escena deja las demás byte-idénticas y marca
  `videoOutdated`; regen sin claves falla limpio sin tocar mtimes ajenos;
  `render-video` real (ffmpeg empaquetado) sobreescribe el mp4 con chunks
  cache-hit y limpia `videoOutdated`; `render_missing_images` deja el mp4
  anterior intacto; `export-clips` deja `clips/` con un mp4 por escena +
  narración; `replace-narration` reemplaza el audio preservando `scenes.json`.
- `pnpm check:locales` — los tres catálogos declaran las mismas claves.
- **Cómo se vería una regresión:** una stage llenando `explicitNewImage` sin
  pedido del usuario; un comando de lectura escribiendo `project.json`; una
  regen persistiendo escenas fuera de `writeScenesOwned`/`mergeScenesById`; el
  export spawneando `open`; un `videoOutdated` que borra el mp4.

## Fuera de alcance

- **Versiones anteriores de render** (`video_anterior_*.mp4` del origen): no se
  portan; el flag de desactualizado cubre el aviso.
- **Logs por proyecto y «copiar runtime»**: el pipeline nuevo no escribe logs a
  disco; el diagnóstico viaja por eventos.
- **Migración de proyectos del Vimo original**: formato incompatible; sería un
  proyecto en sí y se decidió no arrastrar el pasado.
- **Paginación/búsqueda del listado**: el origen tampoco la tenía; se agrega si
  las bibliotecas reales lo piden.

## Referencias

- ADR-0009 (layout de proyecto; gana `clips/`), ADR-0010 (orden de migración;
  este es el módulo final), ADR-0013 (contratos congelados que este módulo
  consume).
- Origen del port: `02-vimo/cursor-video/app/src/caracteristicas/biblioteca-de-videos/`
  y `app/servidor-local/rutas/proyectos.ts` (referencia de comportamiento,
  solo lectura).
