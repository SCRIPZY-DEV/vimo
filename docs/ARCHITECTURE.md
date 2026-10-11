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
| Las 8 fases que generan el video              | `pipeline/` (stages)              |
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
├── stages/                las 8 fases de Create + su registro: voice/, transcription/, scene-cuts/, scene-prompts/, images/, avatar/, animation/, render/ (ADR-0013, ADR-0057), y shared/ con lo que usan varias fases
├── avatar/                el avatar dentro del video (ADR-0057): nombres de los archivos de una escena de avatar, el planificador de apariciones, la orientación del look (la comparten Crear y el sidecar), el carril de una escena con HeyGen (huellas del pedido, corte del audio, recibos `creating`/`pending` con `Idempotency-Key`, descarga y ajuste del clip al tramo sin retimar) y la operación que comparten la fase `avatar` y el comando del editor (cosecha antes que pago, el saldo antes de cada escena, de a tres)
├── narration/             frases de la narración, la unidad de continuidad del avatar (ADR-0057)
├── project/               la carpeta de un proyecto en disco: rutas tipadas, metadata, scenes.json y referencias de personajes (ADR-0009)
├── providers/             estrategia por servicio externo: llm/ (DeepInfra), music/ (Evolink), tts/ (DubVoice: Minimax · ElevenLabs · Edge; ElevenLabs directo — ADR-0024), image/ (Fal · Evolink), transcription/ (Deepgram), ytdlp/ (BGM, overlay y la ficha de un video para clonar su estilo), avatar/ (HeyGen: avatares y sus looks, assets, creación desde foto, looks desde un prompt, saldo, el borrado de un avatar propio y los renders de las escenas de avatar —crear, consultar y buscar por la marca del título— — ADR-0057)
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
usuario (guion, prompts, rutas). La ADR-0057 sumó `dropped` (las apariciones del
avatar que no cupieron, en `avatar-planned`); el progreso de cada render de HeyGen
(`avatar-scene-progress`) se muestrea como todo `*-progress` sin porcentaje: uno cada
30 s por tipo de evento, no por escena (con tres renders en paralelo queda uno solo).

Tres reglas más para que el log sirva a soporte:

- **Toda fila lleva `project_name`.** `diagnostics/subject.rs` lo resuelve desde el
  subcomando y el payload: el proyecto (`projectId` / `projectIds`, o `name` en una
  creación fallida) o, si no hay proyecto, la entidad con prefijo fijo (`Estilo: X`,
  `Personaje: X`, `Avatar: X`, `Voz: X`, `Música`, `Demo`). Un subcomando nuevo que
  trabaje sobre un proyecto manda `projectId` en el payload aunque el handler no lo use.
  Así `avatar-render-scenes` (ADR-0057) es del proyecto en Rust y, en el webview, la
  palabra `scene` lo archiva en `videos` (`SUBCOMMAND_MODULE_KEYWORDS`) aunque su nombre
  empiece con `avatar`.
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
   los administra desde ahí. Con el avatar presentador
   ([ADR-0057](adr/ADR-0057-escenas-de-avatar-con-heygen-sobre-la-narracion.md)) la
   tarjeta de Crear ofrece los avatares de la biblioteca y, de cada uno, solo los looks
   con la orientación del formato del video (`lookOrientationFit`, la misma regla con la
   que el sidecar los acepta): un look generado con «Crear escenario» guarda la
   orientación del formato pedido cuando HeyGen no informa la suya
   (`preferredOrientation`: 16:9 horizontal, 9:16 vertical, 1:1 cuadrado, que no sirve en
   ningún formato de video; 4:5, 5:4 y `auto` quedan sin orientación). Sin clave de HeyGen
   la tarjeta se ve apagada y el formulario que se valida, se estima y se envía lleva el
   avatar apagado (`withAvatarKey`, derivado en el render, no un efecto): nunca un
   `options.avatar` sin con qué generarlo. Con la tarjeta encendida, un look pedido con
   «Crear escenario» o un avatar que entrena se sigue cada 15 s
   (`useProcessingAvatarsRefresh`) y aparece al terminar sin salir de Crear.
   Desde la entrega 2c las tarjetas de la fila «Avatar» (`CreateAvatarCard`) tienen la
   forma del video (`AVATAR_LOOK_FRAME_CLASSES`) y muestran el look de cada avatar para
   ese video —el elegido en el elegido, el de por defecto (`defaultAvatarChoice`) en los
   demás— con el nombre del look y «+N looks» en blanco sobre un degradado. Al montar
   Crear solo la tarjeta del elegido pide el listado de HeyGen (`useAvatarRemoteLooks`,
   sobre `useStockLooks`: gratis, con la caché por grupo del panel de la biblioteca y el
   `ownership` en un solo lugar); las demás muestran su look si la biblioteca bajó su
   vista previa (solo las tres de la tarjeta, `AVATAR_CARD_LOOK_PREVIEWS`) o la cara del
   avatar, y piden recién con la intención de mirarlas: el mouse quieto encima o el foco
   visible del teclado (`usePreviewActivation`, sobre `useHoverIntent`), que también
   pasa el video mudo. Debajo, el botón «Look» (`CreateAvatarLooks`) despliega la grilla
   con todos los looks del avatar mirado —también de uno sin look para el formato, que
   no pide nada hasta abrirse—, el principal primero, cada uno con su formato
   (`lookFormatOf`, completado con el listado) y su forma real dentro de la celda. Solo
   se eligen los que sirven y los demás dicen por qué, los dos según `lookUnfitReason`
   (`selectableAvatar.ts`, la regla con la que `avatarLooksFor` ofrece), y siguen
   enfocables (`aria-disabled`) para llegar con el teclado a su motivo y a su video. El
   aviso de moderación es un recuadro `role="note"` con su título. El
   formulario sobrevive a la navegación dentro de la sesión: `CreateView` se siembra del
   borrador en memoria del módulo (`utilities/createDraft.ts`, nunca en disco), salvo lo
   que ninguna pantalla de Crear edita y solo siembra Ajustes (la duración de escena de
   las gemas y su pausa), que sale siempre de la preferencia actual. Lo escribe en cada
   cambio —un formulario intacto (la semilla de las preferencias con la que Crear se
   montó, sin borrador) no se guarda, tampoco al volver con «Crear otro», así Crear sigue
   tomando las preferencias y las claves del momento; uno restaurado de un borrador sí, y
   con un borrador ya escrito se refleja todo— y al volver al
   formulario («Crear otro» o cerrar la confirmación de escenas, en su manejador y no en
   un efecto), y lo descarta recién cuando el proyecto ya existe (el aviso
   `onProjectCreated` de `startCreation`, que llega una vez y solo con la tarea
   vigente): un pre-chequeo que frena, una cancelación o un `createProject` que falla lo
   dejan. La autonavegación al editor no lo guarda; la demo no lo lee, no lo escribe ni
   lo descarta. Cerrar sesión no lo borra, como la tarea en curso; un reinicio sí. Los
   enlaces («Crear escenario», «Administrar avatares», «Ir a Claves API») siguen siendo
   enlaces.
3. **Pre-flight del proveedor de voz** (`probe-tts`): valida contra los
   endpoints de LISTADO —no gasta créditos— y avisa antes de arrancar un
   pipeline largo. El resultado se cachea 2 minutos en la UI.
4. **Pre-check de saldo** (ADR-0031): `useCreateCostCheck` estima el gasto
   por proveedor (voz por caracteres × `VOICE_COST_FACTORS`, imágenes por
   escenas × precio de la calidad —sin las escenas de avatar, que no llevan
   imagen—, el avatar presentador por segundos × la tarifa de Avatar III —en
   dólares de HeyGen, comparados solo con una billetera en `usd`—, música de
   fondo informativa) y lo cruza con los saldos leídos
   (`compareCostLines`). Con saldo leído e insuficiente el envío se frena y
   `InsufficientCreditsAlert` ofrece recargar (`billingUrl` del catálogo de
   `api-keys`); un saldo ilegible solo avisa. Al enviar, `verify()` re-lee el
   saldo justo antes de arrancar.
5. `create-video-project` crea la carpeta del proyecto con `project.json`,
   `script.txt` y las referencias de los personajes; con audio propio,
   `upload-narration` lo copia (o transcodifica) a `narration.mp3`. Con avatar
   presentador (ADR-0057), después de validar todo lo local (biblioteca, grupo, look,
   orientación y vista previa) y antes de crear la carpeta, hace UNA lectura gratis de
   la cuenta de HeyGen (`getBalance`): una clave que HeyGen rechaza (401 o 403) rechaza
   la creación con `avatar_invalid_key`, sin clave el código es `missing_api_key`, y si
   HeyGen no responde (red, 429, 5xx, o no contesta en 8 s: la lectura lleva su propio
   plazo y no repite el 429) solo avisa y el proyecto se crea; el saldo no
   frena acá (lo comparan Crear y la fase antes de pagar). Es lo que evita descubrir una
   clave muerta con la voz y las imágenes ya pagadas, porque la fase `avatar` corre
   después de ellas.

**Biblioteca de avatares (ADR-0057, entregas 1b, 2b y 2c).** La vista `AvatarLibrary`
muestra una `AvatarCard` por avatar en una grilla donde cada fila mide lo que su tarjeta
más alta y las tarjetas de una fila miden lo mismo: un mosaico sin huecos con la cara
del look principal y hasta dos miniaturas, donde cada imagen reproduce, muda, el video
de su look al pasar el mouse (el foco visible del teclado en el nombre, el de la
principal). Los videos salen del listado de HeyGen del avatar (`useStockLooks`, gratis,
con la caché de 5 min que comparte con el panel), pedido recién cuando la persona se
detiene en la tarjeta (`useHoverIntent`: el mouse quieto `HOVER_FETCH_DELAY_MS` = 250 ms
o el foco del teclado; cruzar tarjetas no lanza un proceso del sidecar por cada una).
«Agregar de stock» abre `StockLooksDialog` en dos niveles. El primero lista los avatares
(grupos) con los filtros de `useStockGroupFilters`: la categoría —solo el stock público:
Profesional = estudio, Comunidad = gemelos, Estilo de vida = el resto, por la
clasificación de `avatar-stock-types` (`useStockTypes`; si falla o llega vacía, el aviso
y todo) y Favoritos, marcados con el corazón (etiqueta fija, estado en `aria-pressed`) y
guardados en el store `avatars.json` de la app (`useStockFavorites`: el corazón queda
deshabilitado hasta leer lo guardado; escrituras en cola y relectura tras un fallo; el
hook nunca escribe por su cuenta: un favorito que el listado completo de HeyGen ya no
trae no se borra del store, solo se oculta y en la sesión deja de contar para la
auto-carga de Favoritos; quitar uno con el teclado desde Favoritos deja el foco en el corazón vecino o
en el chip)—, el género y la búsqueda; con un filtro activo la grilla pide páginas sola
hasta mostrar `STOCK_FILTER_MIN_VISIBLE` tarjetas (nunca tras un error, mientras
clasifica ni cuando la categoría ya no puede sumar), y una tarjeta sin video de grupo
reproduce el de su look de portada (`coverLookVideoUrl`). En el segundo nivel y en el
panel del avatar (`AvatarDetailDialog`), un clic en una ficha abre `LookPlayerDialog`
(`useOpenLook` recuerda qué look y adónde vuelve el foco), un diálogo de Radix anidado
(Escape cierra solo él) con el reproductor del look —`LookPlayer` + `useLookPlayback`,
montado con una `key` por URL: el video entero sobre un escenario oscuro, sin autoplay,
con sonido solo desde un clic o una tecla, barra con tiempo, velocidad, silencio y
pantalla completa; en el panel espera la lista de HeyGen antes de decir «sin video»— y
una acción al pie según de dónde se abre (`LookPlayerAction`): «Cargar a la biblioteca»
(agrega el avatar con ese look como principal y abre su panel) o «Abrir en tu
biblioteca» en el stock; «Usar como principal» o «Es el look principal» en el panel; el
motivo (`lookUnusableReasonKey`) si el look no sirve. Mientras carga, el reproductor no
se cierra y el foco espera en el escenario. En «Mis avatares» (entrega 2c) cada tarjeta
trae, arriba a la izquierda y con el mouse o el foco, un tacho para eliminar el avatar
de HeyGen en dos pasos: el primer clic lo arma («¿Eliminar para siempre?» en rojo, con
la explicación sobre la imagen; su nombre accesible es ese texto y lo describen el
avatar y la explicación) y el segundo elimina; no confirman el segundo clic de un doble
clic (`isSecondClickOfDoubleClick`) ni una tecla sostenida (`ignoreHeldKey`), las mismas
guardas de «Quitar» → «Seguro» en la tarjeta de la biblioteca y en el panel (el primer
gesto arma; soltar y volver a apretar, o un clic aparte, confirma), y salir de la
tarjeta, sacarle el foco o tocarla cancela, sin que nada entre ni salga del DOM en el
blur. `useAvatarMutations().deleteFromHeyGen` (`networkMode: 'always'`) saca la tarjeta
de la caché (`avatarsQueryKeys.stockGroupsOf('private')`) al lograrlo, avisa y relee la
cuenta y la biblioteca; el diálogo hace un borrado a la vez y nunca junto a un alta, no
se cierra (Escape, clic afuera ni la X) mientras el borrado está en vuelo, y lleva el
foco del teclado al tacho vecino o a la pestaña. Las fichas de looks (`LookChips`) dicen
su formato (`lookFormatOf`: 16:9, 9:16, 1:1, 4:5 o 5:4, con medidas finitas) en lugar de
la orientación; en el panel, las medidas salen del listado de HeyGen cuando la
biblioteca no guarda la orientación (`SizedLibraryLook`). El velo que late sobre una
vista previa mientras llega su video (`LookPreview`) está siempre montado y se apaga con
la opacidad: sacarlo del DOM en el blur de una tarjeta devolvía el foco a la caja del
diálogo.

**Subcomandos de avatares (`pipeline/commands/avatars/`, ADR-0057).** Doce, todos con
«avatar» en el nombre para que el diagnóstico los agrupe en su familia: `avatars-list`
(la biblioteca), `avatar-stock-groups` y `avatar-stock-looks` (el stock público de
HeyGen o los avatares propios, por páginas con cursor), `avatar-stock-types` (qué grupos
públicos son de estudio y cuáles gemelos), y `avatar-add`, `avatar-create-photo`,
`avatar-refresh`, `avatar-set-main-look`, `avatar-generate-look`, `avatar-balance`,
`avatar-delete` (solo local) y `avatar-heygen-delete`. **`avatar-stock-types`**
(entrega 2b) alimenta los filtros
«Profesional» y «Comunidad» del stock. El listado de grupos de HeyGen no trae tipo, tags
ni categoría, así que barre
`GET /v3/avatars/looks?ownership=public&avatar_type=studio_avatar|digital_twin` (gratis,
~45 pedidos y ~20 s, los dos tipos en paralelo, hasta 80 páginas por tipo) y devuelve
los ids de grupo de estudio y de gemelos, ordenados y sin repetir (los demás grupos son
avatares de foto), más `truncated` si algún recorrido llegó al tope. El resultado se
guarda 24 h en `<carpeta raíz>/avatars/.stock-types.json`
(`{ version: 1, fetchedAt, studioGroupIds, twinGroupIds, truncated }`; el listado de la
biblioteca ignora los nombres que no son un id): una caché vigente se sirve sin clave ni
pedidos (`fromCache: true`) y `refresh: true` la salta. Un archivo que existe pero no
sirve (no se puede leer, JSON roto, otra versión, `fetchedAt` inválido, ids o
`truncated` inválidos) vale como si no existiera y avisa una vez en el log, con el
motivo y sin la ruta; que no exista no avisa. Una fecha futura es una fecha válida: no
es vigente (se vuelve a barrer), pero la caché se lee y sirve de respaldo. **Fallo:** si
HeyGen falla y hay una caché legible —vencida, de fecha futura o vigente saltada por
`refresh`—, se sirve con un `log warn` con el código del fallo; sin caché el fallo sale
tal cual (`avatar_network`, `avatar_invalid_key`…); una escritura de la caché que falla
solo avisa; una cancelación sale siempre tal cual; y cuando un recorrido falla el otro
se aborta, para no seguir pidiendo páginas con el job terminado. Una barrida que no
devuelve ningún grupo de ningún tipo (y no llegó al tope de páginas) casi seguro es un
`data: []` pasajero: no se guarda y avisa; con una caché legible se sirve esa
(`fromCache: true`) y no se la pisa, y sin caché se devuelve lo barrido, así que la
siguiente llamada vuelve a barrer. **Motivo:** la API de HeyGen no expone categorías,
así que Vimo las deriva del tipo de look; en la app, `useStockTypes` pide la
clasificación una vez por sesión, salvo que venga sin ningún grupo: esa vence al
instante y se reintenta al reabrir el stock, y mientras se reintenta informa `isLoading`
(el diálogo dice «Clasificando…» en vez de mostrar categorías vacías). La caché de 24 h
entre sesiones vive en el sidecar.

**`avatar-heygen-delete { groupId, name? }`** (entrega 2c) borra de verdad un avatar
propio de la cuenta de HeyGen: `DELETE /v3/avatars/{group_id}` (gratis, con todos sus
looks; HeyGen no deja borrar grupos públicos ni de la comunidad, así que la interfaz lo
ofrece solo en «Mis avatares»; `name` solo nombra la fila del log de soporte, como en
`avatar-add`). Antes de llamar valida el id (`[a-zA-Z0-9_-]`, hasta 128: un `.` o una
`/` cambiarían la ruta del pedido) y exige la carpeta raíz y la clave; cuando HeyGen
confirma, quita de la biblioteca todas las entradas de ese grupo (`removeGroupEntries`,
con el mismo `rm` con reintentos que `avatar-delete`, `removeAvatarFolder`) y devuelve
`{ groupId, removedEntryIds }`. **Fallo:** si HeyGen rechaza (401, 400, 429 tras sus
reintentos, 5xx o la red), la biblioteca no se toca; un 404 (el grupo ya no estaba) y un
2xx sin cuerpo cuentan como borrado; una carpeta que no se puede borrar avisa por el
log, con el código y sin la ruta, sigue en la biblioteca (su refresco la marcará
`avatar_group_missing`) y no tumba el job. **Motivo:** HeyGen primero y el disco
después: un fallo de HeyGen nunca saca de la biblioteca un avatar que sigue existiendo.

### Las ocho fases

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

| Fase            | Qué hace el sidecar                                                                                                                                                                                                                                                                                                                                                                                                                                  | Qué muestra la interfaz                                                                                                                                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `voice`         | Narración (TTS con cascada de carriles y troceo), música de fondo y overlay **en paralelo**                                                                                                                                                                                                                                                                                                                                                          | `voice-progress`, `bgm-progress`                                                                                                                                                                                                                                                           |
| `transcription` | Deepgram palabra a palabra, con puntuación (`sentenceEnd` en la palabra que cierra frase, ADR-0057), + duración real del audio medida decodificando                                                                                                                                                                                                                                                                                                  | fase en curso                                                                                                                                                                                                                                                                              |
| `scene-cuts`    | Corta la duración en N escenas por tiempo; con avatar, fija antes sus apariciones en fronteras de frase y corta solo lo libre (ADR-0057); con `confirmScenes`, **pausa** acá                                                                                                                                                                                                                                                                         | `scenes-planned` (y `avatar-planned` con avatar, que con la pausa sale antes de ella) o el diálogo                                                                                                                                                                                         |
| `scene-prompts` | Biblia visual, director de escenas y redactor por escena (4 capas de garantía); toda escena con timestamps recibe prompt — la muda (texto vacío del corte clásico) se ilustra como pausa desde la narración vecina ([fix](fixes/2026-09-22-fix-silent-scene-images/silent-scene-images.md)); una escena de avatar no lleva prompt: los dos carriles la saltean (ADR-0057)                                                                            | `scene-prompt-ready` por escena; `scene-prompts-progress` (avance del stream, carril verbatim); `prompt-model-trouble` (el modelo elegido falló: se bloquea 1 h, ADR-0028); `job-failed` con `llm_prompt_language` si la gema pide otro idioma: se corrige la gema, sin bloquear el modelo |
| `images`        | Una imagen por escena (carril normal y carril de personaje en paralelo), con recuperación de las rechazadas; al primer rechazo por saldo aborta la fase entera (ADR-0031); una escena de avatar no lleva imagen: su imagen fija es la vista previa del look elegido, `avatar/look.<ext>` (ADR-0057)                                                                                                                                                  | `scene-image-*` sobre la grilla; `images-recovery-pass` (`rewrite` devuelve la fila de prompts a «en curso» y reemite `scene-prompt-ready`; `retry` anota el reintento)                                                                                                                    |
| `avatar`        | Opcional (ADR-0057): sube a HeyGen el audio de cada escena de avatar y pide el look con su propio fondo, en el formato del video; guarda el intento antes del POST, sondea el render (plazo de 30 min, no una espera fija) y ajusta el clip al tramo sin retimar. Cosecha recibos y mira el saldo antes de cada pago, y no vuelve a pedir sola una aparición que HeyGen rechazó para siempre (moderación o look no soportado). Sin avatar se saltea. | `avatar-scene-*` con el paso y el tiempo transcurrido; `avatar-provider-trouble` (aviso pasajero)                                                                                                                                                                                          |
| `animation`     | Opcional: agrupa las fuentes del prefijo en clips, conserva recibos y ajusta cada clip a su intervalo antes de publicarlo (ADR-0045). Sin animación automática se saltea. Una escena de avatar nunca se anima con Kie: sale de las marcas y su tramo viaja como cubierto.                                                                                                                                                                            | `scene-animation-*`; carga azul por clip y reproducción de los clips listos.                                                                                                                                                                                                               |
| `render`        | Chunks con ken burns → concat sin re-encode → mezcla de audio, overlay y color del estilo; el clip de una escena de avatar listo y vigente tiene prioridad sobre Kie y entra a velocidad 1; sin clip, desactualizado o más corto que su tramo menos 1 s, la escena sale estática con la vista previa del look y un `warn`; sus subtítulos van por frase (ADR-0057)                                                                                   | `render-progress` por sub-fase                                                                                                                                                                                                                                                             |

**Animación inicial (2026-09-29, [ADR-0045](adr/ADR-0045-prefijo-animado-por-parejas-y-fase-propia.md)):** el formulario ofrece solamente el primer minuto y lo limita al audio real. Se crean imágenes fuente cada 3 s hasta ese límite y la fase `animation` las agrupa en clips solicitados de 6 s. Desde el segundo 60, los cortes usan el intervalo estático elegido. La última pareja puede contener una cola parcial; sus bordes no se desplazan. El editor conserva su planificador existente. Los proyectos históricos de fuentes de 6 s y todos sus recibos se reanudan sin redistribuir escenas.

```mermaid
flowchart LR
    runner["Runner del sidecar"]:::propio
    images["images<br/>Completa las imágenes"]:::propio
    avatar["avatar<br/>Genera las escenas de avatar"]:::propio
    animation["animation<br/>Agrupa y anima el prefijo"]:::propio
    render["render<br/>Ensambla si corresponde"]:::propio
    files[("Archivos y recibos del proyecto")]:::datos
    heygen(["HeyGen"]):::externo
    kie(["Kie.ai"]):::externo
    ui(["Pantalla de progreso"]):::propio
    runner -->|"genera fuentes · función local"| images
    runner -->|"continúa tras imágenes · función local"| avatar
    runner -->|"continúa tras el avatar · función local"| animation
    runner -->|"continúa tras animación · función local"| render
    avatar -->|"mira el saldo, sube el audio, pide y consulta renders · HTTPS"| heygen
    avatar -->|"guarda recibos y clips · archivos"| files
    animation -->|"crea y consulta clips · HTTPS"| kie
    animation -->|"consulta recibos y guarda clips · archivos"| files
    runner -.->|"publica fases y clips · NDJSON vía Channel"| ui
    classDef externo fill:#f5f5f5,stroke:#9e9e9e,stroke-dasharray:4
    classDef propio fill:#e3f2fd,stroke:#1976d2
    classDef datos fill:#f3e5f5,stroke:#7b1fa2
```

**Contrato:** el runner cierra `images` antes de iniciar `animation`, y publica el clip listo después de guardar su manifiesto. La fase `avatar` cierra antes de `animation` y guarda el intento de cada render antes del POST; si HeyGen no responde, el intento queda sin resolver y la próxima corrida lo busca por la marca de su `title` (adopta primero el render con el título exacto que salió, pedido también por ese título por si HeyGen filtra por igualdad, y, sin él, el que termine en la marca y no esté `failed`) o lo repite con la misma clave y el mismo cuerpo: nunca paga dos veces el mismo pedido. **Fallo:** una animación incompleta impide el ensamblaje de ese intento; reanudar conserva clips listos y consulta recibos pendientes antes de comprar trabajo nuevo. `avatar` vuelve a mirar el saldo de HeyGen antes de pagar cada escena (diseño §8): si no alcanza, o HeyGen dice que no hay saldo, no pide las que faltan, cosecha las que ya pidió y el proyecto queda pausado con `avatar_insufficient_credits` (el estimado y el saldo se comparan en millonésimas de dólar enteras, así una billetera igual a la cifra que muestra la interfaz alcanza); una escena que falla deja la fase en `avatar_incomplete` con el código dominante de las que fallaron y reanudar paga solo esa, salvo que la cuenta haya frenado la corrida: si alguna falló por un código de la cuenta (`avatar_invalid_key`, `missing_api_key` o `avatar_insufficient_credits`), ese es el dominante —manda sobre cualquier otro fallo, sea cual sea el orden en que terminan las escenas; si no, es el que más se repite— y la fase lanza ESE código, para que una clave que deja de servir a mitad de corrida no se disfrace de «apariciones sin generar» mientras un render pagado espera esa clave. La relectura del saldo no cuenta las escenas ya admitidas que todavía no se cobraron: detecta un gasto ajeno mayor que lo que está en vuelo, y uno menor lo ataja HeyGen con un 402. La cosecha de recibos va antes del saldo y puede repetir un POST con la MISMA `Idempotency-Key` (HeyGen deduplica, así que no cobra dos veces); si el original nunca llegó, esa repetición es en la práctica el primer pago y sale sin el chequeo, pero sin saldo HeyGen la rechaza con un 402 y la fase pausa. Si una escena de avatar se queda sin clip (la fase termina en `avatar_incomplete`) o su clip quedó desactualizado, el render la muestra estática con la vista previa del look y avisa en el log: el video nunca queda con un hueco. Cuatro comportamientos de HeyGen solo se confirman con la cuenta real (la QA del dueño, ADR-0057): si la búsqueda por la marca del `title` encuentra un render que HeyGen todavía tiene en `waiting` o `pending`, si guarda 24 h el error de una clave de idempotencia (un 402 repetido con la misma clave, tras recargar), cuándo descuenta, al crear o al terminar el render, y cómo filtra `GET /v3/videos?title=` (por substring, por prefijo o por igualdad), si conserva el final del título de un render (la marca; hasta unos 170 caracteres en total) y en qué orden lista los renders y sus copias. **Motivo:** mostrar una fase distinta evita presentar imágenes todavía «generándose» cuando el trabajo pendiente es video. El puente Rust conserva su contrato genérico de reenvío de JSON.

**Qué hace el carril ante lo incierto (ADR-0057):** cada render tiene su recibo en `scene.avatar` y la regla es no pagar dos veces el MISMO pedido (misma huella) ni perder uno pagado. Un «no» definitivo al POST (un 4xx que no es 409 ni 429, o el cliente que no lo manda) cierra el recibo `failed` y el reintento usa la clave siguiente; todo lo demás lo deja `ambiguous`, y la corrida siguiente lo busca (por su título guardado y por la marca de su `title`) o repite la MISMA clave y el mismo cuerpo. Dos señales mantienen abierto el original: el cliente marca (`sawRequestInProgress`) todo rechazo que llega después de un `409 request_in_progress` del mismo pedido, porque HeyGen ya confirmó el original en vuelo, y en la REPETICIÓN de un recibo sin resolver un 401, 402, 403, 408 o 425 —o un rechazo por saldo— no dicen nada del original, así que lo dejan `ambiguous` (en el primer envío, esos mismos 401, 402 y 403 sí cierran el recibo `failed`; un 5xx que habla del saldo en una repetición lanza y deja la escena como estaba). La búsqueda no descarta un render cuyo estado Vimo no conoce si trae id y título (darlo por inexistente sería repetir el pedido). Un render que HeyGen rechazó para siempre —moderación o look no soportado— no se vuelve a pedir solo: repetirlo no se cobra pero falla igual, y la persona quedaría en un bucle de «Reanudá»; la escena queda `failed` con su código y un aviso, sin llamadas, hasta que cambie el look o la narración (otra huella) o la persona lo pida con `avatar-render-scenes` (`retryFinalRejection`; su botón en el editor es de la entrega 3). El mp4 final se marca desactualizado solo cuando una escena recibe un clip nuevo (el checkpoint que la deja lista lleva `newClip`), no con los recibos intermedios de un render que HeyGen después rechaza. Al entrar al carril de una escena se barren los temporales (`.cut-tmp.wav`, `.normalize-tmp.mp4`) que un job matado dejó para ella. **Fallo:** si guardar la intención falla no sale ningún POST; si guardar el `pending` falla después de un POST exitoso, en disco queda `creating` y la corrida siguiente repite la misma clave. **Motivo:** pagar una sola vez aunque el job muera: sin recibo guardado no hay POST.

**Título del render (entrega 2c, diseño §7.1):** cada POST lleva
`<nombre del video> · <marca>` (`avatarNamedVideoTitle`,
`pipeline/avatar/fingerprint.ts`: el `name` de `project.json` en NFC, sin espacios de
más y cortado en `AVATAR_VIDEO_TITLE_NAME_LIMIT` = 80 grafemas con `Intl.Segmenter`, así
ni un emoji compuesto ni una bandera quedan partidos; sin nombre, la marca sola), y el
intento guarda ese título exacto en la misma escritura de la intención, antes del POST
(`AvatarAttempt.title`, aditivo). Cada POST del intento manda el mismo cuerpo bajo la
misma `Idempotency-Key`: el título guardado, aunque el video haya cambiado de nombre, o,
en un recibo de antes de la 2c (que no lo tiene), la marca sola, como salió su POST
original; nada se escribe antes de una repetición. La recuperación (`findOwnVideo`,
`pipeline/avatar/lane.ts`) busca primero el render con el título EXACTO que salió: si el
recibo tiene un título guardado distinto de la marca, una página de
`GET /v3/videos?title=<título guardado>` (la OpenAPI dice que el filtro es por
substring; así también sirve si HeyGen filtra por igualdad o por prefijo), y después por
la marca `vimo:<proyecto>:scene-<id>:<hash8>`, hasta tres páginas. El exacto se adopta
con cualquier estado (es el nuestro; si está `failed`, el intento se cierra como con
cualquier render fallido, que HeyGen no cobra). Solo si no aparece, el que termine en la
marca con lo que sea delante (`endsWithAvatarVideoMarker`: HeyGen pudo guardar distinto
el nombre o el separador, y ninguna otra marca de Vimo puede terminar en la nuestra) y
no esté `failed`, el más avanzado (completado, después en curso, después de estado
desconocido; entre iguales, el primero del listado). Una copia hecha en HeyGen
(«`Copia de <título>`») también termina así, pero nunca le gana al exacto, y una
`failed` nunca se elige: si se adoptara, el intento se cerraría y se pagaría otro
render. Un título con la marca en otro lugar no se adopta. **Fallo:** si HeyGen truncara
el título y se perdiera la marca del final, el render no se reconoce ni por el exacto ni
por la marca, y el carril repite la misma clave (gratis dentro de las 24 h de HeyGen, un
pago doble después); sin el exacto, si una copia de HeyGen está tan avanzada como el
render pagado, la elección por estado y orden puede adoptar la copia. **Motivo:** el
pedido del dueño de llevar el nombre del video a HeyGen sin perder la recuperación sin
pago doble.

**Escenas de avatar (ADR-0057):** Kie nunca anima una escena de avatar ni empareja una imagen del prefijo a través de ella. `pipeline/animation/avatar-coverage.ts` (puro, browser-safe) saca a las escenas de avatar de las marcas del planificador (`withoutAvatarSceneIds`) y pasa su tramo como cubierto (`avatarCoveredIntervals`), en el sidecar (`hasAnimationWork` y `generateSceneAnimations`; la marca del prefijo, `needsPrefixMarker`, solo comprueba que la escena no sea de avatar) y en las cuatro utilidades de la UI que planifican clips (rango del editor y su costo de reanudación, galería, panel de la escena y tarjetas del progreso): el planificador rechaza por larga una escena marcada de más de 12 s antes de mirar la cobertura, y una aparición dura de 7 a 60 s, también después del corte (la cola final de menos de 3 s que el corte le pega al avatar ya cuenta en ese máximo). La cobertura cuenta toda escena de avatar, en cualquier estado (planeada, con el pedido en curso, fallida, desactualizada o lista), salvo un tramo que no llega a un cuadro de 25 fps: `avatarSceneSpan` (`pipeline/types/avatar.ts`) es la regla única de «avatar de largo cero» y la comparten el carril, la cobertura, la pista y el visor. El planificador, el render y el visor descartan un clip de Kie heredado bajo cualquier avatar: `timelineBlocks` y `clipAt` aplican la misma regla (`overlapsAnySpan`). **Fallo:** una marca del editor sobre un avatar se descarta sin error.

**Render con avatar (ADR-0057):** `collectRenderScenes` arma primero la candidata de cada escena de avatar con la misma vista que ya usan el timeline y el visor (`toSceneAvatarView`: clip listo, en disco y vigente por narración y por tramo) y la declara con el hueco cuantizado al cuadro, así el chunk la corre a velocidad 1 y nunca la retima. El tramo de toda escena de avatar, en cualquier estado, es suyo: un clip de Kie heredado que lo pise se descarta con un aviso. **Fallo:** sin clip que sirva (planeada, fallida, sin archivo, desactualizada, ilegible o más corta que su tramo menos 1 s —`ANIMATION_CLIP_PAD_SECONDS`, lo único que el chunk rellena con el último cuadro—) la escena sale estática con la vista previa del look (`avatar/look.<ext>`) y un `warn` (`avatar clip is too short` en el último caso); sin esa vista previa, el render y el export de clips fallan con `avatar_render_look_unavailable` (no con `render_missing_images`, ni con `avatar_look_unavailable`, que es el código de Crear: acá el proyecto ya existe y su look no se elige de nuevo), y si además faltan imágenes de escenas comunes gana `render_missing_images` (`clips_no_images` en el export), el camino de siempre. **Subtítulos:** los de una escena de avatar se parten por frase (`detectSentences` sobre `words.json`, recortadas al tramo) porque una aparición habla hasta 60 s; los de las demás escenas salen de su `scene.text`. Reemplazar la narración conserva `scene.text`: después de reemplazarla, los subtítulos de una escena de avatar salen de la transcripción nueva y los de sus vecinas del texto viejo, así que en el borde del avatar puede repetirse una palabra o faltar un subtítulo (la regla del punto medio lo amortigua). **Motivo:** la narración manda y el video no puede quedar con un hueco.

**El avatar en la pantalla de progreso (ADR-0057):** la fase `avatar` (entre imágenes y animación, en morado) se muestra solo con avatar y **por datos** (`hasAvatar` del proyecto, la fase en curso o escenas de avatar), porque una fase saltada nunca queda en `completedStages`: sin eso un proyecto sin avatar reanudado desde disco la mostraría pendiente y la culparía de un fallo. `PipelineAvatarPanel` muestra «Avatar n/m» con la fase del render y su reloj (el tiempo que informa el sidecar más el reloj local; vuelve a 0 entre la cosecha y el pedido nuevo). Los `avatar-scene-*` quedan en `SceneView.avatarActivity` (memoria; no sobrevive al reinicio) y, al terminar el job, un render anunciado que no se cerró (saldo, clave o cancelación) vuelve a «En espera». Tres cosas más que la persona tiene que poder ver y que las filas no dicen: las apariciones que no entraron (`avatarDropped`, que `avatar-planned` anuncia y la interfaz toma como un valor, no suma) salen en una nota siempre que sean más de cero: debajo de las fases cuando el panel del avatar no está a la vista y no hay pausa; si no, lo dice el propio panel o el diálogo de la pausa, también cuando no entró ninguna y la fase se saltea («Ninguna aparición del avatar entró en la narración (N descartadas): el video sale sin avatar»); HeyGen caído o degradado (`avatar-provider-trouble`, una vez por código y corrida) sale como un aviso pasajero traducido, uno a la vez, además del log; y si el job termina en `avatar_incomplete` con un rechazo que reanudar no arregla como código dominante (moderación, look no soportado o pedido inválido), la cabecera no manda a «Reanudar» sino a renderizar desde el editor —sale con la imagen fija— o cambiar el look (`failureMessageOf`, `create.errors.avatarRejected`; con un código de la cuenta dominando, el texto de ese código). El reproductor de la biblioteca usa la misma cabecera para el mismo proyecto.

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

Con avatar, el evento trae `avatarSpans` (dónde aparece, ya ajustado a frases y con
los tramos libres de menos de 3 s absorbidos, la cola incluida) y `suggestedScenes`
cuenta sus escenas (las imágenes a generar son `suggestedScenes − avatarSpans.length`);
confirmar otra cantidad o duración solo reparte las escenas libres (ADR-0057).
`countScenesAroundSpans` (`pipeline/stages/scene-cuts/pins.ts`, puro) cuenta igual que
la fase sin las palabras.

Antes de la pausa la fase emite `avatar-planned { sceneIds, dropped }` (los ids del corte
sugerido y las apariciones que el plan no pudo ubicar), también cuando ninguna entró
(`avatarSpans: []`): así la persona se entera antes de pagar las imágenes. La corrida que
corta —tras confirmar, sin pausa o reusando el corte previo— lo emite una vez más con los
ids finales, y con el corte ya hecho `dropped` cuenta las apariciones pedidas que le faltan
a ESE corte (`droppedAppearances`, en `pins.ts`: las del plan menos las escenas de avatar
del corte, nunca negativo): con un corte nuevo es lo mismo que el plan, pero uno reusado con
sus recibos tras reemplazar la narración no dice «3 no entraron» con las tres apariciones
todavía en el video. La interfaz lo toma como un valor (set, no suma). La pausa no guarda
el plan: al reiniciar la app, o al abrir un proyecto en pausa desde la biblioteca,
`video-project-status` devuelve `avatarSpans` y `avatarDropped` recalculados desde
`words.json`, las opciones y la duración medida (el planificador es puro, así que da el
mismo plan que anunció la pausa): los tramos y las descartadas del plan mientras se espera
la confirmación, y los tramos de las escenas de avatar del corte con las pedidas que le
faltan cuando ya está hecho. Solo con avatar automático (`placement: 'auto'`) y un
`words.json` legible, con cada palabra con sus dos tiempos finitos: el recálculo va dentro de
un `try` y un archivo roto deja el estado sin esos dos campos en vez de hacerlo fallar (el
proyecto se abre igual). No se persiste nada nuevo en `project.json`.

La interfaz dice dónde sale el avatar (`AvatarSpansNote`: «El avatar aparece 3 veces
(0:00–0:11, …)») y lo que cobra HeyGen por esos tramos (`avatarSpansCostEstimate` sobre los
`avatarSpans` y la tarifa del look elegido: la misma cifra que la fase compara con el saldo,
contada en cuadros como ella). Con `avatarSpans` vacío —ninguna aparición entra— dice
«Ninguna aparición del avatar entra en esta narración (N descartadas)» y que se puede
cancelar y acortar las apariciones o alargar la narración; con tramos, suma «N apariciones
no entraron» si las hubo; sin avatar (sin `avatarSpans`), la nota no dibuja nada. El paso de
segundos cuenta el «≈ N escenas» local con `countScenesAroundSpans` hasta que llega la vista
previa exacta, y el diálogo por cantidad con avatar muestra «≈ N escenas en total · M
imágenes a generar (las apariciones del avatar no llevan)» con la misma cuenta que corta
(`countStepSceneEstimate`): una cantidad menor que la mínima —una escena por tramo libre más
las apariciones— se acota y se dice.

**Planificador de apariciones (ADR-0057; entrega 2b, decisiones del dueño y rulings del
2026-10-11):** `planAvatarSpans` (`pipeline/avatar/planner.ts`, puro y determinista)
arma cada aparición con frases enteras de `detectSentences`. Cada aparición del reparto
arranca en la frase más cercana a su ancla **desde la que cabe**, antes o después de él
(`nearestFittingSpan`): una frase desde la que la aparición pasaría los 60 s o no
llegaría a 7 s se saltea, y la aparición va a `dropped` solo si ninguna frase de la zona
sirve; la apertura no tiene alternativa (arranca en 0 o se descarta). **Tope de
silencio:** una aparición no carga más de `AVATAR_MAX_PAUSE_SECONDS` (2 s) después de la
última palabra de una frase. Cada `NarrationSentence` trae `lastWordEndSeconds` (el fin
de su última palabra en `words.json`, sin llevar al cuadro) y su fin recortado es
`min(endSeconds, cuadro(lastWordEndSeconds + 2 s))`, nunca antes de su inicio; una frase
recortada cierra la aparición (la siguiente no se suma, ni para llegar al mínimo), y el
hueco de 10 s hasta la siguiente se cuenta desde ahí. El tope nunca deja una cola corta:
si el fin recortado queda a menos de 3 s (`MIN_SECONDS_PER_SCENE`) del fin del audio, el
tramo llega al fin de la frase, porque `pinnedTimeline` absorbería esa cola en el
avatar, y el mínimo se sigue midiendo hasta el fin recortado, así una última frase casi
muda no se vuelve aparición. **El máximo** (60 s, regla del dueño) se mide con lo que le
deja el corte: una aparición que terminaría a menos de 3 s del fin del audio se mide
hasta el fin del audio, haya o no tope de silencio; si ni así entra, se queda una frase
antes o, sin otra frase desde la que quepa, va a `dropped`. El silencio inicial de la
primera frase no se recorta, y una pausa larga ADENTRO de una frase de 15 s o menos la
aparición la carga entera (el tope mira solo la pausa después de la última palabra). En
los **subtítulos** de una escena de avatar (`sceneCues`), cada frase cuenta por el punto
medio de su parte hablada (de su inicio a `lastWordEndSeconds`): la frase recortada
termina después de la escena y, medida entera, sus palabras no se subtitularían en
ningún lado. El tope no cambia el plan cuando todas las pausas son de 2 s o menos; la
regla de la frase más cercana desde la que cabe y la del máximo sí pueden cambiarlo sin
pausas. Sin avatar nada cambia (el planificador y las frases solo corren con
`options.avatar`; las escenas de imagen subtitulan como siempre).

**El tope de silencio en el corte** (`check-scene-pins.mjs`): el silencio que el tope
deja fuera de un pin es el comienzo del tramo libre siguiente y el carril lo corta como
siempre, así que las ventanas que caen enteras en el silencio salen como escenas de
imagen sin palabras, con el prompt de sus vecinas (frases 0–5, una palabra a los 5 s con
silencio hasta los 15 y 15–25: avatar 0–7,44 e imágenes mudas 7,44–10,44 y 10,44–13,44
con el carril de 3 s), también la cola final de 3 s o más (avatar 0–9,96 e imagen muda
9,96–15). Una última frase cuyo fin recortado queda a menos de 3 s del fin del audio
entra si llega al mínimo con ese fin recortado y su escena termina en el fin del audio
(5–15 cuando habla hasta los 10,95); casi muda (recortada, 5,96 s) no hay aparición y el
video son solo imágenes. Ninguna aparición pasa los 60 s después de que el corte le
pegue la cola final: con la última frase 55–61 que habla hasta los 57,95 queda 0–55 y la
imagen 55–61, y sin pausas, con una frase final de 0,75 a 2,75 s, 0–55 en vez de 0–59,6.

**Cortes alrededor del avatar (ADR-0057):** la fase planifica las apariciones sobre las
frases de la narración (`planAvatarSpans`) y las fija como _pines_
(`pipeline/stages/scene-cuts/pins.ts`); lo libre entre pines lo corta el carril elegido
—segundos, cantidad o prefijo animado— acotado a cada tramo, con ids contiguos y el
texto de cada escena por su punto medio. Un tramo libre de menos de 3 s lo absorbe el
avatar (la cola del audio también; el planificador ya la cuenta en el máximo de 60 s,
así que ninguna aparición lo pasa después del corte); una cantidad confirmada se
reparte entre los tramos libres por promedios mayores (D'Hondt), con mínimo una
escena por tramo. Con prefijo
animado, las fuentes de 3 s se miden desde el inicio de cada tramo hasta el segundo del
video donde termina el rango, y la fuente sobrante de menos de 3 s se une a la anterior
(salvo si es la única del tramo o si cierra el audio). Un corte previo con recibos o clip
de HeyGen (o con la fase `avatar` cumplida) se conserva; uno distinto sin nada pagado se
rehace. En el carril de segundos, una confirmación por cantidad se traduce a los segundos
equivalentes sobre el audio libre (los tramos libres, con los cortos ya absorbidos) y las
escenas libres (la cantidad menos los pines, al menos una), no sobre el audio entero
(`secondsForConfirmedCount`). Las frases (`detectSentences`) se miden en cuadros de 25 fps:
una palabra recortada al fin del audio nunca queda como una frase de 0 cuadros (se une a la
anterior) y las frases, el planificador y los pines comparten, del lado del avatar, un único `TIME_EPSILON` (los planificadores de Kie conservan los suyos)
(`pipeline/animation/timing.ts`, browser-safe). Sin avatar el corte sale byte por byte como
antes.

**Imágenes de menos de 3 s:** sin prefijo animado, el carril de segundos y la cantidad
automática no las dan (tampoco la explícita, hasta lo que cabe en los tramos libres); una
cantidad explícita por encima de eso acorta las escenas parejo, como sin avatar. Con
prefijo animado y avatar quedan tres residuales documentados: la única fuente corta de
un tramo que arranca menos de 3 s antes del fin del rango, un resto corto posterior al
prefijo que termina en una aparición (los dos, a lo sumo una vez por video) y la cola
final del audio, igual que sin avatar.

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
`NoCreditsResumePanel`, que re-lee el saldo antes de relanzar. Con el avatar
presentador (ADR-0057), `avatar_insufficient_credits` cae en el dominio
`avatar` (la billetera de HeyGen, en dólares): la fase lee el saldo antes de
pagar cada escena y pausa; al reanudar, `estimateResumeCost` cuenta todas las
escenas de avatar sin clip y el aviso lo dice como techo («necesitás hasta X»),
porque la vista no trae los recibos y un pedido ya pagado se cosecha sin cobro
nuevo; con el corte hecho y ninguna escena de avatar (ninguna aparición entró) no
pide nada de HeyGen: la fase no tiene qué cobrar.

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
El comando `avatar-render-scenes { projectId, sceneIds }` (ADR-0057) genera o
regenera el avatar de escenas puntuales con el mismo carril y los mismos
recibos que la fase `avatar`; como `animate-scenes`, toma el lease compartido
de animación: las lecturas siguen disponibles y una escritura exclusiva falla
con `animation_project_busy` hasta que termine. Una escena lista con el mismo
pedido no se vuelve a pagar; una desactualizada pide un render nuevo. Sus
`sceneIds` se validan en un solo lugar (`requestedAvatarSceneIds`: una lista no
vacía de enteros, cada uno de una escena de avatar; sin lista o con un id que no
lo es se rechaza todo con `invalid_payload`, nunca «todas las pendientes»), y a
diferencia de la fase repite con la clave siguiente un render que HeyGen rechazó
para siempre (`retryFinalRejection`): lo pide la persona, no la corrida (su botón en
el editor es de la entrega 3). Marca el mp4 desactualizado solo si una escena recibe un clip nuevo.
Los recibos de HeyGen viven en `scene.avatar` de `scenes.json`: se escriben solo
bajo `withAnimationCheckpointLease` releyendo antes, y lo que reescribe
`scenes.json` entero (los cortes, el reemplazo de narración) corre bajo el lease
exclusivo del proyecto. Reemplazar la narración sube `metadata.narrationVersion`
(toda escena de avatar se lee desactualizada) y, con avatar, escala el corte en
vez de repartirlo uniforme. Una escena de avatar no tiene imagen que regenerar
(`avatar_scene_without_image`: `update-scenes` rechaza además cualquier edición de
su prompt, descripción, personajes, modelo o calidad de imagen con el mismo código,
sin aplicar el resto del lote) y, con clip o recibos, sus dos fronteras no se mueven
(`avatar_timing_locked`). En el editor, el panel de una escena de avatar muestra su
In/Out de solo lectura y no la sección de animación (Kie nunca la anima), y la
galería, el aviso de imágenes faltantes y las dos vías de «Regenerar imagen» no la
cuentan (`sceneImageEditable`). El export para editar saca la escena de avatar como su
clip o como el look, igual que el video final, y falla con
`avatar_render_look_unavailable` si no tiene ninguno.

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
| Módulo `avatars` (Avatares)                        | en construcción — ADR-0057 entrega 1 (con los ajustes de la 1b): biblioteca de avatares de HeyGen en `<carpeta raíz>/avatars/`, donde un avatar es un grupo de HeyGen con sus looks y un look principal (una carpeta por avatar con `metadata.json`, `preview.<ext>` y `looks/`): avatares de stock de HeyGen, creación desde una foto (1,32 USD, con aviso de moderación), look principal elegible, looks nuevos desde un prompt, saldo de HeyGen en la vista y borrado; la clave `heygen` (categoría `avatar`) se valida en Rust contra `GET /v3/users/me`. Entrega 2: el avatar dentro del video —sección «Avatar presentador» en Crear con el look elegido, escenas de avatar que HeyGen renderiza con el look tal cual sobre la narración (fase `avatar`) y su bloque morado en el timeline—; entrega 2b (QA del dueño, 2026-10-11): el stock público se filtra por categoría (`avatar-stock-types`) y por favoritos, cada look abre en un reproductor y las tarjetas se mueven al pasar el mouse; Crear conserva el formulario al navegar; el planificador no carga más de 2 s de silencio ni pasa los 60 s; entrega 2c: eliminar el avatar de HeyGen, el formato de cada look y el botón «Look» de Crear (ver «Biblioteca de avatares» y «Subcomandos de avatares» en §5); la entrega 3 (desde el editor) está pendiente.             |
| FFmpeg y yt-dlp empaquetados                       | listos para **macOS arm64, macOS x64 y Windows x64** — ADR-0013 / ADR-0026 / ADR-0034: `scripts/fetch-binaries.mjs` los descarga con URL y SHA-256 pineados por target triple (firma ad-hoc en macOS en desarrollo; en CI Tauri los re-firma con Developer ID y notariza el DMG) y los deja como `externalBin`; Rust los resuelve junto a `current_exe` con el sufijo de la plataforma y los inyecta en `PipelineJob.binaryPaths`. Los instaladores (NSIS de Windows y DMG de macOS arm64 e Intel) salen del workflow `.github/workflows/build-desktop.yml`, con los targets declarados en `scripts/release-targets.mjs`; un tag `v*` además firma los artefactos y publica `latest.json` para el updater de la app (ADR-0027, módulo `settings`). Pendientes: Linux, firma Authenticode y la revisión GPL→LGPL de ffmpeg                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Módulo `videos` (Create)                           | listo — ADR-0013: pantalla completa de creación (formulario con guion o audio propio, estilo, escenas, proveedor de imagen, selector de voz y de hasta 2 personajes, música y overlay), progreso en vivo por fases con grilla de escenas, pausa de confirmación de escenas, cancelar y reanudar, y panel del video terminado. La tarea vive en un store con `localStorage` y sobrevive a navegación y reload. Desde 2026-09-03 la pantalla de progreso calca la del origen (rama 7 de ADR-0016, port visual de `vimo-ui-pipeline`): página entera con cronómetro que descuenta la pausa, fases a la izquierda y un panel por fase, grilla de imágenes con visor a pantalla completa, paso de segundos por escena inline y el error dentro de la pantalla. Entrega 1 de gemas por secciones (ADR-0048), tras `features.gemTemplate`: modal de Mi estilo por secciones, migración de gemas viejas, `vimoServerFetch` y `useAccessFeature` en `common`. Entrega 2 (ADR-0039 Aceptada), tras `features.newCatalog`: pestaña Catálogo nueva con las 38 gemas de `pipeline/prompts/catalog-gems/` como tarjetas del carril de Mi estilo, «Ver» (muestras, etiquetas, modo de personaje recordado por estilo) y «Pasar a mi estilo» (`catalog-styles-list`, `catalog-style-copy`); el catálogo viejo sigue con el interruptor apagado y en la demo. |
| Runner de stages y las 8 fases                     | listos — ADR-0013: `pipeline/runner/run-stages.ts` + `pipeline/stages/` (voice, transcription, scene-cuts, scene-prompts, images, avatar, animation, render; ADR-0045, ADR-0057) con el registro declarativo en `stages/registry.ts`. Toda fase es retomable por `skip()`; los guards de gasto del origen se conservan textualmente (anti-doble-gasto del TTS, concat con re-encode, cosecha de tarea Evolink ya pagada, `-t` explícito en el render)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Módulo `videos` (Library)                          | listo — ADR-0014: biblioteca completa (grilla con estados y borrado en lote, partida en dos pestañas por formato desde 2026-09-08 —«Formato largo» con tarjetas 16:9 y «Shorts» con tarjetas 9:16 en una columna más—, la pestaña se recuerda en `localStorage` y queda en la del último proyecto creado; reproductor con velocidades, pantalla de progreso rehidratable) + editor (regeneración selectiva de imágenes con prompt propio y modelo/calidad por escena, drag de fronteras en el timeline, re-render con cache de chunks, export de clips a `clips/`, reemplazo de narración con re-transcripción, música IA/YouTube/archivo, mezcla de volúmenes y offset). 11 subcomandos nuevos en `pipeline/commands/videos/` sin tocar Rust; flag `videoOutdated` en `project.json`. Pendiente: prueba con claves reales en build instalado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Modo demo (`videos` + sidecar)                     | listo — ADR-0029 + ADR-0030: entrada «Demo» del sidebar (flag `demo` del veredicto de vimo.click: administradores y `demo_accesos`), puerta `/create-demo` que descarga una sola vez el pack v3 (318,7 MB, SHA-256 pineado; raíz v2 con cuatro historias 16:9 más `short/` con cuatro shorts 9:16) a `<carpeta raíz>/_demo-pack` y siembra la gema del pack en `_styles/demo-storytelling/`, Crear pre-llenado desde el manifest (la historia sigue a formato y estilo; «Subir mi audio» ya cargado con el audio de la historia) y `run-video-pipeline` simulando las seis fases (~40 s) con los archivos del pack, sin claves ni proveedores; regenerar imágenes y cambiar narración se rechazan (`demo_project`). Dominio `pipeline/commands/demo/` (`demo-status`, `demo-prepare`, `run-demo-pipeline`) sin tocar Rust. Guard `pnpm check:demo` (19 secciones) y armador `pnpm build:demo-pack`                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Mantené esta tabla al día: es lo que le dice a quien llega —persona o agente— qué puede
dar por hecho y qué no.
