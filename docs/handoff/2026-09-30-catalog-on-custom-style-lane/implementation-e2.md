# Entrega 2: estado de la implementación y traspaso

Implementación de la Entrega 2 de [design.md](design.md) según [plan-e2.md](plan-e2.md), hecha el
2026-10-02 con el patrón de la Entrega 1: el orquestador escribió el contrato, las 38 gemas y las
muestras, y dos agentes en paralelo (sidecar y app) hicieron los subcomandos y la pestaña, cada tarea
con su revisión. Rama `feat/catalogo-estilos`, local, sobre los 43 commits de la Entrega 1.

## Qué quedó

- **Contrato y gemas:** `pipeline/types/catalog.ts` (`CatalogGem` con nombre, descripción y etiquetas
  en tres idiomas, secciones, modos permitidos, modo de las muestras, preset de color y cantidad de
  muestras) y `pipeline/prompts/catalog-gems/` con las 38 gemas (5 de la casa y 33 de Imperio Pro), la
  paleta de etiquetas (`tags.ts`) y `catalog.ts` (`CATALOG_GEMS`, `findCatalogGem`).
- **Muestras:** 152 imágenes en `public/style-references/`: las 20 de siempre y 132 generadas con el
  carril de Vimo (`generate-style-samples`) para las 33 gemas nuevas, a 1280×720. Ver «Muestras».
- **Sidecar:** dominio `pipeline/commands/catalog/` con `catalog-styles-list` (puro) y
  `catalog-style-copy` («Pasar a mi estilo»: valida todo antes de tocar el disco, muestras primero y
  `style.json` al final, con `origin`); `create-video-project` exige la coherencia de §5.4;
  `generate-character-preview` acepta los ids nuevos del catálogo con el marco (los 5 heredados siguen
  con su plantilla fija, P6); `isCharacterStyleId` busca la propiedad propia (ver
  `fixes/2026-10-02_legacy-style-id-prototype-names.md`).
- **App**, detrás de `features.newCatalog` y fuera de la demo: la pestaña Catálogo de Crear con
  tarjetas como las de Mi estilo (`StyleCardFrame`, compartido con `CustomStyleCard`), etiquetas como
  chips, «Usar en este video», «Ver» (`CatalogStyleModal`: etiquetas, modo de personaje y muestras,
  con el modo recordado por estilo en `localStorage`) y «Pasar a mi estilo» (lleva a Mi estilo con
  el modal de la copia abierto, que dice «Basado en …»). Crear con una gema del catálogo: sin selección por defecto, chip del personaje que
  abre «Ver», un personaje como máximo, segundos por escena y modelo de prompts; desaparecen la
  frecuencia, la cantidad de escenas y «Confirmar escenas». El payload es el de §5.4.
- **Con el interruptor apagado** (hoy `VIMO_FLAG_NEW_CATALOG=off`) y en la demo, Crear y el payload del
  catálogo viejo son los de siempre: lo fija `check-app-catalog-payload.mjs` con un snapshot literal.
  Único cambio visible: el texto de ayuda de la pestaña pasa de «Los 5 estilos de Vimo.» a «Los
  estilos de Vimo.» (decisión R10: lo manda el plan y sigue siendo cierto).
- **Docs:** ADR-0039 Aceptada, nota en la ADR-0048, ARCHITECTURE §5 y §6, `scripts/test/README.md` y
  este traspaso.

Commits de la entrega, en orden (todos locales):

| Commit     | Qué                                                                                     |
| ---------- | --------------------------------------------------------------------------------------- |
| `d938ed39` | Contrato del catálogo, paleta de etiquetas y las 5 gemas de la casa (O1)                |
| `926ac219` | Las 33 gemas de Imperio Pro (O2)                                                        |
| `1fa13064` | Muestras del catálogo (O3)                                                              |
| `3bcf4a5b` | Sidecar: `catalog-styles-list`, `catalog-style-copy`, preview y coherencia del proyecto |
| `ceaefeab` | Fix: nombres del prototipo aceptados como ids heredados                                 |
| `2527fd44` | App: módulos puros, tarjetas, «Ver» y «Pasar a mi estilo» (C1 y C2)                     |
| `ad0e9bea` | Ajustes de la revisión del sidecar                                                      |
| `a0c4135c` | Ajustes de la revisión de la app (borrador del personaje compartido)                    |
| `acb8303f` | App: Crear con un estilo del catálogo y «Basado en …» (C3 y C4)                         |
| `a89bcf9a` | Ajustes de la revisión de C3 y C4 y de la prueba visual                                 |
| `92e97e1d` | Gemas: el rol al inicio de `character`, frases fijas de POV Stickman solo de estilo     |
| `59833480` | App: el modal de personaje conoce los estilos del catálogo; textos del personaje fijo   |

El 2026-10-03 se sumaron dos cambios, con la primera generación real de imágenes:

- `feat(pipeline): fill the script language into the styles' fixed phrases`: la plataforma completa
  el marcador `[IDIOMA DEL GUION]` de las frases fijas con el idioma del guion (decisión R6).
- `feat: add the Documentary Realistic samples and require four sharp samples per style`: las 4
  muestras que faltaban y la regla del guard.

Cada frente pasó una revisión independiente por tarea (informes en el espacio de trabajo de la
sesión, no versionado). Hallazgos y qué se hizo con ellos:

- **Sidecar:** aprobado con siete menores; seis aplicados en `ad0e9bea`.
- **App, C1 y C2:** un importante (el borrador del personaje duplicado entre los dos modales,
  corregido en `a0c4135c`) y dos menores aplicados.
- **App, C3 y C4:** aprobado con siete menores. Aplicados en `a89bcf9a`: la selección de la otra
  pestaña sobrevive a la pantalla de progreso (vive en `Create.tsx` y el cambio de pestaña pasa por el
  helper puro `tabSwitchSelection`), un personaje como máximo al entrar a una gema del catálogo, y el
  caso del guard de la copia por el camino real.
- **Prueba visual** (script local sin versionar: los componentes reales con el CSS del build y la API
  simulada, en Chrome headless): la grilla dibuja las 38 tarjetas con la misma altura, con 148
  imágenes sin roturas y sin desborde horizontal; «Ver» tampoco desborda. Dos hallazgos corregidos en
  `a89bcf9a`: los botones de «Ver» quedaban cortados bajo el carrusel (ahora son un pie fijo) y el
  aviso de selección quedaba debajo de las 38 tarjetas (ahora va arriba).
- **Revisión final de toda la entrega** (un revisor aparte sobre los 11 commits): sin críticos. Lo
  comprobó ejecutando el código real: 456 payloads de proyecto (38 gemas × 3 idiomas × 4 variantes
  de personaje) armados por los módulos de la app y aceptados por `create-video-project`, y 38
  copias con las 148 muestras reales aceptadas por `catalog-style-copy`. Encontró cuatro
  importantes; tres se corrigieron y el cuarto es de integración (sección «Integración»):
  - La sección `character` de 7 gemas no abría con el rol, y el tejedor armaba frases rotas («the
    smooth walking…», «the main character…»). Corregido en `92e97e1d`, con una regla nueva en
    `check-catalog-gems.mjs` (el rol esperado por gema, contra el tejedor real).
  - Las frases fijas de POV Stickman describían al muñeco y se pegan en todas las escenas, también
    en las que no llevan protagonista. Ahora son solo de estilo (`92e97e1d`).
  - El modal de crear personaje no conocía los 33 ids nuevos (`59833480`).

## Decisiones tomadas durante la implementación

| ID  | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Las muestras del catálogo las genera Vimo con su propio carril (`generate-style-samples`) y las claves del llavero de la app. No se toman de terceros ni de la previsualización del estilo de origen (regla del dueño). Ver «Muestras».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R2  | Pedido del dueño al aprobar el plan: etiquetas del admin (P12). `CatalogGem.tags: LocalizedText[]` con la paleta `CATALOG_TAGS`; «Dinamismo» si y solo si hay `dynamism` y «Personaje fijo» si y solo si hay `character`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| R3  | Frente C en dos despachos (C1+C2 y C3+C4) para que cada diff tenga una revisión propia.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R4  | `CATALOG_SAMPLE_COUNT` en la app es una constante con comentario, no un `typeof` sobre `catalog-store.ts` (ese archivo lo creaba el frente A al mismo tiempo).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R5  | La gema `realista` de Imperio Pro se llama «Realista Documental» en el catálogo: con el nombre de origen chocaba con la gema de la casa «Realista».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| R6  | En el origen cada prompt cierra con «If any text appears in the image, it must be written in [IDIOMA DEL GUION]» y el marcador lo completa el modelo. Acá el final fijo lo pega el código, así que el idioma lo pone el código: `fixedPhrasesInLanguage` (`pipeline/prompts/template-frame.ts`) cambia el marcador por el idioma detectado del guion (`detectScriptLanguage`, «Spanish») al pegar, quitar o recortar las frases fijas, en el carril, las muestras, el respaldo y el rescate de imágenes. Sin idioma detectado, o en el retrato de un personaje (no tiene guion), va «the narration's own language». Las 31 gemas de Imperio Pro con final fijo cierran con esa frase; Realista Documental y Realista Personaje no tienen final fijo y la llevan como instrucción en `rules`. Vale también para las gemas de Mi estilo que traigan el marcador. Medido: sin la frase, el generador inventaba los carteles en inglés con un guion en español; con ella salen en español. |
| R7  | Las gemas de Imperio Pro cuyo agente no fijó `promptEnd` reciben la frase `Style: …` de su ficha de origen (infografico-amarillo, 2d-personaje-1, 2d-mono, 2d-asiatico, documental-oscuro, cosmos); `realista` y `realista-personaje` no, porque su sufijo lo deduce el modelo del tono del guion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R8  | `catalogStyleId` en el snapshot del proyecto marca una gema usada directamente del catálogo (`customStyle.styleId` igual a ese id). Un proyecto creado desde una copia de «Pasar a mi estilo» no lo lleva: su procedencia vive en `style.json` (`origin`). Dos fixtures de la Entrega 1 que mezclaban las dos cosas no tenían productor en la app y se adaptaron.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R9  | El tope de 80 caracteres del nombre del snapshot vale para todo `customStyle`, no solo para el catálogo: la galería ya lo capa al guardar, así que no rechaza datos existentes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| R10 | El texto de ayuda de la pestaña Catálogo («Los estilos de Vimo.») es uno solo, también con el interruptor apagado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R11 | El guard del payload de Crear (`check-app-catalog-payload.mjs`) empaqueta el `createProjectPayload` y el `formBlockers` reales con esbuild (como `check-app-vimo-server.mjs`) en vez de probar un fragmento puro: es la única forma de fijar el payload viejo entero, byte por byte.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R12 | Realista Documental (`realista`) permite solo el modo cinemático (`allowedModes: ['none']`): sus reglas piden describir a cada persona entera en cada prompt, lo contrario de lo que el marco hace con un protagonista. Para un protagonista está Realista Personaje. Salió de la revisión final, antes de la QA.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Las gemas: qué se cambió a mano

Las 38 pasaron por el agente reconstructor (CometAPI `gpt-5.4-nano-2026-03-17`,
`reasoning_effort: medium`; 38 de 38 en una llamada cada una salvo Terror, que necesitó dos; 124 000
tokens de entrada y 118 000 de salida, unos 14 ¢ en total a la tarifa de CometAPI). Después se
revisaron una por una.

**Las 5 de la casa** (`normal`, `pov_stickman`, `cartoon`, `fantasia`, `terror`) se escribieron a mano
sobre la respuesta del agente, porque esta mezclaba idiomas (Terror), perdía la sección `character`
(POV Stickman: el muñeco fue a `visualStyle`) y no fijaba `promptEnd` cuando el bloque STYLE superaba
los 600 caracteres (Cartoon, Fantasía). Reglas que valen para las 5:

- `dynamism` en inglés traduce el contrato del director (spec §8): el menú de tratamientos del estilo
  (Realista sin `diagram` ni `bubble`), al menos 1 de cada 3 escenas explicativa o alusiva, nunca 3
  tratamientos ni 3 lugares iguales seguidos, el protagonista en alrededor del 50 % de las escenas.
- Las reglas de armado del carril viejo (longitud total, bloques, el ejemplo JSON) y el manejo del
  bloque de personaje quedaron afuera: el marco teje al protagonista por código.
- El cierre literal de Realista y los bloques STYLE son `promptEnd`; los de Cartoon, Fantasía y Terror
  se condensaron a 600 caracteres (se quitaron repeticiones, no rasgos). Los prólogos de POV Stickman,
  Fantasía y Terror son `promptStart`. Fantasía y Terror conservan «SCENE:» al inicio de la escena para
  que el prompt final tenga la forma con la que salieron las muestras.
- POV Stickman: el muñeco en `character` (identidad: cabeza, cara, extremidades; `Outfit:` con una
  ropa base azul y gris que cada escena reemplaza por la que pide la historia) y sus reglas (otros
  muñecos iguales con ropa propia, ropa según la historia) en `rules`.
- Terror conserva su seguridad de contenido específica en `rules` (la del marco es genérica).
- `sampleMode: 'generic'` en las 5: sus muestras tienen protagonista.

**Las 33 de Imperio Pro** (`estilos/`, sin `contenido-real`) salieron del agente con sus secciones en
el idioma del autor (español en su mayoría; el modelo las lee). Ajustes por gema:

| Gema                   | Qué se cambió                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2d-stickman            | `character` concreto (el agente dejó `Outfit: [ROPA DETALLADA]`): cabeza blanca, rasgos 2D, extremidades de línea; `Outfit:` con ropa base y «la que da la historia».                        |
| 2d-personaje-1         | `character`: los guantes blancos pasan a la oración `Outfit:` (faltaba); `promptEnd` = `Style:` de la ficha.                                                                                 |
| stickman-cinematico    | `visualStyle` nuevo (el del agente tenía 72 caracteres); `character` nuevo con el stick figure de su Fase 1; `rules` sin «describe su anatomía y su ropa en cada prompt» (lo teje el marco). |
| 3d-relatos             | `camera` y `rules` sin las instrucciones de la hoja de personaje de la Fase 1.                                                                                                               |
| 2d-basico-explicativo  | `character` concreto; `dynamism` sin el «recordatorio físico» de `[subject]`; `rules` sin la plantilla de la Fase 1 ni las plantillas A/B; «español» → «idioma del guion».                   |
| 2d-mono                | `character` sin «neutral pose» ni la instrucción de la Fase 1; `Outfit: none…`; `rules` sin la frase con marcador; `promptEnd` = `Style:` de la ficha.                                       |
| 2d-cavernicola         | `promptEnd` sin las dos frases de idioma.                                                                                                                                                    |
| 2d-crayon              | `rules` sin la «regla maestra» y la relación 1:1 (protocolo de chat).                                                                                                                        |
| 2d-bola                | `character`: `Outfit:` concreto.                                                                                                                                                             |
| realista               | `rules` sin «prohibido actuar como asistente conversacional»; nombre «Realista Documental».                                                                                                  |
| 2d-asiatico            | `promptEnd` = frase de la ficha (el agente no la fijó).                                                                                                                                      |
| pixel-retro            | `visualStyle` sin la hoja de sprite «isolated on a plain white background».                                                                                                                  |
| noir-detective         | `rules` sin la relación 1:1; «ropa de color distinto» → «de tono distinto» (el estilo es blanco y negro).                                                                                    |
| caricatura-editorial   | `visualStyle` sin «the protagonist reference is isolated on a plain white paper background».                                                                                                 |
| documental-oscuro      | `promptEnd` = `Style:` de la ficha.                                                                                                                                                          |
| cosmos                 | `rules` sin la frase con marcador; `promptEnd` = `Style:` de la ficha.                                                                                                                       |
| las 19 con el marcador | R6: la frase de idioma sale de `promptEnd`.                                                                                                                                                  |

Sin cambios: infografico-amarillo (solo `promptEnd` de la ficha), 2d-estilo, 2d-personaje,
abstracto-rojo, realista-personaje, 2d-comic, mistico, anime-storytime, claymation, papercraft,
cyberpunk-neon, infografia-azul, blueprint-tecnico, collage-retro, terror-analogico, naturaleza-epica,
mapa-historico (más allá de R6).

`sampleMode`: `generic` en las 17 con personaje fijo en el origen y `none` en las 16 sin él (P3).
`allowedModes: ['generic', 'own', 'none']` en las 38; la QA de la Ola 3 decide si alguna restringe.

## Muestras

- **Las 5 de la casa:** las 20 de siempre (`public/style-references/`, 1920×1072).
- **Las 33 de Imperio Pro**, incluida Realista Documental: 4 muestras por estilo generadas el
  2026-10-03 con el carril de Vimo, el mismo subcomando `generate-style-samples` que usa la app en Mi
  estilo. Cada gema pasó por los cuatro momentos fijos de `pipeline/prompts/style-samples.ts`, con el
  marco de la plantilla, su modo de personaje (`sampleMode`), los prompts escritos por el modelo de
  la casa (DeepInfra) y las imágenes de Evolink (`gpt-image-2`, 16:9 1K, calidad `low`, la de las
  previsualizaciones de la app; el dueño pidió calidad baja). Las 132 salieron a la primera: 6 gemas
  a la vez, 5 minutos.
- **Formato:** el proveedor entrega 1360×768 y cerca de 1 MB por imagen. Se guardan a 1280×720, JPEG
  progresivo de calidad 85: 20,6 MB en total, 160 KB de promedio (la más pesada, 339 KB).
- **Orden:** la portada de la tarjeta es la muestra 1. En las gemas nuevas, `_1` es el momento de la
  calle (el segundo del guion de muestra) y `_2` el primer plano del amanecer (el primero): con el
  primer plano de portada, 33 tarjetas abrían con una cara casi igual y distinta de las 5 de la casa,
  que abren con una calle. `_3` y `_4` van como salen. Realista Documental conserva el orden (su
  momento de la calle es un plano detalle). La app no rotula las muestras por momento: solo las
  numera.
- **Revisión:** miradas las 132 en hojas de contacto. Cada estilo sale en su técnica y, en las gemas
  con personaje, con el mismo protagonista en las cuatro. Los carteles salen en español, el idioma
  del guion de muestra (R6). Abstracto Rojo, Documental Oscuro y Terror Analógico salen oscuros, como
  los describe su gema. Se repitieron dos gemas: Pixel Retro (una muestra traía al personaje
  pegado aparte, fuera de la escena) y Abstracto Rojo.

**Regla del dueño: las muestras del catálogo las genera Vimo.** No se toman de terceros ni de la
previsualización del estilo de origen. `check-catalog-gems.mjs` fija que toda gema trae sus 4
muestras y que cada una mide 1280×720 o más.

**Cómo repetirlas** (una gema nueva, o cambiar las de una gema):

1. Claves `deepinfra` y `evolink` (o `fal`). El 2026-10-03 se leyeron del llavero de la app
   (servicio `click.vimo.portable`, cuenta `api-keys`) con un script local sin versionar que las deja
   solo en memoria. También sirve un `.harness-keys.json` en la raíz (ignorado por git), como dice
   el README.
2. Por cada gema, en una raíz de prueba (nunca `~/Documents/Vimo`): sembrar
   `<raíz>/_styles/<id>/style.json` con `name`, `sections`, `templateVersion`, `colorFilter`,
   `character: { mode: <sampleMode> }`, `shots: []` y `createdAt`, y correr
   `pnpm pipeline:harness generate-style-samples --payload '{"styleId":"<id>","imageProvider":"evolink"}' --root <raíz>`.
3. Mirar las cuatro y repetir la gema si alguna salió rota o fuera de estilo.
4. Llevar cada `sample-<n>.jpg` a 1280×720 con el ffmpeg de `src-tauri/binaries`
   (`scale=1280:720:force_original_aspect_ratio=increase:flags=lanczos,crop=1280:720`), codificarla
   con `cjpeg -quality 85 -optimize -progressive` y guardarla como
   `public/style-references/<id>_<n>.jpg`, con la calle en el `_1`.
5. `node --test scripts/test/check-catalog-gems.mjs`.

Costo: 0,0036 USD por imagen en Evolink (calidad `low`), es decir 0,48 USD las 132 y 0,014 USD
repetir una gema; más centavos de DeepInfra por los prompts. Clave propia del dueño.

## Verificación

Sobre el HEAD de la entrega (`59833480`), el 2026-10-03:

| Qué                                                                                                                                                                                                                        | Resultado                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `pnpm lint`                                                                                                                                                                                                                | verde                                                 |
| `pnpm build` (`tsc -b` + Vite)                                                                                                                                                                                             | verde                                                 |
| `pnpm format:check`                                                                                                                                                                                                        | verde                                                 |
| `pnpm check:locales`                                                                                                                                                                                                       | 1496 claves alineadas en es, en y pt                  |
| `node --test scripts/test/check-gem-*.mjs check-app-*.mjs check-catalog-*.mjs check-preview-regressions.mjs`                                                                                                               | 431 de 431                                            |
| Carril viejo y verbatim (`check-catalog-prompts`, `check-character-identity-lock`, `check-scene-wardrobe`, `check-verbatim-prompt-language`, `check-verbatim-prompt-persistence`, `check-prompt-identity-travels-as-text`) | 91 de 91                                              |
| `pnpm check:demo`                                                                                                                                                                                                          | 99 de 99                                              |
| `pnpm test:tauri`                                                                                                                                                                                                          | 51 de 51                                              |
| `pnpm build:sidecar` y `pnpm pipeline:harness catalog-styles-list`                                                                                                                                                         | binario reconstruido; `job-completed` con 38 entradas |
| `pnpm pipeline:harness create-video-project` con el payload de §5.4 (`infografico-amarillo`)                                                                                                                               | `job-completed`; `project.json` con `catalogStyleId`  |

Lo que falla y ya fallaba en `dev` (no lo toca esta rama): `check-style-character-video.mjs`,
`check-editor-character-selection.mjs` y `check-silent-scene-images.mjs` (33 tests, los mismos de la
Entrega 1) y `check-packaged-catalog.mjs` (con el sidecar reconstruido). Los cuatro por la misma
causa: sus simulaciones del LLM no responden a la revisión de alineación narrativa que sumó el PR #91
(`scene_prompt_alignment_failed`); `pipeline/stages/scene-prompts/narrative-alignment.ts` y esos
guards no cambian en esta rama.

Hasta el 2026-10-03 no se pudo recorrer la pestaña nueva en `tauri dev`: el interruptor
`VIMO_FLAG_NEW_CATALOG` estaba en `off` en producción. Lo que sí se verificó sin la app: los módulos
puros, el payload por carril con el formulario real empaquetado, los subcomandos contra el sidecar
real, y la galería y «Ver» reales dibujados en Chrome headless con el CSS del build (38 tarjetas,
alturas, imágenes, desbordes, el pie fijo de «Ver» y el aviso de selección). Queda por mirar en la
app (WebKit): el pie fijo de «Ver» se midió en Chrome.

**El interruptor está en `admins` desde el 2026-10-03 a las 14:15**, con la aprobación del dueño:
`wrangler pages secret put VIMO_FLAG_NEW_CATALOG` y un redeploy del mismo commit de producción de
vimo-landing (`main@c708864`, deployment `1f44ad93`), porque en Pages un secreto vale desde el
próximo deployment. El comportamiento público de `vimo.click` quedó igual que antes del redeploy
(mismos 401 y CORS en `verificar-acceso` y `estilos/reconstruir`, y la política de enforcement con el
mismo `kid`, estado y firma válida). Falta lo que solo ve una sesión de admin: que `verificar-acceso`
devuelva `features.newCatalog: true` y que la pestaña aparezca al reiniciar la app.

Con las muestras y la frase de idioma (2026-10-03): `pnpm lint`, `pnpm build`,
`pnpm format:check` y `pnpm check:locales` en verde, y los guards de gemas, app, catálogo y carril de
prompts, 497 de 497. Cada punto donde el sidecar pega o recorta las frases fijas
tiene un test que se pone en rojo si se le quita el idioma.

## Ajustes de la QA del dueño (2026-10-03)

El dueño probó la pestaña con su cuenta de admin y pidió siete cambios de pantalla, que quedaron en
cinco commits. Ninguno toca el sidecar ni el contrato; cada commit tiene su informe en `fixes/` y la
nota del 2026-10-03 de la
[ADR-0048](../../adr/ADR-0048-gemas-por-secciones-y-agente-reconstructor.md) los resume.

| Commit     | Qué cambia                                                                                                                                                      | Informe                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `39f7db44` | «Ver» del catálogo: los interruptores de personaje van arriba de las muestras                                                                                   | `fixes/2026-10-03_catalog-view-character-first.md`     |
| `7dbf121d` | Mi estilo dice «Personaje del estilo» cuando la gema trae su personaje (modal y chip de Crear)                                                                  | `fixes/2026-10-03_style-own-character-label.md`        |
| `c0fab6ff` | «Pasar a mi estilo» lleva a Mi estilo con el modal de la copia abierto; sin el aviso con «Ir a Mi estilo»                                                       | `fixes/2026-10-03_catalog-copy-opens-in-custom-tab.md` |
| `7eeeb26a` | El modal de Mi estilo ya no ofrece «Pegar gema nueva»                                                                                                           | `fixes/2026-10-03_remove-paste-new-gem.md`             |
| `de495bd5` | El aviso «Adaptamos …» dura una visita a la pestaña, el del modal se cierra solo a los 60 s y la tarjeta de una gema adaptada lleva la etiqueta «Gema adaptada» | `fixes/2026-10-03_gem-adaptation-notices.md`           |

**Cómo se probó.** Cada commit se verificó por separado (formato, lint, build, catálogos y los
guards de la app, el catálogo y las gemas: 415 en el último). Además, los cambios se recorrieron
con el formulario real de Crear montado en Chrome sin interfaz, dentro de `StrictMode` como en
`pnpm tauri dev`, con la API y el agente simulados: 26 comprobaciones, todas en verde. Ese arnés es
local y no se versiona. Falta el recorrido del dueño en la app.

**Lo que el dueño pidió y no está en estos commits:** editar las gemas del catálogo y sus etiquetas
desde la app con su cuenta de admin. No es un fallo de la cuenta: las 38 gemas viven en el código
(`pipeline/prompts/catalog-gems/`) y la edición desde la app es la Entrega 3 del diseño (catálogo en
Supabase, endpoints de admin en `vimo-landing` y su pantalla), que no está construida. Queda a la
espera de que el dueño decida el alcance.

### Segunda tanda, el mismo día

Con esos cambios probados, el dueño pidió tres ajustes más y preguntó por el prompt de sistema. De
probar el tercero salió un cuarto arreglo. Tampoco tocan el sidecar ni el contrato.

| Commit     | Qué cambia                                                                                                                                                            | Informe                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `80971b7b` | El aviso «Adaptamos …» sale arriba de las tarjetas de Mi estilo                                                                                                       | `fixes/2026-10-03_gem-migration-notice-on-top.md`  |
| `50aa056e` | El aviso «Lo que la IA ajustó de tu gema» explica que las reglas de flujo, de formato y de idioma las pone Vimo                                                       | `fixes/2026-10-03_gem-warnings-platform-note.md`   |
| `ee8f54ea` | La copia dice «Gema clonada del catálogo» con el nombre en una píldora amarilla; el aviso de la copia en curso, «Clonando gema del catálogo»                          | `fixes/2026-10-03_catalog-clone-label.md`          |
| `ac21db7a` | Los avisos de «Pasar a mi estilo» quedan pegados abajo de lo que se ve (el scroll que los traía a la vista lo cortaba el foco del menú) y el de fallo se puede cerrar | `fixes/2026-10-03_catalog-copy-notices-in-view.md` |

**Cómo se probó.** Cada commit con formato, lint, build y catálogos (1495 claves en el último), y
con el mismo arnés de Chrome, ahora con el formulario dentro del contenedor que scrollea en la app
(`<main>`): 35 comprobaciones en verde. Falta el recorrido del dueño en la app, que corre sobre
WebKit.

**Pregunta del dueño, resuelta el 2026-10-04: el rol al inicio del `system`.** El 2026-10-03 el
dueño preguntó si el prompt de sistema debería abrir con el rol de su gema («Eres un Director de
Arte y Prompt Engineer experto en IA visual» y su «REGLA MAESTRA» de solo texto) o si funciona bien
sin eso. Ese día no se cambió: el marco (`buildTemplateSystem`) abría con `# VISUAL STYLE`, las
muestras de las 33 gemas nuevas habían salido así, la regla de solo texto es de un Gem de chat (acá
el modelo se llama por API, solo devuelve texto, y los prompts los manda Vimo al generador) y una
regla nueva en el marco cambia todos los videos. Al día siguiente el dueño decidió sumarlo «para
estar seguros». El marco abre ahora con `FRAME_ROLE_LINE` (commit `feat(pipeline): open the gem
frame with the role of the model`, informe `fixes/2026-10-04_template-frame-role-line.md`, nota del
2026-10-04 de la ADR-0048). **Es el único cambio de esta tanda que toca el sidecar:** para verlo hay
que reiniciar `pnpm tauri dev`. No se midió con claves reales antes de entrar: la medición es la QA
de generación del dueño.

## Integración con `dev` y con la rama hermana

Verificado el 2026-10-03 con `git merge-tree` (solo lectura; no se mergeó ni se rebaseó nada):

- **`origin/dev`** avanzó 3 commits desde la base de esta rama (`c007e008`): el PR #92 («Fix/promot
  missing») y el cambio de versión a 0.9.0. Esta rama lleva 57 commits propios. Al integrar chocan
  dos archivos, los dos por cambios de la Entrega 1: `pipeline/stages/scene-prompts/scene-prompts.ts`
  y `src/modules/videos/constants.ts`.
- **`fix/prompt-identity-travels-as-text`** (`d1532716`, local, decisión del dueño del 2026-10-02: un
  personaje de identidad de prompt viaja siempre como texto) borra el aviso
  `create.characters.noStylePreviewHint` y la copia del retrato del estilo, que es justo el bloque de
  `CharacterSection.tsx` que esta entrega tocó: un conflicto ahí. Cuando ese fix entre, hay que quitar
  entero el bloque `withoutStylePreview` (también la variante de esta entrega) y actualizar dos
  comentarios que describen la regla vieja (`previewStyleKeyOf.ts` y `CharacterSection.tsx`).
- Mientras tanto, la QA de «Mi personaje» con un personaje de texto en esta rama ejercita la regla
  vieja (el retrato del estilo viaja como imagen de referencia).

El orden (rebase sobre `dev`, cuál de las dos ramas entra primero) lo decide el dueño.

**Guards que ya fallan en `dev`.** Verificado el 2026-10-04 contra `origin/dev` (`7cf81422`): seis
guards provisorios fallan igual ahí que en esta rama, así que no son de esta entrega.
`check-editor-character-selection.mjs` y `check-style-character-video.mjs` no contestan la revisión
de correspondencia narrativa (ADR-0043) y caen con `scene_prompt_alignment_failed`;
`check-silent-scene-images.mjs`, `check-api-key-ui.mjs`, `check-editor-character-ui.mjs` y
`check-export-header-ui.mjs` fallan por sus propias aserciones. Los guards de la app, el catálogo,
las gemas y el carril verbatim (433) están en verde.

## Pendientes y pasos del dueño

**Pasos del dueño (Ola 3 del plan), en orden:**

1. Reiniciar `pnpm tauri dev` (reconstruye el sidecar con los subcomandos del catálogo y relee el
   acceso).
2. ~~Encender el interruptor para administradores.~~ Hecho el 2026-10-03 con la aprobación del dueño
   (ver «Verificación»).
3. Recorrido con el interruptor encendido (lista completa en «Qué mirar», abajo) y con el interruptor
   apagado (Crear tiene que estar como siempre; se ve con una cuenta que no sea admin o en la demo).
4. ~~`.harness-keys.json` para regenerar las muestras.~~ Hecho el 2026-10-03 con las claves del
   llavero de la app (sección «Muestras»).
5. QA con claves reales (E2-7): guiones × estilos × modos contra el catálogo viejo, con el costo y el
   tiempo de la fase de prompts (criterios de la ADR-0039). Prioridad: las 5 de la casa y las gemas
   con personaje fijo. De esa QA sale qué modos permite cada gema (`allowedModes`).
6. Visto bueno: `VIMO_FLAG_NEW_CATALOG` a `all` y arranca el plazo de 7 días del retiro del carril
   viejo.
7. Push de `feat/catalogo-estilos` y PR a `dev` cuando el dueño lo diga.

**Qué mirar en `tauri dev`:**

- Interruptor apagado (o en la demo): Crear abre en Catálogo con Realista elegido, la galería vieja,
  cantidad de escenas, «Confirmar escenas» y la frecuencia con un personaje; Mi estilo como siempre;
  la demo con sus tres estilos.
- Interruptor encendido: Catálogo arranca sin tarjeta y con el aviso para elegir; 38 tarjetas con sus
  etiquetas (las de la casa primero); el menú de tres puntos con «Usar en este video», «Ver» y «Pasar
  a mi estilo»; «Ver» con las etiquetas, el modo de personaje arriba y las muestras debajo (el modo
  se recuerda al volver a abrir); el chip del personaje en Crear abre «Ver» de esa gema; «Pasar a
  mi estilo» lleva a Mi estilo con el modal de la copia abierto y la deja en uso, con «Gema
  clonada del catálogo» y el nombre en una píldora amarilla (mientras se copia, el aviso «Clonando
  gema del catálogo» se ve abajo de la ventana, sin que la página se mueva); al volver a Catálogo
  sigue elegida la gema de antes; generar con una gema de la casa (por ejemplo Fantasía) y con una
  de Imperio Pro.
- Mi estilo, después de la QA del 2026-10-03 (sección «Ajustes de la QA del dueño»): una gema que
  trae su personaje dice «Personaje del estilo» en su modal y en el chip de Crear; el modal ya no
  ofrece «Pegar gema nueva»; al adaptarse una gema sale el aviso «Adaptamos …» arriba de las
  tarjetas, que se va al cambiar de pestaña; el aviso del modal explica qué reglas pone Vimo y se
  cierra solo al minuto, y la tarjeta queda con la etiqueta «Gema adaptada».

**Límites conocidos y decisiones que quedan para el dueño:**

- **Textos de «modelos bloqueados».** Cinco textos (`common.promptModelBlocked.allBlocked`,
  `create.validation.promptModelsBlocked`, `create.styleSource.customBlockedHint`,
  `create.promptModel.allBlocked`, `create.promptModelIssue.allBlockedHint`) ofrecen «usá un estilo de
  Vimo» como salida. Con el catálogo nuevo eso deja de ser cierto: una gema del catálogo también
  necesita un modelo de prompts. Solo se ve con todos los modelos bloqueados y el interruptor
  encendido; se corrigen con el retiro del carril viejo o antes, si el dueño lo pide.
- **Catálogo nuevo sin tarjeta elegida.** Hasta que la persona elige una tarjeta, el cálculo previo
  de costo y la clave del preview de personaje se calculan como en el catálogo viejo (con el
  `styleId` del formulario). El envío ya está bloqueado en ese estado, así que es cosmético: puede
  aparecer una línea de saldo calculada para el otro carril.
- **Texto en las muestras y en el video.** La frase de idioma (R6) hace que los carteles que inventa
  el generador salgan en el idioma del guion. Quedan dos diferencias conocidas. Una palabra que el
  modelo de prompts cita traducida sale como la citó (en las 132 muestras, «PAPERS» en dos gemas y
  «CITY ST» en una). Y el video suma al final de cada prompt la cláusula de texto de la plataforma
  (`IMAGE_TEXT_LANGUAGE_CLAUSE`: solo se dibujan las palabras citadas), que las muestras y el retrato
  no llevan: una muestra puede mostrar más carteles que el video.
- **Peso de las muestras.** Las 132 nuevas suman 20,6 MB en el repo y en el paquete de la app. Si
  pesa demasiado, la misma tanda a calidad 75 son unos 15 MB.
- **«wearing none».** En las gemas cuyo personaje no lleva ropa (2D Básico Explicativo, 2D Bola), la
  regla de vestuario por escena deja frases como «wearing none» y el párrafo del vestuario en cada
  prompt. No rompe la imagen; se ve al leer los prompts. Queda para la QA paga.
- **Una copia que falla a mitad** (fallo de disco) deja una carpeta `_styles/st-…` sin `style.json`:
  `styles-list` no la muestra y nada la borra. No se limpia a propósito: el único fallo que un guard
  puede inyectar es una ruta que ya existe, y ahí borrar sería peligroso.
- **Diagnóstico.** La fila de una copia sale como `Estilo: <nombre>`, pero sin id (Rust lee `id` o
  `styleId` y el payload trae `catalogStyleId`). Rust no se tocó.
- **Preview de personaje de los 5 ids heredados:** sigue con la plantilla fija de siempre (P6) hasta
  el retiro del carril viejo.
- **Frases fijas que nombran un personaje.** `3d-relatos` («stylized cinematic 3D character») y
  `caricatura-editorial` («exaggerated proportions with an oversized head») traen esas palabras en
  su `promptEnd`, que se pega también en las escenas sin protagonista. Se dejaron como en el origen
  (Imperio Pro las pega igual en todas); la QA con imágenes dice si hay que hacerlas condicionales,
  como se hizo con POV Stickman.
- **Diagnóstico y exportación de prompts.** La fila de diagnóstico de un proyecto del catálogo lleva
  `styleId: normal` sin el id de la gema, y el `.txt` de prompts dice «Style: normal». Para la QA
  conviene mirar `project.json` (`options.customStyle.catalogStyleId`).
- **Copia en curso al cambiar de pestaña.** El estado de la copia vive en la galería: si la persona
  sale de la pestaña Catálogo y vuelve mientras se copia, puede lanzar otra copia del mismo estilo.
- **Tarjeta de una copia en Mi estilo:** tiene una línea más («Basado en …») que las de los estilos
  propios; en una fila que mezcla las dos, el pie queda desparejo.
- **Sin buscador ni filtros** en la pestaña (38 tarjetas en tres columnas): fuera de alcance; se
  evalúa en la QA. Las etiquetas ya viajan en cada gema, así que un filtro por etiqueta no necesita
  cambios en el contrato.
- **Entrega 3** (catálogo remoto en Supabase, administración de gemas y etiquetas desde la app): el
  contrato de esta entrega ya tiene la forma de esa fila (`name`, `description` y `tags` en tres
  idiomas dentro de la gema).
