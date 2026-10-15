# ADR-0061 — Demo v4: catálogo nuevo, animación y avatar de ejemplo, y un pack en partes que se baja en segundo plano

- **Estado:** Propuesta (diseño aprobado por el dueño el 2026-10-14 y pack publicado el 2026-10-15; pasa a
  Aceptada con la QA de la app compilada y el merge del PR).
- **Fecha:** 2026-10-15
- **Área:** app / pipeline / distribución
- **Extiende:** [ADR-0029](ADR-0029-modo-demo-pipeline-simulado-sobre-pack-prehecho.md) (modo demo) y
  [ADR-0030](ADR-0030-pack-v3-historias-short-y-narracion-precargada.md) (pack v3). Enmienda la regla 1 de la
  ADR-0030 (la raíz del pack deja de ser el formato v2 congelado) y lo que la ADR-0029 dejó fuera de alcance
  (seguir la descarga fuera de la puerta).
- **Relacionada con:** [ADR-0039](ADR-0039-catalogo-sobre-el-carril-de-mi-estilo.md) (el catálogo sobre el
  carril de Mi estilo), [ADR-0042](ADR-0042-animacion-kie-por-intervalos-y-recibos.md) (animación con Kie),
  [ADR-0057](ADR-0057-escenas-de-avatar-con-heygen-sobre-la-narracion.md) (avatar con HeyGen),
  [ADR-0028](ADR-0028-bloqueo-temporal-de-modelos-de-prompts.md) (bloqueo de modelos) y
  [ADR-0031](ADR-0031-saldo-por-proveedor-precheck-y-pausa-retomable.md) (pre-check de saldo): estas dos últimas
  no aplican en la demo.
- **Diseño:** [docs/handoff/2026-10-14-demo-v4/design.md](../handoff/2026-10-14-demo-v4/design.md).
- **Informe:** [el editor de un proyecto demo reproduce el video final](../fixes/2026-10-15-fix-demo-editor-preview/demo-editor-preview.md).

## Problema

Los closers y mentores muestran Vimo en vivo con la demo (ADR-0029). El pack v3 pesa 334 MB y trae cuatro
historias por formato con el catálogo viejo (tres estilos más la gema de Mi estilo), con videos de 80 s y 42 s,
sin animación y sin avatar. La app real, mientras tanto, pasó al catálogo nuevo (38 estilos sobre el carril de
Mi estilo, ADR-0039), anima el primer minuto con Kie (ADR-0042) y suma un avatar presentador con HeyGen
(ADR-0057): lo que se enseñaba en vivo ya no era lo que el producto hace.

El dueño pidió el 2026-10-14 que la demo vuelva a mostrar lo que hace la app: cada estilo del catálogo con su
propia historia de 1 minuto, en 16:9 y en Short; el switch «Animar el primer minuto» funcionando, con clips a
720p; un ejemplo con avatar presentador; y un Crear con el mismo aspecto que el real. Son 79 videos con su
variante animada y su variante sin animar: ≈ 3,3 GB, diez veces el pack anterior. Eso rompe tres supuestos de
las ADR-0029 y ADR-0030:

- **Un solo zip.** A ese tamaño no cabe en un asset de GitHub (tope de 2 GiB) y un corte de red, o cerrar la
  app a mitad, obligaría a empezar de cero.
- **Una descarga atada a la puerta.** Dura entre 10 minutos (50 Mbps) y casi una hora (10 Mbps), y la persona
  tiene que poder seguir usando la app mientras baja; con el v3, salir de la puerta cancela el job.
- **Una raíz de pack congelada en el formato v2**, con tres estilos fijos (`DEMO_CATALOG_STYLES`) y una sola
  gema: no puede describir 79 historias, dos gemas y dos variantes por historia.

Restricciones que achicaron el campo:

- La simulación sigue sin tocar proveedores ni claves (ADR-0029): todo lo que se ve —audio, escenas, imágenes,
  clips, avatar y videos— viene pre-hecho en el pack.
- Rust no se toca y el camino real de `run-video-pipeline` no cambia: los usuarios siguen generando a 480p; el
  720p es solo del generador del pack.
- El pack es un release público de `otd20071-cloud/vimo-releases`: no puede llevar recibos, ids de tareas ni URLs
  del proveedor.
- El sidecar no depende del PATH ni de `unzip` (ADR-0013): el lector de zip sigue siendo `yauzl`.

## Decisión

**La demo muestra el producto completo —catálogo nuevo, animación y avatar—: un pack de 79 historias de 1 minuto
con su variante animada a 720p y un ejemplo con avatar, repartido en 8 partes que se instalan una por una en
segundo plano y que, si se cortan, siguen desde la parte que faltaba; y Crear en demo se arma sobre el catálogo
nuevo.**

### Forma

```
release demo-pack-v4 (otd20071-cloud/vimo-releases) · 8 partes · 3.341.476.006 bytes
   │ puerta /create-demo: «Descargar la demo» ─► store del módulo videos (sigue aunque se salga de la puerta)
   ▼
<raíz>/_demo-pack.tmp/ ── por parte: espacio libre ─► zip + SHA-256 ─► extraer ─► marca ─► borrar el zip
   │ todas las marcas: validar el pack entero ─► .ok { version, parts[] } ─► rename atómico
   ▼
<raíz>/_demo-pack/ ─► demo-status ─► Crear en demo (catálogo nuevo + Mi estilo)
   │ create-video-project { demo: true, animationMinutes?, customStyle }
   ▼
run-demo-pipeline: voice · transcription · scene-cuts · scene-prompts · images (+ avatar) · animation? · render
   (copia del pack: audio, palabras, escenas, imágenes, clips, avatar y el video animado o sin animar)
```

| Pieza                     | Estado | Ubicación                                                                                                                                            | Para qué                                                                                                                                |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `DemoConfig.packParts`    | cambio | `pipeline/config/pipeline-config.ts`                                                                                                                 | `packVersion: 'v4'` y las 8 partes pineadas `{ url, sha256, bytes }` reemplazan a `packUrl` y `packSha256`; `diskMarginBytes` (500 MiB) |
| Lector del pack           | cambio | `pipeline/commands/demo/pack.ts`, `pipeline/types/demo.ts`                                                                                           | El manifest manda; `validatePack` exige cada historia listada completa; `.ok` sella la versión y los SHA de las partes                  |
| Instalación por partes    | nuevo  | `pipeline/commands/demo/{demo-prepare,staging,install-lock}.ts`, `demo-status.ts`                                                                    | Una parte por vez, staging que se conserva, un solo instalador por raíz; `demo-status` informa tamaño, avance y espacio necesario       |
| Armador                   | cambio | `scripts/build-demo-pack.mjs` (`pnpm build:demo-pack`)                                                                                               | Arma y recomprime las partes desde proyectos nativos terminados                                                                         |
| Simulación                | cambio | `pipeline/commands/demo/run-demo-pipeline.ts`                                                                                                        | Las ocho fases de la corrida real, con animación y avatar                                                                               |
| 720p interno              | nuevo  | `pipeline/config/pipeline-config.ts`, `pipeline/types/video-provider.ts`, `pipeline/animation/{generate,lane}.ts`, `pipeline/providers/video/kie.ts` | `animation.resolution`, solo para el generador del pack                                                                                 |
| Descarga en segundo plano | nuevo  | `src/modules/videos/utilities/demoPrepareStore.ts`, `hooks/useDemoPrepare.ts`                                                                        | El job vive fuera de React; salir de la puerta no lo cancela                                                                            |
| La puerta                 | cambio | `views/CreateDemo/`, `components/DemoGate{Card,Body,Offer,Progress,Failure}.tsx`, `utilities/demoGateScreen.ts`                                      | Oferta con el tamaño, avance, espera y fallos                                                                                           |
| Crear en demo             | cambio | `utilities/demoForm.ts` (reglas puras), `hooks/useDemoFormChoices.ts`, `views/Create/Create.tsx`, `components/CreateForm.tsx`                        | Catálogo nuevo, un solo modelo, switch de avatar, personajes, sin subtítulos ni saldo                                                   |
| `CreateTask.demo`         | nuevo  | `types/create.ts`, `hooks/useCreateTask.ts`, `utilities/avatarTaskEvents.ts`                                                                         | Una corrida de la demo no anota apariciones del avatar «cobradas»                                                                       |

### 1. El pack: contenido y formato

- **79 historias de 1 minuto**, cada una de un proyecto real del pipeline. En 16:9 son los 38 estilos del
  catálogo más las gemas `storytelling` y `jardineria` (40); en Short, los 38 más `storytelling` (39). Jardinería
  es el único ejemplo con avatar y solo existe en 16:9.
- **Guion y voz.** Guion en español, con audio de 60 a 69 s; el de Jardinería dura ~80 s para que entren sus 5
  apariciones de 5 s (la app exige 10 s de imágenes entre una aparición y otra). La voz es Abel, generada por ai33
  (`elevenlabs_452WrNT9o8dphaYW5YGU`): el 2026-10-14 el motor ElevenLabs de DubVoice fallaba con cualquier texto.
  La voz que muestra Crear sale del manifest.
- **Carril y personaje.** El del catálogo nuevo y de Mi estilo (`customStyle` con `catalogStyleId`, 3 s por
  escena, imágenes en calidad baja). Los 7 estilos con personaje fijo y la gema `storytelling` salen con el
  personaje del estilo (`generic`; en la gema, porque su prompt dibuja al narrador como protagonista); el resto de
  los estilos y Jardinería, sin personaje (`none`). En Crear solo los 7 estilos muestran el chip «Personaje del
  estilo»: `storytelling` es una gema vieja, sin secciones, y no lo muestra (`demoShowsCharacterSection`).
- **Animación.** Todas son animadas: el primer minuto son 10 clips de 6 s a 720p (menos en Jardinería, donde las
  apariciones del avatar no se animan) y lo que pasa del minuto queda sin animar, como en la app: de 0,1 a 8,5 s en
  las 78 historias de 60 a 69 s y unos 20 s en Jardinería. Cada historia lleva además el mismo video sin animar
  (copia del proyecto sin los clips y render local, sin costo).

```
manifest.json   version "v4" · voz · gemas[] · estilos[] e historiasGema[] (16:9) · short { estilos[], historiasGema[] } (9:16)
gemas/<id>/     style.json + sample-N.jpg (+ avatar.jpg si una historia de la gema trae avatar)
<id>/           historia 16:9: los 38 del catálogo, storytelling y jardineria
short/<id>/     historia 9:16: los 38 del catálogo y storytelling
  guion.txt · audio.mp3 · palabras.json · escenas.json · imagenes/imagen_<id>.jpg
  animaciones/<clip>.mp4 (primer minuto, 720p) · avatar/… (solo con avatar)
  video_final.mp4 (sin animar) · video_animado.mp4
```

- **`escenas.json`** conserva los campos del v3 y suma un bloque `nativo` con la forma nativa de lo que el editor
  y la simulación necesitan: `animationRequestedSeconds`, `staticTransitionIn`, los bloques de `animations` y los
  datos de `avatar` de cada escena. Se quitan recibos, ids de tareas y URLs del proveedor.
- **El manifest manda.** Desaparece la lista fija de estilos: `validatePack` exige que cada historia listada
  esté completa (los archivos, una imagen y un prompt por escena —salvo las apariciones del avatar, que no
  llevan—, cada clip que nombra `escenas.json` y los dos videos). La raíz deja de ser el formato v2 congelado;
  se conservan la estructura por historia y el árbol hermano `short/` de la ADR-0030, y el lector acepta solo
  `version: "v4"`.
- **La historia se elige** por formato y por `customStyle.catalogStyleId` (catálogo) o por el `styleId` de la gema
  (`demo-storytelling`, `demo-jardineria`; cada gema se siembra en `_styles/<styleId>/` solo si no existe). Sin
  historia, `demo_style_not_included`. `demo-status` da el pack por listo solo con todas sus gemas sembradas:
  una gema borrada de la galería se vuelve a sembrar sin bajar nada.

### 2. Partes y armado

- **Partes.** Zips sin compresión de unos 500 MB, cada uno con historias enteras (nunca un archivo partido entre
  dos zips) y sin ZIP64; ninguna pasa de 2000 MB. La primera trae el manifest y las gemas. El release publicado
  tiene siete partes de 448 a 491 MB y una última de 35 MB (3.341.476.006 bytes ≈ 3,1 GiB).
- **Armado** (`pnpm build:demo-pack --stories … --gems … --out …`). Lee un proyecto nativo terminado por
  historia, lo valida entero antes de escribir nada (formato, voz, estilo, ids de escena contiguos, clips y
  avatar listos, videos), lo traduce al formato del pack (sin recibos ni URLs; las gemas viajan sin `origin` ni
  `sourcePrompt`, y una gema con personaje propio corta el armado) y lo recomprime con el ffmpeg empaquetado
  —imágenes en JPEG (`-q:v 4`), clips y videos en H.264 CRF 28, preset `medium`—. Vuelve a pasar el lector que
  usa la app y escribe las partes más un `parts.json` (archivo, bytes, SHA-256).
- **Versión y partes se cambian juntas** en `DEFAULT_PIPELINE_CONFIG.demo`: subir la versión invalida el `.ok` y
  el staging a medias y fuerza una descarga limpia en todas las máquinas. El `.ok` v4 sella
  `{ version, parts: [sha256 de cada parte, en orden] }` y el pack cuenta como instalado solo si coinciden con
  la configuración.
- **Publicar** es crear el release `demo-pack-v4` en `otd20071-cloud/vimo-releases` (sin marcarlo como `latest`),
  subir las partes y pegar `parts.json` en la configuración.

### 3. Descarga e instalación en segundo plano

- **Antes de empezar**, la puerta muestra el tamaño y un botón «Descargar la demo»: son varios GB. Con avance de
  una sesión anterior (`downloadedBytes > 0`) sigue sola.
- **Cada parte**, en orden: espacio libre, descarga por streaming a `_demo-pack.part-<n>.download` con SHA-256,
  verificación, extracción a `_demo-pack.tmp/`, marca de la parte en `_demo-pack.tmp/.parts.json` y borrado del
  zip. Con todas las marcas se valida el pack entero, se lo sella con el `.ok` y un rename atómico reemplaza
  `_demo-pack/`: el pack real nunca queda a medias.
- **Continuar donde quedó.** El staging guarda la versión y el SHA de cada parte ya extraída y se conserva entre
  intentos y entre sesiones de la app mientras sea del mismo armado; si no, se borra entero. Al volver, sigue con
  la primera parte sin marca: lo que se pierde como mucho es la parte en curso.
- **Corte de red.** Sin respuesta o sin bytes nuevos durante `demo.downloadIdleMs` (90 s), la parte falla enseguida:
  `demo_offline` si el pedido no tuvo respuesta, `demo_download_failed` si se cortó a mitad. No hay tope total: una
  conexión lenta pero viva baja la parte entera. El fallo de la red se muestra mientras alguien mira la puerta y se
  olvida al salir de ella: volver a entrar a la demo consulta `demo-status` y, con avance previo, sigue sola desde la
  primera parte sin marca, sin «Reintentar».
- **Espacio.** Antes de cada parte se exige lo que falta extraer más la parte más grande de las que faltan (su zip
  convive con lo extraído hasta que se borra) más 500 MiB de margen: ≈ 4,4 GB con todo por instalar. Si no alcanza,
  `demo_disk_full`, con los GB que hacen falta; un `ENOSPC` al bajar, extraer, mover el pack a su lugar (la copia,
  si el rename sigue trabado) o sembrar las gemas da el mismo código. Con el pack ya instalado, `demo-prepare` borra
  el `_demo-pack.tmp` que haya quedado, sin frenar si no puede.
- **Un solo instalador por raíz.** `_demo-pack.lock` (creado con `O_EXCL`, con pid, token y fecha) lo late su
  dueño cada 5 s. Otro job espera hasta 60 s y falla con `demo_busy`; el lock de un proceso muerto se toma
  enseguida y uno sin latido hace más de 2 minutos, tras volver a mirarlo 15 s después. `demo-status` informa si
  un instalador vivo lo tiene (`installing`: el lock existe, su proceso vive y latió hace menos de 2 minutos), sin
  tomarlo.
- **Segundo plano.** El job vive en un store del módulo `videos` fuera de React (`demoPrepareStore.ts`, con el
  patrón de `gemMigrations` y `useCreateTask`: una sola instancia en `useDemoPrepare.ts`, leída con
  `useSyncExternalStore`). El store nunca cancela el job: salir de la puerta no lo corta, volver muestra el
  avance y el resto de la app se usa normal. Un solo job por app.
- **Avance.** Porcentaje total por bytes (partes terminadas más la parte en curso, nunca hacia atrás y con tope
  99 hasta que el pack queda instalado) y «Parte X de N».
- **`demo_busy` no es un fallo.** Si otro `demo-prepare` tiene el lock (uno que siguió corriendo tras recargar la
  vista), la puerta muestra «La demo se sigue descargando…» con el avance de `demo-status`, consulta cada 3 s
  solo mientras está montada, entra a Crear apenas el pack está listo y ofrece «Reintentar». Si `demo-status` dice
  que ya nadie tiene el lock y el pack no está listo (ese job falló o murió), nadie baja: relanza el propio.
- **Vigilante.** Un job sin ningún evento durante 5 minutos (`DEMO_PREPARE_SILENCE_LIMIT_MS`) se da por mudo: su
  proceso pudo morir y Rust no avisa por el canal. El store pasa a la misma espera sin cancelarlo ni soltar su
  listener: si vuelve a hablar, su avance lo devuelve a «en curso» y su fin o su fallo cuentan. Si nadie tiene el
  lock, la espera relanza `demo-prepare` (al volver a entrar a la demo o, con la puerta abierta, en la consulta
  siguiente), que toma el lock del proceso muerto y sigue desde la primera parte sin marca; relanzar suelta el
  listener viejo. Con el tope de inactividad de cada parte, un corte de red siempre termina en un fallo, que cuenta
  aunque llegue después del vigilante (en una conexión muy lenta, el 1 % que separa dos avances tarda más que el
  vigilante). Las consultas de `demo-status` que hace el store tienen un tope de 30 s para que nada quede colgado.

### 4. Crear en demo

La historia (nombre, guion, escenas y audio) sigue a formato y estilo, como en la ADR-0030. Lo demás cambia
cuando Crear abre con un manifest de demo:

| Parte de Crear              | En la demo                                                                                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pestaña Catálogo            | Siempre el catálogo nuevo (carril `catalog-gem`), aunque la cuenta no tenga `newCatalog`. La galería muestra solo los estilos con historia en el formato elegido, en el orden de `catalog-styles-list`, sin «Pasar a mi estilo», herramientas de admin ni «Crear estilo con IA» |
| Tarjeta por defecto         | Sin una elegida, la primera de la galería (un id del pack que la lista no trae se omite); el texto de la pestaña cuenta las tarjetas a la vista («Los {{count}} estilos con demo lista.»)                                                                                       |
| Pestaña Mi estilo           | Solo las gemas del pack para el formato (en Short no está Jardinería); sin «Crear estilo» ni clonaciones, y sin migrar gemas viejas: la demo no llama al agente                                                                                                                 |
| Formato                     | «Próximamente» donde la historia elegida no existe                                                                                                                                                                                                                              |
| Escenas                     | Sin cantidad de escenas ni «Confirmar escenas» (salen del carril, como en la app real)                                                                                                                                                                                          |
| Modelo de IA                | Solo la tarjeta del modelo predeterminado, sin enlace a Ajustes; el bloqueo de modelos (ADR-0028) no aplica y el envío lleva ese modelo                                                                                                                                         |
| Animación                   | El switch funciona si la historia trae su variante animada (si no, «Próximamente» y el envío va sin animar); encendido, el payload lleva `animationMinutes: 1`. Sin aviso de clave de Kie ni estimación de créditos                                                             |
| Personajes                  | El modo sale de la historia: los 7 estilos con personaje fijo muestran el chip «Personaje del estilo», quieto (en «Ver» no hay «Mi personaje» ni «Sin personaje»); el resto no muestra la sección ni «Agregar personaje»                                                        |
| Subtítulos y saldo          | Sin la casilla de subtítulos. Nunca se consulta ni bloquea por saldo: `useCreateCostCheck` con `demo` da una estimación vacía, el selector de imagen no muestra saldos y Crear no relee el saldo al enviar                                                                      |
| Corrida (`CreateTask.demo`) | Viaja con la tarea (del payload al crear; de `project.json` al reanudar, reintentar o cambiar la voz desde la biblioteca): una corrida de la demo no anota apariciones del avatar «cobradas», así que ni «Cancelar» ni «Crear otro» avisan de ellas                             |

Por qué: la historia ya está hecha y la simulación no escribe prompts, no anima con Kie, no cobra el avatar ni
usa personajes de la persona. Antes, con la animación encendida, una cuenta con poco saldo en Kie podía
bloquear la demo; un «Mi personaje» recordado en la app pedía un personaje; los modelos bloqueados apagaban Mi
estilo; y la simulación del avatar hacía aparecer el aviso de apariciones ya cobradas.

### 5. El switch de avatar

Pedido del dueño del 2026-10-14. El avatar de ejemplo es uno solo (el avatar y el look «Jardineria», motor
Avatar IV, 5 apariciones de 5 s), así que el switch tiene que llevar siempre a él:

- Funciona en cualquier estilo, sin clave de HeyGen y sin leer la biblioteca de la persona. La tarjeta muestra
  los datos del pack, fijos (nombre, vista del look, «5 apariciones de 5 s» y el motor), sin selector, costo,
  saldo ni aviso de clave.
- Encenderlo lleva a Mi estilo con Jardinería y a 16:9 (también desde Short): la única historia con avatar.
- Con el switch encendido, pedir otra gema, otro estilo o la pestaña Catálogo vuelve a Jardinería y muestra
  «Usa este estilo para avatar o desactiva el switch para usar otro.», hasta el próximo cambio de estilo,
  pestaña, formato o switch. Lo guardado de la otra pestaña no se toca y Short queda en «Próximamente».
- Elegir Jardinería con el switch apagado lo enciende: su historia trae el avatar y no hay versión sin él.
  Apagarlo con Jardinería vuelve a la pestaña Catálogo con la primera tarjeta.
- Sin la gema del avatar en la lista de Mi estilo (todavía carga, o se borró), encender el switch no hace nada y
  un pedido que quita la tarjeta en uso lo apaga, sin aviso: no hay a dónde volver. Sin avatar en el pack, el
  switch queda en «Próximamente».
- El payload de la demo sigue sin llevar `options.avatar`: en la demo, avatar encendido equivale a Jardinería y
  lo pone la simulación desde el pack.

### 6. La simulación

`run-demo-pipeline` sigue sin tocar proveedores ni claves y cada archivo se copia antes del evento que lo
nombra.

- **Fases.** Las ocho de la corrida real, en su orden: `voice`, `transcription`, `scene-cuts`, `scene-prompts`,
  `images`, `avatar`, `animation` y `render`. Las que no aplican emiten `stage-skipped` y `completedStages` anota
  solo las que corrieron.
- **Avatar.** Con la historia de Jardinería, `options.avatar` sale de `avatar.opciones` del manifest (nunca del
  payload) y la vista del look se copia a `avatar/look.<ext>` antes del primer evento. El corte siembra cada
  aparición como `planned` y anuncia `avatar-planned`; la fase `avatar` arranca junto con `images` (como en la
  corrida real, ADR-0057) y emite los eventos del carril: `avatar-scene-started`, `avatar-scene-progress` por fase
  (`audio`, `upload`, `render`, `download` y `normalize`) y `avatar-scene-ready`, este último después de copiar el
  clip y restaurar su bloque nativo.
- **Animación.** Corre solo si el proyecto trae `animationMinutes > 0` y la historia es animada. Emite
  `scenes-planned` con `animationEndSeconds` y, en tandas de 10, `scene-animation-started`,
  `scene-animation-progress` (con porcentaje) y `scene-animation-ready` después de copiar el clip de
  `animaciones/` a `animations/` y guardar su bloque en `scenes.json`. El `render` copia `video_animado.mp4`, o
  `video_final.mp4` si el switch está apagado, aunque la historia sea animada.
- **Duración.** ≈ 38 s sin animación (como antes) y ≈ 53 s con ella, medido contra el pack v4 real.
- **`project.json`.** Termina con `renderTransitionVersion` igual a `TRANSITION_POLICY_VERSION` (1) y
  `videoOutdated: false`, así el editor reproduce el video del pack en vez de darlo por desactualizado y simular
  la vista previa (arreglo con su informe en `docs/fixes/`). El editor muestra las escenas animadas y las
  apariciones del avatar; regenerar, animar y las acciones del avatar siguen bloqueadas en la demo.
- **Payload.** `create-video-project` acepta `animationMinutes` junto con `demo: true`; `options.avatar` sigue
  rechazado.

### 7. Animación a 720p (ajuste interno)

- **`animation.resolution`** en `PipelineConfig`, con `'480p'` por defecto. Solo lo sube el generador del pack
  por el `config` del job, igual que `demo.delayScale`; Rust nunca lo manda.
- **Dónde actúa:** el pedido a Kie, el hash y el recibo del intento, y el cuadro de normalización
  (`animationFrame`: 854×480 pasa a 1280×720; en vertical, al revés).
- **Lo que no cambia:** en 480p la cadena que se hashea es la misma de antes, así que la huella es idéntica y los
  recibos de los proyectos existentes siguen valiendo; un clip a 720p tiene otra huella y nunca se confunde con
  uno de 480p. Las estimaciones de créditos de la app siguen en 480p, PoYo (que solo lee proyectos históricos)
  sigue pidiendo 720p y las migraciones de clips históricos conservan su cuadro fijo.

## Alternativas consideradas

- **Un solo zip de ~3,3 GB** — descartada: GitHub limita un asset a 2 GiB y cualquier corte de red o cierre de la
  app obligaría a empezar de cero.
- **Descarga por estilo bajo demanda** (bajar cada historia cuando se elige) — descartada por el dueño
  (2026-10-14) en favor de un pack en partes que se baja una vez: con todo en disco la demo corre sin red y sin
  esperas al elegir un estilo.
- **Seguir usando el v3 mientras baja el v4** — descartada: obligaría a mantener dos formatos de pack (dos
  lectores, dos marcadores `.ok` y un Crear en demo para cada catálogo). Lo que se acepta a cambio es que una
  máquina con el v3 no puede usar la demo hasta que termine el v4.
- **720p para los usuarios** (ofrecerlo como opción de la app) — descartada por ahora: a 720p Grok cuesta
  4,5 créditos por segundo (27 por clip de 6 s; tarifario público de Kie del 2026-10-14) contra los 2,4 que
  estima la app a 480p, y cambiaría estimaciones, huellas de recibos y cuadros de todos los proyectos. Si algún
  día se ofrece, hay que revisar esas tres cosas primero.

## Consecuencias

- ✅ La demo vuelve a enseñar lo que hace la app —catálogo nuevo, animación del primer minuto y avatar— en 16:9 y
  en Short, y Crear se ve como el real.
- ✅ Un corte de red o cerrar la app a mitad pierde como mucho la parte en curso (≤ 491 MB) y, al volver a entrar a
  la demo, la descarga sigue sola desde la parte que faltaba; mientras baja, el resto de la app se usa normal.
- ✅ Publicar otro pack con más historias no exige tocar el lector: el manifest decide qué se ofrece; solo cambian
  `packVersion` y `packParts`.
- ⚠️ Cada máquina baja 3,3 GB una vez (≈ 10 minutos a 50 Mbps; cerca de una hora a 10 Mbps) y necesita ≈ 4,4 GB
  libres durante la instalación. Cambiar la carpeta raíz en Ajustes obliga a bajarlo de nuevo.
- ⚠️ Con el v3 instalado, la demo figura «no lista» y no se puede usar hasta que termine el v4.
- ⚠️ El release es público e incluye el video con el avatar «Jardineria» del dueño, que pidió usarlo.
- ⚠️ El catálogo es vivo: si un admin borra un estilo después de generar su historia, desaparece de la demo; si lo
  edita, la demo muestra la tarjeta nueva con la historia generada antes.
- ⚠️ **Pendiente, sin arreglar acá:** `src-tauri/src/pipeline/commands.rs` (el brazo `CommandEvent::Terminated`,
  línea 107) saca el job de `RunningJobs` sin mandar ningún evento final por el canal. Un consumidor de
  `runPipelineJob` puede quedar colgado si el sidecar muere sin evento; la puerta de la demo lo mitiga con el
  vigilante de 5 minutos, que pasa a la espera y relanza `demo-prepare` si nadie tiene el lock. Arreglarlo es una
  decisión aparte, en Rust.
- 🔒 Versión y partes del pack viven en un solo archivo y se cambian juntas.
- 🔒 La descarga de la demo nunca se cancela desde la interfaz: solo se suelta su listener.
- 🔒 La simulación emite solo tipos de `pipeline/runner/events.ts` y nunca toca un proveedor, una clave ni un saldo.
- 🔒 `animation.resolution` solo lo cambia el generador del pack; la app y Rust nunca piden 720p.
- 🔒 Ningún código `demo_*` entra a `RETRYABLE_ERROR_CODES`: la demo no se reintenta sola.

## Verificación de cumplimiento

- **Guards.** Todos sin claves ni red real; el detalle de cada uno está en `scripts/test/README.md`.
  - `pnpm check:demo` (`scripts/test/check-demo.mjs`; 40 secciones, 379 chequeos) sobre un pack mínimo v4 servido
    por HTTP local: el lector y los packs incompletos; la instalación por partes (SHA por parte, marcas, `.ok` con
    los SHA de todas, rename atómico); seguir tras un corte, una cancelación o un cierre en seco sin volver a bajar
    las partes hechas; una parte colgada que falla en el tope de inactividad y sigue desde ella, una lenta pero
    viva que no se corta y un servidor que no contesta; el staging de otra versión; `demo_disk_full`, también al
    mover el pack o al sembrar; un solo instalador por raíz, `demo_busy` y el `installing` de `demo-status`; la
    historia por `catalogStyleId` y por gema; la fase `animation` con cada clip en disco antes de su
    `scene-animation-ready` y el video animado; `stage-skipped` y el video sin animar; Jardinería con el avatar
    junto a las imágenes; `renderTransitionVersion: 1`; y que las partes del armador las instala `demo-prepare`.
  - `node --test scripts/test/check-demo-gate.mjs` (40 tests): el store de la descarga (no cancela, un solo job,
    el vigilante que no suelta un job vivo, la espera que relanza cuando nadie tiene el lock, `demo_busy` y los
    fallos de la red que se olvidan al salir), qué muestra la puerta y los GB y el porcentaje en cada idioma.
  - `node --test scripts/test/check-animation-resolution.mjs` (4 tests): 480p por defecto, 720p por el `config`
    del job, el cuadro de normalización y el pedido a Kie.
  - `node --test scripts/test/check-app-demo-form.mjs` (33 tests) y `node scripts/test/check-create-demo-ui.mjs`
    (127 checks, Chrome headless): las reglas de Crear en demo y la vista Create montada. El guard de UI se vio
    fallar con un mutante por cada comportamiento que fija.
  - Ampliados: `check-app-avatar-create.mjs` (35 tests), `check-app-gem-migration.mjs` (35),
    `check-avatar-cancel-charged-ui.mjs` (86 checks) y `check-create-draft-ui.mjs` (33, con su fixture ya en v4).
  - `pnpm check:locales`, `pnpm lint`, `pnpm build` y `pnpm build:sidecar` en verde.
- **Greps ejecutables**, todos vacíos:
  - `git grep -n "packUrl\|packSha256" -- pipeline src src-tauri` (versión y partes solo en `packParts`).
  - `git grep -n "DEMO_CATALOG_STYLES" -- pipeline src scripts` (el manifest manda).
  - `grep -rn "cancelJob" src/modules/videos/utilities/demoPrepareStore.ts src/modules/videos/hooks/useDemoPrepare.ts src/modules/videos/views/CreateDemo src/modules/videos/components/DemoGate*`
    (salir de la puerta no cancela).
  - `git grep -n "720p" -- src src-tauri` (la app y Rust no piden 720p).
- **Evidencia del 2026-10-15** con el release publicado (sidecar, sin la interfaz): con la configuración que
  apunta a las 8 partes y sin overrides, `demo-status` da `ready: true` sobre un pack instalado desde los mismos
  zips, y una instalación real desde GitHub, cortada a mitad por la red y retomada, terminó con el pack listo.
- **Checklist manual con la app compilada** (la hace el dueño):
  1. La puerta ofrece el v4 con su tamaño y «Descargar la demo».
  2. Salir de la puerta y volver muestra el avance, y el resto de la app se usa mientras baja.
  3. Cerrar la app a mitad de la descarga y volver sigue desde la parte que faltaba.
  4. Crear muestra los 38 estilos del catálogo y las dos gemas, y Short sin Jardinería.
  5. Con la animación encendida: la fase de animación en el progreso y el video animado.
  6. El switch de avatar lleva a Jardinería, devuelve ahí con el aviso al elegir otro estilo y el video sale con
     el avatar.
  7. El editor de un proyecto demo reproduce el video final y muestra los clips y las apariciones.
  8. Con al menos una parte ya bajada, apagar el Wi-Fi más de 5 minutos a mitad de la siguiente, volver a encenderlo
     y ver que la puerta no miente (muestra el fallo de la red, no «La demo se sigue descargando…») y que, al volver a
     entrar a la demo, la descarga sigue desde la parte que faltaba. Si el corte cae en la primera parte, la puerta
     vuelve a ofrecer la descarga.
- **Cómo se vería una regresión:** la descarga se corta al salir de la puerta, o tras un corte de red la puerta
  queda «descargando» sin que nada baje o pide «Reintentar» para seguir (`check-demo-gate.mjs`); una parte colgada
  no falla en el tope de inactividad (`check-demo.mjs`, sección 38); una máquina con el v3 aparece «lista» o se
  reinstala sola cada vez (`check-demo.mjs`, secciones del `.ok`); Crear en demo deja elegir un estilo sin
  historia, o con el avatar encendido no vuelve a Jardinería (`check-app-demo-form.mjs` y
  `check-create-demo-ui.mjs`); la demo consulta un saldo o frena por la clave de Kie (`check-create-demo-ui.mjs`);
  un usuario a 720p sin pedirlo, o un pedido a Kie o un cuadro de normalización que no sigan el ajuste
  (`check-animation-resolution.mjs`); el editor de un proyecto demo muestra el video «desactualizado»
  (`check-demo.mjs`, `renderTransitionVersion`).

## Modos de falla

| Situación                                                          | Código                                                | Qué pasa                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sin espacio, o el disco se llena al bajar, mover el pack o sembrar | `demo_disk_full`                                      | `job-failed`; la puerta dice cuántos GB hacen falta (hacia arriba, a un decimal; sin cifra si falló al mover el pack o sembrar). Se libera espacio y «Reintentar» sigue desde la primera parte sin marca    |
| El SHA-256 de una parte no es el pineado                           | `demo_pack_corrupt`                                   | Se borra el zip de esa parte; las partes con marca no se tocan y «Reintentar» la baja de nuevo                                                                                                              |
| Sin red, GitHub responde error, o la descarga se corta o se cuelga | `demo_offline`, `demo_download_failed`                | Sin respuesta o sin bytes por 90 s (`downloadIdleMs`), la parte falla y se borra su zip; las marcas quedan. El fallo se olvida al salir: con alguna parte ya bajada, volver a entrar sigue sola             |
| El zip de una parte no se puede abrir                              | `demo_pack_unreadable`                                | Ídem; señal de una parte mal publicada                                                                                                                                                                      |
| Con todas las partes, el pack no es válido                         | `demo_pack_incomplete`                                | El staging se descarta entero y se empieza de cero (así «Reintentar» no queda trabado); no se escribe `.ok` ni `_demo-pack`. Cualquier otro error al validar deja el staging para seguir sin volver a bajar |
| Staging de otra versión o de otro armado                           | —                                                     | Se borra entero y se empieza de cero: `_demo-pack.tmp` nunca mezcla dos packs. Pasa al cambiar `packVersion` o si una marca tiene el SHA de otro zip                                                        |
| Otro `demo-prepare` tiene el lock                                  | `demo_busy`                                           | Una espera en la puerta, no un fallo; si el lock queda libre sin el pack listo, relanza el job. Un job que espera más de 60 s al lock falla con este código; uno que lo pierde deja de latir y se corta     |
| Se cierra la app o el sidecar muere a mitad                        | —                                                     | Los `.download` que quedan se borran al empezar el próximo `demo-prepare`, que sigue con la primera parte sin marca. Si el sidecar muere sin evento final, a los 5 minutos la puerta espera y lo relanza    |
| El rename de `_demo-pack.tmp` queda trabado (antivirus en Windows) | —                                                     | Se copia el árbol y el `.ok` va al final: una copia cortada nunca queda sellada y el próximo intento la repite desde el staging, que sigue entero                                                           |
| Historia o formato fuera del pack (solo por payload a mano)        | `demo_style_not_included`, `demo_format_not_included` | `job-failed`; Crear solo ofrece lo que el pack trae                                                                                                                                                         |
| Pack v3 instalado                                                  | —                                                     | `demo-status` lo da por no listo por la versión; la puerta ofrece bajar el v4                                                                                                                               |

## Fuera de alcance

- **Seedance 1.5 Pro.** Kie anuncia su fin el 2026-11-11 y es el modelo de respaldo de la animación en la app
  (ADR-0042). Se ve aparte; las historias del pack ya están generadas.
- **720p para los usuarios**, la **descarga por estilo bajo demanda** y **seguir con el v3 mientras baja el v4**:
  descartados arriba.
- **Otros huecos conocidos de la demo:** el menú de cada gema del pack sigue abierto (editarla y generar sus
  muestras; borrarla no deja secuelas, porque la puerta la vuelve a sembrar) y la música del editor sigue
  alcanzable. «Crear estilo» y «Crear estilo con IA» sí están ocultos en Crear.

## Referencias

- [Diseño de la demo v4](../handoff/2026-10-14-demo-v4/design.md) (contenido, decisiones del dueño, presupuesto
  de generación y los 79 títulos) ·
  [informe del editor de la demo](../fixes/2026-10-15-fix-demo-editor-preview/demo-editor-preview.md).
- ADR-0029 (modo demo), ADR-0030 (pack v3), ADR-0039 (catálogo sobre el carril de Mi estilo), ADR-0042
  (animación con Kie) y ADR-0057 (avatar con HeyGen).
- Release: <https://github.com/otd20071-cloud/vimo-releases/releases/tag/demo-pack-v4>.
