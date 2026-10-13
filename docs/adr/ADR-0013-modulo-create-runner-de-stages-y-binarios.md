# ADR-0013 — Create: runner de stages, confirmación de escenas y binarios empaquetados

- **Estado:** Aceptada
- **Fecha:** 2026-08-21
- **Área:** pipeline / app / distribución
- **Completa a:** [ADR-0010](ADR-0010-pipeline-por-stages-y-migracion-por-modulos.md)
- **Actualiza:** [ADR-0009](ADR-0009-preferencias-nativas-y-carpeta-raiz.md) (layout de proyecto)

## Problema

La ADR-0010 fijó el pipeline por stages y dejó tres decisiones **diferidas al
paso que las tocara**: si el fallback Groq del LLM se conserva, si yt-dlp sigue
siendo la vía para BGM/overlay, y si el evento de pausa
`esperando-confirmacion-escenas` sobrevive. Ese paso es Create, que además es
el primero que necesita FFmpeg — hasta ahora `binaryPaths` se inyectaba vacío
porque ningún módulo lo usaba.

Restricciones que achicaron el campo:

- El usuario prueba con **build instalado** (la .app lanzada desde Finder no
  hereda el PATH): ningún binario puede asumirse global.
- Library (paso 5 del orden original) **necesita proyectos ya creados**: sin
  Create no hay nada que listar.
- Cada job del sidecar es un proceso: lo que deba sobrevivir entre jobs
  (la pausa, el progreso, la cosecha de una tarea pagada) tiene que estar en
  disco, no en memoria.

## Decisión

**Create se implementa completo — las 6 stages, el runner declarativo y el
módulo `src/modules/videos/` — y se adelanta a Library; FFmpeg y yt-dlp viajan
como `externalBin`; la confirmación de escenas se conserva como una pausa que
cierra el job limpio.**

### Orden: Create antes que Library

Se invierten los pasos 5 y 6 de ADR-0010. Library lee los proyectos que Create
produce: hacerla primero habría significado maquetar contra un formato de disco
todavía inexistente. El formato de `scenes.json` (`pipeline/types/scenes.ts`)
queda **congelado** en esta ADR: Library lo consumirá tal cual.

### Binarios empaquetados

`scripts/fetch-binaries.mjs` descarga **ffmpeg** y **yt-dlp** con URL y SHA-256
**pineados como constantes** (nunca «latest»: build reproducible), los firma
ad-hoc y deja un marcador `<binario>.sha256` que hace el script idempotente —
la firma modifica el archivo, así que su hash ya no coincide con el descargado.
Corre en `beforeDevCommand`/`beforeBuildCommand`, antes del sidecar.

- **Solo `aarch64-apple-darwin`** en esta fase (la plataforma donde se prueba);
  el resto llega con la fase de distribución. Un triple sin pins falla con un
  mensaje que dice qué agregar.
- **ffprobe NO se empaqueta**: la duración se mide decodificando con ffmpeg
  (`pipeline/utils/media-duration.ts`) — el header de un MP3 VBR miente y el
  origen ya había pagado ese bug con la voz cortada al final del video.
- Rust resuelve las rutas junto a `current_exe` (`src-tauri/src/pipeline/
binaries.rs`): la CLI de Tauri copia los externalBin ahí tanto en `target/
debug` como dentro del bundle. Best-effort, como las API keys: si falta uno,
  el sidecar reporta `ffmpeg_missing` / `ytdlp_missing`.
- Nota de licencia: el build estático de ffmpeg es **GPL**; la aspiración LGPL
  queda para distribución.

### yt-dlp se porta completo

BGM desde YouTube y overlay siguen existiendo (`pipeline/providers/ytdlp/
download.ts`), con la allowlist de hosts y el clasificador de errores del
origen (~12 familias → códigos i18n). **El soporte de cookies del navegador no
se porta**: era config por entorno; si un video las exige, el error clasificado
(`ytdlp_needs_login`) lo dice.

### La confirmación de escenas se conserva

El contrato `Stage` gana `StagePause`: `scene-cuts` emite
`awaiting-scene-confirmation`, persiste `state: 'awaiting-confirmation'` y
devuelve `{ pause: true }`. El runner corta el recorrido y el job termina con
`job-completed { status: 'awaiting-confirmation' }` — **cierre limpio ≠
completado**, la semántica del origen que fue fuente histórica de bugs.
Confirmar llama al subcomando `confirm-scenes` (escribe
`scenes-confirmed.json`) y **relanza** el job: voz y transcripción son
cache-hit por `skip()`.

### Siempre renderizar

> **Actualizada por [ADR-0016](ADR-0016-adopcion-del-rediseno-de-vimo-dev-por-ramas.md):**
> Create expone el checkbox de auto-export (default apagado). Con
> `autoRender: false` el job genera todo menos el render, el proyecto queda en
> `draft` y el video se arma desde el editor. Ausente = `true` (proyectos
> previos intactos).

La UI no expone el toggle de auto-render: todo job de Create termina en el mp4.
El campo `autoRender` queda en `VideoProjectOptions` para no romper el contrato
cuando Library traiga el editor.

### Eventos tipados, no `progress.detail`

Los 10 eventos nuevos de `pipeline/runner/events.ts` (`scenes-planned`,
`scene-image-*`, `voice-progress`, `render-progress`,
`awaiting-scene-confirmation`…) son variantes tipadas del union. La UI los
consume con un `switch` legible y sin casts; `progress` genérico queda para lo
que ya lo usaba (música, personajes).

> **Adenda 2026-09-04.** El carril verbatim de prompts (ADR-0016) emitía su
> avance de stream como `progress` genérico con `stageId: 'scene-prompts'`, y
> ninguna UI lo consumía: la barra de prompts saltaba de 0 a 100 al terminar el
> lote. Pasa a ser la variante tipada `scene-prompts-progress { ready, total }`
> (cifras absolutas sobre todas las escenas, espejo de `prompts-progreso` del
> origen), coherente con esta regla.

> **Adenda 2026-09-09.** Las pasadas de recuperación de `images` reescribían
> prompts (rechazados por contenido o inválidos) emitiendo solo un `log`: la UI
> mostraba prompts ✓ e imágenes congeladas, y la persona lo leía como un
> pipeline trabado. Pasan a emitir `images-recovery-pass { kind: 'rewrite' |
'retry', sceneIds, pass, maxPasses }` (cifras absolutas) y a reemitir
> `scene-prompt-ready` por cada prompt reescrito. La stage sigue sin emitir
> `stage-*`: que la fila de prompts vuelva a «en curso» es derivación de la UI
> a partir de ese evento, no una reapertura de la fase en el runner.

### Layout del proyecto, en inglés

```
<projectsRoot>/<slug>/
├── project.json  script.txt  narration.mp3  music.mp3  overlay.mp4
├── words.json  scenes.json  scenes-confirmed.json  visual-context.txt
├── scenes/scene_<id>.jpg      characters/reference_N.jpg
├── cache/chunks/              prompts.md
└── <slug>.mp4
```

Actualiza el contrato de ADR-0009 (que lo previó): `music/` pasa a ser el
archivo `music.mp3`, y se suman los artefactos intermedios. `characters` y
`_history` son nombres **reservados**: un proyecto no puede llamarse así.

### ADR-0012 sigue siendo Propuesta

Create se construye sobre las primitivas actuales del runner. Esta ADR **no la
materializa ni la invalida**: si se acepta después, la extracción encontrará
más call-sites (los de Create), que es exactamente lo que su «orden de
adopción» quería evitar. Decisión consciente del usuario para no bloquear
Create detrás de un refactor.

### Fallback Groq

Sigue **sin portarse** (lo que ADR-0010 ya había decidido): la degradación de
tier de `providers/llm/generate.ts` cubre el caso que motivaba el fallback.

## Alternativas consideradas

- **Library primero (orden original de ADR-0010)** — descartada: obligaba a
  maquetar contra un formato de disco inexistente y a re-tocarla al llegar
  Create.
- **Buscar ffmpeg en el PATH del sistema** — descartada: una app lanzada desde
  Finder no hereda el PATH (bug ya pagado con el sidecar, ver ADR-0010). El
  usuario final no tiene por qué instalar ffmpeg.
- **Empaquetar también ffprobe** — descartada: un binario más para algo que
  ffmpeg ya hace, y con peor precisión en MP3 VBR.
- **Eliminar la pausa de confirmación** — descartada por el usuario: es la
  única oportunidad de ajustar el ritmo del video antes de pagar las imágenes.
- **Un solo subcomando gigante sin stages** — descartada: es el monolito de
  2.142 líneas del origen que ADR-0010 decidió no repetir.
- **Un subcomando por fase, encadenados desde la UI** — descartada: mudaría la
  orquestación (orden, cache-hit, invalidación en cascada, retomar) al
  frontend, y perdería lo que cruza fases dentro de un proceso (el hoisting de
  la biblia visual, voz ∥ música ∥ overlay).

## Consecuencias

- ✅ El pipeline completo corre por CLI (`pnpm pipeline run-video-pipeline`):
  hasta el render, nada depende de Tauri.
- ✅ Retomar es gratis: cada stage saltea su trabajo si el artefacto en disco
  es válido, así que un error, una cancelación o la pausa continúan donde
  quedaron.
- ✅ La UI sobrevive a navegación y reload: la tarea vive en un store con
  localStorage (`vimo:create:task:v1`) y el proyecto, en disco.
- ⚠️ El bundle crece ~115 MB (ffmpeg + yt-dlp) sobre los ~110 MB del sidecar.
  Aceptado: es el precio de no depender del PATH.
- ⚠️ yt-dlp requiere mantenimiento (YouTube cambia): el pin se bumpea a mano.
- 🔒 `spawn` existe SOLO en `pipeline/utils/ffmpeg.ts` y
  `pipeline/providers/ytdlp/download.ts`; toda ruta de binario viene de
  `binaryPaths`.
- 🔒 Los guards de gasto del origen se conservan textualmente: anti-doble-gasto
  del TTS troceado, concat con re-encode (nunca `-c copy`), cosecha de tarea
  Evolink ya pagada antes de re-encargar, reintento solo de las escenas
  rechazadas por contenido, `-t` explícito en el render.

## Verificación de cumplimiento

- **Guards (greps ejecutables):**
  - `grep -rn "process.env" pipeline/` → vacío.
  - `grep -rn "console\." pipeline/` → vacío fuera del emitter.
  - `grep -rn "whisper\|llama\|ollama\|fishaudio" pipeline/` → vacío.
  - `grep -rln "spawn(" pipeline/` → solo `utils/ffmpeg.ts` y
    `providers/ytdlp/download.ts`.
  - `grep -rn "stage-started\|stage-completed" pipeline/stages/` → vacío (solo
    el runner los emite).
  - `grep -rn "/\*\*" pipeline/stages pipeline/commands/videos src/modules/videos`
    → vacío (comentarios `//` en el código de Create).
- **i18n:** `pnpm check:locales` — los tres catálogos declaran las mismas
  claves. El grupo `create.*` está **íntegramente en inglés** (claves, no
  textos), a pedido del usuario.
- **Smoke por CLI:** `create-video-project` → `run-video-pipeline --until
scene-cuts` con `confirmScenes` → `confirm-scenes` → relanzar; se verifica
  que la primera corrida pause con `awaiting-scene-confirmation` y que la
  segunda salte voz y transcripción con `stage-skipped`.
- **Al terminar un cambio:** `pnpm format && pnpm lint && pnpm build` +
  `cargo check` para lo de Rust.
- **Cómo se vería una regresión:** una stage emitiendo `stage-*` a mano; un
  `spawn` con `'ffmpeg'` literal; un reintento de imagen que crea tarea nueva
  sin consultar la anterior; `-shortest` reapareciendo en el render.

## Fuera de alcance

- **Regeneración selectiva de escenas** (`escribirEscenasMergeRegen` del
  origen) y el editor: llegan con Library. `pipeline/project/scenes-file.ts` es
  el archivo donde vivirá el merge.
- **Cookies de yt-dlp**, plataformas distintas de macOS arm64, y el guard de
  fidelidad por comparación de artefactos contra un proyecto del Vimo original
  (queda como verificación manual con claves reales).

## Enmienda 2026-10-13 — una fase puede correr junto con la anterior

El runner de esta ADR era un lazo secuencial: una fase, la siguiente. En la entrega 2h del avatar con HeyGen
([ADR-0057](ADR-0057-escenas-de-avatar-con-heygen-sobre-la-narracion.md), diseño §24.1) el dueño pidió que el
avatar se genere al mismo tiempo que las imágenes: la fase `avatar` no usa nada de los prompts ni de las
imágenes (sus entradas son la narración, las semillas del corte y el look copiado al crear el proyecto), y
esperarlas era tiempo perdido. Cambia cómo se recorren las fases, no qué hace cada una ni el orden del
registro; fuera de un grupo, el runner es el de antes.

- **`runsAlongside?: StageId`.** El contrato `Stage` suma ese campo: la fase arranca junto con esa otra, si la
  sigue en la lista que recorre el runner. `avatar` declara `runsAlongside: 'images'`. `STAGE_IDS` y el orden
  del registro no cambian y siguen siendo la secuencia del video (`animation` espera a las dos: necesita las
  imágenes). Con `untilStage: 'images'` la lista termina en las imágenes y el avatar no corre; con `avatar` o
  después corren las dos. Una acompañante que no tiene antes en la lista a la fase que acompaña corre sola, en
  su lugar, como cualquier fase. El corredor no lo hace con una promesa suelta dentro de `images`: así cada
  fase conserva su `skip()`, sus eventos y su gancho, y ninguna sabe de la otra (R-2h-2 de la entrega).
- **El grupo (`runGroup`).** Al llegar a una fase, las que la siguen y declaran `runsAlongside` con su id
  forman un grupo con ella. El runner evalúa el `skip()` de cada una, en orden (las salteadas emiten
  `stage-skipped` en ese momento), emite el `stage-started` de cada una que corre —la que manda primero— y
  las corre a la vez. Cada una emite su `stage-completed` y llama a `hooks.onStageCompleted` apenas termina.
  Tres consecuencias que nadie debe contradecir: (1) `completedStages` puede quedar con `avatar` antes que
  `images`; (2) el `stage-skipped` de una acompañante puede llegar **antes** del `stage-started` de la que
  manda (en un proyecto sin avatar, `stage-skipped avatar` sale antes que `stage-started images`), no
  «cuando su fase termina»; (3) el gancho puede correr para las dos fases a la vez, y quien escribe en él
  tiene que tolerarlo.
- **Solo el runner emite `stage-*`.** La regla de esta ADR sigue en pie y su grep de «Verificación de
  cumplimiento» sigue vacío: ninguna fase emite `stage-started`, `stage-skipped` ni `stage-completed` a mano.
  Es lo que permitió traer el avatar al grupo y no esconderlo dentro de `images`.
- **Cuando algo falla (R-2h-3).** La que manda es la primera del grupo que corre (`images`). Cada acompañante
  corre con su propio `AbortController` unido a la señal del job (`AbortSignal.any`), en una copia del
  contexto que solo cambia `signal` (la metadata y el resto se comparten por referencia, a propósito).
  1. Falla la que manda (o se pausa por saldo de imágenes): las acompañantes se cortan enseguida, el runner
     espera a que terminen —lo que HeyGen ya aceptó queda en sus recibos y se cosecha en la próxima corrida sin
     pagar de nuevo— y sale el fallo de la que manda.
  2. Falla una acompañante: la que manda sigue hasta el final, emite su `stage-completed` y pasa por el
     gancho; recién después sale el fallo de la acompañante (pausa por saldo o error, como hoy). Reanudar
     saltea `images` y rehace solo el avatar.
  3. Fallan las dos: gana la que manda y el fallo propio de la otra va como `log` `warn` con su código. El eco
     de un corte (la acompañante cae con su señal ya cancelada, porque la cortó el runner o el job) no se
     avisa como un segundo fallo.
  4. Cancelación del job: se frenan las dos y sale la cancelación, que `run-video-pipeline` trata como
     siempre (`paused`, `pauseReason: 'cancelled'`).
  5. Una fase que devuelve `{ pause: true }`: se espera a las otras y el grupo devuelve la pausa, salvo que
     otra haya fallado (un fallo le gana a una pausa; hoy ninguna de las dos la pide).

  Un gancho que falla es el fallo de su fase, como en el lazo secuencial. El runner nunca devuelve ni lanza
  antes de que terminen todas las fases del grupo: el sidecar sale forzado después de `job-failed`.

- **`project.json` en fila.** Con el gancho corriendo para las dos fases y el avatar marcando el video
  desactualizado, dos escrituras atómicas a la vez dejan la última que renombra y la otra se pierde
  (`completedStages`, `videoOutdated`). Las escrituras de `project.json` del proceso (`writeProjectMetadata`)
  van en una fila por archivo (`inMetadataQueue`, en `pipeline/project/metadata.ts`): cada una corre cuando
  terminó la anterior y toma la copia en memoria **cuando le toca escribir**, no cuando se pidió; sin otra
  escritura en curso corre en el acto, con los mismos bytes de siempre. La marca de video desactualizado del
  carril (`markStoredVideoOutdated`) relee el disco **dentro** de la fila, le cambia solo `videoOutdated` y
  copia la marca en la metadata en memoria antes de soltarla. Se eligió «releer y unir» y no «escribir la copia
  en memoria» porque el mismo carril corre como comando del editor junto a otros jobs, y ahí la copia de un
  job puede estar vieja. Entre procesos manda el lease del proyecto (un job que escribe por vez).
  `animation/generate.ts` conserva su propio «leer y marcar» (corre después del grupo, sin carrera).
- **`scenes.json`.** Las escrituras de `images` (y la del carril verbatim de prompts) van bajo el lease de
  checkpoint y conservan el `avatar` que haya en disco en cada escena (`writeScenesKeepingAvatars`): `images`
  nunca cambia `scene.avatar`. El detalle y el porqué están en la enmienda 2h de la ADR-0057.
- **Verificación.** `check-stage-runner-alongside.mjs` (26 tests): el grupo con fases falsas, sin disco ni red
  (el orden de los eventos, los dos órdenes de terminación, las combinaciones de `skip()`, cada regla del
  fallo, la cancelación y la pausa), la fila de `project.json` cruzada con el gancho en los dos órdenes y el
  pipeline real con Fal y HeyGen simulados. Con el `run-stages.ts` de antes, el guard se pone rojo.

Costo si estuviera mal: que el avatar termine aunque fallen las imágenes es cambiar el corte de las
acompañantes en `runGroup` (`leaderRun.catch`); que una pausa le gane a un fallo, el último `return` de
`runGroup`; y volver al lazo secuencial es sacar `runsAlongside` del avatar (el resto del grupo queda sin
uso). La fila de `project.json` y el lease de `scenes.json` no dependen de esto: siguen valiendo si algún día
otra fase corre en paralelo.
