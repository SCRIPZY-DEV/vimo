# Arquitectura

Fuente de verdad sobre **cómo está construido** este sistema y **cómo fluye**. Se lee
antes de tocar código.

Este documento es de referencia: describe la forma del sistema. Las **reglas** para
escribir código están en [CLAUDE.md](../CLAUDE.md), y las **decisiones** con su
justificación en [docs/adr/](adr/).

> [!IMPORTANT]
> **Cambio de dirección (2026-08-13,
> [ADR-0007](adr/ADR-0007-invoke-reemplaza-al-servidor-local.md)), materializado por la
> [ADR-0010](adr/ADR-0010-pipeline-por-stages-y-migracion-por-modulos.md):** el
> servidor local Hono (ADR-0002) queda **reemplazado**. El puente entre la app y el
> sistema operativo es `invoke()` de Tauri, y el pipeline se reescribe guiado en
> `pipeline/` como **sidecar Node por job** — sin servidor HTTP, sin puerto: Rust lo
> lanza, le pasa el job por stdin y reenvía su progreso NDJSON por el `Channel` del
> invoke. El entitlement firmado desaparece como concepto. La mecánica actual y la
> receta para extender el pipeline están en la **sección 4**. La sección 5 todavía
> describe el flujo del servidor viejo y se reescribirá cuando se migre Create +
> stages; hasta entonces, ante conflicto mandan las ADR-0007 y ADR-0010.

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
├── scripts/               build-sidecar.mjs: empaqueta el sidecar (Node SEA → externalBin)
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
├── commands/              subcomandos por dominio: <dominio>/ con sus handlers y su mapa subcommands.ts (hoy: music/, voices/, characters/)
├── stages/                (pendiente) voice, transcription, scene-cuts, scene-prompts, images, render
├── providers/             estrategia por servicio externo: llm/ (DeepInfra), music/ (Evolink), tts/ (DubVoice: Minimax · ElevenLabs · Edge), image/ (Fal · Evolink)
├── prompts/               prompts de sistema como plantillas versionadas
├── config/                PipelineConfig + ApiKeys + BinaryPaths, con defaults inyectables
├── types/                 tipos del dominio (json, llm, music, voices, characters, images)
└── utils/                 utilidades compartidas (sanitización de nombres, números a palabras para TTS)
```

Guards del contrato (ADR-0010, aplicados también por ESLint): nada en `pipeline/`
lee `process.env` ni escribe a consola — la config viaja en el `PipelineJob` y todo
output es un evento NDJSON del emitter.

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
    ├── common/              lo transversal: fetcher, queryClient, supabase, UI, brand
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

Es el único flujo del producto. La interfaz **dispara y observa**; el sidecar
**ejecuta**. Cada paso indica qué hace cada lado.

### Arranque de la aplicación

1. Rust lanza el sidecar del servidor pasándole un **puerto libre** —nunca uno fijo—, el
   directorio de trabajo y la ruta del binario de FFmpeg.
2. El sidecar informa su puerto y queda escuchando en `127.0.0.1`.
3. La interfaz **espera un health check** antes de la primera petición: el sidecar tarda
   en levantar y disparar antes provoca fallos intermitentes.
4. Al cerrar la aplicación, Rust detiene el sidecar. Un sidecar huérfano corriendo tras
   el cierre es un fallo, no un detalle.

Si el sidecar no arranca o no responde, la interfaz lo dice explícitamente y **no
permite generar**. No hay modo degradado: sin sidecar no hay video.

### Fase 0 — Sesión y configuración

- **La interfaz** exige sesión iniciada (Supabase), reúne las entradas del formulario
  —guion, estilo visual, número de imágenes y opciones de proveedores— y verifica que
  estén cargadas las claves necesarias.
- Si falta una clave, lleva al usuario a la pantalla de ajustes en lugar de arrancar un
  trabajo que va a fallar.

La comunicación con el sidecar **no lleva autenticación**: escucha en localhost y sirve
a un único usuario, el que ya está frente a la aplicación.

### Fase 1 — Voz, música y overlay

- **El sidecar** genera en paralelo la narración con el proveedor de TTS, descarga la
  música de fondo y, si corresponde, el video de overlay.
- **La interfaz** muestra la fase en curso. Si la música o el overlay eran obligatorios y
  fallaron, el trabajo se aborta con un error explícito, no con un estado ambiguo.

### Fase 2 — Transcripción palabra a palabra

- **El sidecar** transcribe la narración con marcas de tiempo por palabra, usando el
  proveedor externo. Esto es lo que después permite sincronizar cada imagen con lo que se
  está narrando.
- **La interfaz** solo refleja el avance.

### Fase 3 — Cortes por tiempo

- **El sidecar** divide la duración total en N escenas de igual duración y agrupa las
  palabras dentro de cada una según sus marcas de tiempo.
- **La interfaz** sugiere el número de imágenes recomendado (aproximadamente una cada 3
  segundos) y deja que el usuario lo confirme o lo cambie **antes** de disparar. Nunca a
  mitad del proceso: no se espera una respuesta interactiva con el trabajo ya corriendo.

### Fase 4 — Prompts de imagen

- **El sidecar** genera, con un modelo de lenguaje, el prompt de imagen de cada escena,
  usando el guion completo como contexto para que el fragmento no quede fuera de lugar.
- **La interfaz** muestra el avance por escena.

### Fase 5 — Generación de imágenes

- **El sidecar** genera una imagen por escena con el proveedor elegido, reintentando y
  reformulando los prompts rechazados por filtros de contenido.
- **La interfaz** muestra cuántas escenas llevan imagen sobre el total. Es la fase más
  larga: el progreso tiene que ser granular, no una barra indeterminada.

### Fase 6 — Render final

- **El sidecar** invoca a FFmpeg para ensamblar el video: movimientos de cámara,
  concatenación, mezcla de voz y música, y el filtro de color del estilo elegido.
- **La interfaz** muestra el avance y, al terminar, ofrece reproducir el resultado o
  guardarlo con el diálogo nativo de Tauri.

Como todo ocurre en la misma máquina, el MP4 no viaja por la red: ya está donde tiene que
estar.

### Reanudar un trabajo interrumpido

El estado del trabajo lo lleva el **sidecar**, en el `checkpoint` que escribe en el
directorio de trabajo. La interfaz **no** guarda progreso propio que pueda quedar
desincronizado.

El sidecar sobrevive a recargas de la webview y a la navegación entre vistas, **pero no
al cierre de la aplicación**: se detiene con ella y el trabajo se interrumpe. Al volver a
abrir, la generación se retoma desde la última fase completada gracias al checkpoint.
Conviene advertir al usuario antes de cerrar con un trabajo en curso.

### Contrato con el sidecar

Lo que ya está decidido:

- **Asíncrono**: el `POST` de generación devuelve un id al instante, nunca bloquea.
- **Progreso por consultas periódicas** contra un endpoint de estado. Alcanza con
  TanStack Query; no hace falta SSE ni WebSocket.
- **Una generación a la vez**, sin cola ni base de datos: el `checkpoint` en disco es el
  estado.
- **Sin autenticación**, por ser localhost y un solo usuario.

Lo que falta fijar, y conviene hacerlo antes de implementar la vista de generación:

- Los nombres y las formas exactas de los endpoints.
- La **forma de los errores por fase**, para poder mostrar mensajes útiles en lugar de un
  «algo falló».
- Dónde se guardan las claves del usuario en la máquina y cómo las lee la interfaz.

---

## 6. Estado de la migración

Este documento describe el destino. El código todavía no llegó ahí:

| Pieza                                              | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React 19 + TypeScript + Vite                       | listo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Tauri 2 con la ventana de la aplicación            | listo (identifier y tamaño de ventana propios)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ESLint, Prettier y el alias `@/`                   | listo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Convenciones de código ([CLAUDE.md](../CLAUDE.md)) | listo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Estructura modular en `src/`                       | fundaciones + layouts listos: `router/`, `i18n/`, `layouts/` (Authenticated/Guest), `modules/common` (ui, doodles, theme, brand, fetcher, queryClient, supabase) y módulos `auth`/`videos`/`setup` (`home` eliminado)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Layouts y vistas base                              | Login, Callback, AccessDenied y Splash con lógica real; Create (videos) y PageNotFound maquetadas; sidebar/navbar funcionales — ADR-0005                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| React Router, TanStack Query, Tailwind             | instalados y configurados (hash router con loaders como guards; primeras query keys: `authQueryKeys`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Autenticación (módulo `auth`)                      | lista — ADR-0006: OAuth Google doble flujo (web + deep link `vimo://`), verificación de acceso contra vimo.click, gate por loaders, logout, vista License. Pendiente: cold start del deep link                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Módulo `costs` (catálogo local)                    | listo pero **retirado de la UI** — ADR-0008: comparativa de precios con dataset local (`catalog.ts`), 4 tabs + filtros. Fuera del router y del sidebar (`hidden` en `layouts/AuthenticatedLayout/constants.ts`) mientras se redefine el modelo de precios; el código sigue completo y typechequeado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Módulo `settings` (carpeta de proyectos)           | listo — ADR-0009: carpeta raíz única (default `~/Documents/Vimo`) con dialog/fs/store; en web se muestra deshabilitado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Módulo `api-keys` (claves de proveedores)          | listo — ADR-0011: dashboard con catálogo único (`providers.ts`), claves en el keychain del SO (`keyring`; Android vía plugin local `tauri-plugin-secure-keys`), validación en Rust con reqwest; primeros comandos `invoke` del repo (`src-tauri/src/api_keys/`); en web se muestra deshabilitado. Pendiente: probar el plugin Android en emulador (falta `tauri android init`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Infraestructura de i18n (`src/i18n/`)              | lista con i18next + catálogos `public/locales/{es,en,pt}.json` — ADR-0004                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Plugins de Tauri                                   | `deep-link`, `opener`, `dialog`, `fs`, `store` instalados y configurados (scheme `vimo`, capabilities con scope `$HOME/**`); `shell` solo del lado Rust para el spawn del sidecar (sin capability al webview)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Backend local / pipeline                           | **redirigido por ADR-0007, en curso por ADR-0010**: fundación lista — `pipeline/` (contratos job/eventos, providers `llm` DeepInfra, `music` Evolink, `tts` DubVoice e `image` Fal/Evolink, prompts, config inyectada), sidecar con subcomandos **empaquetado como binario único Node SEA** (`externalBin`, regenerado por los hooks de dev/build), y comandos genéricos `start_pipeline_job`/`cancel_pipeline_job` (`src-tauri/src/pipeline/`) que reenvían el NDJSON por el `Channel` del invoke (un canal por job, sin canal global); la capa compartida de la UI vive en `src/modules/common/fetcher/pipeline.ts` (`startPipelineJob`/`runPipelineJob`); las claves se cachean en memoria por sesión (menos prompts del keychain). Pasos 1 a 4 (AI Music, Voices, Characters) hechos; sigue Library; las stages y el runner llegan con Create |
| Módulo `music` (AI Music)                          | listo — ADR-0010 paso 2: pantalla completa (formulario Suno, sugerir prompt vía LLM, generación con progreso y cancelación, chooser de variaciones, historial en `<carpeta raíz>/_history/music/` con audio/cover/metadata, saldo de créditos); primeros jobs reales del sidecar (6 subcomandos en `pipeline/commands/`); asset protocol habilitado (scope `$HOME/**`) para reproducir el audio local con `convertFileSrc`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Módulo `voices` (Voces TTS)                        | listo — ADR-0010 paso 3: explorador de voces de DubVoice (Minimax · ElevenLabs · Edge) con filtros, favoritos e historial en `<carpeta raíz>/_history/voices/`; probador con progreso y cancelación; saldo de créditos. Las muestras suenan desde la URL del proveedor: los previews precomputados del origen (81 MB) y su síntesis con créditos no se portaron, y Edge queda sin muestra                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Módulo `characters` (Personajes)                   | listo — ADR-0010 paso 4: biblioteca de identidades en `<carpeta raíz>/characters/` (una carpeta por personaje con `metadata.json` y un preview por estilo); el "experto" redacta la identidad neutra de estilo con el LLM en tier premium, y los previews estrenan los providers de imagen (Fal · Evolink) con la regla de oro de los proveedores pagos. El modo con foto de referencia y el selector de hasta 2 personajes llegan con Create                                                                                                                                                                                                                                                                                                                                                                                                     |
| FFmpeg empaquetado por plataforma                  | sin empezar (viajará como `externalBin` y su ruta entra al sidecar por `PipelineJob.binaryPaths` — ADR-0010)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Mantené esta tabla al día: es lo que le dice a quien llega —persona o agente— qué puede
dar por hecho y qué no.
