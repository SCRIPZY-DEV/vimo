# Vimo

Aplicación de escritorio que convierte un guion de texto en un video narrado completo,
listo para publicar: voz sintetizada, imágenes generadas por IA sincronizadas con la
narración, música de fondo y render final en MP4.

> [!IMPORTANT]
> **Este repositorio contiene la interfaz (`src/`), el lado nativo (`src-tauri/`) y el
> pipeline de generación (`pipeline/`).** El pipeline (las 6 fases: voz, transcripción,
> cortes, prompts, imágenes y render) se reescribe guiado desde el proyecto original y
> corre como **sidecar Node lanzado por Rust**, un proceso por job, sin servidor local
> ni puerto: la UI lo dispara con `invoke()` y recibe el progreso por el `Channel` del invoke
> ([ADR-0007](docs/adr/ADR-0007-invoke-reemplaza-al-servidor-local.md),
> [ADR-0010](docs/adr/ADR-0010-pipeline-por-stages-y-migracion-por-modulos.md)).
> FFmpeg viaja como binario. La identidad del usuario se resuelve con **Supabase**.
> En `src/` no hay orquestación ni llamadas a proveedores: solo la app que el usuario
> ve y opera.

Todo corre en la máquina del usuario: no hay servidor que desplegar. Las únicas llamadas
remotas son a los proveedores externos, con las claves del propio usuario.

Es una **reescritura desde cero** de un proyecto anterior que era un CLI monolítico en
Node. La lógica de generación se extrajo a un servicio propio y esta capa se rehízo
completa, con estructura modular y convenciones nuevas.

## Qué hace la aplicación

El usuario escribe o pega su guion, elige el estilo visual y las opciones de
generación, y la app dispara el proceso mostrando el avance fase por fase hasta
entregar el video final. El modelo es **BYO-keys**: cada usuario aporta sus
propias claves de los servicios pagos, así que el costo variable corre por su cuenta.

El flujo completo, paso a paso y con el reparto de responsabilidades entre la interfaz
y el sidecar, está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Cómo fluye la aplicación

Del login al primer job, en un dibujo. La regla que lo sostiene: **la capa `api/` de
cada módulo es el único intermediario entre la UI y Tauri** — ningún componente ni
hook llama a `invoke`, `fetch` ni al SDK de Supabase directamente.

```
              ┌───────────────────────── webview (src/) ─────────────────────────┐
              │                                                                  │
              │   vista/componente → hook (TanStack Query) → api/ del módulo     │
              │                                                    │             │
              └────────────────────────────────────────────────────┼─────────────┘
                        │                        │                 │
              (1) LOGIN │              (2) CLAVES│        (3) JOBS │
                        ▼                        ▼                 ▼
              ┌──────────────────┐   ┌──────────────────────┐   ┌─────────────────────┐
              │ Supabase (OAuth  │   │ Rust: api_keys       │   │ Rust: pipeline      │
              │ Google, web +    │   │  valida la clave     │   │  arma el PipelineJob│
              │ deep link vimo://│   │  (reqwest) y la      │   │  (claves desde el   │
              │ ); guards en los │   │  guarda en el        │   │  keychain, nunca    │
              │ loaders del      │   │  KEYCHAIN del SO     │   │  del webview) y     │
              │ router           │   │  — nunca localStorage│   │  spawnea el sidecar │
              └──────────────────┘   └──────────────────────┘   └──────────┬──────────┘
                                                                           │ stdin: job
                                                                           ▼
                                                                ┌─────────────────────┐
                                                                │ sidecar             │
                                                                │ vimo-pipeline       │
                                                                │  llama a los        │
                                                                │  proveedores (LLM,  │
                                                                │  música, …) con las │
                                                                │  claves del usuario │
                                                                └──────────┬──────────┘
                                                       eventos NDJSON      │
                                              ◄── Channel del invoke ──────┘
                                              (progreso, resultado, error)
```

En palabras:

1. **Login** — el módulo `auth` autentica contra Supabase (OAuth Google); los loaders
   del router hacen de guard: sin sesión válida no se entra al layout autenticado.
2. **Claves (BYO-keys)** — en Ajustes, el módulo `api-keys` manda cada clave por
   `invoke` a Rust, que la valida contra el proveedor y la guarda en el keychain del
   sistema operativo. La clave no vuelve a pasar por la UI.
3. **Jobs** — cuando un módulo genera algo (música hoy, voces mañana), su `api/` usa
   la capa común `src/modules/common/fetcher/pipeline.ts`: `invoke` lanza el job y un
   `Channel` de Tauri trae de vuelta el progreso y el resultado. Rust inyecta las
   claves del keychain al job por stdin; el sidecar es quien llama a los proveedores.

El detalle de cada pieza está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
(sección 4 para el pipeline).

## Plataformas

Una sola base de código compilada con Tauri 2 a aplicaciones nativas de **Windows,
macOS y Linux**.

Móvil queda fuera mientras el render dependa de FFmpeg como binario local — el porqué
está en la [ADR-0002](docs/adr/ADR-0002-servidor-local-como-sidecar-de-tauri.md)
(reemplazada por la ADR-0007 en cuanto al servidor, pero su análisis de FFmpeg sigue
vigente).

## Requisitos

- **Node.js 22+** y **pnpm**. Node 22 es el piso real: el sidecar del pipeline se
  empaqueta con Node SEA y el harness CLI ejecuta TypeScript por type stripping.
- **Rust** y las dependencias nativas de Tauri, solo si vas a compilar la app de
  escritorio. Guía oficial: <https://tauri.app/start/prerequisites/>.
- Para el desarrollo de la interfaz sola, alcanza con Node y pnpm.

## Puesta en marcha

```bash
git clone https://github.com/SCRIPZY-DEV/vimo.git
cd vimo
pnpm install
```

Si pnpm pide aprobar los scripts de instalación de alguna dependencia:

```bash
pnpm approve-builds
```

Después, según lo que quieras levantar:

```bash
pnpm dev          # interfaz en el navegador (http://localhost:5173)
pnpm tauri dev    # aplicación nativa, con recarga en caliente
```

## Comandos

| Comando                 | Qué hace                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm dev`              | Servidor de desarrollo de Vite en el puerto 5173                                                            |
| `pnpm build`            | Chequeo de tipos (`tsc -b`) y bundle de producción en `dist/`                                               |
| `pnpm preview`          | Sirve el bundle ya construido                                                                               |
| `pnpm lint`             | ESLint sobre todo el repositorio                                                                            |
| `pnpm lint:fix`         | ESLint aplicando las correcciones automáticas                                                               |
| `pnpm format`           | Prettier sobre todo el repositorio                                                                          |
| `pnpm pipeline`         | Corre el sidecar crudo: el `PipelineJob` va por stdin, a mano                                               |
| `pnpm pipeline:harness` | Ejecuta un subcomando del sidecar armando el job por vos ([ver abajo](#probar-el-pipeline-por-cli-harness)) |
| `pnpm build:sidecar`    | Empaqueta el sidecar como binario único (Node SEA → `externalBin`)                                          |
| `pnpm fetch:binaries`   | Descarga ffmpeg y yt-dlp pineados a `src-tauri/binaries/`                                                   |
| `pnpm check:locales`    | Verifica que `es`, `en` y `pt` declaren exactamente las mismas claves                                       |
| `pnpm tauri dev`        | Aplicación nativa en modo desarrollo                                                                        |
| `pnpm tauri build`      | Compila los instaladores nativos de la plataforma actual                                                    |

Antes de dar por terminado un cambio: `pnpm format`, `pnpm lint` y `pnpm build`, en ese
orden. Los tres deben pasar.

## Empaquetado del sidecar del pipeline

El pipeline (`pipeline/`) no corre con el Node del sistema: viaja dentro de la app
como **binario único** generado con Node SEA (esbuild → blob SEA → runtime de Node,
~110 MB por plataforma). Ver la sección `pipeline/` de
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**No hay pasos manuales en el flujo normal**: `pnpm tauri dev` y `pnpm tauri build`
regeneran el binario solos (hooks `beforeDevCommand`/`beforeBuildCommand` →
`pnpm build:sidecar`). El comando suelto existe para regenerarlo a mano o
diagnosticar el empaquetado.

⚠️ **Los artefactos generados NO se commitean** — ya están en `.gitignore`; si git
te los muestra como cambios, algo se rompió en el ignore, no los agregues:

```
src-tauri/binaries/        el binario final vimo-pipeline-<target-triple> (~110 MB)
src-tauri/sidecar-build/   intermedios (bundle CJS + blob SEA)
dist/                      bundle de la interfaz
```

Cada quien genera el binario para SU plataforma al compilar (el target triple sale
de `rustc`, o de `TAURI_ENV_TARGET_TRIPLE` dentro de los hooks de Tauri). Detalles
del proceso en [scripts/build-sidecar.mjs](scripts/build-sidecar.mjs).

## Probar el pipeline por CLI (harness)

Hasta el render, nada del pipeline depende de Tauri ([ADR-0010](docs/adr/ADR-0010-pipeline-por-stages-y-migracion-por-modulos.md)):
**cualquier subcomando del sidecar se puede ejecutar desde la terminal**, sin abrir la
app. Es la vía rápida para probar un cambio sin pasar por el formulario.

[scripts/run-pipeline-harness.mjs](scripts/run-pipeline-harness.mjs) arma a mano el
`PipelineJob` que normalmente construye Rust —claves, raíz de proyectos, rutas de
binarios— y se lo escribe por stdin a `node pipeline/main.ts <subcomando>`:

```bash
pnpm pipeline:harness <subcomando> [--payload '<json>'] [--root <dir>] [--keys <archivo>]
```

| Flag        | Default              | Para qué                                                               |
| ----------- | -------------------- | ---------------------------------------------------------------------- |
| `--payload` | sin payload          | El JSON propio del subcomando, entre comillas simples                  |
| `--root`    | `~/Documents/Vimo`   | Raíz de proyectos (ADR-0009): debajo viven los proyectos y `_history/` |
| `--keys`    | `.harness-keys.json` | Archivo con las claves BYO del usuario                                 |

**Antes de la primera corrida:**

- Las claves van en un `.harness-keys.json` en la raíz del repo (gitignoreado), con los
  ids del catálogo de proveedores:

  ```json
  {
    "deepinfra": "...",
    "fal": "...",
    "evolink": "...",
    "dubvoice": "...",
    "elevenlabs": "...",
    "deepgram": "..."
  }
  ```

  Si el archivo no existe, el harness sigue con `{}`: alcanza para todo lo que no llama a
  un proveedor (los listados, el estado de un proyecto, crear un proyecto, `ping`).

- `ffmpeg` y `yt-dlp` salen de `src-tauri/binaries/` —los **mismos** que empaqueta Tauri,
  nunca los del PATH—. Si la carpeta está vacía: `pnpm fetch:binaries`.

**Lo que sale por stdout** es una línea NDJSON por evento, idéntica a la que la UI recibe
por el `Channel`. Todo job abre con `job-started` y cierra con `job-completed` (exit 0) o
`job-failed` (exit 1):

```
{"type":"job-started","jobId":"harness-1770000000000"}
{"type":"job-completed","result":{"projectId":"mi-video"},"jobId":"harness-1770000000000"}
{"type":"job-failed","code":"invalid_payload","message":"payload.sceneCount must be an integer between 1 and 500", ...}
```

> [!NOTE]
> El harness **no manda mensajes de control**, así que no se puede cancelar un job a
> mitad como hace la app con `cancel_pipeline_job`. Para cortar, Ctrl-C.

### Contrato

`ping` devuelve el payload que recibió: la comprobación más barata de que el sidecar
arranca y el job se parsea bien.

```bash
pnpm pipeline:harness ping --payload '{"hola":"mundo"}'
```

### Videos

| Subcomando             | Claves y binarios que necesita                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-video-project` | ninguna (solo escribe disco)                                                                                                                                               |
| `upload-narration`     | `ffmpeg`, solo si el audio no es `.mp3`                                                                                                                                    |
| `run-video-pipeline`   | según las stages: `dubvoice`/`elevenlabs` (voz), `deepgram` (transcripción), `deepinfra` (prompts), `fal` o `evolink` (imágenes), `evolink` (BGM IA) · `ffmpeg` y `yt-dlp` |
| `video-project-status` | ninguna                                                                                                                                                                    |
| `confirm-scenes`       | ninguna                                                                                                                                                                    |
| `probe-tts`            | `dubvoice`                                                                                                                                                                 |

```bash
# Crea <root>/<slug>/ con project.json en estado draft y devuelve { projectId, projectDir }.
# name ≤ 80 · sceneCount entero 0-500 (0 = automática) · script obligatorio con narrationMode "tts".
# styleId: normal | pov_stickman | cartoon | fantasia | terror
pnpm pipeline:harness create-video-project --payload '{
  "name": "Mi video de prueba",
  "script": "Hace mil años, en un pueblo olvidado, vivía un relojero.",
  "options": {
    "styleId": "cartoon",
    "sceneCount": 0,
    "narrationMode": "tts",
    "voiceProvider": "minimax",
    "voiceId": "Spanish_SereneWoman",
    "imageProvider": "evolink",
    "useBgm": false,
    "useOverlay": false,
    "confirmScenes": true
  }
}'

# Copia (o transcodifica con ffmpeg) el audio del usuario a narration.mp3. Ruta absoluta.
pnpm pipeline:harness upload-narration --payload '{"projectId":"mi-video-de-prueba","audioPath":"/ruta/absoluta/narracion.wav"}'

# El job largo. untilStage corta el recorrido y es lo que hace útil al harness:
# voice → transcription → scene-cuts → scene-prompts → images → render.
pnpm pipeline:harness run-video-pipeline --payload '{"projectId":"mi-video-de-prueba","untilStage":"scene-cuts"}'

# Lee project.json y el resumen de escenas del disco.
pnpm pipeline:harness video-project-status --payload '{"projectId":"mi-video-de-prueba"}'

# Resuelve la pausa awaiting-scene-confirmation. sceneCount entero 1-500.
pnpm pipeline:harness confirm-scenes --payload '{"projectId":"mi-video-de-prueba","sceneCount":12}'

# Pre-flight del proveedor TTS. Nunca falla el job: responde { ok, reason }.
pnpm pipeline:harness probe-tts --payload '{"provider":"minimax"}'
```

Relanzar `run-video-pipeline` sobre el mismo proyecto **retoma donde quedó**: cada stage
se saltea si su artefacto en disco es válido. Ese es el mismo camino del botón «Reanudar»
de la app.

### Voces

`list-voices`, `generate-voice` y `get-voice-credits` necesitan la clave `dubvoice`; los
dos de historial solo leen y borran disco bajo `<root>/_history/voices/`.

```bash
# Catálogo unificado. filters es opcional; page solo es significativo para elevenlabs.
pnpm pipeline:harness list-voices --payload '{"provider":"minimax","filters":{"language":"Spanish","gender":"female"}}'

# Sintetiza y guarda la entrada en el historial. text ≤ 4500 chars.
# En minimax el voiceId es SIEMPRE el id largo ("Spanish_SereneWoman"): el corto da 500.
pnpm pipeline:harness generate-voice --payload '{"provider":"minimax","voiceId":"Spanish_SereneWoman","text":"Hola, esto es una prueba.","settings":{"speed":1,"pitch":0}}'

pnpm pipeline:harness get-voice-credits
pnpm pipeline:harness voice-history-list
pnpm pipeline:harness voice-history-delete --payload '{"id":"<id-del-historial>"}'
```

### Música

`suggest-music-prompt` usa `deepinfra`; `generate-music` y `get-music-credits`, `evolink`.
`choose-music` solo descarga la URL que ya devolvió la generación.

```bash
# Propone un prompt de música a partir del guion (LLM).
pnpm pipeline:harness suggest-music-prompt --payload '{"script":"Hace mil años, en un pueblo olvidado..."}'

# OJO: acá el payload ES MusicGenerationParams, sin anidar bajo otra clave.
# Emite eventos `progress` mientras Suno trabaja.
pnpm pipeline:harness generate-music --payload '{"prompt":"epic orchestral, cinematic","instrumental":true}'

# Baja la opción elegida a <root>/_history/music/<id>/. option.audioUrl sale de generate-music.
pnpm pipeline:harness choose-music --payload '{"option":{"audioUrl":"https://.../track.mp3","title":"Take 1"},"prompt":"epic orchestral, cinematic","name":"intro epica","instrumental":true}'

pnpm pipeline:harness get-music-credits
pnpm pipeline:harness music-history-list
pnpm pipeline:harness music-history-delete --payload '{"id":"<id-del-historial>"}'
```

### Personajes

El CRUD de la biblioteca (`<root>/characters/`) no necesita claves. `suggest-character-profile`
usa `deepinfra` y `generate-character-preview` usa `fal` o `evolink`, según el `provider`.

```bash
pnpm pipeline:harness characters-list

# description ≥ 10 chars: la identidad va en inglés y NEUTRA de estilo (el estilo se
# aplica aparte al generar cada imagen).
pnpm pipeline:harness character-create --payload '{"name":"Elena","description":"a young watchmaker with short red hair and round glasses","age":"28","role":"protagonist"}'

# Solo los campos que mandes se tocan; el id sale de characters-list.
pnpm pipeline:harness character-update --payload '{"id":"elena-a1b2c3","role":"antagonist"}'
pnpm pipeline:harness character-delete --payload '{"id":"elena-a1b2c3"}'

# Sin clave de deepinfra (o sin datos suficientes) responde un fallback armado a mano.
pnpm pipeline:harness suggest-character-profile --payload '{"name":"Elena","role":"watchmaker","script":"Hace mil años..."}'

# Una imagen del personaje en el estilo elegido; devuelve { dataUri, finalPrompt }.
# provider fal admite además falModel: gpt-image-2 | flux-schnell
pnpm pipeline:harness generate-character-preview --payload '{"identityPrompt":"a young watchmaker with short red hair","styleId":"cartoon","provider":"evolink"}'
```

## Extender el pipeline

### Agregar una fase a un flujo existente

Una fase implementa el contrato `Stage` de
[pipeline/runner/stage.ts](pipeline/runner/stage.ts) (`id`, `skip?`, `run`) y **el
runner es el único que emite** `stage-started` / `stage-skipped` / `stage-completed`:
la fase no los emite a mano.

1. **La fase** en `pipeline/stages/<fase>/<fase>.ts`, exportando su `Stage`. Todo lo
   que use solo esa fase se queda en su carpeta; si lo necesitan dos fases, va a
   `pipeline/stages/shared/`.
2. **El id** en [pipeline/runner/stage-id.ts](pipeline/runner/stage-id.ts): es lo que
   viaja a la UI en los eventos.
3. **Registrarla** en [pipeline/stages/registry.ts](pipeline/stages/registry.ts). El
   orden del array **es** la secuencia del video:

   ```ts
   export const CREATE_VIDEO_STAGES: Stage<CreateVideoContext>[] = [
     voiceStage,
     transcriptionStage,
     sceneCutsStage,
     scenePromptsStage,
     imagesStage,
     renderStage,
   ]
   ```

4. **La etiqueta i18n** de la fase en los tres catálogos de `public/locales/`
   (`create.stages.*`) y su entrada en `PIPELINE_STAGES`
   ([src/modules/videos/constants.ts](src/modules/videos/constants.ts)), que es lo que
   dibuja la barra de progreso.

Toda fase debe ser **retomable**: `skip()` devuelve `true` cuando su artefacto en
disco ya es válido, y así un proyecto a medias se retoma sin repetir —ni volver a
pagar— lo hecho. Una fase puede además pedir **pausa** devolviendo `{ pause: true }`
(lo usa la confirmación de escenas): el job termina limpio y al relanzarlo retoma.

### Agregar un flujo nuevo

Un flujo es su propio array de fases con su propio contexto. Además de las fases:

1. **El contexto** que comparten sus fases, extendiendo `PipelineContext`
   (`pipeline/stages/context.ts` es el ejemplo: rutas del proyecto, metadata y
   opciones).
2. **Su registro** — otro array como el de arriba, con su propio nombre y tipo:
   `export const MI_FLUJO_STAGES: Stage<MiFlujoContext>[] = [...]`.
3. **El subcomando** que lo dispara, en `pipeline/commands/<dominio>/`, armando el
   contexto y llamando a `runStages(MI_FLUJO_STAGES, context, hooks)` — como hace
   [run-video-pipeline.ts](pipeline/commands/videos/run-video-pipeline.ts). El resto
   del camino (registrar el subcomando, la UI) es la receta de subcomandos de
   [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Rust no se toca en ningún caso: `start_pipeline_job` es genérico.

## Estructura

```
src/         la interfaz: módulos por dominio, router e i18n
pipeline/    el pipeline de generación: sidecar Node por stages, con los providers de IA
src-tauri/   el lado Rust: comandos invoke, configuración nativa, iconos y capabilities
docs/        arquitectura, guía de contribución y decisiones (ADRs)
```

El detalle de cada carpeta y las reglas para agregar código están en
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) y [CLAUDE.md](CLAUDE.md).

## Documentación

| Documento                                          | Para qué                                        |
| -------------------------------------------------- | ----------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)       | Cómo está construido y cómo fluye la aplicación |
| [CLAUDE.md](CLAUDE.md)                             | Convenciones de código (obligatorias)           |
| [docs/CONTRIBUTING.es.md](docs/CONTRIBUTING.es.md) | Ramas, Pull Requests y forma de trabajo         |
| [docs/adr/](docs/adr/)                             | Decisiones de arquitectura y por qué se tomaron |

## Estado

La migración está en curso. Hoy el repositorio tiene el andamiaje completo (React 19,
Vite, Tauri 2, React Router con guards, TanStack Query, Tailwind, i18next) y la
**autenticación real**: OAuth con Google en doble flujo —web y deep link `vimo://`—,
verificación de acceso y cierre de sesión (ADR-0006). El pipeline de generación está
en migración por módulos (ADR-0010): la fundación de `pipeline/` —contratos, providers
de LLM y música, sidecar mínimo y comandos Rust genéricos— ya está; faltan los módulos
de pantalla (AI Music primero) y las stages con Create. El detalle pieza por pieza
está en la tabla §6 de [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
