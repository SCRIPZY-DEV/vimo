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

La UI no expone el toggle de auto-render: todo job de Create termina en el mp4.
El campo `autoRender` queda en `VideoProjectOptions` para no romper el contrato
cuando Library traiga el editor.

### Eventos tipados, no `progress.detail`

Los 10 eventos nuevos de `pipeline/runner/events.ts` (`scenes-planned`,
`scene-image-*`, `voice-progress`, `render-progress`,
`awaiting-scene-confirmation`…) son variantes tipadas del union. La UI los
consume con un `switch` legible y sin casts; `progress` genérico queda para lo
que ya lo usaba (música, personajes).

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
