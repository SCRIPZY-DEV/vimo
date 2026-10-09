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
>
> **Dirección futura
> ([ADR-0032](adr/ADR-0032-proveedores-en-servidor-y-creditos-de-vimo.md),
> propuesta):** las llamadas a proveedores se unificarán en un servidor de Vimo
> con créditos propios y sin claves del usuario; en el sidecar quedará solo lo
> local (FFmpeg, ensamblado y descarga de assets). Hasta entonces rige BYO-keys
> con saldo por proveedor ([ADR-0031](adr/ADR-0031-saldo-por-proveedor-precheck-y-pausa-retomable.md)).

---

## 1. Frontera del sistema

**Todo corre en la máquina del usuario.** Este repositorio no despliega ningún
servidor: la aplicación empaqueta el pipeline (sidecar Node) y el binario de FFmpeg, y
las únicas llamadas remotas del pipeline son a los proveedores externos, con las
claves del propio usuario.

El repositorio tiene **tres carpetas de código**, una por pieza del sistema: `src/`
(la SPA en la webview), `src-tauri/` (Rust) y `pipeline/` (el sidecar del pipeline,
que vive como proceso solo mientras corre un job):

```
UI ── invoke("start_pipeline_job" + Channel) ──► Rust ── spawn por job ──► sidecar vimo-pipeline
UI ◄── Channel del invoke (eventos) ──────────── Rust ◄── NDJSON stdout ── (runner → stages → providers)
```

El sidecar invoca a FFmpeg y llama a los proveedores externos (TTS · transcripción ·
LLM · imágenes · música). La SPA solo habla con Rust vía `invoke()` (con un `Channel`
para los eventos de cada job) y con las dos piezas remotas propias de Vimo, que no
generan video: **Supabase** (la identidad del usuario y la subida de diagnósticos) y el
servidor de **vimo.click**.

El servidor de vimo.click (`vimo-landing`, otro repositorio: Pages Functions de
Cloudflare) resuelve el veredicto de acceso y los interruptores de salida
(`verificar-acceso`,
[ADR-0006](adr/ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md)), ofrece
a soporte el panel donde se revisan los diagnósticos
([ADR-0038](adr/ADR-0038-logs-de-diagnostico-por-ejecucion-en-supabase.md)) y, desde la
Entrega 1 de las gemas por secciones
([ADR-0048](adr/ADR-0048-gemas-por-secciones-y-agente-reconstructor.md)), aloja el
**agente reconstructor** (`POST /api/estilos/reconstruir`): recibe la gema completa que
pegó el usuario, la ordena en secciones con un modelo y deja una fila por intento en
`gem_rebuild_logs`. Corre ahí y no en el sidecar porque usa la clave de Vimo, que no
puede viajar dentro de la app: el sidecar solo tiene las del usuario. La SPA lo llama
únicamente desde el `api/` de `videos`, con `vimoServerFetch`
(`src/modules/common/fetcher/`), que adjunta la sesión de Supabase; el sidecar no lo
conoce.

Desde la Entrega 3 del catálogo
([ADR-0049](adr/ADR-0049-catalogo-remoto-administrado.md), tras
`features.remoteCatalog`) el mismo servidor **aloja el catálogo de estilos**: la tabla
`catalog_styles` de Supabase (borrador y copia publicada de cada gema) y el bucket
público `previews-gemas` con las muestras de los estilos nuevos, que solo escribe
`vimo-landing` con el service role. La SPA le pide el catálogo publicado
(`GET /api/catalogo`) al abrir Crear y el sidecar lo deja en `<carpeta raíz>/_catalog/`
con sus muestras (`catalog-styles-sync`); sin red sirve el último sincronizado y, si
nunca sincronizó, las 38 gemas empaquetadas. Un admin crea, edita, genera muestras
(con sus claves, por el sidecar, subidas al bucket por URLs firmadas que emite el
servidor), publica, oculta y elimina estilos desde la pestaña Catálogo
(`/api/admin/catalogo/**`). El sidecar sigue sin conocer vimo.click: los orígenes
permitidos de descarga y de subida le llegan en el payload.

| Responsabilidad                               | Dónde vive                        |
| --------------------------------------------- | --------------------------------- |
| Pantallas, navegación, estado de la UI        | `src/`                            |
| Rutas, diálogos nativos y acceso a archivos   | `src/` + plugins de Tauri         |
| Lanzar, escuchar y cancelar jobs del pipeline | `src-tauri/`                      |
| Las 7 fases que generan el video              | `pipeline/` (stages)              |
| Llamadas a los proveedores externos           | `pipeline/` (providers)           |
| Ensamblado del video                          | FFmpeg, invocado por el sidecar   |
| Registro, login y sesión                      | Supabase                          |
| Acceso y reconstrucción de gemas (agente)     | Servidor de vimo.click            |
| Catálogo de estilos publicado y su edición    | Servidor de vimo.click + Supabase |
| Claves de los servicios pagos (BYO-keys)      | keychain del SO (ADR-0011)        |

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
├── scripts/               build-sidecar.mjs (empaqueta el sidecar Node SEA), fetch-binaries.mjs (descarga ffmpeg/yt-dlp pineados), target-triple.mjs (helper compartido), release-targets.mjs (targets de release, ADR-0034), run-pipeline-harness.mjs, ab-scene-wardrobe.mjs (A/B con claves reales del vestuario por escena, matriz en ab/), build-update-manifest.mjs y build-demo-pack.mjs; test/ agrupa guards y regresiones provisorios (check-locales, check-demo, …) pendientes de migrar a un framework de pruebas
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
├── commands/              subcomandos por dominio: <dominio>/ con sus handlers y su mapa subcommands.ts (music/, voices/, characters/, avatars/, videos/)
├── stages/                las 7 fases de Create + su registro: voice/, transcription/, scene-cuts/, scene-prompts/, images/, animation/, render/ (ADR-0013), y shared/ con lo que usan varias fases
├── project/               la carpeta de un proyecto en disco: rutas tipadas, metadata, scenes.json y referencias de personajes (ADR-0009)
├── providers/             estrategia por servicio externo: llm/ (DeepInfra), music/ (Evolink), tts/ (DubVoice: Minimax · ElevenLabs · Edge; ElevenLabs directo — ADR-0024), image/ (Fal · Evolink), transcription/ (Deepgram), ytdlp/ (BGM, overlay y la ficha de un video para clonar su estilo), avatar/ (HeyGen: looks, assets y creación de avatares desde foto — ADR-0057)
├── prompts/               prompts de sistema como datos versionados (biblia visual, director de escenas, bloques del redactor, estilos)
├── config/                PipelineConfig + ApiKeys + BinaryPaths, con defaults inyectables
├── types/                 tipos del dominio (json, llm, music, voices, characters, avatar, images, scenes, video-project)
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
(`scripts/fetch-binaries.mjs`, con URL y SHA-256 pineados por target triple:
macOS arm64, macOS x64 y Windows x64). Rust los resuelve junto a `current_exe` —con
`.exe` en Windows— y los inyecta en `PipelineJob.binaryPaths` (ADR-0013, ADR-0026,
ADR-0034).

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
│   ├── EditorLayout/        pantalla completa para el editor de proyecto (ADR-0056)
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

`modules/common/fetcher/` es el único borde de la interfaz con el exterior y tiene tres
transportes: `fetcher.ts` (HTTP, legado del servidor local), `pipeline.ts` (jobs del
sidecar vía `invoke` + `Channel` — ver la sección 4) y `vimoServer.ts` (vimo.click con
la sesión de Supabase, `vimoServerFetch` — ver la sección 1). Ningún componente ni hook
llama a `fetch`, `invoke` de pipeline ni `listen` directamente.

### `src-tauri/` — el lado nativo y los sidecars

```
src-tauri/
├── tauri.conf.json    ventana, iconos, externalBin con los sidecars y el endpoint del updater
├── tauri.windows.conf.json  instalador NSIS y WebView2; Tauri lo mezcla solo en Windows
├── tauri.updater.conf.json  createUpdaterArtifacts; solo lo pasa el workflow con --config (ADR-0027)
├── Cargo.toml         dependencias de Rust (incluye tauri-plugin-shell, single-instance y updater)
├── build.rs           script de build de Tauri
├── src/               código Rust: lanza los sidecars y los detiene al salir
│   └── <módulo>/tests/  tests unitarios del módulo, un archivo por archivo de producción
├── binaries/          los sidecars, con sufijo de target triple
├── capabilities/      permisos, incluido el de ejecutar sidecars
├── icons/             iconos de la aplicación
└── gen/               código generado (no se edita a mano)
```

Los binarios de `binaries/` **deben llevar el sufijo del target triple** en el nombre
(`vimo-server-x86_64-apple-darwin`); es el requisito de Tauri que más se olvida. Cada
instalador incluye únicamente los binarios de su plataforma.

Del lado del bundle, Tauri empaqueta `dist/` (la clave `frontendDist`), los iconos y los
`externalBin`. Nada de `docs/` (interno) viaja dentro de la aplicación.

#### Tests de Rust

Se corren con `pnpm test:tauri` (equivale a `cargo test --lib` en `src-tauri/`); para
un módulo, `cargo test --lib diagnostics`. Rust ofrece dos tipos de test y acá se
usa uno solo:

- **Unitarios, en una carpeta `tests/` dentro del módulo.** Cada archivo de
  producción termina con `#[cfg(test)] #[path = "tests/<archivo>.rs"] mod tests;`
  y su test vive en `src/<módulo>/tests/<archivo>.rs`. Para el compilador es igual
  que un `mod tests { … }` inline (es hijo del módulo, `use super::*` ve lo privado,
  no entra al binario), pero el código de test no ensucia el de producción. Es la
  única forma de tener los tests en archivo aparte **sin** abrir visibilidad
  (`pub(crate)`) solo para testear; por eso el `#[path]` es deliberado.
- **De integración, en `src-tauri/tests/`.** Cada archivo es un crate externo que
  solo ve la API pública de `app_lib`. Reservado para probar comandos Tauri
  completos con `tauri::test::mock_app`; hoy no hay ninguno y `diagnostics` ni
  siquiera es `pub` desde `lib.rs`, así que desde ahí no existe.

Para que un módulo sea testeable, lo que depende de `AppHandle` se parte en dos: una
función sobre `&Path` (o el dato concreto) con la lógica, y un wrapper público con
`AppHandle` que solo resuelve el path y delega. Los tests que tocan disco usan
`tempfile::tempdir()`. `diagnostics/spool.rs` y `diagnostics/tests/spool.rs` son el
ejemplo de referencia.

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

Desde 2026-09-12, la narración conserva además recibos atómicos por solicitud
TTS pendiente. Reanudar consulta la tarea remota conocida; no repite un POST
incierto. Rust excluye jobs simultáneos del mismo proyecto dentro de la app.
Ver [ADR-0035](adr/ADR-0035-recibos-de-voz-y-previews-interactivas.md) y
[límites y pruebas de recuperación](fixes/2026-09-12-fix-voice-resume/voice-resume.md).

### Logs de diagnóstico

Cada job deja un registro redactado que soporte busca por correo + proyecto
([ADR-0038](adr/ADR-0038-logs-de-diagnostico-por-ejecucion-en-supabase.md)). Rust
lo arma mientras reenvía los eventos (`src-tauri/src/diagnostics/`), lo guarda en
`<appLogDir>/diagnostics/<jobId>.json` y el módulo `src/modules/diagnostics/` lo
sube a la tabla `diagnostic_logs` de Supabase. Un subcomando nuevo queda cubierto
sin escribir nada; pero de cada evento solo se sube una **allowlist de claves**
(`ALLOWED_EVENT_KEYS` en `diagnostics/redaction.rs`): si agregás a un evento una
clave útil para diagnosticar, sumala ahí — y nunca una que lleve contenido del
usuario (guion, prompts, rutas).

Tres reglas más para que el log sirva a soporte:

- **Toda fila lleva `project_name`.** `diagnostics/subject.rs` lo resuelve desde el
  subcomando y el payload: el proyecto (`projectId` / `projectIds`, o `name` en una
  creación fallida) o, si no hay proyecto, la entidad con prefijo fijo (`Estilo: X`,
  `Personaje: X`, `Avatar: X`, `Voz: X`, `Música`, `Demo`). Un subcomando nuevo que
  trabaje sobre un proyecto manda `projectId` en el payload aunque el handler no lo use.
- **Los errores de proveedor son estructurados.** Un proveedor lanza
  `PipelineFailure(code, message, { provider, httpStatus })`; el `job-failed` reenvía
  ambos y llegan a `error_provider` / `error_http_status`. Todo reintento o fallback
  de proveedor emite además `provider-failure` (`pipeline/utils/provider-failure.ts`)
  con `recovered: true`, para que un fallo que el pipeline absorbió no desaparezca del
  log de una ejecución `completed`.
- **La revisión de soporte se marca en la fila.** El panel admin de vimo.click pone
  `seen` / `seen_at` / `seen_by` en las ejecuciones `failed`, `crashed` y `cancelled`
  (enmienda 2026-09-23 de la ADR-0038, `PATCH /api/admin/diagnosticos` con service
  role). La app no lee ni escribe esas columnas y la marca se borra con la fila a los
  30 días.

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
   su frecuencia, música de fondo y overlay. Con `features.newCatalog`
   encendido y fuera de la demo ([ADR-0039](adr/ADR-0039-catalogo-sobre-el-carril-de-mi-estilo.md),
   Entrega 2 de [ADR-0048](adr/ADR-0048-gemas-por-secciones-y-agente-reconstructor.md)),
   la pestaña Catálogo muestra las 38 gemas de la casa
   (`pipeline/prompts/catalog-gems/`) como tarjetas del carril de Mi estilo
   («Usar en este video», «Ver» con muestras, etiquetas y modo de personaje,
   «Pasar a mi estilo»): un estilo del catálogo nuevo viaja como
   `options.customStyle` con `catalogStyleId`, con segundos por escena y
   modelo de prompts, sin cantidad de escenas ni frecuencia. Con el
   interruptor apagado sigue el catálogo viejo, byte por byte. Con
   `features.remoteCatalog` además ([ADR-0049](adr/ADR-0049-catalogo-remoto-administrado.md),
   Entrega 3), la pestaña sincroniza el catálogo publicado en vimo.click
   (`_catalog/`), y un admin con conexión ve todos los estilos con su estado y
   los administra desde ahí.
3. **Pre-flight del proveedor de voz** (`probe-tts`): valida contra los
   endpoints de LISTADO —no gasta créditos— y avisa antes de arrancar un
   pipeline largo. El resultado se cachea 2 minutos en la UI.
4. **Pre-check de saldo** (ADR-0031): `useCreateCostCheck` estima el gasto
   por proveedor (voz por caracteres × `VOICE_COST_FACTORS`, imágenes por
   escenas × precio de la calidad, música de fondo informativa) y lo cruza
   con los saldos leídos (`compareCostLines`). Con saldo leído e
   insuficiente el envío se frena y `InsufficientCreditsAlert` ofrece
   recargar (`billingUrl` del catálogo de `api-keys`); un saldo ilegible
   solo avisa. Al enviar, `verify()` re-lee el saldo justo antes de arrancar.
5. `create-video-project` crea la carpeta del proyecto con `project.json`,
   `script.txt` y las referencias de los personajes; con audio propio,
   `upload-narration` lo copia (o transcodifica) a `narration.mp3`.

### Las siete fases

**Actualización de Catálogo (2026-09-12, [ADR-0036](adr/ADR-0036-prompts-de-catalogo-sin-relleno.md)):**
la referencia histórica a «4 capas de garantía» queda reemplazada por streaming
con rotación acotada de modelos y validación por tarea. Director en lotes de hasta
12; cancelación sin relleno, checkpoints serializados y barrera de prompts válidos
antes de imágenes. Una respuesta genérica de respaldo ya no autoriza gasto.
Esa revisión de Catálogo no alteró las fases ni el transporte. [Causa, archivos y QA](fixes/2026-09-12-fix-catalog-scene-prompts/catalog-scene-prompts.md).

Cada una implementa `Stage { id, skip?, run }` y el runner
(`pipeline/runner/run-stages.ts`) las recorre emitiendo `stage-started` /
`stage-skipped` / `stage-completed`. **Toda fase es retomable**: si su artefacto
en disco es válido, `skip()` la saltea.

| Fase            | Qué hace el sidecar                                                                                                                                                                                                                                                                         | Qué muestra la interfaz                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `voice`         | Narración (TTS con cascada de carriles y troceo), música de fondo y overlay **en paralelo**                                                                                                                                                                                                 | `voice-progress`, `bgm-progress`                                                                                                                                                                                                                                                           |
| `transcription` | Deepgram palabra a palabra + duración real del audio medida decodificando                                                                                                                                                                                                                   | fase en curso                                                                                                                                                                                                                                                                              |
| `scene-cuts`    | Corta la duración en N escenas por tiempo; con `confirmScenes`, **pausa** acá                                                                                                                                                                                                               | `scenes-planned` o el diálogo                                                                                                                                                                                                                                                              |
| `scene-prompts` | Biblia visual, director de escenas y redactor por escena (4 capas de garantía); toda escena con timestamps recibe prompt — la muda (texto vacío del corte clásico) se ilustra como pausa desde la narración vecina ([fix](fixes/2026-09-22-fix-silent-scene-images/silent-scene-images.md)) | `scene-prompt-ready` por escena; `scene-prompts-progress` (avance del stream, carril verbatim); `prompt-model-trouble` (el modelo elegido falló: se bloquea 1 h, ADR-0028); `job-failed` con `llm_prompt_language` si la gema pide otro idioma: se corrige la gema, sin bloquear el modelo |
| `images`        | Una imagen por escena (carril normal y carril de personaje en paralelo), con recuperación de las rechazadas; al primer rechazo por saldo aborta la fase entera (ADR-0031)                                                                                                                   | `scene-image-*` sobre la grilla; `images-recovery-pass` (`rewrite` devuelve la fila de prompts a «en curso» y reemite `scene-prompt-ready`; `retry` anota el reintento)                                                                                                                    |
| `animation`     | Opcional: agrupa las fuentes del prefijo en clips, conserva recibos y ajusta cada clip a su intervalo antes de publicarlo (ADR-0045). Sin animación automática se saltea.                                                                                                                   | `scene-animation-*`; carga azul por clip y reproducción de los clips listos.                                                                                                                                                                                                               |
| `render`        | Chunks con ken burns → concat sin re-encode → mezcla de audio, overlay y color del estilo                                                                                                                                                                                                   | `render-progress` por sub-fase                                                                                                                                                                                                                                                             |

**Animación inicial (2026-09-29, [ADR-0045](adr/ADR-0045-prefijo-animado-por-parejas-y-fase-propia.md)):** el formulario ofrece solamente el primer minuto y lo limita al audio real. Se crean imágenes fuente cada 3 s hasta ese límite y la fase `animation` las agrupa en clips solicitados de 6 s. Desde el segundo 60, los cortes usan el intervalo estático elegido. La última pareja puede contener una cola parcial; sus bordes no se desplazan. El editor conserva su planificador existente. Los proyectos históricos de fuentes de 6 s y todos sus recibos se reanudan sin redistribuir escenas.

```mermaid
flowchart LR
    runner["Runner del sidecar"]:::propio
    images["images<br/>Completa las imágenes"]:::propio
    animation["animation<br/>Agrupa y anima el prefijo"]:::propio
    render["render<br/>Ensambla si corresponde"]:::propio
    files[("Archivos y recibos del proyecto")]:::datos
    kie(["Kie.ai"]):::externo
    ui(["Pantalla de progreso"]):::propio
    runner -->|"genera fuentes · función local"| images
    runner -->|"continúa tras imágenes · función local"| animation
    runner -->|"continúa tras animación · función local"| render
    animation -->|"crea y consulta clips · HTTPS"| kie
    animation -->|"consulta recibos y guarda clips · archivos"| files
    runner -.->|"publica fases y clips · NDJSON vía Channel"| ui
    classDef externo fill:#f5f5f5,stroke:#9e9e9e,stroke-dasharray:4
    classDef propio fill:#e3f2fd,stroke:#1976d2
    classDef datos fill:#f3e5f5,stroke:#7b1fa2
```

**Contrato:** el runner cierra `images` antes de iniciar `animation`, y publica el clip listo después de guardar su manifiesto. **Fallo:** una animación incompleta impide el ensamblaje de ese intento; reanudar conserva clips listos y consulta recibos pendientes antes de comprar trabajo nuevo. **Motivo:** mostrar una fase distinta evita presentar imágenes todavía «generándose» cuando el trabajo pendiente es video. El puente Rust conserva su contrato genérico de reenvío de JSON.

La narración es **esencial** (si falla, el job muere); música y overlay son
**opcionales**: si fallan, el video sale sin ese asset y la UI recibe un `log`.

**Con un estilo propio («Mi estilo», ADR-0018/0019/0020)** `scene-prompts` cambia
de carril: la gema del usuario viaja verbatim como `system` (si es por secciones, la
arma el marco de Vimo: ver más abajo), se saltean la biblia y el director, y los
prompts salen **por lotes** con el modelo LLM elegido en Create
(`options.promptModel`; el catálogo llega por `list-prompt-models` y el
simulador de costos vive en `utilities/promptCost.ts`). Cada lote cerrado se
escribe en `scenes.json` en el acto: sus tokens ya se pagaron, así que un fallo
posterior no puede tirarlos y el reintento solo pide lo que falta. La gema declara además
qué hace con su protagonista (`customStyle.character`: propio, genérico o
ninguno) y puede diseñarlo con el guion como contexto (`design-style-character`).
Un personaje se ilustra también con la gema (`generate-character-preview` con el
id de galería: la gema escribe la escena del retrato con DeepSeek V4.1 Flash, con
V3.2 de respaldo, y la descripción se pega palabra por palabra como en una escena
del video; enmienda del 2026-10-04 a la ADR-0021), pero ese retrato es solo para
verlo: un personaje de identidad de prompt viaja siempre como texto,
en cualquier estilo, y `create-video-project` no le copia ninguna referencia
(enmienda del 2026-10-02 a la ADR-0021). Solo un personaje **con foto** (ADR-0033)
lleva referencia: su foto es la referencia en cualquier estilo, y con gema entra al
modo `reference` del carril (la identidad viaja en la imagen, no en texto). Los
prompts salen **siempre en inglés**: la plataforma suma a la gema una regla de idioma
(`OUTPUT_LANGUAGE_RULE`, ADR-0019) y, si el modelo igual escribe en otro idioma, la fase
corta en una ronda con `llm_prompt_language` sin culpar al modelo
([fix](fixes/2026-09-22-fix-verbatim-prompt-language/verbatim-prompt-language.md)).

En ese carril la interfaz además **vigila al modelo** (ADR-0028): si pasan dos
minutos sin un prompt nuevo, o el sidecar emite `prompt-model-trouble`, el modelo
queda bloqueado localmente una hora (`common/utilities/promptModelBlocks.ts`) y
un diálogo ofrece seguir esperando o cancelar y relanzar el mismo proyecto con
otro modelo (`set-prompt-model` + `run-video-pipeline`, prompts ya escritos
intactos). Con todos los modelos bloqueados solo quedan los estilos de Vimo.

**Gemas por secciones (Entrega 1,
[ADR-0048](adr/ADR-0048-gemas-por-secciones-y-agente-reconstructor.md)).** Con el
interruptor `features.gemTemplate` (primero solo para admins), una gema nueva ya no es
un texto libre: se guarda en siete secciones fijas (`visualStyle`, la única
obligatoria, `character`, `dynamism`, `camera`, `rules`, `promptStart` y `promptEnd`)
que ordena el agente reconstructor de vimo.click (sección 1) a partir de lo que pegó el
autor; editar una sección guarda directo con `style-save`, sin agente. El proyecto
copia la gema en `options.customStyle` (`sections`, `templateVersion` y `colorFilter`;
una gema vieja lleva `systemPrompt`, nunca los dos). Al generar, el sidecar la
envuelve con el **marco de Vimo** (`pipeline/prompts/template-frame.ts`):
`buildTemplateSystem` arma el `system` con que el carril escribe los lotes de prompts
(su Fase 2; la Fase 1 diseña al protagonista desde el guion): el rol del modelo, las
secciones, la seguridad de contenido, el formato de salida y las reglas de plataforma de
siempre; y
`composeGemText` arma la gema como texto para lo que no escribe escenas (la Fase 1, el
diseño y el preview de personajes y el respaldo de imágenes). La sección `character`
nunca entra al `system`: el modo de personaje decide si viaja y cómo.

- **Genérico:** con `character`, ese texto es el protagonista —se teje en cada escena
  que lo nombra— y **no corre la Fase 1**; queda en `styleProtagonist` con
  `source: 'style-section'`. Sin la sección, la Fase 1 lo diseña como siempre.
- **Mi personaje:** `character` no viaja; el protagonista es el del usuario (con texto,
  dibujado en el estilo; con foto, `APPEARANCE LOCK`).
- **Cinemático:** `character` no viaja y la arquitectura va sin `[subject]`; si el
  dinamismo nombra al protagonista, esa escena sale sin protagonista recurrente.

Con `dynamism`, cada prompt de lote empieza con una **etiqueta de tratamiento**,
`((n)) [T:<tratamiento>]`: el parser la quita y la guarda en `scene.treatment`, un `log`
informa el reparto al cerrar la fase, una escena cuyo tratamiento no muestra al
protagonista va sin `[subject]`, y una etiqueta ausente o inválida ni invalida el prompt
ni reintenta. Con `promptStart` y `promptEnd`, **el código** —no el modelo— arma cada
prompt de imagen como inicio fijo + escena tejida + final fijo: con final fijo no corre
`restoreStyleTail` y, si el prompt no entra, el recorte cede primero el núcleo de la
escena, después el final y la identidad al último, sin cortar nunca el inicio. El
**filtro de color** es un preset del estilo (`none`, `fantasy` u `horror-bw`, en
`pipeline/prompts/color-filters.ts`) que `resolveProjectStyle` vuelca en el
`filterFinal` del render. Una gema **sin secciones** —todas las anteriores a la
Entrega 1 y las que aún no se migraron— sigue por `buildVerbatimSystem` **byte por
byte** (lo fija `check-gem-verbatim-lane.mjs` con huellas SHA-256); con el interruptor
encendido la app la migra con el agente la primera vez que se abre o se elige en Crear
y, si la migración falla, la gema sigue por el camino viejo.

**Creador de estilo con IA
([ADR-0050](adr/ADR-0050-creador-de-estilo-con-ia.md)).** Clona un estilo desde un
video de YouTube o desde hasta 10 imágenes y lo guarda como una gema por secciones. El
análisis lo hace vimo.click (`POST /api/estilos/crear-con-ia`, Gemini 3.1 Pro con la
clave de Vimo, un turno por pedido y sin estado); la app conduce los turnos y el
sidecar hace lo que necesita la computadora y las claves del usuario, con cuatro
subcomandos de `pipeline/commands/styles/`:

| Subcomando            | Qué hace                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `style-clone-prepare` | Junta el material: hasta 10 mosaicos del storyboard, 3 fotogramas públicos, la miniatura y el título de un video, o las imágenes del usuario validadas y achicadas a JPEG. |
| `style-clone-draw`    | Dibuja una ronda de pruebas (3 diseños del personaje o 4 escenas) con Fal o Evolink y deja el «Original» de cada escena. Una prueba que falla no tumba la ronda.           |
| `style-clone-save`    | Guarda el estilo (`origin: { kind: 'ai-clone' }`), las clonaciones aprobadas como muestras y, si se replicó, el personaje en la biblioteca como predeterminado del estilo. |
| `style-clone-discard` | Borra la carpeta de la sesión.                                                                                                                                             |

Todo lo de una clonación vive en `<carpeta raíz>/_style-clones/<sesión>/` (reservada
en `RESERVED_ROOT_DIRECTORIES`) hasta que se guarda o se descarta: el material con su
índice `material.json` y las pruebas dibujadas. YouTube bloquea algunas redes como
bot: la ficha del video se pide con el cliente de siempre de yt-dlp y, si sale ese
bloqueo, con `mweb`; sin storyboard la clonación sigue con los fotogramas públicos. El
final fijo de un estilo clonado lleva su ficha de estilo, por eso `promptEnd` admite
hasta 1 000 caracteres.

En la app, cada clonación es una **sesión** de un store fuera de React
(`src/modules/videos/utilities/styleCloneSessions.ts`, conectado en
`hooks/useStyleClones.ts`): se guarda en `localStorage` (`vimo:styleClone:sessions:v1`),
sigue trabajando aunque se cierre su modal, admite hasta 3 a la vez y, cuando necesita
una respuesta, se detiene y lo dice en su tarjeta de Mi estilo. Cada acción avanza por
fases (material → turno → pruebas → guardado) y retomar tras un fallo o tras cerrar la
app repite solo la fase que estaba corriendo. El turno viaja con `vimoServerStream`
(`src/modules/common/fetcher/vimoServer.ts`), el cliente de respuestas por partes
(NDJSON) de vimo.click: tope de 300 s y 45 s de silencio. La card aparece con el
interruptor `features.aiStyleCreator`.

### La pausa de confirmación de escenas

Cuando el usuario pidió confirmar — con estilo de catálogo, la casilla
«Confirmar escenas antes de generar» del formulario; con estilo propio, la
preferencia «No preguntarme al generar» de Ajustes, sin casilla en el
formulario —, `scene-cuts` emite
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
job — todo lo hecho se conserva. Una cancelación deja el proyecto en `paused`
con `pauseReason: 'cancelled'`, igual de retomable.

**Saldo agotado a mitad del job** (ADR-0031): los providers clasifican el
rechazo con la familia `*_insufficient_credits`
(`pipeline/utils/insufficient-credits.ts`), la fase `images` corta los carriles
en vuelo, y `run-video-pipeline` deja `paused` + `pauseReason:
'insufficient-credits'` + `errorCode`. En la UI el código no entra al reintento
automático: la tarea guarda `creditsIssue` y la pantalla de progreso muestra
`InsufficientCreditsCard` (saldo de la cuenta que rechazó, lo pendiente por
gastar estimado desde disco, recargar, reanudar cuando alcanza). Biblioteca lo
lista con el badge «Sin créditos» y `LibraryProgress` monta
`NoCreditsResumePanel`, que re-lee el saldo antes de relanzar.

### Editar después de crear (Library)

Con el auto-export apagado (default desde ADR-0016), **este es el flujo
normal**: el job de Create genera voz, escenas, imágenes y la animación inicial
si está activada; deja el proyecto en `draft` sin render, y la UI navega directo al editor — el mp4 se arma desde el
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
`update-scenes` solo lo marca cuando cambian los tiempos de una escena; prompt,
modelo, calidad y personajes esperan a la regeneración, que marca por su cuenta.
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

| Pieza                                              | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React 19 + TypeScript + Vite                       | listo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Tauri 2 con la ventana de la aplicación            | listo (identifier y tamaño de ventana propios)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ESLint, Prettier y el alias `@/`                   | listo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Convenciones de código ([CLAUDE.md](../CLAUDE.md)) | listo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Estructura modular en `src/`                       | fundaciones + layouts listos: `router/`, `i18n/`, `layouts/` (Authenticated/Guest), `modules/common` (ui, doodles, theme, brand, fetcher, queryClient, supabase) y módulos `auth`/`videos`/`setup` (`home` eliminado)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Layouts y vistas base                              | Login, Callback, AccessDenied, Splash y Create con lógica real; PageNotFound maquetada; sidebar/navbar funcionales — ADR-0005                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| React Router, TanStack Query, Tailwind             | instalados y configurados (hash router con loaders como guards; primeras query keys: `authQueryKeys`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Autenticación (módulo `auth`)                      | lista — ADR-0006: OAuth Google doble flujo (web + deep link `vimo://`), verificación de acceso contra vimo.click, gate por loaders, logout, vista License. Pendiente: cold start del deep link                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Módulo `costs` (catálogo local)                    | listo pero **retirado de la UI** — ADR-0008: comparativa de precios con dataset local (`catalog.ts`), 4 tabs + filtros. Fuera del router y del sidebar (`hidden` en `layouts/AuthenticatedLayout/constants.ts`) mientras se redefine el modelo de precios; el código sigue completo y typechequeado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Módulo `settings` (carpeta de proyectos)           | listo — ADR-0009: carpeta raíz única (default `~/Documents/Vimo`) con dialog/fs/store; en web se muestra deshabilitado. Desde ADR-0024 también la preferencia «proveedor de voces» (DubVoice / ElevenLabs, null = automático)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Módulo `api-keys` (claves de proveedores)          | listo — ADR-0011: dashboard con catálogo único (`providers.ts`), claves en una única entrada del keychain del SO cacheada por sesión (`keyring`, ADR-0023; Android vía plugin local `tauri-plugin-secure-keys`), validación en Rust con reqwest; primeros comandos `invoke` del repo (`src-tauri/src/api_keys/`); en web se muestra deshabilitado. Pendiente: probar el plugin Android en emulador (falta `tauri android init`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Infraestructura de i18n (`src/i18n/`)              | lista con i18next + catálogos `public/locales/{es,en,pt}.json` — ADR-0004                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Plugins de Tauri                                   | `deep-link`, `opener`, `dialog`, `fs`, `store` instalados y configurados (scheme `vimo`, capabilities con scope `$HOME/**` más la carpeta de proyectos habilitada en runtime — ADR-0037); `shell` solo del lado Rust para el spawn del sidecar (sin capability al webview)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Backend local / pipeline                           | **redirigido por ADR-0007, en curso por ADR-0010**: fundación lista — `pipeline/` (contratos job/eventos, providers `llm` DeepInfra, `music` Evolink, `tts` DubVoice e `image` Fal/Evolink, prompts, config inyectada), sidecar con subcomandos **empaquetado como binario único Node SEA** (`externalBin`, regenerado por los hooks de dev/build), y comandos genéricos `start_pipeline_job`/`cancel_pipeline_job` (`src-tauri/src/pipeline/`) que reenvían el NDJSON por el `Channel` del invoke (un canal por job, sin canal global); la capa compartida de la UI vive en `src/modules/common/fetcher/pipeline.ts` (`startPipelineJob`/`runPipelineJob`); las claves llegan de `KeySource::get_all` (una entrada del keychain, cacheada por sesión — ADR-0023). Pasos 1 a 4 (AI Music, Voices, Characters) hechos; Create con el runner completo (ADR-0013) y Library como cierre (ADR-0014): **la migración por módulos de ADR-0010 está completa**                                                                                                                                                                                                                                                                                                                                                                                      |
| Módulo `music` (AI Music)                          | listo — ADR-0010 paso 2: pantalla completa (formulario Suno, sugerir prompt vía LLM, generación con progreso y cancelación, chooser de variaciones, historial en `<carpeta raíz>/_history/music/` con audio/cover/metadata, saldo de créditos); primeros jobs reales del sidecar (6 subcomandos en `pipeline/commands/`); asset protocol habilitado (scope `$HOME/**` + carpeta de proyectos en runtime, ADR-0037) para reproducir el audio local con `convertFileSrc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Módulo `voices` (Voces TTS)                        | listo — ADR-0010 paso 3: explorador de voces de DubVoice (Minimax · ElevenLabs · Edge) y, desde ADR-0024, de ElevenLabs directo («Mis voces» + «Biblioteca», cuota de caracteres) según el proveedor elegido; filtros, favoritos e historial en `<carpeta raíz>/_history/voices/`; probador con progreso y cancelación; saldo de créditos. Las muestras suenan desde la URL del proveedor: los previews precomputados del origen (81 MB) y su síntesis con créditos no se portaron, y Edge queda sin muestra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Módulo `characters` (Personajes)                   | listo — ADR-0010 paso 4: biblioteca de identidades en `<carpeta raíz>/characters/` (una carpeta por personaje con `metadata.json` y un preview por estilo); el "experto" redacta la identidad neutra de estilo con el LLM en tier premium, y los previews estrenan los providers de imagen (Fal · Evolink) con la regla de oro de los proveedores pagos. El selector de hasta 2 personajes ya vive en Create (ADR-0013); desde ADR-0033 un personaje también se crea CON foto («cara idéntica»: la imagen subida es su identidad y viaja como referencia en todos los estilos, sin previews)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Módulo `avatars` (Avatares)                        | en construcción — ADR-0057 entrega 1: biblioteca de avatares de HeyGen en `<carpeta raíz>/avatars/` (una carpeta por avatar con `metadata.json` y `preview.<ext>`): avatares de stock de HeyGen, creación desde una foto (1,32 USD, con aviso de moderación) y borrado; la clave `heygen` (categoría `avatar`) se valida en Rust contra `GET /v3/users/me`. El avatar dentro del video (escenas de avatar sobre la narración) es la entrega 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FFmpeg y yt-dlp empaquetados                       | listos para **macOS arm64, macOS x64 y Windows x64** — ADR-0013 / ADR-0026 / ADR-0034: `scripts/fetch-binaries.mjs` los descarga con URL y SHA-256 pineados por target triple (firma ad-hoc en macOS en desarrollo; en CI Tauri los re-firma con Developer ID y notariza el DMG) y los deja como `externalBin`; Rust los resuelve junto a `current_exe` con el sufijo de la plataforma y los inyecta en `PipelineJob.binaryPaths`. Los instaladores (NSIS de Windows y DMG de macOS arm64 e Intel) salen del workflow `.github/workflows/build-desktop.yml`, con los targets declarados en `scripts/release-targets.mjs`; un tag `v*` además firma los artefactos y publica `latest.json` para el updater de la app (ADR-0027, módulo `settings`). Pendientes: Linux, firma Authenticode y la revisión GPL→LGPL de ffmpeg                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Módulo `videos` (Create)                           | listo — ADR-0013: pantalla completa de creación (formulario con guion o audio propio, estilo, escenas, proveedor de imagen, selector de voz y de hasta 2 personajes, música y overlay), progreso en vivo por fases con grilla de escenas, pausa de confirmación de escenas, cancelar y reanudar, y panel del video terminado. La tarea vive en un store con `localStorage` y sobrevive a navegación y reload. Desde 2026-09-03 la pantalla de progreso calca la del origen (rama 7 de ADR-0016, port visual de `vimo-ui-pipeline`): página entera con cronómetro que descuenta la pausa, fases a la izquierda y un panel por fase, grilla de imágenes con visor a pantalla completa, paso de segundos por escena inline y el error dentro de la pantalla. Entrega 1 de gemas por secciones (ADR-0048), tras `features.gemTemplate`: modal de Mi estilo por secciones, migración de gemas viejas, `vimoServerFetch` y `useAccessFeature` en `common`. Entrega 2 (ADR-0039 Aceptada), tras `features.newCatalog`: pestaña Catálogo nueva con las 38 gemas de `pipeline/prompts/catalog-gems/` como tarjetas del carril de Mi estilo, «Ver» (muestras, etiquetas, modo de personaje recordado por estilo) y «Pasar a mi estilo» (`catalog-styles-list`, `catalog-style-copy`); el catálogo viejo sigue con el interruptor apagado y en la demo. |
| Runner de stages y las 7 fases                     | listos — ADR-0013: `pipeline/runner/run-stages.ts` + `pipeline/stages/` (voice, transcription, scene-cuts, scene-prompts, images, animation, render; ADR-0045) con el registro declarativo en `stages/registry.ts`. Toda fase es retomable por `skip()`; los guards de gasto del origen se conservan textualmente (anti-doble-gasto del TTS, concat con re-encode, cosecha de tarea Evolink ya pagada, `-t` explícito en el render)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Módulo `videos` (Library)                          | listo — ADR-0014: biblioteca completa (grilla con estados y borrado en lote, partida en dos pestañas por formato desde 2026-09-08 —«Formato largo» con tarjetas 16:9 y «Shorts» con tarjetas 9:16 en una columna más—, la pestaña se recuerda en `localStorage` y queda en la del último proyecto creado; reproductor con velocidades, pantalla de progreso rehidratable) + editor (regeneración selectiva de imágenes con prompt propio y modelo/calidad por escena, drag de fronteras en el timeline, re-render con cache de chunks, export de clips a `clips/`, reemplazo de narración con re-transcripción, música IA/YouTube/archivo, mezcla de volúmenes y offset). 11 subcomandos nuevos en `pipeline/commands/videos/` sin tocar Rust; flag `videoOutdated` en `project.json`. Pendiente: prueba con claves reales en build instalado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Modo demo (`videos` + sidecar)                     | listo — ADR-0029 + ADR-0030: entrada «Demo» del sidebar (flag `demo` del veredicto de vimo.click: administradores y `demo_accesos`), puerta `/create-demo` que descarga una sola vez el pack v3 (318,7 MB, SHA-256 pineado; raíz v2 con cuatro historias 16:9 más `short/` con cuatro shorts 9:16) a `<carpeta raíz>/_demo-pack` y siembra la gema del pack en `_styles/demo-storytelling/`, Crear pre-llenado desde el manifest (la historia sigue a formato y estilo; «Subir mi audio» ya cargado con el audio de la historia) y `run-video-pipeline` simulando las seis fases (~40 s) con los archivos del pack, sin claves ni proveedores; regenerar imágenes y cambiar narración se rechazan (`demo_project`). Dominio `pipeline/commands/demo/` (`demo-status`, `demo-prepare`, `run-demo-pipeline`) sin tocar Rust. Guard `pnpm check:demo` (19 secciones) y armador `pnpm build:demo-pack`                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Mantené esta tabla al día: es lo que le dice a quien llega —persona o agente— qué puede
dar por hecho y qué no.
