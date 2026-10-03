# Entrega 2: el catálogo nuevo para el alumno — plan

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado)
> o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas
> (`- [ ]`) para el seguimiento.

- **Fecha:** 2026-10-02
- **Rama:** `feat/catalogo-estilos` (decisión del dueño: la misma rama de la Entrega 1).
- **Spec:** [design.md](design.md) §8, con las decisiones del dueño del 2026-10-02 (sección 1).
- **Plan maestro:** [plan.md](plan.md), «Entrega 2: esquema» (E2-1 a E2-8).
- **Base:** la Entrega 1 implementada y commiteada (HEAD `50f01657`, 42 commits sobre `origin/dev`).

**Goal:** la pestaña Catálogo de Crear muestra las gemas de la casa como tarjetas iguales a las de
Mi estilo (tres puntos: «Usar en este video», «Ver», «Pasar a mi estilo»), cada gema del catálogo
corre por el carril de Mi estilo con sus secciones y el marco de Vimo, «Ver» muestra las muestras y
el modo de personaje, y «Pasar a mi estilo» crea una copia independiente. Todo detrás de
`features.newCatalog`.

**Architecture:** tres frentes que no se pisan. El orquestador (esta sesión) congela el contrato
(`pipeline/types/catalog.ts`), escribe las 38 gemas del catálogo y consigue sus muestras. El frente
A (sidecar) agrega los subcomandos del catálogo y la coherencia del proyecto. El frente C (app) hace
la pestaña, «Ver», «Pasar a mi estilo» y los cambios de Crear. El servidor no cambia en esta entrega.

**Tech Stack:** el de la Entrega 1 (React 19, TypeScript, Vite, Tauri 2; sidecar Node SEA con
guards `node --test`).

---

## 1. Decisiones del dueño (2026-10-02) y decisiones de este plan

**Del dueño, en el chat:**

| ID    | Decisión                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2-D1 | Entran las 5 gemas actuales (Realista, POV Stickman, Cartoon 2D, Fantasía mágica, Terror) **más las 34 de `estilos/`** (Imperio Pro). `contenido-real` no genera imágenes y queda afuera: son 38 gemas. |
| E2-D2 | Las muestras se **generan, 4 por estilo, reusando las que ya existen** (las 4 fotos de cada estilo actual).                                                                                             |
| E2-D3 | «Ver» muestra **solo muestras y modo de personaje**, sin el texto de la gema (sigue la D5 del 2026-09-30).                                                                                              |
| E2-D4 | Se hace **en la misma rama** `feat/catalogo-estilos`.                                                                                                                                                   |

**De este plan** (el dueño las puede cambiar; cada una dice qué cuesta si está mal):

| ID  | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Si está mal                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| P1  | **Las muestras del catálogo viven en la app** (`public/style-references/<id>_1..4.jpg`), como hoy las de los 5 estilos: el sidecar no puede empaquetar imágenes (esbuild sin loader, SEA sin assets, Tauri sin `resources`). «Pasar a mi estilo» le manda los bytes al sidecar en el payload. En la Entrega 3 pasan al bucket y a `_catalog/`.                                                                                                                                                                                                                         | Se mueven a `resources` de Tauri; cambia el payload de la copia.           |
| P2  | **Las muestras nuevas se generan con el carril de Vimo** (`generate-style-samples`, calidad base) a través de `pnpm pipeline:harness` con las claves del dueño (`.harness-keys.json` o el llavero de la app), y se guardan a 1280×720. Costo: 132 imágenes ≈ 0,5 USD en Evolink o 0,7 en Fal.                                                                                                                                                                                                                                                                          | Una gema que falla se repite.                                              |
| P3  | **El modo de personaje por defecto de cada gema es `sampleMode`**: `generic` en las gemas con personaje fijo (17 de Imperio Pro, POV Stickman) y `none` (cinemático) en las que no lo tienen. El spec decía «genérico» para todas; en un estilo sin personaje, genérico inventaría uno. `allowedModes` ofrece los tres salvo que la QA diga otra cosa.                                                                                                                                                                                                                 | Se cambia un campo por gema.                                               |
| P4  | **Sin tarjeta elegida no hay video**, igual que en Mi estilo: la pestaña Catálogo nueva arranca sin selección, con el aviso `pickNotice` y el bloqueo `styleRequired`. Hoy el catálogo viejo arranca con Realista elegido.                                                                                                                                                                                                                                                                                                                                             | Se preselecciona Realista con un efecto.                                   |
| P5  | **En modo demo sigue el catálogo viejo** (las historias del pack van por `options.styleId`): `features.newCatalog` no aplica mientras `demo` está activo. El pack se regenera con el retiro del carril viejo.                                                                                                                                                                                                                                                                                                                                                          | Se regenera el pack ahora.                                                 |
| P6  | **El preview de personaje de los 5 ids heredados no cambia** (plantilla fija de siempre). Los 33 ids nuevos generan el preview con la gema del catálogo y el marco, como una gema de Mi estilo. El retiro del carril viejo pasa también los 5.                                                                                                                                                                                                                                                                                                                         | Se cambia el orden de chequeos en `generate-character-preview`.            |
| P7  | **Los subcomandos se llaman `catalog-styles-list` y `catalog-style-copy`**: llevan «style» en el nombre para que el diagnóstico (`subject.rs`, tabla fija de palabras) clasifique la fila como `Estilo: <nombre>` sin tocar Rust.                                                                                                                                                                                                                                                                                                                                      | Se agrega la palabra «catalog» a las dos tablas y a sus tests.             |
| P8  | **Nombre y descripción en tres idiomas viajan dentro de la gema** (`CatalogGem.name` y `description`, `{ es, en, pt }`), no en los catálogos de i18n: en la Entrega 3 salen de la fila de Supabase con la misma forma. Los 5 heredados conservan además sus claves `create.styles.*` para el catálogo viejo.                                                                                                                                                                                                                                                           | Se mueven a i18n y el sidecar devuelve solo ids.                           |
| P9  | **La gema de catálogo no lleva `sourcePrompt`**: el texto original de Imperio Pro no se empaqueta; las secciones son el estilo. La copia de «Pasar a mi estilo» tampoco lo tiene (no hay «Texto original»).                                                                                                                                                                                                                                                                                                                                                            | Se suma el campo y 230 KB al sidecar.                                      |
| P10 | **Un video del catálogo nuevo muestra en Biblioteca el modelo de prompts**, como uno de Mi estilo (`promptModelLabel`): es verdad que lo escribió ese modelo.                                                                                                                                                                                                                                                                                                                                                                                                          | Se condiciona `list-video-projects` a `catalogStyleId`.                    |
| P11 | **Las 5 gemas de la casa se escriben pasando por el agente** el `systemPrompt` actual más las reglas del director y del reparto (spec §8), y se ajustan a mano: el dinamismo traduce el contrato del director. Las 33 de Imperio Pro pasan por el agente tal cual y se revisan (marcadores en `character`, inicio fijo recortado: lo visto en la comparación de modelos).                                                                                                                                                                                              | Se reescriben a mano.                                                      |
| P12 | **Etiquetas del admin** (pedido del dueño del 2026-10-02 al aprobar el plan: «el admin puede marcar con una etiqueta la gema como dinamismo … y muchas otras cosas»): `CatalogGem.tags: LocalizedText[]`, de 0 a 5 por gema, con una paleta en `pipeline/prompts/catalog-gems/tags.ts` (`CATALOG_TAGS`) para escribirlas siempre igual. «Dinamismo» va si y solo si la gema tiene sección `dynamism`, y «Personaje fijo» si y solo si tiene `character` (lo fija el guard). Viajan dentro de la gema, como el nombre (P8). La tarjeta y «Ver» las muestran como chips. | Se pasan a ids con textos en i18n; el guard cambia.                        |
| P13 | **Las muestras del catálogo las genera Vimo; no se toman de terceros ni de la previsualización del estilo de origen** (regla del dueño, 2026-10-03). `implementation-e2.md` dice cómo repetirlas.                                                                                                                                                                                                                                                                                                                                                                      | Una gema sin muestras muestra el marcador «sin muestras» hasta generarlas. |

---

## 2. Global Constraints

Las de [plan.md](plan.md) («Global Constraints»), y además:

- **El carril viejo no cambia:** sin `features.newCatalog` (o en demo), la pestaña Catálogo y el
  payload de un proyecto del catálogo son los de hoy, byte por byte. Lo fijan los guards del carril
  (`check-catalog-prompts.mjs`, `check-packaged-catalog.mjs`) y el nuevo guard del payload.
- **Una gema del catálogo es una gema de plantilla:** mismos límites (spec §4.1), mismo marco, mismos
  guards de composición. Nada nuevo en `pipeline/stages/`.
- **Ids:** los 5 heredados (`normal`, `pov_stickman`, `cartoon`, `fantasia`, `terror`) y los 33 de
  Imperio Pro (todos cumplen `STYLE_ID_PATTERN`, ninguno empieza con `st-`). Las copias de «Pasar a
  mi estilo» siempre llevan un id `st-…` nuevo.
- **`src/` importa de `pipeline/` solo tipos** (`import type` con `@pipeline/types/<archivo>.ts`).
  Las constantes que la app necesite se copian con una anotación `typeof`, como en la Entrega 1.
- **Los agentes no corren `git`, `pnpm format`, `pnpm build` ni `pnpm lint:fix`** (reglas de
  ejecución de plan.md). Verifican con `pnpm exec prettier --write <archivos>`, `pnpm exec eslint
<archivos>`, `pnpm exec tsc -p <tsconfig> --noEmit` y `node --test scripts/test/<guard>`.
- **Nada de claves en el repo ni en los informes.** `.harness-keys.json` está ignorado y no se lee
  ni se imprime; solo se pasa su ruta al harness.
- **Trailer de los commits:** `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## 3. Review Focus

1. **Una gema con sección `character` elegida en modo cinemático.** Ninguna escena muestra a ese
   personaje. Lo cubren los guards de la Entrega 1 (`check-gem-template-frame.mjs`, modo `none`) y
   la QA de la Ola 3 (E2-7).
2. **«Pasar a mi estilo» interrumpido a mitad de la copia** (la app se cierra, el sidecar muere).
   No queda una tarjeta a medias: las muestras se escriben primero y `style.json` al final, con
   escritura atómica. Guard de la Tarea A2.
3. **El catálogo viejo con el interruptor apagado.** El payload de un proyecto del catálogo es
   idéntico al de hoy. Guard de la Tarea C1 sobre el módulo puro del payload.
4. **El modo recordado de un estilo que el catálogo ya no permite** (`allowedModes` cambió). Se usa
   el primero permitido, sin romper. Guard de la Tarea C1.
5. **Un estilo nuevo del catálogo con `options.styleId: 'normal'`.** El carril nuevo no aplica nada
   de lo que `normal` tenía por código en el carril viejo (candado de identidad, vetos, fotorrealismo):
   el estilo lo lleva en sus secciones. Lo cubren `check-gem-color-filters.mjs` (`resolveProjectStyle`
   con `customStyle`) y la QA visual de E2-7.

---

## 4. Cómo se ejecuta en paralelo sin pisarse

| Frente      | Puede tocar                                                                                                                                                                                                                                                                                                              | No toca                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Orquestador | `pipeline/types/catalog.ts`, `pipeline/prompts/catalog-gems/**`, `public/style-references/`, `docs/**`, `scripts/test/README.md`, commits y vault                                                                                                                                                                        | Lo que toquen A y C                                                           |
| A · sidecar | `pipeline/commands/catalog/**`, `pipeline/commands/styles/style-store.ts`, `pipeline/commands/characters/generate-character-preview.ts`, `pipeline/commands/videos/create-video-project.ts`, `pipeline/main.ts`, guards nuevos `scripts/test/check-catalog-*.mjs` y los casos nuevos en `check-gem-project-snapshot.mjs` | `pipeline/types/catalog.ts` (lo congela O1), `src/`, `public/`, `docs/`, Rust |
| C · app     | `src/**`, `public/locales/*.json`, guards nuevos `scripts/test/check-app-catalog-*.mjs` y casos nuevos en `check-app-custom-style-payload.mjs`                                                                                                                                                                           | `pipeline/`, `docs/`, `package.json`, `src-tauri/`                            |

```
Ola 0  O1 contrato + 5 gemas de la casa  ──►  commit del orquestador (abre A y C)
       O2 33 gemas de Imperio Pro        ──►  commit (no bloquea a nadie)
       O3 muestras (claves del dueño)    ──►  commit (no bloquea a nadie; las tarjetas sin muestras muestran su marcador)
Ola 1  A1…A5  ║  C1…C4                   (dos frentes en paralelo; C2 usa A1 por contrato, no por código)
Ola 2  I1…I4  integración, docs, vault (orquestador)
Ola 3  pasos del dueño: interruptor en `admins`, QA con claves, `all` y arranque del retiro
```

Reglas: las de plan.md («Reglas de la ejecución en paralelo»). Si un frente necesita cambiar el
contrato de la sección 5, se detiene y avisa.

---

## 5. Contratos congelados (los escribe O1)

### 5.1 `pipeline/types/catalog.ts` (nuevo)

```ts
import type {
  ColorFilterId,
  CustomStyleSummary,
  GemSections,
  StyleCharacter,
  StyleCharacterMode,
} from './styles.ts'

/** Idiomas de la app: los mismos de public/locales. */
export type CatalogLocale = 'es' | 'en' | 'pt'
export type LocalizedText = Record<CatalogLocale, string>

/**
 * Una gema del catálogo de Vimo (spec §8). Es una gema de plantilla con nombre y
 * descripción en tres idiomas, los modos de personaje que permite y el modo con el
 * que salieron sus muestras. Las muestras viven en la app
 * (`/style-references/<id>_<n>.jpg`, n = 1..sampleCount) hasta la Entrega 3.
 */
export interface CatalogGem {
  /** Uno de los 5 ids heredados o un id que cumple STYLE_ID_PATTERN. */
  id: string
  name: LocalizedText
  description: LocalizedText
  /** Etiquetas del admin (P12): 0 a CATALOG_TAG_LIMIT, cada traducción hasta CATALOG_TAG_LABEL_LIMIT. */
  tags: LocalizedText[]
  sections: GemSections
  templateVersion: number
  /** Nunca vacío. El primero no es el defecto: lo es `sampleMode`. */
  allowedModes: StyleCharacterMode[]
  /** Con qué modo se generaron las muestras; también el modo por defecto en «Ver». */
  sampleMode: StyleCharacterMode
  colorFilter: ColorFilterId
  /** Cuántas muestras trae la app para este estilo (0 a 4). */
  sampleCount: number
}

export interface CatalogListResult {
  entries: CatalogGem[]
}

/** Una muestra que la app le manda al sidecar para la copia: JPEG en base64. */
export interface CatalogSampleUpload {
  /** `sample-<n>.jpg`, n = 1..4. */
  file: string
  base64: string
}

export interface CatalogCopyToCustomPayload {
  catalogStyleId: string
  /** El nombre que vio la persona (en su idioma): nombre de la copia y de `origin`. */
  name: string
  /** El modo elegido en «Ver» (con `defaultCharacterId` si es «Mi personaje»). */
  character: StyleCharacter
  samples: CatalogSampleUpload[]
}

export interface CatalogCopyToCustomResult {
  entry: CustomStyleSummary
}
```

Constantes del sidecar (en `pipeline/commands/catalog/catalog-store.ts`, las copia la app con
`typeof`): `CATALOG_SAMPLE_COUNT = 4`, `MAX_CATALOG_SAMPLE_BYTES = 4 * 1024 * 1024` (reusa
`MAX_SAMPLE_BYTES` de `style-store.ts`).

### 5.2 Las gemas (`pipeline/prompts/catalog-gems/`)

- Un archivo por gema, `pipeline/prompts/catalog-gems/<id>.ts`, que exporta `const <idEnCamelCase>:
CatalogGem` (por ejemplo `povStickman`, `infograficoAmarillo`).
- `pipeline/prompts/catalog-gems/catalog.ts` exporta `CATALOG_GEMS: readonly CatalogGem[]` en el
  orden de la pestaña (los 5 de la casa primero, después los 33 en el orden de `estilos/README.md`)
  y `findCatalogGem(id: string): CatalogGem | undefined` (con `Object.hasOwn` sobre un mapa, no
  `in`).
- Reglas de contenido que fija el guard `check-catalog-gems.mjs` (Tarea A1):
  - ids únicos; cada uno heredado o `STYLE_ID_PATTERN`; ninguno empieza con `st-`;
  - `sections` pasa `assertGemSections` (límites del spec §4.1) y `visualStyle` no está vacío;
  - `name` y `description` con los tres idiomas no vacíos;
  - `allowedModes` no vacío, sin repetidos, y `sampleMode` incluido;
  - `fantasia` lleva `colorFilter: 'fantasy'` y `terror`, `'horror-bw'`; el resto `'none'` salvo que
    la gema lo pida;
  - `character`, `promptStart` y `promptEnd`, si existen, no tienen marcadores `[…]` ni la frase
    «neutral pose», y `character` termina con una oración que empieza con `Outfit:`;
  - `tags` (P12): hasta `CATALOG_TAG_LIMIT` (5), cada traducción no vacía y de hasta
    `CATALOG_TAG_LABEL_LIMIT` (24) caracteres, sin repetidas (por `es`); la etiqueta
    `CATALOG_TAGS.dynamism` está si y solo si hay `sections.dynamism`, y `CATALOG_TAGS.fixedCharacter`
    si y solo si hay `sections.character` (las dos viven en `pipeline/prompts/catalog-gems/tags.ts`);
  - `sampleCount` coincide con los archivos `public/style-references/<id>_1..N.jpg` que existen.

### 5.3 Subcomandos (frente A)

| Subcomando            | Payload                      | Resultado                   | Qué hace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog-styles-list` | —                            | `CatalogListResult`         | Devuelve `CATALOG_GEMS`. Puro: no toca el disco ni la red.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `catalog-style-copy`  | `CatalogCopyToCustomPayload` | `CatalogCopyToCustomResult` | Crea `_styles/<st-id>/`: valida la gema (`findCatalogGem`), el nombre (`STYLE_NAME_LIMIT`), el personaje (`assertStyleCharacter`) y cada muestra (nombre `sample-<n>.jpg` con n = 1..4 sin repetir, base64 válido, magia JPEG `FF D8 FF`, hasta `MAX_SAMPLE_BYTES`); escribe las muestras primero y `style.json` al final (`writeFileAtomic`), con `sections`, `templateVersion`, `colorFilter`, `character`, `origin: { kind: 'catalog', catalogStyleId, name }`, `createdAt` y `updatedAt`. Devuelve la entrada como la listaría `styles-list`. |

Códigos de fallo (`PipelineFailure`): `invalid_payload` (lo de siempre), `style_not_found` (la
gema no existe en el catálogo), `missing_projects_root`.

### 5.4 Proyecto de un estilo del catálogo (frente C → sidecar)

`options` de `create-video-project` para una gema del catálogo (interruptor encendido):

```ts
{
  styleId: <el id heredado si la gema es uno de los 5; si no, 'normal'>,
  customStyle: {
    styleId: gem.id,
    catalogStyleId: gem.id,
    name: gem.name[idioma],
    sections: gem.sections,
    templateVersion: gem.templateVersion,
    colorFilter: gem.colorFilter,
    character: <el modo elegido en «Ver», con defaultCharacterId si es own>,
  },
  sceneCount: 0,
  secondsPerScene: <el de Ajustes, como Mi estilo>,
  promptModel: <el resuelto, como Mi estilo>,
  confirmScenes: form.confirmSceneDuration,
  // sin characterFrequency
}
```

`create-video-project` (Tarea A4) exige: con `catalogStyleId`, `customStyle.styleId ===
catalogStyleId`; y `options.styleId` igual a `catalogStyleId` cuando este es heredado, o `'normal'`
cuando no. `name` hasta `STYLE_NAME_LIMIT`.

### 5.5 Memoria del modo elegido (frente C)

`localStorage['vimo:catalog:character:v1']` = `Record<catalogStyleId, StyleCharacter>`. Lectura
tolerante (JSON roto o forma inesperada = vacío); un modo recordado que la gema ya no permite cae al
primero de `allowedModes`; sin memoria, `sampleMode`. Vive en
`src/modules/videos/utilities/catalogCharacterMemory.ts` (puro, con guard) y la clave en
`src/modules/videos/constants.ts`.

---

## 6. Mapa del código (de las exploraciones del 2026-10-02)

Para que cada ejecutor sepa dónde está parado sin volver a explorar. Rutas relativas al repo.

**Catálogo viejo (app):** `src/modules/videos/components/StyleSourceTabs.tsx` (pestañas, solo
`custom` se puede bloquear), `StyleGallery.tsx` (grilla 1/2/3 columnas de `StyleCard`, `visibleIds`
para la demo), `StyleCard.tsx` (16:9, sin menú, pie con descripción), `src/modules/videos/constants.ts:346-376`
(`VIDEO_STYLES` con claves `create.styles.*`, ojo: `pov_stickman` → `stickman` y `fantasia` →
`fantasy`), `utilities/styleReferences.ts` (`/style-references/<id>_1..4.jpg`,
`STYLE_REFERENCE_SAMPLE_COUNT`), `utilities/previewStyleKeyOf.ts`, `utilities/demoForm.ts`.

**Crear:** `components/CreateForm.tsx` (pestañas 136-154; galerías 155-188; `PromptModelSection`
182-186 solo custom; cantidad de escenas 193-215 y «Confirmar escenas» 304-324 solo catálogo),
`components/CharacterSection.tsx` (chips 100-251 solo custom; frecuencia 378-384 solo catálogo;
selector clásico 253-373; `editStyleInUse` 86-89 abre `openCustomStyleEditor`; `styleContext`
391-404), `utilities/formPayload.ts` (`createProjectPayload` 18-122: `styleId: 'normal'` en 26,
`customStyle` en 63, `secondsPerScene` 67, `promptModel` 68; `formBlockers` 126-177;
`styleCharacterModeOf` 181-186), `utilities/projectCustomStyle.ts` (no emite `catalogStyleId`),
`utilities/selectedCustomStyle.ts`, `types/create.ts:250-305` (`CreateFormValue`: `styleSource`,
`styleId`, `customStyle`), `views/Create/Create.tsx` (`submit` 216-252), `constants.ts:703-740`
(valores iniciales). Sitios que deciden «carril» por `styleSource === 'custom'`:
`CreateForm.tsx:155,193,304`, `CharacterSection.tsx:63,258,378`, `formPayload.ts:24,145,148,184`,
`previewStyleKeyOf.ts:7`, `estimateCreateCost.ts:83`, `demoForm.ts:62`, `Create.tsx:171-183`.

**Mi estilo (para reusar):** `components/CustomStyleCard.tsx` (4:3, menú de tres puntos con
`stopPropagation`, carrusel por hover, imágenes por `videosApi.imageSource`),
`CustomStyleGallery.tsx` (grilla `grid-cols-2 sm:grid-cols-3`, tarjeta «Crear estilo», avisos,
modal), `hooks/useCustomStyleEditor.ts` (store de «qué modal está abierto»: nunca dos),
`CustomStyleModal.tsx` (orden personaje → muestras; esconde el Dialog mientras el selector de
personaje está abierto), `StyleSamplesCarousel.tsx` (`{ images, name }`),
`StyleCharacterBlock.tsx` (filas own/generic/none, sin `allowedModes`; textos
`create.styleCharacter.*` dicen «tu estilo»), `CharacterPickerModal.tsx` (`previewStyleKey`,
`max`, `styleContext`), `hooks/useCustomStyles.ts` (`videosQueryKeys.customStyles`,
`showSavedStyle`), `hooks/useStyleCharacter.ts` (deriva del formulario; no guarda nada),
`utilities/libraryTab.ts:34-51` (patrón de lectura tolerante de `localStorage`), `api/index.ts`
(216-233: `styles-list`, `style-save`, `style-delete`, `generate-style-samples`, `rebuildGem`;
283: `imageSource`). Interruptores: `useAccessFeature('newCatalog')`
(`src/modules/common/hooks/useAccessFeature.ts`); `newCatalog` ya está declarado y nadie lo lee.

**Sidecar:** `pipeline/prompts/visual-styles.ts` (`VISUAL_STYLES`, los 5 `systemPrompt` con
`GLOBAL_RULES`, `filterFinal` de Fantasía y Terror), `pipeline/types/styles.ts` (`GemOrigin`,
`CustomStyleSummary.origin`, `StyleSavePayload.origin`), `pipeline/types/video-project.ts:47-61`
(`ProjectCustomStyle.catalogStyleId`), `pipeline/commands/styles/style-store.ts` (`STYLE_ID_PATTERN`
31, límites 32-52, `assertGemSections` 139, `assertColorFilter` 206, `isCatalogStyleId` 221,
`assertGemOrigin` 244, `stylesRoot`/`styleDirectory` 282-295, `StoredStyle` 300-315,
`readStyleSamples` 317), `style-save.ts` (conserva `origin`; escritura atómica 119-122),
`pipeline/commands/demo/pack.ts:411-465` (`seedCustomStyle`: muestras primero, `style.json`
después: el precedente de la copia), `pipeline/commands/videos/create-video-project.ts` (130
`isCharacterStyleId(options.styleId)`; 254-309 `assertProjectCustomStyle`; 301-308
`catalogStyleId`; 347 `previewStyleKey`), `pipeline/stages/shared/project-style.ts` (con
`customStyle` devuelve `id: 'custom'` y `colorFilterFor`),
`pipeline/commands/characters/generate-character-preview.ts` (63-86: id heredado → plantilla fija;
otro → `_styles/<id>` o `style_not_found`), `preview-style.ts` (`isPreviewStyleKey`),
`pipeline/main.ts:26-37` (`SUBCOMMANDS`), `pipeline/commands/styles/subcommands.ts` (mapa del
dominio), `pipeline/project/paths.ts:23-28` (`RESERVED_ROOT_DIRECTORIES`),
`src-tauri/src/diagnostics/subject.rs:30-38` y `src/modules/diagnostics/constants.ts:30-39`
(palabras que clasifican un subcomando). Harness: `scripts/run-pipeline-harness.mjs`
(`pnpm pipeline:harness <subcomando> --payload '<json>' --root <dir> --keys .harness-keys.json`;
README.md 176-215).

**Contenido:** `estilos/<nn>-<id>.md` (sin trackear): H1 con el nombre, tabla `Campo | Valor` (id,
tagline, tags, accent, conPersonaje, suffix, esReal, images, chars) y la gema literal bajo
`## Gema completa` en un bloque `text` (cerca de 3 o 4 acentos graves: tomar la primera línea de
cerca después del título y la última igual; 10 gemas dejan un bloque interno sin cerrar; los
archivos 20-34 terminan con salto de línea que cuenta en `chars`). `estilos/README.md` tiene la
tabla de los 34 (17 con personaje fijo, 17 sin; `contenido-real` es `esReal`). Arnés del agente en
el scratchpad de la sesión (`qa-modelo/correr.mjs` sobre `modelo.mjs`, bundle de
`vimo-landing/functions/_lib/reconstructor/modelo.ts`; la clave se pasa por `COMET_KEY` desde el
entorno; `casos.json` con `{ id, texto }`). Muestras de los 5: `public/style-references/` (20 JPEG
1920×1072, idénticos al set `gpt-image-2` de VIDEO ON CLICK).

---

## Ola 0: orquestador

### Tarea O1: contrato y las 5 gemas de la casa

**Files:**

- Create: `pipeline/types/catalog.ts` (sección 5.1)
- Create: `pipeline/prompts/catalog-gems/catalog.ts`, `normal.ts`, `pov-stickman.ts`, `cartoon.ts`,
  `fantasia.ts`, `terror.ts`
- Create: `docs/handoff/2026-09-30-catalog-on-custom-style-lane/plan-e2.md` (este archivo)
- Modify: `plan.md` («Entrega 2: esquema» apunta acá)

- [ ] **Paso 1:** escribir `pipeline/types/catalog.ts` tal cual la sección 5.1.
- [ ] **Paso 2:** armar el texto de cada estilo de la casa: el `systemPrompt` de `VISUAL_STYLES`
      sin `GLOBAL_RULES` ni la sección `# TEMPLATE` (eso lo pone el marco), más un bloque
      «Dinamismo» que traduce el contrato del director (spec §8): el menú de tratamientos del
      estilo (Realista sin `diagram` ni `bubble`), al menos 1 de cada 3 escenas explicativa o
      alusiva, nunca 3 tratamientos ni 3 lugares iguales seguidos, el protagonista en alrededor del
      50 % de las escenas. Terror suma su seguridad de contenido en «Reglas».
- [ ] **Paso 3:** pasar los 5 textos por el agente con el arnés (modelo elegido en la Entrega 1,
      `origin` irrelevante en local), guardar las respuestas en el scratchpad y revisarlas:
      `character` sin marcadores y con `Outfit:`; `promptStart`/`promptEnd` completos; nada de la
      regla de los «muñecos iguales» perdido en POV Stickman (comparación de modelos de la
      Entrega 1). Lo que falte se corrige a mano.
- [ ] **Paso 4:** escribir los 5 archivos `.ts` con nombre y descripción en es/en/pt (los de
      `create.styles.*`), `allowedModes: ['generic', 'own', 'none']`, `sampleMode: 'generic'`
      (`none` en Terror y Fantasía si sus muestras actuales no tienen protagonista: mirarlas),
      `colorFilter` de Fantasía y Terror, `sampleCount: 4`.
- [ ] **Paso 5:** `pnpm exec tsc -p tsconfig.pipeline.json --noEmit`, `pnpm exec prettier --write`
      y `pnpm exec eslint` sobre los archivos. Commit
      `feat(pipeline): add the catalog gem contract and the five house gems` con este plan.

### Tarea O2: las 33 gemas de Imperio Pro

**Files:**

- Create: `pipeline/prompts/catalog-gems/<id>.ts` × 33
- Modify: `pipeline/prompts/catalog-gems/catalog.ts`

- [ ] **Paso 1:** extraer las 33 gemas de `estilos/` (sin `contenido-real`) con un script del
      scratchpad que lea la tabla y el bloque literal (trampas de la sección 6), y armar
      `casos.json`.
- [ ] **Paso 2:** correrlas por el agente con el arnés (4 en paralelo; unos 0,4 ¢ cada una) y
      guardar las respuestas con sus `warnings`.
- [ ] **Paso 3:** revisar cada respuesta con un chequeo automático (marcadores `[…]` y «neutral
      pose» en `character`/`promptStart`/`promptEnd`, `Outfit:`, secciones vacías, total de
      caracteres) y a ojo las 17 con personaje fijo. Corregir a mano lo que haga falta y anotar en
      `implementation-e2.md` qué se cambió por gema.
- [ ] **Paso 4:** nombre y descripción: `es` de `estilos/README.md` (Nombre y Descripción); `en` y
      `pt` traducidos por el orquestador, cortos. `allowedModes: ['generic', 'own', 'none']`;
      `sampleMode: 'generic'` en las 17 con personaje fijo y `'none'` en las 16 sin él (P3);
      `colorFilter: 'none'`; `sampleCount: 0` hasta la Tarea O3.
- [ ] **Paso 5:** generar los 33 archivos `.ts` con el script, sumarlos a `CATALOG_GEMS` en el
      orden del README, correr el guard `check-catalog-gems.mjs` (de A1; si todavía no existe, los
      chequeos del Paso 3) y commitear `feat(pipeline): add the 33 Imperio Pro catalog gems`.

### Tarea O3: muestras

**Files:**

- Create: `public/style-references/<id>_1..4.jpg` × 33
- Modify: los 33 archivos de gemas (`sampleCount: 4`)

- [ ] **Paso 1:** el dueño deja `.harness-keys.json` en la raíz del repo (ignorado por git) con
      `deepinfra` y `evolink` (o `fal`), como dice el README. El orquestador no lo lee.
- [ ] **Paso 2:** con un script del scratchpad, por cada gema nueva: sembrar `_styles/<id>/style.json`
      en una raíz de prueba (`--root` del scratchpad; nunca `~/Documents/Vimo`) con sus secciones,
      `templateVersion`, `colorFilter` y `character: { mode: sampleMode }`, y correr
      `pnpm pipeline:harness generate-style-samples --payload '{"styleId":"<id>","imageProvider":"evolink"}'`
      (calidad base). Costo total estimado: menos de 1 USD.
- [ ] **Paso 3:** reducir cada `sample-<n>.jpg` a 1280×720 (JPEG, calidad 85) y guardarlo como
      `public/style-references/<id>_<n>.jpg`. Mirar una grilla con las 132 (en el scratchpad) y
      repetir las que salieron rotas o fuera de estilo.
- [ ] **Paso 4:** `sampleCount: 4` en cada gema, `node --test scripts/test/check-catalog-gems.mjs`
      y commit `feat: ship the catalog style samples`.

---

## Ola 1, frente A: sidecar

### Tarea A1: `catalog-styles-list` y el guard de las gemas

**Files:**

- Create: `pipeline/commands/catalog/catalog-store.ts` (constantes, `findCatalogGem` reexportado si
  conviene, validaciones de la copia), `pipeline/commands/catalog/catalog-styles-list.ts`,
  `pipeline/commands/catalog/subcommands.ts`
- Modify: `pipeline/main.ts` (esparcir `catalogSubcommands`)
- Test: `scripts/test/check-catalog-gems.mjs`, `scripts/test/check-catalog-list.mjs`

**Interfaces:**

- Consumes: `CatalogGem`, `CatalogListResult` (5.1); `CATALOG_GEMS`, `findCatalogGem` (5.2);
  `assertGemSections`, `assertColorFilter`, `STYLE_ID_PATTERN`, `isCatalogStyleId` de
  `style-store.ts`; `isCharacterStyleId` de `visual-styles.ts`.
- Produces: el subcomando `catalog-styles-list` → `{ entries: CatalogGem[] }`.

- [ ] **Paso 1:** escribir `check-catalog-gems.mjs` con las reglas de la sección 5.2 (importa
      `CATALOG_GEMS` y las funciones de `style-store.ts`; lee `public/style-references/` con
      `node:fs`). Correrlo: debe pasar con las 5 gemas de O1.
- [ ] **Paso 2:** `catalog-styles-list.ts`: `async (): Promise<CatalogListResult> => ({ entries:
[...CATALOG_GEMS] })`. Sin disco ni red.
- [ ] **Paso 3:** `subcommands.ts` del dominio y el `main.ts`.
- [ ] **Paso 4:** `check-catalog-list.mjs`: el subcomando devuelve las mismas entradas y en el
      mismo orden que `CATALOG_GEMS`; los 5 heredados primero.
- [ ] **Paso 5:** `pnpm exec tsc -p tsconfig.pipeline.json --noEmit`, prettier y eslint sobre lo
      tocado; `node --test` de los dos guards. Informe con lo hecho.

### Tarea A2: `catalog-style-copy`

**Files:**

- Create: `pipeline/commands/catalog/catalog-style-copy.ts`
- Modify: `pipeline/commands/styles/style-store.ts` (`newCustomStyleId()`, con el mismo formato que
  `newCustomStyleId` de `src/modules/videos/constants.ts:506-509`; `assertSampleUpload`),
  `pipeline/commands/catalog/subcommands.ts`
- Test: `scripts/test/check-catalog-copy.mjs`

**Interfaces:**

- Consumes: `CatalogCopyToCustomPayload`, `CatalogSampleUpload` (5.1); `StoredStyle`,
  `styleDirectory`, `readStyleSamples`, `assertStyleCharacter`, `STYLE_NAME_LIMIT`,
  `MAX_SAMPLE_BYTES` (`style-store.ts`); `writeFileAtomic`, `ensureDirectory`
  (`pipeline/utils/atomic-fs.ts`); el precedente `seedCustomStyle` (`demo/pack.ts:411-465`).
- Produces: `catalog-style-copy` → `{ entry: CustomStyleSummary }` (la misma forma que lista
  `styles-list`: con `samples` leídas del disco, `origin`, `createdAt`, `updatedAt`).

- [ ] **Paso 1:** escribir el guard primero, con una raíz temporal (`tempfile` del patrón de los
      guards del sidecar): copia completa (muestras + `style.json` + `origin`); sin muestras (lista
      vacía: tarjeta sin muestras); muestra con nombre inválido, base64 roto, sin magia JPEG o de
      más de 4 MiB → `invalid_payload` sin tocar el disco; gema inexistente → `style_not_found`;
      nombre vacío o de más de 80 → `invalid_payload`; `character` inválido → `invalid_payload`;
      dos copias seguidas → dos ids distintos; el id cumple `STYLE_ID_PATTERN` y empieza con `st-`;
      el orden de escritura (muestras antes que `style.json`) con un `writeFileAtomic` espiado o
      inspeccionando el directorio tras un fallo simulado en la última muestra.
- [ ] **Paso 2:** implementar: validar todo antes de tocar el disco; `ensureDirectory`; escribir
      cada muestra con `writeFileAtomic`; `style.json` al final con `writeFileAtomic`; devolver la
      entrada con `readStyleSamples`.
- [ ] **Paso 3:** registrar en `subcommands.ts`. Verificar en `src-tauri/src/diagnostics/subject.rs`
      que el nombre `catalog-style-copy` cae en la rama de estilos y toma `payload.name`
      (`Estilo: <nombre>`); si no, anotarlo en el informe (no se toca Rust).
- [ ] **Paso 4:** tsc, prettier, eslint y el guard en verde. Informe.

### Tarea A3: preview de personaje con una gema del catálogo

**Files:**

- Modify: `pipeline/commands/characters/generate-character-preview.ts`
- Test: casos nuevos en `scripts/test/check-preview-regressions.mjs` o un guard propio
  `scripts/test/check-catalog-preview.mjs` (lo que resulte más chico)

- [ ] **Paso 1:** en `writeCustomStylePrompt` (97-142), antes de leer `_styles/<id>`, probar
      `findCatalogGem(styleId)`: si existe, usar sus `sections` por el mismo camino que una gema de
      plantilla (`buildCustomStyleSystemPrompt({ sections })`, frases fijas aplicadas por código).
      Los 5 ids heredados siguen por la plantilla fija (P6): no cambia el orden de chequeos de
      63-86.
- [ ] **Paso 2:** guard: un id de catálogo nuevo produce el preview con la gema (sin
      `style_not_found`); un id heredado sigue igual que hoy (misma salida); un id `st-…` sigue
      leyendo `_styles`.
- [ ] **Paso 3:** tsc, prettier, eslint y guards en verde. Informe.

### Tarea A4: coherencia del proyecto del catálogo

**Files:**

- Modify: `pipeline/commands/videos/create-video-project.ts` (`assertProjectCustomStyle`)
- Test: casos nuevos en `scripts/test/check-gem-project-snapshot.mjs`

- [ ] **Paso 1:** reglas de la sección 5.4: con `catalogStyleId`, `customStyle.styleId` igual;
      `options.styleId` igual a `catalogStyleId` si es heredado, `'normal'` si no; `name` hasta
      `STYLE_NAME_LIMIT`. Mensajes de `invalid_payload` que digan el campo.
- [ ] **Paso 2:** casos del guard: proyecto válido con `pov_stickman` (heredado) y con
      `infografico-amarillo` (nuevo, `styleId: 'normal'`); `styleId` que no coincide → rechazado;
      `customStyle.styleId` distinto de `catalogStyleId` → rechazado; `name` de 81 → rechazado; los
      casos de hoy siguen igual.
- [ ] **Paso 3:** tsc, prettier, eslint y guards en verde. Informe.

### Tarea A5: el harness de punta a punta (sin claves)

- [ ] `pnpm pipeline:harness catalog-styles-list` devuelve 38 entradas.
- [ ] `pnpm pipeline:harness create-video-project` con el payload de la sección 5.4 para
      `infografico-amarillo` y un guion corto, en una raíz del scratchpad: `job-completed` y
      `project.json` con `options.customStyle.catalogStyleId`.
- [ ] Anotar los dos comandos en el informe para la Ola 2.

---

## Ola 1, frente C: app

### Tarea C1: datos, memoria del modo y módulos puros

**Files:**

- Create: `src/modules/videos/hooks/useCatalogStyles.ts`,
  `src/modules/videos/utilities/catalogCharacterMemory.ts`,
  `src/modules/videos/utilities/catalogSamples.ts`,
  `src/modules/videos/utilities/selectedCatalogStyle.ts`,
  `src/modules/videos/utilities/formLane.ts`
- Modify: `src/modules/videos/api/index.ts` (`listCatalogStyles`, `copyCatalogStyle`),
  `src/modules/videos/constants.ts` (`videosQueryKeys.catalogStyles`,
  `CATALOG_CHARACTER_STORAGE_KEY = 'vimo:catalog:character:v1'`, `CATALOG_SAMPLE_COUNT` con
  `typeof`), `src/modules/videos/types/styles.ts` (`SelectedCustomStyle.catalogStyleId?`),
  `src/modules/videos/utilities/projectCustomStyle.ts` (emite `catalogStyleId`)
- Test: `scripts/test/check-app-catalog-style.mjs` (nuevo), casos en
  `scripts/test/check-app-custom-style-payload.mjs`

**Interfaces:**

- Consumes: `CatalogGem`, `CatalogListResult`, `CatalogCopyToCustomPayload`,
  `CatalogCopyToCustomResult` (`@pipeline/types/catalog.ts`, solo `import type`).
- Produces:
  - `useCatalogStyles(): { gems: CatalogGem[]; isLoading }` (TanStack Query, `networkMode:
'always'`, `enabled: native`).
  - `catalogSampleImages(gem): string[]` → `/style-references/<id>_1..sampleCount.jpg`.
  - `readCatalogCharacter(gem, storage): StyleCharacter` y `rememberCatalogCharacter(gem.id,
character, storage)` (sección 5.5).
  - `selectedCatalogStyleFrom(gem, locale, character): SelectedCustomStyle` (sección 5.4) y
    `catalogProjectStyleId(gem.id): CharacterStyleId` (heredado o `'normal'`).
  - `laneOf(form): 'legacy-catalog' | 'catalog-gem' | 'custom'` (`styleSource` y `customStyle`).
  - `videosApi.copyCatalogStyle(payload)` → `catalog-style-copy` por `runPipelineJob`;
    `videosApi.listCatalogStyles()` → `catalog-styles-list`.

- [ ] **Paso 1:** guards primero: memoria tolerante (JSON roto, modo no permitido → primero
      permitido, sin memoria → `sampleMode`, recordar y releer); `selectedCatalogStyleFrom`
      (snapshot completo, `catalogStyleId`, nombre en el idioma, `styleId` heredado vs `'normal'`);
      `projectCustomStyleFrom` emite `catalogStyleId` solo si existe; `laneOf`.
- [ ] **Paso 2:** implementar los módulos puros (sin imports de `@/` en tiempo de ejecución salvo
      tipos, para que Node los corra) y el resto.
- [ ] **Paso 3:** `pnpm exec tsc -p tsconfig.app.json --noEmit`, prettier, eslint y guards.

### Tarea C2: la pestaña Catálogo: tarjetas, «Ver» y «Pasar a mi estilo»

**Files:**

- Create: `src/modules/videos/components/StyleCardFrame.tsx` (el cascarón presentacional extraído
  de `CustomStyleCard`: imagen 4:3 con carrusel por hover, badge «En uso», los tres puntos con sus
  reglas de eventos, zona de pie; recibe `images: string[]`, `selected`, `disabled`, `menu` (los
  ítems), `overlay?`, `footer`, `onSelect`), `CatalogStyleCard.tsx`, `CatalogStyleGallery.tsx`,
  `CatalogStyleModal.tsx`, `src/modules/videos/hooks/useCatalogStyleViewer.ts` (store «qué estilo
  del catálogo está en «Ver»», patrón de `useCustomStyleEditor`)
- Modify: `CustomStyleCard.tsx` (usa `StyleCardFrame`; mismo comportamiento), `StyleCharacterBlock.tsx`
  (`allowedModes?: StyleCharacterMode[]` y `variant: 'custom' | 'catalog'` para los textos del
  título), `public/locales/{es,en,pt}.json` (grupo `create.catalog.*`)
- Test: ninguno nuevo (componentes); los guards de C1 cubren lo puro.

- [ ] **Paso 1:** extraer `StyleCardFrame` de `CustomStyleCard` sin cambiar nada visible ni de
      eventos (los comentarios del origen sobre `onMouseDown`, `onDragStart`, `modal={false}` y
      `stopPropagation` viajan con el cascarón). `CustomStyleCard` queda como contenedor fino.
- [ ] **Paso 2:** `CatalogStyleCard`: `StyleCardFrame` con `catalogSampleImages(gem)`, pie con
      nombre y descripción en el idioma, menú: «Usar en este video» / «Ya está en uso», «Ver»,
      «Pasar a mi estilo». Sin muestras: el mismo marcador que Mi estilo.
- [ ] **Paso 3:** `CatalogStyleGallery` (`{ selected, disabled, script, promptModel, onSelect,
onCopied }`): encabezado como el de Mi estilo con `create.catalog.galleryHint`, spinner,
      grilla `grid-cols-2 sm:grid-cols-3` de `CatalogStyleCard` (orden de `CATALOG_GEMS`),
      `pickNotice` sin selección, el aviso «Copiado a Mi estilo» con la acción «Ir a Mi estilo»
      (`onCopied` cambia la pestaña) y el error de la copia, y el modal «Ver».
- [ ] **Paso 4:** `CatalogStyleModal` («Ver», `max-w-3xl` como el de Mi estilo): título con el
      nombre, descripción, `StyleSamplesCarousel` (o el marcador sin muestras),
      `StyleCharacterBlock` con `allowedModes` de la gema y `variant: 'catalog'`, el selector de
      personaje para «Mi personaje» (`CharacterPickerModal` con `previewStyleKey: gem.id`,
      `max: 1`, `styleContext` con las secciones; el Dialog se esconde mientras el selector está
      abierto, como en Mi estilo), botones «Usar en este video» (guarda el modo en la memoria y
      llama `onSelect`) y «Pasar a mi estilo». El modo se recuerda al cambiarlo
      (`rememberCatalogCharacter`); si el estilo está en uso, el cambio actualiza el snapshot del
      formulario (`onSelect` de nuevo).
- [ ] **Paso 5:** «Pasar a mi estilo»: la app trae las muestras (`fetch` de cada URL de
      `catalogSampleImages` → `blob` → base64, en el `api/`: `videosApi.catalogSampleUploads(gem)`),
      llama `copyCatalogStyle({ catalogStyleId, name, character, samples })`, mete la entrada en la
      caché (`showSavedStyle`) y muestra el aviso. Botón deshabilitado mientras copia.
- [ ] **Paso 6:** textos `create.catalog.*` en es/en/pt (voseo en es): `galleryHint`, `pickNotice`,
      `menuAria`, `useInVideo`, `alreadyInUse`, `view`, `copyToCustom`, `copying`, `copied`,
      `copiedAction`, `copyFailed`, `modalTitle`, `noSamples`, `characterTitle`, `characterHint`,
      `useButton`; `create.styleSource.catalogHint` pasa a «Los estilos de Vimo.» (ya no son 5).
      `pnpm check:locales` en verde.
- [ ] **Paso 7:** tsc, prettier y eslint sobre lo tocado.

### Tarea C3: Crear con un estilo del catálogo

**Files:**

- Modify: `CreateForm.tsx` (con `newCatalog` y sin demo, `styleSource === 'catalog'` muestra
  `CatalogStyleGallery`; cantidad de escenas y «Confirmar escenas» solo en `legacy-catalog`;
  `PromptModelSection` en `custom` y `catalog-gem`), `CharacterSection.tsx` (chips también en
  `catalog-gem`, con `onEdit` → `openCatalogStyleViewer`; frecuencia solo en `legacy-catalog`;
  selector clásico con `max: 1` en `catalog-gem`; `styleContext` también en `catalog-gem`),
  `formPayload.ts` (`createProjectPayload` usa `laneOf`: `catalog-gem` manda lo de la sección 5.4;
  `formBlockers` suma `styleRequired` en `catalog-gem` sin tarjeta y `promptModelsBlocked` en los
  dos carriles nuevos; `FormBlockersContext.newCatalog`), `previewStyleKeyOf.ts` (`catalog-gem` →
  `customStyle.styleId`), `estimateCreateCost.ts` (`laneOf`), `Create.tsx` (pasa `newCatalog` al
  contexto de bloqueos), `demoForm.ts` (sin cambios de comportamiento: la demo sigue en
  `legacy-catalog`; un comentario lo dice)
- Test: casos en `scripts/test/check-app-custom-style-payload.mjs` si el payload del catálogo se
  arma en un módulo puro (recomendado: `catalogProjectOptions(form)` en `selectedCatalogStyle.ts`
  o en un módulo nuevo sin imports de `@/`).

- [ ] **Paso 1:** guard del payload: `catalog-gem` produce exactamente la sección 5.4;
      `legacy-catalog` produce lo mismo que hoy (fijar con un snapshot literal); `custom` no
      cambia.
- [ ] **Paso 2:** los cambios de arriba, sitio por sitio (la lista de la sección 6, «Crear»).
- [ ] **Paso 3:** con el interruptor apagado, recorrer en `tauri dev` que Crear está como hoy:
      pestañas, galería vieja, cantidad de escenas, frecuencia.
- [ ] **Paso 4:** tsc, prettier, eslint y guards.

### Tarea C4: la etiqueta «Basado en …» de las copias

**Files:**

- Modify: `CustomStyleCard.tsx` (pie: si `style.origin`, una línea `create.customStyles.basedOn`
  con `{{name}}`), `CustomStyleModal.tsx` (la misma línea bajo la descripción), locales.

- [ ] **Paso 1:** la línea, en los tres idiomas. `pnpm check:locales`.
- [ ] **Paso 2:** tsc, prettier, eslint.

---

## Ola 2: integración (orquestador)

### Tarea I1: verificación completa

- [ ] `pnpm format:check`, `pnpm lint`, `pnpm build`, `pnpm check:locales`.
- [ ] `node --test scripts/test/check-gem-*.mjs scripts/test/check-app-*.mjs
scripts/test/check-catalog-*.mjs`, más `check-preview-regressions.mjs`,
      `check-catalog-prompts.mjs`, `check-gem-project-snapshot.mjs` y los del carril verbatim
      (plan.md, Tarea I1). Esperado: todo en verde salvo los 3 guards rojos de `dev` (33 tests, los
      mismos nombres).
- [ ] Los dos comandos de la Tarea A5.
- [ ] Rebuild del sidecar (`pnpm build:sidecar`) y `pnpm tauri dev` con `features.newCatalog`
      encendido para el correo del dueño: recorrido de la pestaña (tarjetas, «Ver», modos, «Usar en
      este video», «Pasar a mi estilo», la copia en Mi estilo con «Basado en»), y un proyecto creado
      con una gema del catálogo que llega a `scene-prompts` (sin claves, hasta donde deje).

### Tarea I2: documentación

- [ ] `docs/adr/ADR-0039-*.md` pasa a **Aceptada** (2026-10-02): la tabla «Qué hay que resolver»
      con lo resuelto (frecuencia → dinamismo de la gema; escenas sin el personaje → modo cinemático
      del marco; época → el guion es el contexto; variedad → `camera` y `dynamism`; Stickman → su
      gema con el muñeco en `character` y sus reglas; costo y latencia → se mide en E2-7; proyectos
      viejos → carril viejo hasta el retiro). Enlaza la ADR-0048 y este plan.
- [ ] `docs/adr/ADR-0048-*.md`: nota del 2026-10-02 sobre el catálogo (contrato, dónde viven las
      muestras, P1 a P11).
- [ ] `docs/ARCHITECTURE.md`: §5 (la pestaña Catálogo nueva y el carril único) y §6 (la fila de
      `videos`).
- [ ] `scripts/test/README.md`: filas de los guards nuevos.
- [ ] `docs/handoff/2026-09-30-catalog-on-custom-style-lane/implementation-e2.md`: estado,
      decisiones tomadas en la implementación, qué se cambió a mano en las gemas, pendientes.
- [ ] Vault: `Sesiones - VIMO-TAURI.md` (cada commit), `Recursos/Costos Operativos Mensuales.md`
      (el costo de las muestras, una vez), `Proyectos/VIMO-TAURI/` (nota de la ADR-0039 Aceptada
      con el diagrama del carril único).

### Tarea I3: commits

Un commit por tarea terminada y verificada, con el mensaje que describe el qué, el porqué y con
qué interactúa (plan.md, «Commits»). Los de las gemas y las muestras van aparte de los del código.
La rama sigue local hasta que el dueño lo diga.

---

## Ola 3: pasos del dueño

1. `.harness-keys.json` para la Tarea O3 (antes de la Ola 1 si se quieren las muestras desde el
   primer recorrido; si no, después).
2. `VIMO_FLAG_NEW_CATALOG` de `off` a `admins` en Cloudflare Pages (lo puede hacer el orquestador
   con aprobación, como en la Entrega 1).
3. QA con claves reales (E2-7): guiones × estilos × modos, contra el catálogo viejo; medición de
   costo y tiempo de la fase de prompts (criterios de la ADR-0039). Prioridad: los 5 de la casa y
   los 17 con personaje fijo.
4. Visto bueno: `VIMO_FLAG_NEW_CATALOG` a `all` (E2-8) y arranca el plazo de 7 días del retiro.
5. Push de `feat/catalogo-estilos` y PR a `dev` cuando el dueño lo diga.

## Fuera de alcance

- Todo lo de la Entrega 3 (catálogo en Supabase, admins, sincronización, `_catalog/`).
- El retiro del carril viejo y la regeneración del pack de la demo.
- Buscador o filtros en la pestaña Catálogo (38 tarjetas en tres columnas: se evalúa en la QA).
- Traducción automática de nombres y descripciones (las escribe el orquestador).
