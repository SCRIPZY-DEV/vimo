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
- **Muestras:** 148 imágenes en `public/style-references/`: las 20 de siempre y 128 generadas con el
  carril de Vimo (`generate-style-samples`) para 32 de las gemas nuevas; `realista`, todavía sin
  muestras.
- **Sidecar:** dominio `pipeline/commands/catalog/` con `catalog-styles-list` (puro) y
  `catalog-style-copy` («Pasar a mi estilo»: valida todo antes de tocar el disco, muestras primero y
  `style.json` al final, con `origin`); `create-video-project` exige la coherencia de §5.4;
  `generate-character-preview` acepta los ids nuevos del catálogo con el marco (los 5 heredados siguen
  con su plantilla fija, P6); `isCharacterStyleId` busca la propiedad propia (ver
  `fixes/2026-10-02_legacy-style-id-prototype-names.md`).
- **App**, detrás de `features.newCatalog` y fuera de la demo: la pestaña Catálogo de Crear con
  tarjetas como las de Mi estilo (`StyleCardFrame`, compartido con `CustomStyleCard`), etiquetas como
  chips, «Usar en este video», «Ver» (`CatalogStyleModal`: muestras, etiquetas y modo de personaje,
  recordado por estilo en `localStorage`) y «Pasar a mi estilo» (la copia aparece en Mi estilo con
  «Basado en …»). Crear con una gema del catálogo: sin selección por defecto, chip del personaje que
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

## Decisiones tomadas durante la implementación

| ID  | Decisión                                                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Las muestras del catálogo las genera Vimo con su propio carril (`generate-style-samples`) y las claves del llavero de la app. No se toman de terceros ni de la previsualización del estilo de origen. Ver «Muestras».                                                                                                                                             |
| R2  | Pedido del dueño al aprobar el plan: etiquetas del admin (P12). `CatalogGem.tags: LocalizedText[]` con la paleta `CATALOG_TAGS`; «Dinamismo» si y solo si hay `dynamism` y «Personaje fijo» si y solo si hay `character`.                                                                                                                                         |
| R3  | Frente C en dos despachos (C1+C2 y C3+C4) para que cada diff tenga una revisión propia.                                                                                                                                                                                                                                                                           |
| R4  | `CATALOG_SAMPLE_COUNT` en la app es una constante con comentario, no un `typeof` sobre `catalog-store.ts` (ese archivo lo creaba el frente A al mismo tiempo).                                                                                                                                                                                                    |
| R5  | La gema `realista` de Imperio Pro se llama «Realista Documental» en el catálogo: con el nombre de origen chocaba con la gema de la casa «Realista».                                                                                                                                                                                                               |
| R6  | La frase «If any text appears in the image, it must be written in [IDIOMA DEL GUION]» no puede ser una frase fija (lleva un marcador que nadie reemplaza): sale de `promptEnd` de las 19 gemas que la traían; la regla de idioma de los textos en pantalla ya vive en `rules` de cada una.                                                                        |
| R7  | Las gemas de Imperio Pro cuyo agente no fijó `promptEnd` reciben la frase `Style: …` de su ficha de origen (infografico-amarillo, 2d-personaje-1, 2d-mono, 2d-asiatico, documental-oscuro, cosmos); `realista` y `realista-personaje` no, porque su sufijo lo deduce el modelo del tono del guion.                                                                |
| R8  | `catalogStyleId` en el snapshot del proyecto marca una gema usada directamente del catálogo (`customStyle.styleId` igual a ese id). Un proyecto creado desde una copia de «Pasar a mi estilo» no lo lleva: su procedencia vive en `style.json` (`origin`). Dos fixtures de la Entrega 1 que mezclaban las dos cosas no tenían productor en la app y se adaptaron. |
| R9  | El tope de 80 caracteres del nombre del snapshot vale para todo `customStyle`, no solo para el catálogo: la galería ya lo capa al guardar, así que no rechaza datos existentes.                                                                                                                                                                                   |
| R10 | El texto de ayuda de la pestaña Catálogo («Los estilos de Vimo.») es uno solo, también con el interruptor apagado.                                                                                                                                                                                                                                                |
| R11 | El guard del payload de Crear (`check-app-catalog-payload.mjs`) empaqueta el `createProjectPayload` y el `formBlockers` reales con esbuild (como `check-app-vimo-server.mjs`) en vez de probar un fragmento puro: es la única forma de fijar el payload viejo entero, byte por byte.                                                                              |

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
| realista               | `rules` sin «prohibido actuar como asistente conversacional»; nombre «Realista Documental»; sin muestras todavía.                                                                            |
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
- **32 de las 33 de Imperio Pro:** 4 muestras por estilo generadas con el carril de Vimo, el mismo
  subcomando `generate-style-samples` que usa la app en Mi estilo: los cuatro momentos fijos de
  `pipeline/prompts/style-samples.ts`, el marco de la plantilla, el modo de personaje de cada gema
  (`sampleMode`), los prompts del modelo de la casa y las imágenes de Evolink (`gpt-image-2`, 16:9
  1K, calidad `low`). Se guardan a 1280×720, JPEG progresivo de calidad 85.
- **`realista`** (Realista Documental): todavía sin muestras (`sampleCount: 0`).

Las muestras del catálogo las genera Vimo: no se toman de terceros ni de la previsualización del
estilo de origen.

**Cómo repetirlas** (una gema nueva, o cambiar las de una gema):

1. Claves `deepinfra` y `evolink` (o `fal`): del llavero de la app (servicio
   `click.vimo.portable`, cuenta `api-keys`) o de un `.harness-keys.json` en la raíz (ignorado por
   git), como dice el README. No se imprimen ni se versionan.
2. Por cada gema, en una raíz de prueba (nunca `~/Documents/Vimo`): sembrar
   `<raíz>/_styles/<id>/style.json` con `name`, `sections`, `templateVersion`, `colorFilter`,
   `character: { mode: <sampleMode> }`, `shots: []` y `createdAt`, y correr
   `pnpm pipeline:harness generate-style-samples --payload '{"styleId":"<id>","imageProvider":"evolink"}' --root <raíz>`.
3. Mirar las cuatro y repetir la gema si alguna salió rota o fuera de estilo.
4. Llevar cada `sample-<n>.jpg` a 1280×720 (JPEG, calidad 85) y guardarla como
   `public/style-references/<id>_<n>.jpg`.
5. `node --test scripts/test/check-catalog-gems.mjs`.

## Verificación

Sobre el HEAD de la entrega (`a89bcf9a`), entre el 2026-10-02 y el 2026-10-03:

| Qué                                                                                                                                                                                                                        | Resultado                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `pnpm lint`                                                                                                                                                                                                                | verde                                                 |
| `pnpm build` (`tsc -b` + Vite)                                                                                                                                                                                             | verde                                                 |
| `pnpm format:check`                                                                                                                                                                                                        | verde                                                 |
| `pnpm check:locales`                                                                                                                                                                                                       | 1493 claves alineadas en es, en y pt                  |
| `node --test scripts/test/check-gem-*.mjs check-app-*.mjs check-catalog-*.mjs check-preview-regressions.mjs`                                                                                                               | 429 de 429                                            |
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

No se pudo recorrer la pestaña nueva en `tauri dev`: el interruptor `VIMO_FLAG_NEW_CATALOG` está en
`off` en producción y encenderlo es un paso del dueño (abajo). Lo que sí se verificó sin la app: los
módulos puros, el payload por carril con el formulario real empaquetado, los subcomandos contra el
sidecar real, y la galería y «Ver» reales dibujados en Chrome headless con el CSS del build (38
tarjetas, alturas, imágenes, desbordes, el pie fijo de «Ver» y el aviso de selección). Queda por
mirar en la app (WebKit): el pie fijo de «Ver» se midió en Chrome.

## Pendientes y pasos del dueño

**Pasos del dueño (Ola 3 del plan), en orden:**

1. Reiniciar `pnpm tauri dev` (el sidecar ya está reconstruido con los subcomandos del catálogo).
2. Encender el interruptor para administradores: `VIMO_FLAG_NEW_CATALOG` de `off` a `admins` en
   Cloudflare Pages (vimo-landing) y redesplegar. Es un cambio en producción: se hace con la
   aprobación del dueño, como en la Entrega 1. Hasta entonces la pestaña nueva no se ve.
3. Recorrido con el interruptor encendido (lista completa en «Qué mirar», abajo) y con el interruptor
   apagado (Crear tiene que estar como siempre).
4. Generar las muestras de `realista` (sección «Muestras»).
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
  a mi estilo»; «Ver» con muestras, etiquetas y modo de personaje (el modo se recuerda al volver a
  abrir); el chip del personaje en Crear abre «Ver» de esa gema; «Pasar a mi estilo» → «Ir a Mi
  estilo» deja la copia en uso con «Basado en …»; al volver a Catálogo sigue elegida la gema de
  antes; generar con una gema de la casa (por ejemplo Fantasía) y con una de Imperio Pro.

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
- **`realista` sin muestras.** Su tarjeta muestra el marcador «sin muestras» hasta generarlas
  (paso 4).
- **Una copia que falla a mitad** (fallo de disco) deja una carpeta `_styles/st-…` sin `style.json`:
  `styles-list` no la muestra y nada la borra. No se limpia a propósito: el único fallo que un guard
  puede inyectar es una ruta que ya existe, y ahí borrar sería peligroso.
- **Diagnóstico.** La fila de una copia sale como `Estilo: <nombre>`, pero sin id (Rust lee `id` o
  `styleId` y el payload trae `catalogStyleId`). Rust no se tocó.
- **Preview de personaje de los 5 ids heredados:** sigue con la plantilla fija de siempre (P6) hasta
  el retiro del carril viejo.
- **Sin buscador ni filtros** en la pestaña (38 tarjetas en tres columnas): fuera de alcance; se
  evalúa en la QA. Las etiquetas ya viajan en cada gema, así que un filtro por etiqueta no necesita
  cambios en el contrato.
- **Entrega 3** (catálogo remoto en Supabase, administración de gemas y etiquetas desde la app): el
  contrato de esta entrega ya tiene la forma de esa fila (`name`, `description` y `tags` en tres
  idiomas dentro de la gema).
