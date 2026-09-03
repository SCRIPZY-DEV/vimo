# Arquitectura

Fuente de verdad sobre **cómo está construido** este sistema y **cómo fluye**. Se lee
antes de tocar código.

Este documento es de referencia: describe la forma del sistema. Las **reglas** para
escribir código están en [CLAUDE.md](../CLAUDE.md), y las **decisiones** con su
justificación en [docs/adr/](adr/). La misma forma del sistema, dibujada en
diagramas, está en [docs/diagrams/](diagrams/).

> [!IMPORTANT]
> **Cambio de dirección (2026-08-13,
> [ADR-0007](adr/ADR-0007-invoke-reemplaza-al-servidor-local.md)), materializado por la
> [ADR-0010](adr/ADR-0010-pipeline-por-stages-y-migracion-por-modulos.md):** el
> servidor local Hono (ADR-0002) queda **reemplazado**. El puente entre la app y el
> sistema operativo es `invoke()` de Tauri, y el pipeline se reescribe guiado en
> `pipeline/` como **sidecar Node por job** — sin servidor HTTP, sin puerto: Rust lo
> lanza, le pasa el job por stdin y reenvía su progreso NDJSON por el `Channel` del
> invoke. El entitlement firmado desaparece como concepto. La mecánica actual y la
> receta para extender el pipeline están en la **sección 4**; el flujo completo de
> guion a video (y su edición posterior), en la **sección 5**. La migración por
> módulos de ADR-0010 quedó completa con Library
> ([ADR-0014](adr/ADR-0014-modulo-library-edicion-sobre-stages.md)).

---

## 1. Frontera del sistema

**Todo corre en la máquina del usuario.** No hay servidor que desplegar ni costo de
infraestructura: la aplicación empaqueta el pipeline (sidecar Node) y el binario de
FFmpeg, y las únicas llamadas remotas son a los proveedores externos, con las claves
del propio usuario.

El repositorio tiene **tres carpetas de código**, una por pieza del sistema: `src/`
(la SPA en la webview), `src-tauri/` (Rust) y `pipeline/` (el sidecar del pipeline,
que vive como proceso solo mientras corre un job):

```
UI ── invoke("start_pipeline_job" + Channel) ──► Rust ── spawn por job ──► sidecar vimo-pipeline
UI ◄── Channel del invoke (eventos) ──────────── Rust ◄── NDJSON stdout ── (runner → stages → providers)
```

El sidecar invoca a FFmpeg y llama a los proveedores externos (TTS · transcripción ·
LLM · imágenes · música). La SPA solo habla con Rust vía `invoke()` (con un `Channel`
para los eventos de cada job) y con **Supabase**, la única pieza remota propia: la
identidad del usuario.

| Responsabilidad                               | Dónde vive                      |
| --------------------------------------------- | ------------------------------- |
| Pantallas, navegación, estado de la UI        | `src/`                          |
| Rutas, diálogos nativos y acceso a archivos   | `src/` + plugins de Tauri       |
| Lanzar, escuchar y cancelar jobs del pipeline | `src-tauri/`                    |
| Las 6 fases que generan el video              | `pipeline/` (stages)            |
| Llamadas a los proveedores externos           | `pipeline/` (providers)         |
| Ensamblado del video                          | FFmpeg, invocado por el sidecar |
| Registro, login y sesión                      | Supabase                        |
| Claves de los servicios pagos (BYO-keys)      | keychain del SO (ADR-0011)      |

Lo que **no** existe en `src/` y no debe aparecer: FFmpeg, modelos de IA, llamadas
directas a proveedores, orquestación de fases ni claves de esos servicios. FFmpeg viaja
en la aplicación, sí, pero como binario declarado en `src-tauri/`, nunca como código de
la interfaz. Si un cambio empieza a necesitar algo de esa lista dentro de `src/`, el
cambio va en `pipeline/` (o en un comando Rust si es puente con el SO).

### Quién manda sobre los archivos

La línea es explícita, porque si ambos lados calculan rutas terminan divergiendo:

- **Tauri decide el _dónde_**: elige el directorio de trabajo dentro del directorio de
  datos de la aplicación y expone el diálogo nativo para que el usuario guarde el MP4
  donde quiera.
- **El sidecar decide el _qué_**: recibe ese directorio (`projectDir`) y las rutas de
  binarios (`binaryPaths`) dentro del `PipelineJob`, y escribe ahí sus artefactos. No
  asume rutas propias.
- **La SPA no escribe artefactos del pipeline.** Usa la API de filesystem de Tauri solo
  para leer el resultado, revelarlo en el explorador de archivos y guardarlo.

---

## 2. Stack

| Capa            | Tecnología               | Rol                                                                      |
| --------------- | ------------------------ | ------------------------------------------------------------------------ |
| Interfaz        | React 19                 | Componentes y estado de la UI                                            |
| Lenguaje        | TypeScript               | Toda la fuente de `src/`                                                 |
| Build           | Vite                     | Servidor de desarrollo y bundle de producción                            |
| Empaquetado     | Tauri 2 (Rust)           | Aplicación nativa de escritorio y gestión de sidecars                    |
| Navegación      | React Router v7          | Árbol de rutas y vistas                                                  |
| Estado servidor | TanStack Query           | Caché, reintentos y consulta de progreso                                 |
| Estilos         | TailwindCSS              | Sistema de estilos                                                       |
| Autenticación   | Supabase                 | Identidad del usuario                                                    |
| Pipeline        | TypeScript (`pipeline/`) | Sidecar Node por job: stages, providers y prompts (ADR-0010)             |
| Render          | FFmpeg                   | Binario que invoca el sidecar; build LGPL con codificadores por hardware |
| Paquetes        | pnpm                     | Instalación y scripts                                                    |

Las **versiones exactas** están en [package.json](../package.json) y
[src-tauri/Cargo.toml](../src-tauri/Cargo.toml). No se duplican acá: se desactualizan.

**Plataformas:** Windows, macOS y Linux. Móvil queda fuera mientras el render dependa de
FFmpeg como binario local — ver la
[ADR-0002](adr/ADR-0002-servidor-local-como-sidecar-de-tauri.md).

---

## 3. Estructura de archivos

### Raíz del repositorio

```
vimo/
├── CLAUDE.md              convenciones de código (obligatorias)
├── README.md              qué es el proyecto y cómo levantarlo
├── index.html             plantilla HTML que carga Vite
├── package.json           dependencias y scripts
├── eslint.config.js       reglas de ESLint (incluye react-hooks y react-refresh)
├── .prettierrc.json       formato de código
├── vite.config.ts         build, plugins y el alias @/ → src/
├── tsconfig.app.json      configuración de TypeScript para src/
├── tsconfig.pipeline.json configuración de TypeScript para pipeline/
├── docs/                  documentación del proyecto
│   ├── ARCHITECTURE.md    este archivo
│   ├── CONTRIBUTING.md    proceso de trabajo (inglés)
│   ├── CONTRIBUTING.es.md proceso de trabajo (español)
│   └── adr/               decisiones de arquitectura
├── public/                archivos servidos tal cual (se copian a dist/)
├── scripts/               build-sidecar.mjs (empaqueta el sidecar Node SEA), fetch-binaries.mjs (descarga ffmpeg/yt-dlp pineados) y check-locales.mjs (guard de los 3 catálogos)
├── pipeline/              el pipeline de video: sidecar Node por stages (ADR-0010)
├── src/                   la interfaz  ← el grueso del trabajo
└── src-tauri/             el lado nativo y los sidecars
```

### `pipeline/` — el sidecar del pipeline (ADR-0010)

Paquete TypeScript puro, fuera de `src/`: la app solo puede consumir sus tipos con
`import type` (contrato de eventos y job); el runtime lo ejecuta Rust como proceso
hijo por job, sin servidor ni puerto. Se empaqueta como **binario único con Node
SEA** (`scripts/build-sidecar.mjs`: esbuild → blob SEA → runtime Node, ~110 MB)
en `src-tauri/binaries/vimo-pipeline-<target-triple>`, declarado como
`externalBin`; los hooks `beforeDevCommand`/`beforeBuildCommand` lo regeneran,
así **dev y producción usan el mismo binario** — el sidecar nunca depende del
Node del sistema (una app lanzada desde Finder no hereda el PATH de la
terminal). Para iterar el pipeline por CLI: `pnpm pipeline <subcomando>` (corre
`pipeline/main.ts` con el Node local); tras editar `pipeline/`, reiniciar
`tauri dev` regenera el binario.

```
pipeline/
├── main.ts                entrada del sidecar: subcomandos, job JSON por stdin, NDJSON out
├── runner/                contrato: PipelineJob, PipelineEvent, Stage, contexto y emitter
├── commands/              subcomandos por dominio: <dominio>/ con sus handlers y su mapa subcommands.ts (music/, voices/, characters/, videos/)
├── stages/                las 6 fases de Create + su registro: voice/, transcription/, scene-cuts/, scene-prompts/, images/, render/ (ADR-0013), y shared/ con lo que usan varias fases
├── project/               la carpeta de un proyecto en disco: rutas tipadas, metadata, scenes.json y referencias de personajes (ADR-0009)
├── providers/             estrategia por servicio externo: llm/ (DeepInfra), music/ (Evolink), tts/ (DubVoice: Minimax · ElevenLabs · Edge), image/ (Fal · Evolink), transcription/ (Deepgram), ytdlp/ (BGM y overlay)
├── prompts/               prompts de sistema como datos versionados (biblia visual, director de escenas, bloques del redactor, estilos)
├── config/                PipelineConfig + ApiKeys + BinaryPaths, con defaults inyectables
├── types/                 tipos del dominio (json, llm, music, voices, characters, images, scenes, video-project)
└── utils/                 utilidades compartidas: escritura atómica, ffmpeg, duración de media, concurrencia, seguridad de contenido, época de la historia
```

**Límites entre fases:** la carpeta de una fase es privada. Una fase importa de
su propia carpeta, de `stages/shared/` (el LLM del job, la biblia visual y el
saneado de prompts, que usan varias) y de las capas de abajo (`providers/`,
`project/`, `prompts/`, `utils/`) — nunca de las tripas de otra fase. Si dos
fases necesitan lo mismo, sube a `stages/shared/`. Se verifica con:

```
grep -rn "from '\.\./[a-z-]*/" pipeline/stages/*/*.ts | grep -v "context\|shared/"
```

Hoy quedan dos excepciones declaradas, las dos de `images/` hacia
`scene-prompts/` (`fallback-prompt` y `regeneratePromptsForRejected`): la pasada
de recuperación de imágenes reescribe prompts rechazados por content-policy, y
esa capacidad es de la fase anterior. La dependencia va en el sentido del
pipeline y no hay ciclo.

Guards del contrato (ADR-0010 y ADR-0013, aplicados también por ESLint): nada en
`pipeline/` lee `process.env` ni escribe a consola — la config viaja en el
`PipelineJob` y todo output es un evento NDJSON del emitter. `spawn` existe SOLO
en `utils/ffmpeg.ts` y `providers/ytdlp/download.ts`, y siempre con la ruta que
llegó en `binaryPaths`: una app lanzada desde Finder no hereda el PATH.

Junto al sidecar viajan **ffmpeg** y **yt-dlp** como `externalBin`
(`scripts/fetch-binaries.mjs`, con URL y SHA-256 pineados; solo
`aarch64-apple-darwin` por ahora). Rust los resuelve junto a `current_exe` y los
inyecta en `PipelineJob.binaryPaths` (ADR-0013).

### `src/` — la interfaz

Organizada **por módulo de dominio**, no por tipo de archivo. No existen carpetas
globales `components/`, `hooks/` ni `types/`.

```
src/
├── main.tsx                 punto de entrada: monta React y los providers
├── App.tsx                  shell de la aplicación
├── router/index.ts          árbol de rutas: vistas de los módulos bajo su layout
├── i18n/index.ts            configuración de i18next (los textos viven en public/locales/)
├── layouts/                 cascarones de la app
│   ├── AuthenticatedLayout/ shell con sidebar + navbar (app con sesión)
│   └── GuestLayout/         full-screen para login / acceso denegado
├── assets/                  imágenes, fuentes y CSS global (css/main.css)
└── modules/
    ├── common/              lo transversal: fetcher, queryClient, supabase, UI, brand,
    │                        components/ (UI compartida entre módulos)
    ├── auth/                sesión y acceso: OAuth Google, guards del router, verificación
    ├── videos/              creación de video (hoy: vista Create maquetada)
    ├── setup/               arranque: splash (entrada de la app en `/`)
    └── <modulo>/            un dominio del producto
        ├── api/index.ts     única capa que habla con el exterior
        ├── components/      componentes del módulo
        ├── hooks/           hooks del módulo
        ├── types/           un archivo por dominio
        ├── views/<Vista>/   una vista por carpeta
        └── constants.ts     rutas, claves de query y demás constantes
```

Las reglas que gobiernan esta estructura —límites entre módulos, barriles permitidos,
dónde vive cada tipo de archivo, cómo se colocan las traducciones— están en
[CLAUDE.md](../CLAUDE.md). No se repiten acá para que no se contradigan.

**La cadena de datos es fija y no se saltea ningún eslabón:**

```
componente → hook (TanStack Query) → api/ del módulo → common/fetcher → exterior
```

`modules/common/fetcher/` es el único borde de la interfaz con el exterior y tiene dos
transportes: `fetcher.ts` (HTTP, legado del servidor local) y `pipeline.ts` (jobs del
sidecar vía `invoke` + `Channel` — ver la sección 4). Ningún componente ni hook llama
a `fetch`, `invoke` de pipeline ni `listen` directamente.

### `src-tauri/` — el lado nativo y los sidecars

```
src-tauri/
├── tauri.conf.json    ventana, iconos, y externalBin con los sidecars
├── Cargo.toml         dependencias de Rust (incluye tauri-plugin-shell)
├── build.rs           script de build de Tauri
├── src/               código Rust: lanza los sidecars y los detiene al salir
├── binaries/          los sidecars, con sufijo de target triple
├── capabilities/      permisos, incluido el de ejecutar sidecars
├── icons/             iconos de la aplicación
└── gen/               código generado (no se edita a mano)
```

Los binarios de `binaries/` **deben llevar el sufijo del target triple** en el nombre
(`vimo-server-x86_64-apple-darwin`); es el requisito de Tauri que más se olvida. Cada
instalador incluye únicamente los binarios de su plataforma.

Del lado del bundle, Tauri empaqueta `dist/` (la clave `frontendDist`), los iconos y los
`externalBin`. Nada de `docs/` viaja dentro de la aplicación.

---

## 4. El pipeline hoy: jobs, subcomandos y cómo extenderlo

Esta sección describe la mecánica **vigente** (ADR-0010, materializada con AI Music):
cómo viaja un job de punta a punta y qué piezas hay que tocar para agregar una
operación nueva. Es la referencia para los próximos módulos (voces, characters, …).

### Anatomía de un job

```
componente → hook → api/ del módulo
                      │
                      ▼
        common/fetcher/pipeline.ts        startPipelineJob / runPipelineJob
                      │
        invoke("start_pipeline_job",      el Channel viaja DENTRO del invoke:
                payload + Channel)        cada job tiene su propio canal
                      │
                      ▼
        Rust (src-tauri/src/pipeline/)
          commands.rs  spawnea `vimo-pipeline <subcomando>` y reenvía su
                       stdout NDJSON por el Channel; devuelve el jobId
          job.rs       arma el PipelineJob: claves API desde el keychain
                       (cacheadas por sesión), projectsRoot desde Ajustes
                      │  el job viaja por stdin (nunca por argv)
                      ▼
        sidecar vimo-pipeline (pipeline/)
          main.ts      lee el job de stdin, despacha por la tabla SUBCOMMANDS
          handler      corre con PipelineContext y emite eventos NDJSON
                       hasta terminar en job-completed | job-failed
```

Los contratos viven en `pipeline/runner/` y Rust **no los redeclara**: arma y reenvía
JSON tal cual (por eso `src/` puede consumirlos con `import type`).

- **Entrada** — `PipelineJob` ([runner/job.ts](../pipeline/runner/job.ts)): `jobId`,
  `projectDir?`, `projectsRoot?`, `config?`, `apiKeys`, `binaryPaths`, `payload?`.
  Lo arma Rust ([job.rs](../src-tauri/src/pipeline/job.rs)); las claves salen del
  keychain (ADR-0011) y **nunca pasan por el webview**.
- **Salida** — eventos NDJSON por stdout ([runner/events.ts](../pipeline/runner/events.ts)):
  `job-started`, `progress`, `log`, `stage-*`, y los terminales `job-completed`
  (con `result`) o `job-failed` (con `code` estable para i18n). El emitter
  ([runner/emitter.ts](../pipeline/runner/emitter.ts)) es la única escritura a stdout
  de todo `pipeline/`.
- **Cancelación** — cooperativa: `cancel_pipeline_job` escribe `{"type":"cancel"}` por
  stdin y el sidecar aborta vía `AbortController`; si stdin ya no acepta escrituras,
  Rust mata el proceso como fallback.
- **Errores** — `PipelineFailure(code, message)` ([runner/failure.ts](../pipeline/runner/failure.ts)):
  `code` es la clave estable que la UI traduce; `message` es diagnóstico para logs,
  nunca texto user-facing.

### Los dos modos de consumo en la UI

[src/modules/common/fetcher/pipeline.ts](../src/modules/common/fetcher/pipeline.ts) es
el único punto de `src/` que habla con los jobs, y expone dos primitivos:

|                     | `startPipelineJob`                     | `runPipelineJob`               |
| ------------------- | -------------------------------------- | ------------------------------ |
| La promesa resuelve | cuando el job **arranca**              | cuando el job **termina**      |
| Devuelve            | `PipelineJobHandle` (jobId + stop)     | el `result` final tipado       |
| Eventos intermedios | llegan todos al callback               | se ignoran                     |
| Errores             | evento `job-failed` al callback        | rechaza con `PipelineJobError` |
| Cuándo usarlo       | jobs largos con progreso y cancelación | consultas y acciones puntuales |

`runPipelineJob` está construido sobre `startPipelineJob`; en música, solo la
generación usa el modo streaming — el resto (créditos, historial, sugerir prompt)
es request/response.

### Receta: agregar un subcomando nuevo

En orden, con música como ejemplo vivo de cada paso:

1. **Tipos del contrato** en `pipeline/types/<dominio>.ts`: params del payload y
   forma del result (deben ser JSON serializables).
2. **Handler** en `pipeline/commands/<dominio>/<nombre>.ts` con la firma
   `(context: PipelineContext) => Promise<result>`. Reglas del contrato (las aplica
   ESLint): nada lee `process.env` ni escribe a consola — la config viaja en el job y
   todo output pasa por `context.emitter`; los fallos se lanzan como
   `PipelineFailure` con `code` estable; las operaciones largas respetan
   `context.signal`.
3. **Registrarlo** en el mapa `subcommands.ts` de su dominio
   (`pipeline/commands/<dominio>/subcommands.ts`); si el dominio es nuevo, esparcir
   su mapa en la tabla `SUBCOMMANDS` de [pipeline/main.ts](../pipeline/main.ts).
   Rust no se toca: `start_pipeline_job` es genérico.
4. **Proveedor externo nuevo** (si lo hay): estrategia en
   `pipeline/providers/<servicio>/`. Si requiere clave propia, se agrega al catálogo
   del módulo `api-keys` (`providers.ts`) y a `ALL_PROVIDERS` en Rust
   (`src-tauri/src/api_keys/`): con eso la clave entra sola en `job.apiKeys`.
5. **Lado UI**: el `api/` del módulo envuelve el subcomando con `runPipelineJob` o
   `startPipelineJob`; el mapa `code → clave i18n` va en el `constants.ts` del módulo
   y los textos en los **tres** catálogos de `public/locales/`.
6. **Probar**: `pnpm pipeline <subcomando>` corre el sidecar por CLI con el Node
   local; en la app, reiniciar `tauri dev` regenera el binario SEA.

Cuando llegue Create, las fases largas se modelarán como **stages** encadenadas
(`pipeline/runner/stage.ts` + `stages/`) dentro de un job, con checkpoint para
reanudar; los subcomandos sueltos de `commands/` siguen siendo el camino para
operaciones de un solo paso.

---

## 5. Flujo principal: de guion a video

Es el flujo central del producto y lo implementa el módulo `videos` (Create)
sobre el runner de stages del sidecar (ADR-0013). La interfaz **dispara y
observa**; el sidecar **ejecuta**; el disco **es el estado**.

### Forma

```
UI ── invoke("start_pipeline_job", "run-video-pipeline") ──> Rust ── spawn ──> sidecar
UI <──────── Channel (NDJSON: stage-*, scene-*, *-progress) ─────── Rust <────┘
                                    │
                    <projectsRoot>/<slug>/  ← todo artefacto queda acá
```

### Antes de arrancar

1. **La interfaz** exige sesión iniciada y claves de API
   (`useRequiredApiKeys({ requirements: MODULE_API_KEY_REQUIREMENTS.videos })`:
   las cuatro categorías). Si falta alguna, monta `MissingApiKeysNotice` (modal
   con el nombre de cada clave y CTA que abre su tarjeta en Claves de API) en
   vez de arrancar un trabajo condenado. Cada módulo registra sus claves en
   `MODULE_API_KEY_REQUIREMENTS` (`src/modules/api-keys/constants.ts`).
2. Reúne el formulario: nombre, guion (o audio propio), estilo, cantidad de
   escenas, proveedor/modelo/calidad de imagen, voz y sus ajustes, personajes y
   su frecuencia, música de fondo y overlay.
3. **Pre-flight del proveedor de voz** (`probe-tts`): valida contra los
   endpoints de LISTADO —no gasta créditos— y avisa antes de arrancar un
   pipeline largo. El resultado se cachea 2 minutos en la UI.
4. `create-video-project` crea la carpeta del proyecto con `project.json`,
   `script.txt` y las referencias de los personajes; con audio propio,
   `upload-narration` lo copia (o transcodifica) a `narration.mp3`.

### Las seis fases

Cada una implementa `Stage { id, skip?, run }` y el runner
(`pipeline/runner/run-stages.ts`) las recorre emitiendo `stage-started` /
`stage-skipped` / `stage-completed`. **Toda fase es retomable**: si su artefacto
en disco es válido, `skip()` la saltea.

| Fase            | Qué hace el sidecar                                                                                         | Qué muestra la interfaz          |
| --------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `voice`         | Narración (TTS con cascada de carriles y troceo), música de fondo y overlay **en paralelo**                 | `voice-progress`, `bgm-progress` |
| `transcription` | Deepgram palabra a palabra + duración real del audio medida decodificando                                   | fase en curso                    |
| `scene-cuts`    | Corta la duración en N escenas por tiempo; con `confirmScenes`, **pausa** acá                               | `scenes-planned` o el diálogo    |
| `scene-prompts` | Biblia visual, director de escenas y redactor por escena (4 capas de garantía)                              | `scene-prompt-ready` por escena  |
| `images`        | Una imagen por escena (carril normal y carril de personaje en paralelo), con recuperación de las rechazadas | `scene-image-*` sobre la grilla  |
| `render`        | Chunks con ken burns → concat sin re-encode → mezcla de audio, overlay y color del estilo                   | `render-progress` por sub-fase   |

La narración es **esencial** (si falla, el job muere); música y overlay son
**opcionales**: si fallan, el video sale sin ese asset y la UI recibe un `log`.

### La pausa de confirmación de escenas

Cuando el usuario pidió confirmar, `scene-cuts` emite
`awaiting-scene-confirmation` y devuelve `{ pause: true }`. El job termina con
`job-completed { status: 'awaiting-confirmation' }` — **un cierre limpio no es
un completado**. La interfaz muestra el diálogo; al confirmar llama a
`confirm-scenes` (que escribe `scenes-confirmed.json`) y **relanza** el job: voz
y transcripción son cache-hit.

### Reanudar un trabajo interrumpido

El estado vive en **disco**: `project.json` guarda `state` y `completedStages`,
y cada artefacto es su propio checkpoint. La interfaz mantiene la tarea en un
store con `localStorage` (`vimo:create:task:v1`) que sobrevive a la navegación y
al reload.

El sidecar **no** sobrevive al cierre de la app: al reabrir, una tarea que
quedaba generando se marca interrumpida y el botón «Reanudar» relanza el mismo
job — todo lo hecho se conserva. Una cancelación deja el proyecto en `paused`,
igual de retomable.

### Editar después de crear (Library)

Con el auto-export apagado (default desde ADR-0016), **este es el flujo
normal**: el job de Create genera voz, escenas e imágenes, deja el proyecto en
`draft` sin render, y la UI navega directo al editor — el mp4 se arma desde el
botón de render cuando la persona terminó de revisar.

La biblioteca (ADR-0014) monta la edición sobre las **mismas stages**: la
regeneración selectiva corre el runner sobre `[scene-prompts, images]` con los
ids objetivo en el contexto (`regenerateSceneIds` — único caso que llena
`explicitNewImage`, el bypass del guard de tarea pagada); el re-render corre
`[render-stage]` tras depurar `completedStages` (los chunks con manifest válido
son cache-hit); el reemplazo de narración corre `[transcription]` y redistribuye
los tiempos preservando escenas e imágenes. Las escenas se persisten con
**merge por id** (`scenes-file.ts`): una edición del usuario durante una regen
no se pisa. Un mp4 que quedó atrás se marca con `videoOutdated` en
`project.json` — el flag jamás borra el video; lo limpia el próximo render.
Concurrencia: un pipeline completo/render a la vez en la app, y las regens se
coalescen en UN job por proyecto (cola en la UI); sin replay de eventos — al
rehidratar, la UI refetchea el disco.

### Contrato con el sidecar

- **Un proceso por job**, sin servidor HTTP, sin puerto ni ciclo de vida propio
  (ADR-0007): Rust lo lanza y lo mata.
- **Eventos NDJSON tipados** por el `Channel` del invoke; la UI los consume con
  un `switch` sobre `PipelineEventPayload`.
- **Errores con `code` estable**: cada módulo lo mapea a su clave i18n
  (`CREATE_ERROR_MESSAGE_KEYS`); el `message` es diagnóstico, nunca texto
  user-facing.
- **Cancelación**: `cancel_pipeline_job` escribe `{"type":"cancel"}` por stdin →
  `AbortController` interno, que las stages respetan en cada borde.

---

## 6. Estado de la migración

Este documento describe el destino. El código todavía no llegó ahí:

| Pieza                                              | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React 19 + TypeScript + Vite                       | listo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Tauri 2 con la ventana de la aplicación            | listo (identifier y tamaño de ventana propios)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ESLint, Prettier y el alias `@/`                   | listo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Convenciones de código ([CLAUDE.md](../CLAUDE.md)) | listo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Estructura modular en `src/`                       | fundaciones + layouts listos: `router/`, `i18n/`, `layouts/` (Authenticated/Guest), `modules/common` (ui, doodles, theme, brand, fetcher, queryClient, supabase) y módulos `auth`/`videos`/`setup` (`home` eliminado)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Layouts y vistas base                              | Login, Callback, AccessDenied, Splash y Create con lógica real; PageNotFound maquetada; sidebar/navbar funcionales — ADR-0005                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| React Router, TanStack Query, Tailwind             | instalados y configurados (hash router con loaders como guards; primeras query keys: `authQueryKeys`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Autenticación (módulo `auth`)                      | lista — ADR-0006: OAuth Google doble flujo (web + deep link `vimo://`), verificación de acceso contra vimo.click, gate por loaders, logout, vista License. Pendiente: cold start del deep link                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Módulo `costs` (catálogo local)                    | listo pero **retirado de la UI** — ADR-0008: comparativa de precios con dataset local (`catalog.ts`), 4 tabs + filtros. Fuera del router y del sidebar (`hidden` en `layouts/AuthenticatedLayout/constants.ts`) mientras se redefine el modelo de precios; el código sigue completo y typechequeado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Módulo `settings` (carpeta de proyectos)           | listo — ADR-0009: carpeta raíz única (default `~/Documents/Vimo`) con dialog/fs/store; en web se muestra deshabilitado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Módulo `api-keys` (claves de proveedores)          | listo — ADR-0011: dashboard con catálogo único (`providers.ts`), claves en el keychain del SO (`keyring`; Android vía plugin local `tauri-plugin-secure-keys`), validación en Rust con reqwest; primeros comandos `invoke` del repo (`src-tauri/src/api_keys/`); en web se muestra deshabilitado. Pendiente: probar el plugin Android en emulador (falta `tauri android init`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Infraestructura de i18n (`src/i18n/`)              | lista con i18next + catálogos `public/locales/{es,en,pt}.json` — ADR-0004                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Plugins de Tauri                                   | `deep-link`, `opener`, `dialog`, `fs`, `store` instalados y configurados (scheme `vimo`, capabilities con scope `$HOME/**`); `shell` solo del lado Rust para el spawn del sidecar (sin capability al webview)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Backend local / pipeline                           | **redirigido por ADR-0007, en curso por ADR-0010**: fundación lista — `pipeline/` (contratos job/eventos, providers `llm` DeepInfra, `music` Evolink, `tts` DubVoice e `image` Fal/Evolink, prompts, config inyectada), sidecar con subcomandos **empaquetado como binario único Node SEA** (`externalBin`, regenerado por los hooks de dev/build), y comandos genéricos `start_pipeline_job`/`cancel_pipeline_job` (`src-tauri/src/pipeline/`) que reenvían el NDJSON por el `Channel` del invoke (un canal por job, sin canal global); la capa compartida de la UI vive en `src/modules/common/fetcher/pipeline.ts` (`startPipelineJob`/`runPipelineJob`); las claves se cachean en memoria por sesión (menos prompts del keychain). Pasos 1 a 4 (AI Music, Voices, Characters) hechos; Create con el runner completo (ADR-0013) y Library como cierre (ADR-0014): **la migración por módulos de ADR-0010 está completa** |
| Módulo `music` (AI Music)                          | listo — ADR-0010 paso 2: pantalla completa (formulario Suno, sugerir prompt vía LLM, generación con progreso y cancelación, chooser de variaciones, historial en `<carpeta raíz>/_history/music/` con audio/cover/metadata, saldo de créditos); primeros jobs reales del sidecar (6 subcomandos en `pipeline/commands/`); asset protocol habilitado (scope `$HOME/**`) para reproducir el audio local con `convertFileSrc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Módulo `voices` (Voces TTS)                        | listo — ADR-0010 paso 3: explorador de voces de DubVoice (Minimax · ElevenLabs · Edge) con filtros, favoritos e historial en `<carpeta raíz>/_history/voices/`; probador con progreso y cancelación; saldo de créditos. Las muestras suenan desde la URL del proveedor: los previews precomputados del origen (81 MB) y su síntesis con créditos no se portaron, y Edge queda sin muestra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Módulo `characters` (Personajes)                   | listo — ADR-0010 paso 4: biblioteca de identidades en `<carpeta raíz>/characters/` (una carpeta por personaje con `metadata.json` y un preview por estilo); el "experto" redacta la identidad neutra de estilo con el LLM en tier premium, y los previews estrenan los providers de imagen (Fal · Evolink) con la regla de oro de los proveedores pagos. El selector de hasta 2 personajes ya vive en Create (ADR-0013); el modo con foto de referencia subida por el usuario sigue pendiente                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FFmpeg y yt-dlp empaquetados                       | listos para **macOS arm64** — ADR-0013: `scripts/fetch-binaries.mjs` los descarga con URL y SHA-256 pineados, los firma ad-hoc y los deja como `externalBin`; Rust los resuelve junto a `current_exe` y los inyecta en `PipelineJob.binaryPaths`. Las demás plataformas (y la revisión GPL→LGPL de ffmpeg) llegan con la fase de distribución                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Módulo `videos` (Create)                           | listo — ADR-0013: pantalla completa de creación (formulario con guion o audio propio, estilo, escenas, proveedor de imagen, selector de voz y de hasta 2 personajes, música y overlay), progreso en vivo por fases con grilla de escenas, pausa de confirmación de escenas, cancelar y reanudar, y panel del video terminado. La tarea vive en un store con `localStorage` y sobrevive a navegación y reload. Desde 2026-09-03 la pantalla de progreso calca la del origen (rama 7 de ADR-0016, port visual de `vimo-ui-pipeline`): página entera con cronómetro que descuenta la pausa, fases a la izquierda y un panel por fase, grilla de imágenes con visor a pantalla completa, paso de segundos por escena inline y el error dentro de la pantalla                                                                                                                                                                    |
| Runner de stages y las 6 fases                     | listos — ADR-0013: `pipeline/runner/run-stages.ts` + `pipeline/stages/` (voice, transcription, scene-cuts, scene-prompts, images, render) con el registro declarativo en `stages/registry.ts`. Toda fase es retomable por `skip()`; los guards de gasto del origen se conservan textualmente (anti-doble-gasto del TTS, concat con re-encode, cosecha de tarea Evolink ya pagada, `-t` explícito en el render)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Módulo `videos` (Library)                          | listo — ADR-0014: biblioteca completa (grilla con estados y borrado en lote, reproductor con velocidades, pantalla de progreso rehidratable) + editor (regeneración selectiva de imágenes con prompt propio y modelo/calidad por escena, drag de fronteras en el timeline, re-render con cache de chunks, export de clips a `clips/`, reemplazo de narración con re-transcripción, música IA/YouTube/archivo, mezcla de volúmenes y offset). 11 subcomandos nuevos en `pipeline/commands/videos/` sin tocar Rust; flag `videoOutdated` en `project.json`. Pendiente: prueba con claves reales en build instalado                                                                                                                                                                                                                                                                                                            |

Mantené esta tabla al día: es lo que le dice a quien llega —persona o agente— qué puede
dar por hecho y qué no.
