# ADR-0030 — Pack v3 de la demo: historias en Short por estilo y narración pre-cargada en «Subir mi audio»

- **Estado:** Aceptada
- **Fecha:** 2026-09-11
- **Área:** app / pipeline

Extiende la [ADR-0029](ADR-0029-modo-demo-pipeline-simulado-sobre-pack-prehecho.md):
el modo demo, la puerta, el acceso y la simulación siguen como allí se decidió. Acá
cambia **qué trae el pack** y **qué muestra Crear** en demo.

## Problema

El pack v2 trae cuatro historias distintas (una por estilo del catálogo más la de la
gema «Mi estilo»), todas en 16:9: imágenes de 1360×768 y video de 1920×1080. Por eso
en demo el formato Short (9:16) quedó en «Próximamente» (ADR-0029, decisión 5), y la
persona que muestra Vimo no puede enseñar el formato que más se pide. Además, la pestaña
«Subir mi audio» de Crear aparece vacía en demo: el manifest no dice dónde está el audio
de cada historia, así que el chip «Elegir audio» no tiene qué mostrar aunque el guion
sí se vea (es el mismo campo del formulario). El dueño pidió (2026-09-11) que la demo
tenga **shorts con guiones y audios propios para la gema y los estilos del catálogo**, y
que «toda la app tenga todo subido»: al abrir «Subir mi audio», el audio ya cargado.

Restricciones que achicaron el campo:

- La simulación no toca proveedores ni claves (ADR-0029): todo lo que se ve en demo
  tiene que estar pre-hecho dentro del pack.
- El pack es público, versionado y sellado por SHA-256; cambiarlo implica que todas
  las máquinas lo re-descarguen. Una sola descarga, no dos.
- El pack v2 ya está instalado en máquinas reales: el prellenado del audio no puede
  depender de que exista el v3, y un pack v2 no puede dejar la demo rota.
- El camino real (`run-video-pipeline`, stages, editor) no se toca.

## Decisión

**Publicar un pack v3 aditivo con las mismas cuatro historias en 9:16 bajo `short/`, exponer
en el manifest nativo las historias por formato y la ruta del audio de cada una, y hacer que
Crear en demo siga a formato y estilo con el audio ya cargado en «Subir mi audio».**

### Forma

```
manifest.json            version "v3" · voz · estilos[] + gema (16:9, igual que v2) · short: { estilos[], gema }
gema/                    igual que v2 (estilo.json + muestra-N.jpg)
pov_stickman/ normal/ cartoon/ storytelling/          ← 16:9, tal cual v2 (no se regenera nada)
short/pov_stickman/ short/normal/ short/cartoon/ short/storytelling/
  guion.txt · audio.mp3 · palabras.json · escenas.json · imagenes/imagen_<id>.jpg · video_final.mp4   ← 9:16
```

| Pieza                                                  | Estado   | Ubicación                                            | Para qué                                                                                                                        |
| ------------------------------------------------------ | -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `DemoStories` / `DemoManifest.stories`                 | cambiado | `pipeline/types/demo.ts`                             | historias por formato: `'16:9'` siempre, `'9:16'` opcional (solo v3+); cada `DemoStyleEntry` lleva `audioFile`                  |
| `DEMO_SHORT_FOLDER`, `demoStoryDirectory`              | nuevo    | `pipeline/commands/demo/pack.ts`                     | carpeta de la historia = formato + estilo; `validatePack` y `readDemoManifest` recorren los dos árboles                         |
| `runDemoPipeline`                                      | cambiado | `pipeline/commands/demo/run-demo-pipeline.ts`        | elige la carpeta por `videoFormatOf(options)`; con `own-audio` no hay ramp de voz; `demo_format_not_included` si falta el árbol |
| `demoForm.ts` (`demoEntryFor`, `demoFollowStyle`, …)   | cambiado | `src/modules/videos/utilities/demoForm.ts`           | la historia sigue a formato y estilo; `narrationFilePath` = `audioFile`; Short «Próximamente» solo si el pack no lo trae        |
| `NarrationSection` (`audioLocked`, `audioFileLabel`)   | cambiado | `src/modules/videos/components/NarrationSection.tsx` | chip con el audio de la historia ya cargado; en demo el picker y la X quedan bloqueados                                         |
| `scripts/build-demo-pack.mjs` (`pnpm build:demo-pack`) | nuevo    | `scripts/`                                           | arma un pack vN desde el pack instalado más cuatro proyectos **nativos** en 9:16; imprime el SHA-256                            |
| `DEFAULT_PIPELINE_CONFIG.demo`                         | cambiado | `pipeline/config/pipeline-config.ts`                 | `packVersion 'v3'`, URL del release `demo-pack-v3` y su SHA-256                                                                 |

Reglas del formato v3:

1. **La raíz es v2, congelada.** Todo lo que ADR-0029 documenta sobre la raíz sigue
   valiendo byte a byte; `short/` es un árbol hermano con la misma estructura interna.
   Un formato nuevo en el futuro = otro árbol hermano + otro bloque en el manifest.
2. **`short/` es opcional pero, si está, es completo.** `validatePack` exige en
   `manifest.short` las tres entradas del catálogo y la gema, y en `short/<carpeta>/`
   los mismos archivos que en la raíz. Sin bloque `short`, el pack es válido y
   `stories['9:16']` no existe: Crear muestra Short en «Próximamente», exactamente como
   hoy. Así el prellenado del audio funciona con el v2 ya instalado y el v3 se publica
   cuando su contenido esté listo, sin ventana rota.
3. **El manifest nativo lleva `audioFile`** (ruta absoluta de `audio.mp3` dentro del pack
   instalado) por historia: es lo único que «Subir mi audio» necesita para mostrar el
   chip. Lo calcula el sidecar al leer el pack; el zip no cambia por eso.
4. **En demo la narración es siempre la de la historia.** La simulación copia
   `audio.mp3` del pack sobre `narration.mp3` también con `own-audio` (pisa lo que
   `upload-narration` haya dejado), porque palabras, escenas y video final son los
   pre-hechos. Por eso el picker y la X se bloquean en demo con un aviso: subir otro
   archivo produciría un video que no corresponde al audio.
5. **La historia sigue a formato y estilo.** Cambiar de 16:9 a Short, de estilo o de
   pestaña («Catálogo» / «Mi estilo») reemplaza nombre, guion, escenas y audio por los
   de la historia correspondiente; en Short cada estilo tiene su propio guion, igual que
   en 16:9. Al entrar, la demo sigue arrancando en 16:9.

### Contenido del v3

Cuatro shorts nuevos de unos 45 segundos, generados con el pipeline real en calidad
low (regla del dueño para el pack) y con la misma voz Abel del v2, con guiones propios:

| Carpeta              | Estilo       | Historia                          |
| -------------------- | ------------ | --------------------------------- |
| `short/pov_stickman` | POV stickman | «Tu primer día en Marte»          |
| `short/normal`       | Normal       | «Cómo nace una tormenta»          |
| `short/cartoon`      | Cartoon      | «El gato que quería ser panadero» |
| `short/storytelling` | Mi estilo    | «El último tren a casa»           |

### Cómo se arma un pack nuevo

1. Generar los proyectos que cambian (los shorts, en 9:16 y calidad low, misma voz que
   el manifest) en una carpeta raíz de Vimo; con la app o con el sidecar por terminal.
2. `pnpm build:demo-pack --base <carpeta _demo-pack instalada> --short pov_stickman=<proyecto> --short normal=<proyecto> --short cartoon=<proyecto> --short storytelling=<proyecto> --version v3 --out <zip>`.
   El armador copia la raíz del pack base tal cual (sin `.ok` ni `short/` previos),
   traduce cada proyecto nativo al formato del pack (`script.txt` → `guion.txt`,
   `narration.mp3` → `audio.mp3`, `words.json` → `palabras.json`, `scenes.json` →
   `escenas.json`, `scenes/scene_N.jpg` → `imagenes/imagen_N.jpg`, `<id>.mp4` →
   `video_final.mp4`), valida los invariantes (proyecto `completed` en 9:16, ids
   contiguos, prompt e imagen por escena, misma voz que el pack base, video > 100 KB),
   escribe el zip sin compresión (los assets ya vienen comprimidos) e imprime el SHA-256.
3. Publicar el zip como release `demo-pack-vN` en `otd20071-cloud/vimo-releases`.
4. Bump de `packVersion`, `packUrl` y `packSha256` en `DEFAULT_PIPELINE_CONFIG.demo`. El
   `.ok` versionado fuerza la re-descarga limpia en todas las máquinas.

## Alternativas consideradas

- **Reorganizar el pack por formato (`16-9/…`, `9-16/…`)** — descartada: obliga a
  reescribir el lector y la documentación de la raíz v2 sin ganar nada; el árbol hermano
  es igual de claro y deja la raíz intacta.
- **Un segundo pack solo para los shorts** — descartada: dos descargas, dos marcadores
  `.ok`, dos single-flight y dos estados en la puerta. Los ~120 MB extra en un solo zip
  cuestan menos que esa complejidad.
- **Exigir `short/` en todo pack** — descartada: dejaría la demo rota en las máquinas
  con v2 instalado hasta que el v3 exista, y bloquearía publicar el prellenado del audio
  antes que el contenido nuevo.
- **Permitir un audio elegido por la persona en demo** — descartada: el video final es
  pre-hecho; el resultado no correspondería al audio subido. Se bloquea con aviso.
- **Generar los shorts recortando los assets 16:9** — descartada: calidad pobre y no
  cumple el pedido de guiones distintos.
- **Convertir a formato nativo el pack entero (v3 «nativo», D2 de ADR-0029)** —
  pospuesta: el lector traduce en runtime y funciona; cambiar el formato de todo el zip
  no aporta a este pedido.

## Consecuencias

- ✅ La demo muestra los dos formatos y las dos formas de narrar con contenido real; el
  prellenado del audio funciona desde ya con el v2 instalado.
- ✅ Publicar otro pack con más historias o formatos no exige tocar la app: el manifest
  decide qué se ofrece.
- ⚠️ El pack pasa de 208,8 MB a unos 330 MB y todas las máquinas lo re-descargan una
  vez al subir de versión.
- ⚠️ En demo, el audio que se «sube» es siempre el de la historia; una persona que
  quiera probar su propio audio tiene que salir de la demo.
- 🔒 La raíz del pack no cambia de forma: un formato nuevo entra como árbol hermano de
  `short/` con su bloque en el manifest, nunca reorganizando la raíz.
- 🔒 `short/`, si está, es completo: un pack con el árbol a medias no se instala.

## Verificación de cumplimiento

- **Guard `pnpm check:demo`** (`scripts/check-demo.mjs`), secciones nuevas sobre el pack
  mínimo con `short/`: 14. una historia en 9:16 (catálogo y gema) copia desde `short/<estilo>` y completa;
  `project.json` conserva `videoFormat: '9:16'`; 15. con `narrationMode: 'own-audio'` no hay `voice-progress`, la fase `voice` completa
  y `narration.mp3` termina siendo el audio del pack; 16. un pack sin bloque `short` (v2) se instala, `stories['9:16']` no existe y un
  proyecto 9:16 falla con `demo_format_not_included` persistido como error; 17. un pack con `short/` incompleto no se instala (`demo_pack_incomplete`, sin
  `_demo-pack` a medias); 18. `build-demo-pack` arma, desde un pack base y cuatro proyectos nativos sintéticos,
  un zip que `demo-prepare` instala y del que una historia 9:16 completa.
  Las secciones 2 y 3 pasan a assertar `stories['16:9']` y el `audioFile` de cada
  historia.
- **`pnpm check:locales`:** las claves nuevas existen en los tres catálogos.
- **Corrida real:** con el v3 publicado, `demo-prepare` desde una raíz temporal descarga,
  verifica el SHA e instala; `demo-status` trae `stories['9:16']`; `run-video-pipeline`
  con un proyecto demo 9:16 y otro con `own-audio` completan. Evidencia del
  2026-09-11 con el release `demo-pack-v3` (334.224.614 bytes, 210 archivos): raíz
  limpia instalada en 105 s con el `.ok` sellando v3 y el SHA publicado, ocho historias
  en los dos formatos y la gema sembrada; una raíz con el v2 instalado pasó a «no
  listo» por la versión y se actualizó al v3 en 101 s sin temporales (320 MB en disco);
  contra el zip local, Short de catálogo, Short con la gema y `own-audio` en 16:9
  completaron con los archivos de su carpeta.
- **Checklist manual (build instalado), además del de ADR-0029:** (a) al entrar a la
  demo por primera vez tras el bump, la puerta descarga el v3; (b) Short se puede elegir
  y al elegirlo cambian nombre, guion y audio; generar produce un video vertical; (c) en
  «Subir mi audio» el chip aparece cargado con «<historia>.mp3», el picker y la X están
  bloqueados con el aviso, y generar completa; (d) volver a 16:9 restaura la historia
  larga.
- **Cómo se vería una regresión:** Short vuelve a «Próximamente» con el v3 instalado
  (el manifest perdió `stories['9:16']`); el chip de audio aparece vacío en demo
  (`audioFile` ausente); un proyecto Short en demo copia imágenes 16:9 (la carpeta no se
  eligió por formato). Las tres las atrapan las secciones 2, 14 y 15 del guard.

## Modos de falla

| Situación                                       | Código                     | Qué pasa                                                                                                 |
| ----------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `manifest.short` presente pero árbol incompleto | `demo_pack_incomplete`     | `demo-prepare` no escribe `.ok`; la puerta muestra el error y ofrece reintentar                          |
| Proyecto 9:16 con un pack sin `short/`          | `demo_format_not_included` | `job-failed`; el proyecto queda en `error`. Solo por payload a mano: Crear no ofrece Short sin historias |
| `audio.mp3` de una historia ausente             | `demo_pack_incomplete`     | lo detecta `validatePack` antes de sellar el `.ok`                                                       |
| Se subió otro audio en demo (payload a mano)    | —                          | la simulación pisa `narration.mp3` con el del pack: el proyecto queda coherente                          |

## Fuera de alcance

- Historias nuevas en 16:9 o más estilos: el formato lo permite, este pedido no lo
  incluye.
- Un audio real subido por la persona dentro de la demo (ver decisión 4).
- Convertir el zip al formato nativo (D2 de ADR-0029).

## Referencias

- ADR-0029 (modo demo), ADR-0017 (formato 16:9 / 9:16), ADR-0016 (Crear sin render).
- Pack v2 documentado en `~/Documents/vimo-ruta-demo/pack/FORMATO-DEL-PACK.md` (repo de
  origen); release `demo-pack-v2` y `demo-pack-v3` en `otd20071-cloud/vimo-releases`.
