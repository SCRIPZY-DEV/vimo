# ADR-0029 — Modo demo: pipeline simulado sobre un pack pre-hecho, con acceso decidido por vimo.click

- **Estado:** Aceptada
- **Fecha:** 2026-09-10
- **Área:** app / pipeline
- **Completa a:** [ADR-0006](ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md),
  [ADR-0013](ADR-0013-modulo-create-runner-de-stages-y-binarios.md),
  [ADR-0018](ADR-0018-estilos-visuales-propios-fase-basica.md)
- **Extendida por:** [ADR-0030](ADR-0030-pack-v3-historias-short-y-narracion-precargada.md)
  (pack v3 con historias Short bajo `short/`, audio pre-cargado en «Subir mi audio» y
  armador propio del repo). Lo que acá dice sobre la raíz del pack sigue vigente.

## Problema

Los closers y mentores muestran Vimo en vivo frente a prospectos: necesitan ver un
video «generándose» de punta a punta en menos de un minuto, en una máquina sin claves
API y sin gastar un centavo en proveedores. El Vimo original (Electron, v1.37.0 a
v1.48.2) lo resolvía con la **Ruta Demo**: una entrada del sidebar visible solo para
correos habilitados, que descargaba una vez un pack con cuatro proyectos ya generados
y, al pulsar «Generar», simulaba las fases reales durante ~40 s mientras materializaba
el video pre-hecho. La app nativa no lo tiene, y la carpeta `~/Documents/vimo-ruta-demo`
guarda esa implementación extraída verbatim para portarla.

Restricciones que achicaron el campo:

- **El sidecar se toca quirúrgicamente y Rust no se toca**: `start_pipeline_job` es
  genérico (ADR-0010) y el camino real de `run-video-pipeline` no puede cambiar.
- **Nada del sistema**: el pipeline nunca depende del PATH (ADR-0013), así que no hay
  `unzip` para el pack; Windows además no lo trae.
- **El acceso lo decide vimo.click, nunca la app**: todo administrador ve la demo, y
  hay que poder habilitar correos sueltos desde el panel del landing, sin SQL.
- **El pack v2 ya está publicado** (release `demo-pack-v2` de `otd20071-cloud/vimo-releases`,
  208,8 MB, SHA-256 fijo) y sigue sirviendo al Vimo original: el mismo zip alimenta
  las dos apps.
- **Sin claves y sin probe de voz**: la demo corre en una máquina limpia; ninguna fase
  puede tocar un proveedor.
- **Indistinguible de una corrida real**: mismas pantallas de progreso, biblioteca y
  editor; por eso emite los mismos eventos del contrato, no una pantalla aparte.

## Decisión

**La demo es una variante del dominio «crear video»: una vista puerta en el módulo
`videos` prepara un pack pre-hecho en `<carpeta raíz>/_demo-pack`, entra a Crear
pre-llenado y marca el proyecto con `options.demo`; el sidecar, al ver ese flag en
`run-video-pipeline`, reemplaza las stages por un guion de simulación de ~40 s que
copia archivos del pack y emite los eventos nativos de siempre. El flag `demo` del
veredicto de acceso —administrador o correo en `demo_accesos`— es lo único que
muestra la entrada.**

### Forma

```
sidebar «Demo» (DoodlePlay; solo con access.demo)
   │ Link
   ▼
/create-demo  CreateDemo (puerta) ── demo-status ──► ¿pack listo?
   │                                                    │ no
   │                                    demo-prepare: descarga 209 MB con % ─► SHA-256
   │                                    ─► extrae a .tmp ─► rename atómico ─► siembra gema
   ▼ sí / al terminar
/create con state.demo = manifest ─► formulario pre-llenado ─► create-video-project {…, demo: true}
   │
   ▼
run-video-pipeline ── options.demo === true ──► run-demo-pipeline
                                                 6 fases simuladas (~40 s), copia del pack,
                                                 mismos eventos que las stages reales
   │
   ▼
job-completed { videoPath } ─► biblioteca / editor
                               (regenerar imágenes y cambiar narración: demo_project)
```

| Componente                        | Estado | Ubicación                                                                                                                               | Para qué                                                                                                                                                                                                                                                      |
| --------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flag `demo` en el veredicto       | cambio | vimo-landing `functions/api/verificar-acceso.ts`                                                                                        | `demo: tieneDemo \|\| esAdmin` en las dos respuestas autorizadas; `esAdmin` ya se calculaba                                                                                                                                                                   |
| Endpoint `admin/demo-accesos`     | nuevo  | vimo-landing `functions/api/admin/demo-accesos.ts`                                                                                      | GET/POST/DELETE sobre `demo_accesos` con `verificarAdmin`, clon del de la allowlist (correo en minúsculas, nota opcional)                                                                                                                                     |
| Sección «Accesos a la demo»       | nuevo  | vimo-landing `src/components/admin/SeccionAccesosDemo.tsx`, montada en `src/pages/Admin.tsx`                                            | Formulario correo + nota y lista con quitar, en la pestaña Gestión; aclara que los administradores la ven siempre                                                                                                                                             |
| `AccessStatus.demo`               | cambio | `src/modules/auth/types/access.ts`, `src/modules/auth/api/index.ts`                                                                     | `verifyAccess` lee `body.demo === true`; lo recuerda por correo en `localStorage` y lo reutiliza en el veredicto `offline`                                                                                                                                    |
| `DoodlePlay`                      | nuevo  | `src/modules/common/doodles/DoodlePlay.tsx`                                                                                             | Port del ícono del origen sobre `useDoodleDraw` (círculo saffron + triángulo)                                                                                                                                                                                 |
| Ítem «Demo» con `requiresDemo`    | cambio | `src/layouts/AuthenticatedLayout/{types/navigation.ts,constants.ts,components/Sidebar.tsx}`                                             | Entre Música y Claves; `Sidebar` filtra los `requiresDemo` con el veredicto **cacheado** (`useQuery` sobre `authQueryKeys.access` con `queryFn: skipToken`, sin importar hooks de `auth`: el loader del layout ya lo pobló) y solo en app nativa (`isNative`) |
| Ruta y claves del módulo          | cambio | `src/modules/videos/constants.ts`                                                                                                       | `VideosRoutes.createDemo = '/create-demo'`, `videosQueryKeys.demoStatus`, `DEMO_ERROR_MESSAGE_KEYS`, `demo_project` en `LIBRARY_ERROR_MESSAGE_KEYS`                                                                                                           |
| Vista puerta `CreateDemo`         | nuevo  | `src/modules/videos/views/CreateDemo/`, `components/DemoGateCard.tsx`, `hooks/useDemoStatus.ts`, `hooks/useDemoPrepare.ts`              | Consulta el estado, prepara con barra y porcentaje, cancela el job al desmontar y navega a Crear con el manifest en el `state` del router. La protege `requireDemoAccessLoader` (`src/modules/auth/guards.ts`): sin flag, o en modo web, manda a Crear        |
| `createDemoRoute` + loader        | cambio | `src/modules/videos/routes.ts`, `src/router/index.ts`                                                                                   | El módulo exporta la ruta sin guard; el router (infraestructura) le adjunta el loader de `auth` — un módulo no importa los guards de otro                                                                                                                     |
| `demoStatus` / `startDemoPrepare` | cambio | `src/modules/videos/api/index.ts`, `src/modules/videos/types/demo.ts`                                                                   | Envuelven `demo-status` (`runPipelineJob`) y `demo-prepare` (`startPipelineJob`)                                                                                                                                                                              |
| Crear en modo demo                | cambio | `views/Create/Create.tsx`, `components/{CreateForm,StyleGallery,CustomStyleGallery,VideoFormatSection}.tsx`, `utilities/formPayload.ts` | Pre-llenado desde el manifest; `visibleIds` en la galería; la gema arranca en uso en «Mi estilo»; 9:16 «Próximamente»; sin probe TTS ni bloqueo por claves; `demo: true`                                                                                      |
| Editor con acciones bloqueadas    | cambio | `src/modules/videos/views/LibraryEditor/`                                                                                               | Con `metadata.options.demo`, regenerar imágenes y cambiar narración quedan deshabilitados con tooltip                                                                                                                                                         |
| Contrato del pack y de la demo    | nuevo  | `pipeline/types/demo.ts`                                                                                                                | `DemoManifest`, `DemoStyleEntry`, `DemoVoice`, `DemoStatusResult`, `DemoPrepareResult`                                                                                                                                                                        |
| `options.demo`                    | cambio | `pipeline/types/video-project.ts`, `pipeline/commands/videos/create-video-project.ts`                                                   | `demo?: boolean` en `VideoProjectOptions`; `validatePayload` lo acepta solo como booleano                                                                                                                                                                     |
| Carpeta reservada `_demo-pack`    | cambio | `pipeline/project/paths.ts`                                                                                                             | Entra a `RESERVED_ROOT_DIRECTORIES`: nunca es un proyecto ni aparece en la biblioteca                                                                                                                                                                         |
| Config `demo`                     | cambio | `pipeline/config/pipeline-config.ts`                                                                                                    | `DemoConfig` en `PipelineConfig`/`PipelineConfigOverrides`: `packVersion`, `packUrl`, `packSha256` (los defaults son el pack v2 publicado) y `delayScale` (1 = los ~40 s; el guard la baja a 0). Rust nunca manda `demo`: solo el harness y el guard          |
| Dominio `demo` del sidecar        | nuevo  | `pipeline/commands/demo/{subcommands,demo-status,demo-prepare,pack,download,extract}.ts`                                                | `demoSubcommands` esparcido en `SUBCOMMANDS` de `pipeline/main.ts`; `pack.ts` es el único que conoce el formato v2 del pack (carpetas, nombres, conversión, siembra de la gema)                                                                               |
| Simulación                        | nuevo  | `pipeline/commands/demo/run-demo-pipeline.ts`                                                                                           | El guion de fases; recibe el `CreateVideoContext` ya armado                                                                                                                                                                                                   |
| Rama en el job real               | cambio | `pipeline/commands/videos/run-video-pipeline.ts`                                                                                        | Un guard clause tras `buildCreateVideoContext`: `if (options.demo === true) return runDemoPipeline(…)`                                                                                                                                                        |
| Rechazos `demo_project`           | cambio | `pipeline/commands/videos/{regenerate-scene-images,replace-narration}.ts`                                                               | `PipelineFailure('demo_project')` antes de tocar cualquier proveedor                                                                                                                                                                                          |
| `yauzl`                           | nuevo  | `package.json` (+ `@types/yauzl` en dev)                                                                                                | Lector de zip puro JavaScript y por streaming (una sola dependencia transitiva, `pend`); esbuild lo empaqueta en el SEA                                                                                                                                       |
| Guard ejecutable                  | nuevo  | `scripts/test/check-demo.mjs` (`pnpm check:demo`)                                                                                       | Genera un pack mínimo en una carpeta temporal, lo sirve por HTTP local y corre el sidecar con overrides de `config.demo`; ver Verificación                                                                                                                    |
| Textos                            | cambio | `public/locales/{es,en,pt}.json`                                                                                                        | `layout.nav.demo`, grupo `createDemo.*` (estados, nota, reintentar, `errors.*`), `common.proximamente`, `library.editor.demoLocked`, `library.errors.demoProject`                                                                                             |

### El pack en disco

El zip publicado se extrae **tal cual** en `<carpeta raíz>/_demo-pack/` (raíz detectada
por `manifest.json`, esté suelta o dentro de una carpeta contenedora), junto a un
marcador `.ok` con `{ version, sha256 }`. Versión (`v2`), URL y SHA-256 del pack viven
solo en `DEFAULT_PIPELINE_CONFIG.demo` (`pipeline/config/pipeline-config.ts`); subir
la versión invalida el `.ok` y fuerza una descarga limpia en todas las máquinas.
El formato del origen se traduce al nativo **al copiar**, nunca al extraer:

| En el pack (formato v2)                                                       | En el proyecto nativo                                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `<estilo>/guion.txt`                                                          | ya lo escribió `create-video-project` como `script.txt` (el formulario lo trae)                         |
| `<estilo>/audio.mp3`                                                          | `narration.mp3`                                                                                         |
| `<estilo>/palabras.json` `{word,start,end,confidence}`                        | `words.json` `{word,start,end}`                                                                         |
| `<estilo>/escenas.json` `{id,texto,promptImagen,tiempoInicioSeg,…}`           | `scenes.json` `{id,text,imagePrompt,startSeconds,endSeconds}`                                           |
| `<estilo>/imagenes/imagen_<id>.jpg`                                           | `scenes/scene_<id>.jpg`                                                                                 |
| `<estilo>/video_final.mp4`                                                    | `<slug>.mp4`                                                                                            |
| `gema/estilo.json` `{nombre,systemPrompt,planos,personaje}` + `muestra-N.jpg` | `_styles/demo-storytelling/style.json` (`StoredStyle`) + `sample-N.jpg`, sembrada **solo si no existe** |

`demo-status` devuelve el manifest ya nativo (`voice`, `styles[]`, `customStyle`,
`customStyleId`), con el `script` de cada entrada leído de su `guion.txt`: el
formulario toma **todo** de ahí, y publicar un pack con otras historias no exige tocar
la app. La carpeta del estilo se elige por `options.styleId` (catálogo: `pov_stickman`,
`normal`, `cartoon`) o por `options.customStyle` (gema → `storytelling`); cualquier
otro estilo falla con `demo_style_not_included`. El nombre que ve la persona en «Mi
estilo» es el de la gema del pack (en v2, «STORYTELLING2»), no uno fijo en el código.

### La simulación

`run-demo-pipeline` recorre los seis `STAGE_IDS` en orden, envuelve cada uno en
`stage-started` / `stage-completed`, persiste `completedStages` como el runner real y
respeta `context.signal` en cada espera. Cada archivo se copia **antes** del evento
que lo referencia. Esperas multiplicadas por `config.demo.delayScale`:

| Fase            | Guion (n = escenas del pack)                                                                                                                                        | Deja en disco           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `voice`         | 4 × 1000 ms con `voice-progress` (25/50/75/100 %)                                                                                                                   | `narration.mp3`         |
| `transcription` | 1200 ms + 1300 ms y una línea `log`                                                                                                                                 | `words.json`            |
| `scene-cuts`    | 1500 ms, luego `scenes-planned` con `audioDurationSeconds`; persiste `sceneCount`, `wordCount` y `audioDurationSeconds` en `project.json`                           | `scenes.json`           |
| `scene-prompts` | por escena max(250, 5000 / n) ms, `scene-prompt-ready` + `scene-prompts-progress`                                                                                   | —                       |
| `images`        | tandas de 10; presupuesto por tanda max(1800, 19000 / tandas); por imagen `scene-image-started`, tres `scene-image-progress` (25/55/85), copia, `scene-image-ready` | `scenes/scene_<id>.jpg` |
| `render`        | 4 × 1000 ms con `render-progress` 12/34/58/79 (`chunks`), 600 ms + 92 (`concat`), copia del mp4, 400 ms + 100 (`final`)                                             | `<slug>.mp4`            |

Cierra con `state = 'completed'` y `job-completed { status: 'completed', videoPath }`.
Nunca pausa a confirmar escenas (`confirmScenes` viaja en `false`), nunca toca un
proveedor y no lee `apiKeys`. Cancelar deja `paused` como en una corrida real;
reanudar vuelve a correr el guion completo (las copias son idempotentes).

### Flujo de datos

1. Al arrancar, `verifyAccess` trae `demo`; el sidebar muestra «Demo» solo si es
   `true` y la app es nativa. Sin red, vale el último valor recordado para ese correo
   (el pack ya está en disco y nada se gasta).
2. `CreateDemo` pide `demo-status`. Si `ready`, navega a Crear con `{ demo: manifest }`
   en el `state` del router; si no, lanza `demo-prepare` y pinta `progress.percent`
   hasta el `job-completed`, que trae el manifest. Salir de la vista cancela el job.
3. Crear consume el `state` una sola vez (`useState` inicial), reemplaza la entrada
   del historial para que «atrás» vuelva a un Crear limpio, y pre-llena voz, estilo,
   nombre, guion y escenas desde el manifest. Al cambiar de estilo, el manejador del
   cambio aplica nombre, guion y escenas de la entrada elegida (derivación en el
   evento, sin efecto). `confirmScenes = false`, `autoRender = true`.
4. `submit` saltea el probe de voz y el bloqueo por claves faltantes; el payload lleva
   `demo: true`. `create-video-project` lo valida y lo persiste en `project.json`.
5. `run-video-pipeline` arma el contexto y, con `options.demo`, delega en
   `runDemoPipeline`. Sin pack en disco falla con `demo_not_ready`.
6. La biblioteca lista el proyecto como uno más. En el editor, regenerar y cambiar
   narración se rechazan en el sidecar (`demo_project`) y se muestran deshabilitados;
   renderizar y exportar clips siguen siendo reales (ffmpeg local, sin costo).

## Alternativas consideradas

- **Módulo `src/modules/demo/` separado** (propuesta inicial de `ADAPTAR-A-RUST-TAURI.md`)
  — descartado: Crear necesita el manifest y la puerta necesita entrar a Crear
  pre-llenado; serían imports cruzados entre módulos, prohibidos por CLAUDE.md. La
  demo es Crear con entradas pre-hechas: pertenece al dominio `videos`.
- **Que la vista se proteja sola con `useAccess` y `<Navigate>`** (como `PaginaDemo`
  del origen) — descartado: `useAccess` es un hook de `auth` y `videos` no puede
  importarlo. El loader vive en `auth/guards.ts` y lo adjunta `src/router/index.ts`,
  que ya compone vistas y guards de todos los módulos; la ruta existe siempre.
- **Convertir el pack al formato nativo al extraer** — descartado: el mismo zip sirve
  al Vimo original y el guard valida el formato publicado; la traducción es trivial
  y ocurre al copiar cada archivo.
- **Pack en Application Support** (como el origen) — descartado: el sidecar solo conoce
  `projectsRoot` (ADR-0009); `_demo-pack` sigue el patrón de `_styles` y `_history`.
- **`unzip` o `tar` del sistema** — descartado por ADR-0013 (nunca el PATH) y porque
  Windows no trae `unzip`.
- **Lector de zip propio** — descartado: más código que revisar que la librería;
  `yauzl` es puro JavaScript, por streaming y con una sola dependencia transitiva.
- **Correr las stages reales con el pack copiado como caché** (todo `skip()`) —
  descartado: terminaría en dos segundos y el producto es ver el pipeline «trabajando»
  ~40 s; además algunas stages consultan claves antes de saltear.
- **Lista de correos habilitados en la app** — descartado: cambiarla exigiría un
  release; vimo.click ya administra `admins` y `demo_accesos`.
- **`?demo=1` en la URL** (como el origen) — descartado en favor del `state` del
  router: no hay path literal ni `replaceState` a mano, y el manifest viaja con la
  navegación sin una segunda consulta.
- **Seguir la descarga en segundo plano al salir de la puerta** — descartado por ahora:
  es una descarga única por máquina; si el uso muestra abandonos a mitad, se promueve a
  un store como el de la tarea de creación.

## Consecuencias

- ✅ Demo sin claves, sin gasto y con las mismas pantallas que una corrida real; el pack
  publicado se reutiliza sin republicar.
- ✅ Rust intacto; el camino real de `run-video-pipeline` cambia en un guard clause.
- ✅ Habilitar un correo es un formulario del landing; los administradores no se cargan.
- ⚠️ 209 MB descargados una vez por máquina, bajo la carpeta raíz: cambiar la carpeta en
  Ajustes obliga a descargar de nuevo.
- ⚠️ Los proyectos demo son proyectos reales de la biblioteca con `demo: true` para
  siempre; borrarlos es la única forma de sacarlos.
- ⚠️ El manejo de estado (`generating` → `completed` / `paused` / `error`) se repite en
  `run-demo-pipeline` en vez de factorizarlo: es el precio de no tocar el camino real.
- ⚠️ Una dependencia nueva en el sidecar (`yauzl`).
- ⚠️ El flag recordado sin red sobrevive a una revocación hasta la próxima verificación
  con red (el pack es local y nada se gasta).
- 🔒 `options.demo` solo lo pone el camino de la puerta; nunca es un control del
  formulario ni se edita desde el editor.
- 🔒 La simulación emite **solo** tipos de `pipeline/runner/events.ts`; no se agregan
  eventos nuevos para la demo.
- 🔒 Todo archivo existe en disco antes del evento que lo referencia.
- 🔒 Ningún código `demo_*` entra a `RETRYABLE_ERROR_CODES`: la demo no se reintenta sola.
- 🔒 `_demo-pack` es carpeta reservada: nunca un id de proyecto.
- 🔒 Versión, URL y SHA-256 del pack viven en un solo archivo y se cambian juntos.
- 🔒 El sidecar nunca decide acceso: no hay lista de correos en el código.

## Verificación de cumplimiento

- **Tests:** no hay framework de tests en el repo.
- **Guard:** `pnpm check:demo` (`scripts/test/check-demo.mjs`) corre en local con el Node
  oficial, sobre una carpeta raíz temporal. No hay fixture en el repo: el guard genera
  un pack mínimo (mismo formato v2, 2 escenas por estilo, archivos diminutos), lo
  empaqueta en un zip en memoria y lo sirve por HTTP local, pasando `packUrl`,
  `packSha256` y `delayScale` como overrides de `config.demo`. Asserta:
  1. `demo-prepare` contra ese servidor: `.ok` correcto, raíz detectada aunque el zip
     tenga carpeta contenedora, progreso con fases `download` e `install`, un SHA-256
     distinto termina en `demo_pack_corrupt` sin dejar `.tmp`, un zip sin
     `manifest.json` en `demo_pack_incomplete`, sin servidor en `demo_offline`.
  2. La gema se siembra una vez: un segundo `demo-prepare` no sobreescribe
     `_styles/demo-storytelling/`.
  3. `run-video-pipeline` con `options.demo` y `config.demo.delayScale = 0`: los seis
     `stage-started`/`stage-completed` en el orden de `STAGE_IDS`; cada
     `scene-image-ready` y el `job-completed` con su archivo ya en disco; `project.json`
     termina `completed` con `completedStages` completo; ningún evento de tipo
     desconocido.
  4. Cancelación a mitad de `images`: `project.json` queda `paused` y no hay
     `job-completed`.
  5. `styleId: 'fantasia'` falla con `demo_style_not_included`; sin pack, con
     `demo_not_ready`; `regenerate-scene-images` y `replace-narration` sobre el proyecto
     demo fallan con `demo_project`.
  6. `demo: 'yes'` en `create-video-project` es `invalid_payload`.
- **Guards existentes:** `pnpm check:locales` (las claves nuevas en los tres catálogos),
  `pnpm lint` (sin `process.env` ni `console` en `pipeline/`), `pnpm build` y
  `pnpm build:sidecar` (el bundle minificado conserva los identificadores de la API de
  yauzl; la prueba real es la corrida del checklist manual con el build instalado).
- **Checklist manual** con el build instalado:
  1. Con un correo administrador o cargado desde «Accesos a la demo» del landing,
     reabrir Vimo muestra «Demo» en el sidebar; con otro correo, no.
  2. Primer clic: descarga con porcentaje y barra; segundo clic: entra directo a Crear.
  3. Crear aparece pre-llenado; cambiar de estilo cambia nombre, guion y escenas; el
     Short dice «Próximamente» (hasta ADR-0030: con el pack v3 se elige); con las
     claves vacías, «Generar» funciona.
  4. La generación dura ~40 s con imágenes apareciendo en la grilla y termina con el
     video reproducible; en la biblioteca figura como completado.
  5. En el editor, regenerar y cambiar narración están deshabilitados con tooltip.
  6. Sin red, la entrada sigue apareciendo para un correo que ya la tenía.
- **Cómo se vería una regresión:** la entrada «Demo» aparece para un correo sin flag
  (alguien decidió acceso en la app); la demo pide claves o pausa a confirmar escenas
  (el flag no llegó al `project.json` o la rama no está antes de las stages); una
  imagen «lista» sin archivo en disco (evento antes de la copia); un proyecto llamado
  `_demo-pack` en la biblioteca (carpeta sin reservar); `pnpm check:demo` en rojo.

## Modos de falla

| Situación                                         | Código                    | Qué pasa                                                                                           |
| ------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| Sin red al preparar                               | `demo_offline`            | Mensaje y botón «Reintentar»; nada queda a medias (`.tmp` se borra)                                |
| GitHub responde error o corta la descarga         | `demo_download_failed`    | Ídem                                                                                               |
| SHA-256 distinto al pineado                       | `demo_pack_corrupt`       | Se borra el zip; reintentar descarga de nuevo                                                      |
| El zip no se puede abrir (`yauzl` falla)          | `demo_pack_unreadable`    | Ídem; señal de un pack mal publicado                                                               |
| Falta `manifest.json` o algún archivo obligatorio | `demo_pack_incomplete`    | Ídem; el pack se valida entero antes del rename atómico                                            |
| Generar sin pack (carpeta raíz cambiada, borrado) | `demo_not_ready`          | `job-failed` no reintentable; la puerta lo vuelve a preparar                                       |
| Estilo fuera del pack                             | `demo_style_not_included` | `job-failed`; el formulario en demo solo ofrece los del pack, así que solo pasa por payload a mano |
| Regenerar / cambiar narración de un proyecto demo | `demo_project`            | Rechazo antes de tocar proveedores; la UI ya lo deshabilita                                        |
| Cancelar o cerrar la app a mitad                  | —                         | `paused` / interrumpido como en una corrida real; reanudar repite el guion                         |

## Fuera de alcance

- Shorts (9:16) en la demo: el pack v2 solo trae 16:9 y el botón queda «Próximamente».
  Resuelto por ADR-0030 (árbol `short/` del pack v3).
- Continuar la descarga fuera de la puerta (store global).
- El script que arma un pack nuevo (`armar-demo-pack.ts` del origen): el pack v2 se
  publicó con las herramientas del origen. Desde ADR-0030 el repo tiene su propio
  armador (`scripts/build-demo-pack.mjs`, `pnpm build:demo-pack`).
- Modo web (sin Tauri): la entrada no se muestra y la puerta redirige a Crear igual
  que sin flag (el pack necesita el sidecar).
- Telemetría del uso de la demo.

## Referencias

- [ADR-0006](ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md) — veredicto
  de acceso y fail-open sin red.
- [ADR-0009](ADR-0009-preferencias-nativas-y-carpeta-raiz.md) — carpeta raíz única.
- [ADR-0013](ADR-0013-modulo-create-runner-de-stages-y-binarios.md) — runner, eventos
  y binarios pineados.
- [ADR-0014](ADR-0014-modulo-library-edicion-sobre-stages.md) — jobs del editor.
- [ADR-0018](ADR-0018-estilos-visuales-propios-fase-basica.md) — `StoredStyle` y `_styles/`.
- Origen: `~/Documents/vimo-ruta-demo/` (README, `ADAPTAR-A-RUST-TAURI.md`,
  `servidor/puente/pipelineDemo.ts`, `servidor/rutas/demo.ts`).
- Pack: <https://github.com/otd20071-cloud/vimo-releases/releases/tag/demo-pack-v2>.
