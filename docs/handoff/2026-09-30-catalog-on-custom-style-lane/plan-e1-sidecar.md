# Frente A · Sidecar: gemas por secciones y marco de Vimo — Plan de implementación (Entrega 1)

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado)
> o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas
> (`- [ ]`) para el seguimiento.

**Goal:** Que el sidecar guarde, valide y use las gemas por secciones —almacén, presets de color,
marco de Vimo, carril verbatim con el protagonista de la sección, etiqueta de tratamiento, inicio y
final fijos, muestras con el marco y snapshot del proyecto— sin cambiar un byte del camino de las
gemas viejas.

**Architecture:** Una gema es vieja (`systemPrompt`) o de plantilla (`sections`), nunca las dos.
Con secciones, `buildTemplateSystem` (nuevo `pipeline/prompts/template-frame.ts`) arma el `system` de
la Fase 2: las secciones del autor bajo títulos fijos, cinco reglas de plataforma nuevas y las reglas
de siempre, que pasan a salir de una sola función (`platformSystemRules`) compartida con
`buildVerbatimSystem`. El resto del carril (lotes de 20, escalera, rescate, parser, tejido de
`[subject]`, vestuario, idioma, E34, persistencia por lote) no cambia y recibe tres agregados
acotados: el protagonista de la sección `character` sin Fase 1, la etiqueta `[T:…]` y las frases
fijas pegadas por código y protegidas en el recorte final. Sin `sections`, cada función toma
exactamente el camino de hoy; un guard lo pinea con huellas tomadas del código previo.

**Tech Stack:** TypeScript ejecutado con el type-stripping de Node (sidecar SEA), guards con
`node:test` + `node:assert/strict` y `fetch` simulado (`t.mock.method(globalThis, 'fetch', …)`),
Prettier, ESLint y `tsc -p tsconfig.pipeline.json`.

**Spec:** [design.md](design.md) es el contrato; [plan.md](plan.md) (plan maestro) fija los contratos
congelados, los dueños de cada archivo, las olas y las reglas de ejecución. Este plan cubre la
Tarea 0 (Ola 0) y las Tareas A1 a A8 (Ola 1, frente A). Todo el código de este plan se escribió y se
verificó (tipos, lint, formato y todos los guards) sobre una copia del repo en `e50be2a1`, tarea por
tarea y en este orden.

## Global Constraints

- Código en inglés (nombres, archivos, tipos, constantes); comentarios y documentación en español.
- Sin `enum`: arrays y objetos `as const` con su tipo derivado (`erasableSyntaxOnly`).
- `pipeline/` no lee `process.env` ni escribe a consola; todo fallo es `PipelineFailure(code, message)` con `code` estable (`invalid_payload`, `missing_api_key`, `llm_empty_response`, …).
- Límites (spec §4.1): cada sección hasta 12 000 caracteres y la suma hasta 30 000 (`SYSTEM_PROMPT_CHAR_LIMIT`); `character` hasta 700 (`MAX_WOVEN_IDENTITY_CHARS`); `promptStart` y `promptEnd` hasta 600 cada una.
- Una gema tiene `sections` o `systemPrompt`, nunca los dos.
- Un `customStyle` sin `sections` produce exactamente los mismos mensajes y los mismos prompts que hoy, byte por byte (spec §5.7).
- Reglas nuevas del marco: en español sin acentos y declaradas como las de hoy, con el encabezado «(regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo)» (ADR-0019).
- La sección `character` nunca entra al `system` (spec §5.1).
- Este frente solo edita `pipeline/**` y crea `scripts/test/check-gem-*.mjs`; la Tarea 0 además toca los tres archivos de `src/` que lista, y nada más.
- Los agentes no corren `git add`, `git commit`, `pnpm format`, `pnpm build` ni `pnpm lint:fix`. Solo `pnpm exec prettier --write <archivos>`, `pnpm exec eslint <archivos>`, `pnpm exec tsc -p tsconfig.pipeline.json --noEmit` (y `tsconfig.app.json` en la Tarea 0), `node --test scripts/test/<guard>` y los casos del harness de la Tarea A8. Excepción: la Tarea 0 corre sola en la Ola 0 y puede usar `pnpm build`.
- Guards sin claves reales ni red: LLM y proveedores simulados, carpetas temporales.
- Commits (los hace el orquestador): título Conventional Commits en inglés; cuerpo en español con qué, por qué y con qué interactúa; última línea `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Sin push, merge, rebase, PR ni deploy.
- Los scripts de verificación local no se commitean.

## Review Focus

1. **El modelo escribe igual el inicio o el final fijo** (la regla se lo prohíbe, pero `visualStyle` puede traer la frase). Esperado: la frase aparece una sola vez en el prompt final. Lo prueba la Tarea A6 («every final prompt is start + woven scene + end, with no duplicated phrase» y la unidad de `stripFixedPhrases`).
2. **Una gema vieja sin reconstruir (o con el servidor del agente caído)** sigue generando por el camino de hoy. Esperado: conversación y prompts finales idénticos en los cuatro modos. Lo prueba la Tarea A4 con huellas SHA-256 tomadas del código previo, y se vuelve a correr en A5, A6, A7 y A8.
3. **La etiqueta de tratamiento mal escrita, en mayúsculas, inventada o sola** (`((2)) [T:object]`). Esperado: el prompt vale sin reintento; la etiqueta sola cuenta como escena faltante, nunca como prompt vacío; sin dinamismo, la lectura es la de siempre. Lo prueba la Tarea A5.
4. **Un `style.json` editado a mano o escrito por otra versión** (secciones y `systemPrompt` a la vez, filtro desconocido, versión en texto, secciones rotas). Esperado: la galería lo lee sin romperse y nunca devuelve las dos formas; lo inválido se omite. Lo prueban la Tarea A1 (lectura tolerante) y la A2 (`colorFilterFor('sepia')`).
5. **Frases fijas o sección `character` en español, y prompts muy largos con frases grandes.** Esperado: viajan tal cual (sin fallo de idioma); el recorte final nunca corta el inicio y sacrifica el final fijo antes que la identidad. Lo prueba la Tarea A6.

---

## Mapa de archivos

| Archivo                                                                                                                                                            | Tareas                  | Responsabilidad                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | -------------------------------------------------------------------------------- |
| `pipeline/types/styles.ts`                                                                                                                                         | 0, A8c                  | Contrato de la gema por secciones (congelado en la Ola 0).                       |
| `pipeline/types/video-project.ts`                                                                                                                                  | 0                       | `ProjectCustomStyle` con secciones; fuente `style-section`.                      |
| `pipeline/types/scenes.ts`                                                                                                                                         | 0                       | `Scene.treatment`.                                                               |
| `pipeline/commands/styles/style-store.ts`                                                                                                                          | A1                      | Límites, validación estricta, lectura tolerante y `StoredStyle`.                 |
| `pipeline/commands/styles/style-save.ts`                                                                                                                           | A1                      | Guardar una gema vieja o de plantilla, conservando lo ausente.                   |
| `pipeline/commands/styles/styles-list.ts`                                                                                                                          | A1 (sin cambios)        | Lista con `readStyleEntry`; el guard lo ejercita.                                |
| `pipeline/prompts/color-filters.ts` (nuevo)                                                                                                                        | A2                      | Los tres presets de color.                                                       |
| `pipeline/stages/shared/project-style.ts`                                                                                                                          | A2                      | `filterFinal` desde `customStyle.colorFilter`.                                   |
| `pipeline/prompts/template-frame.ts` (nuevo)                                                                                                                       | A3, A6                  | El marco: `buildTemplateSystem`, `composeGemText`, reglas nuevas y frases fijas. |
| `pipeline/prompts/verbatim-messages.ts`                                                                                                                            | A3                      | `platformSystemRules` compartida; `buildVerbatimSystem` idéntica.                |
| `pipeline/stages/scene-prompts/verbatim/subject-weaver.ts`                                                                                                         | A4                      | El protagonista de la sección `character`.                                       |
| `pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts`                                                                                                        | A4, A5, A6              | `system` del marco, etiquetas, frases fijas en el prompt final.                  |
| `pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts`                                                                                                          | 0, A4, A5               | Gema como texto, protagonista de la sección, tratamiento por escena.             |
| `pipeline/stages/scene-prompts/verbatim/parser.ts`                                                                                                                 | A5                      | `readTreatmentTag`.                                                              |
| `pipeline/stages/scene-prompts/verbatim/treatments.ts` (nuevo)                                                                                                     | A5                      | `withTreatment` y el texto del reparto.                                          |
| `pipeline/stages/scene-prompts/verbatim/verbatim-persistence.ts`                                                                                                   | A5                      | Persiste el tratamiento con cada lote.                                           |
| `pipeline/stages/scene-prompts/scene-prompts.ts`                                                                                                                   | A5                      | El `log` del reparto al cerrar la fase.                                          |
| `pipeline/stages/shared/prompt-safety.ts`                                                                                                                          | A6                      | Recorte final que protege las frases fijas.                                      |
| `pipeline/stages/images/images.ts`                                                                                                                                 | A6                      | Frases fijas en el fallback y en el recorte final.                               |
| `pipeline/commands/styles/generate-style-samples.ts`                                                                                                               | 0, A7                   | Muestras con el marco para gemas de plantilla.                                   |
| `pipeline/prompts/custom-style.ts`                                                                                                                                 | 0, A8                   | La gema como texto para el preview y el fallback.                                |
| `pipeline/commands/videos/create-video-project.ts`                                                                                                                 | A8                      | Validación del snapshot con secciones.                                           |
| `pipeline/commands/characters/generate-character-preview.ts`                                                                                                       | A8                      | Retrato con el texto de la gema y sus frases fijas.                              |
| `pipeline/commands/styles/design-style-character.ts`                                                                                                               | A8c (condicionada a P1) | Diseño del personaje con las secciones.                                          |
| `src/modules/videos/utilities/selectedCustomStyle.ts`, `src/modules/videos/components/CustomStyleGallery.tsx`, `src/modules/videos/components/CustomStyleCard.tsx` | 0                       | Arreglos mínimos de compilación (`?? ''`).                                       |
| `scripts/test/check-gem-*.mjs` (nuevos)                                                                                                                            | A1 a A8                 | Un guard por tarea.                                                              |

## Cómo se trabaja en este frente

- **Orden.** La Tarea 0 corre sola (Ola 0) y se commitea con la ADR-0041. Después A1 → A2 → … → A8,
  en ese orden: cada tarea parte del árbol que dejó la anterior.
- **Cómo leer los pasos de código.** «Crear» y «Reemplazar el contenido completo» traen el archivo
  entero. «Edición n de N — reemplazar … por …» es un reemplazo exacto de texto: el bloque viejo
  aparece una sola vez en el archivo tal como lo dejó la tarea anterior; aplicadas en orden, las
  ediciones dejan el archivo exactamente como quedó verificado.
- **La batería del carril** son los seis guards del plan maestro más el de escenas mudas. Se corre
  así y hoy da `ℹ tests 111` y `ℹ pass 111`:

  ```bash
  node --test scripts/test/check-preview-regressions.mjs scripts/test/check-style-character-video.mjs scripts/test/check-scene-wardrobe.mjs scripts/test/check-verbatim-prompt-persistence.mjs scripts/test/check-verbatim-prompt-language.mjs scripts/test/check-editor-character-selection.mjs scripts/test/check-silent-scene-images.mjs
  ```

- **Huellas del camino viejo.** El guard de la Tarea A4 compara SHA-256 de la conversación y de los
  prompts finales de una gema vieja con valores tomados del código previo. Si una huella falla, el
  cambio rompió el camino viejo: se corrige el código, nunca la huella.
- **Commits.** Ningún agente commitea. El paso final de cada tarea es del orquestador: corre
  `pnpm format:check`, `pnpm lint`, `pnpm build`, `pnpm check:locales`, el guard de la tarea y la
  batería, y recién en verde hace el commit con el mensaje que trae la tarea.

---

## Tarea 0 · Contratos (Ola 0, corre sola)

Escribe los tipos congelados del plan maestro y arregla lo que deja de compilar porque `systemPrompt`
pasa a ser opcional. No cambia ningún comportamiento: toda gema guardada hoy trae `systemPrompt`
(`readStyleEntry` descarta la que no) y `create-video-project` lo sigue exigiendo hasta la Tarea A8
(su chequeo actual compila igual gracias al narrowing de `!customStyle.systemPrompt?.trim()`).

**Files:**

- Modify: `pipeline/types/styles.ts` (tipos nuevos y campos de `CustomStyleSummary`, `StyleSavePayload`, `GenerateStyleSamplesPayload`)
- Modify: `pipeline/types/video-project.ts` (`ProjectCustomStyle`, `StyleProtagonistSource`)
- Modify: `pipeline/types/scenes.ts` (`Scene.treatment`)
- Modify: `pipeline/prompts/custom-style.ts`, `pipeline/commands/styles/generate-style-samples.ts`, `pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts` (arreglos de compilación)
- Modify: `src/modules/videos/utilities/selectedCustomStyle.ts`, `src/modules/videos/components/CustomStyleGallery.tsx`, `src/modules/videos/components/CustomStyleCard.tsx` (arreglos de compilación; única vez que este frente toca `src/`)
- Test: `tsc` de `pipeline/` y de `src/`, `pnpm build` y la batería del carril (la tarea no agrega guard: no cambia comportamiento)

**Interfaces:**

- Consumes: nada.
- Produces (exactamente el contrato congelado del plan maestro):
  - `pipeline/types/styles.ts`: `interface GemSections { visualStyle: string; character?: string; dynamism?: string; camera?: string; rules?: string; promptStart?: string; promptEnd?: string }`, `type GemSectionKey = keyof GemSections`, `const GEM_SECTION_KEYS` (orden canónico `visualStyle, character, dynamism, camera, rules, promptStart, promptEnd`), `const GEM_TEMPLATE_VERSION = 1`, `const COLOR_FILTER_IDS = ['none', 'fantasy', 'horror-bw'] as const`, `type ColorFilterId`, `interface GemOrigin { kind: 'catalog'; catalogStyleId: string; name: string }`.
  - `CustomStyleSummary` suma `systemPrompt?`, `sections?`, `templateVersion?`, `sourcePrompt?`, `colorFilter?`, `origin?`, `updatedAt?`; `StyleSavePayload` suma `systemPrompt?`, `sections?`, `templateVersion?`, `sourcePrompt?`, `colorFilter?`, `origin?`; `GenerateStyleSamplesPayload` suma `promptModel?: string`.
  - `pipeline/types/video-project.ts`: `ProjectCustomStyle` suma `systemPrompt?`, `sections?`, `templateVersion?`, `colorFilter?`, `catalogStyleId?`; `StyleProtagonistSource` suma `'style-section'`.
  - `pipeline/types/scenes.ts`: `Scene.treatment?: SceneTreatment`.
  - `buildCustomStyleSystemPrompt(style: { systemPrompt?: string; shots?: string[] }): string` (acepta la gema sin texto).

- [ ] **Paso 1: escribir los tipos del contrato**

En `pipeline/types/styles.ts`:

Edición 1 de 3 — reemplazar:

<!-- prettier-ignore -->
```ts
  defaultCharacterId?: string
}

export interface CustomStyleSummary {
  id: string
  name: string
  // El estilo ES este system prompt: se manda al LLM que escribe los prompts.
  systemPrompt: string
  // Planos permitidos (vacío = sin restricción declarada).
  shots: string[]
  // Ausente = { mode: 'generic' }.
```

por:

<!-- prettier-ignore -->
```ts
  defaultCharacterId?: string
}

/** Secciones de una gema de plantilla (ADR-0041). */
export interface GemSections {
  visualStyle: string
  character?: string
  dynamism?: string
  camera?: string
  rules?: string
  promptStart?: string
  promptEnd?: string
}

export type GemSectionKey = keyof GemSections

/** Orden canónico de las secciones: el mismo en el marco, en el modal y en el agente. */
export const GEM_SECTION_KEYS = [
  'visualStyle',
  'character',
  'dynamism',
  'camera',
  'rules',
  'promptStart',
  'promptEnd',
] as const satisfies readonly GemSectionKey[]

/** Versión de la estructura de secciones que entienden este sidecar y esta app. */
export const GEM_TEMPLATE_VERSION = 1

export const COLOR_FILTER_IDS = ['none', 'fantasy', 'horror-bw'] as const
export type ColorFilterId = (typeof COLOR_FILTER_IDS)[number]

/** Solo en las copias de «Pasar a mi estilo» (Entrega 2). */
export interface GemOrigin {
  kind: 'catalog'
  catalogStyleId: string
  name: string
}

export interface CustomStyleSummary {
  id: string
  name: string
  /** Solo gemas viejas (sin secciones). */
  systemPrompt?: string
  sections?: GemSections
  templateVersion?: number
  sourcePrompt?: string
  colorFilter?: ColorFilterId
  origin?: GemOrigin
  updatedAt?: string
  // Planos permitidos (vacío = sin restricción declarada).
  shots: string[]
  // Ausente = { mode: 'generic' }.
```

Edición 2 de 3 — reemplazar:

<!-- prettier-ignore -->
```ts
export interface StyleSavePayload {
  id: string
  name: string
  systemPrompt: string
  shots?: string[]
  // Ausente = CONSERVAR el bloque guardado (guard v1.19.2 del origen); quien
  // quiera cambiarlo manda el bloque nuevo.
```

por:

<!-- prettier-ignore -->
```ts
export interface StyleSavePayload {
  id: string
  name: string
  /** Gema vieja. Excluyente con `sections`. */
  systemPrompt?: string
  /** Gema de plantilla. Excluyente con `systemPrompt`. */
  sections?: GemSections
  templateVersion?: number
  /** Ausente = conservar el guardado. */
  sourcePrompt?: string
  /** Ausente = conservar el guardado. */
  colorFilter?: ColorFilterId
  /** Ausente = conservar el guardado. */
  origin?: GemOrigin
  shots?: string[]
  // Ausente = CONSERVAR el bloque guardado (guard v1.19.2 del origen); quien
  // quiera cambiarlo manda el bloque nuevo.
```

Edición 3 de 3 — reemplazar:

<!-- prettier-ignore -->
```ts
export interface GenerateStyleSamplesPayload {
  styleId: string
  imageProvider: ImageProviderId
}

export interface GenerateStyleSamplesResult {
```

por:

<!-- prettier-ignore -->
```ts
export interface GenerateStyleSamplesPayload {
  styleId: string
  imageProvider: ImageProviderId
  /** Modelo de Ajustes para las gemas de plantilla. Ausente = el de la casa. */
  promptModel?: string
}

export interface GenerateStyleSamplesResult {
```

En `pipeline/types/video-project.ts`:

Edición 1 de 3 — reemplazar:

<!-- prettier-ignore -->
```ts
import type { CharacterStyleId } from './characters.ts'
import type { StyleCharacter } from './styles.ts'
import type { ImageProviderId } from './image-provider.ts'
import type { MusicGenerationParams } from './music.ts'
import type { SceneSummary, TranscriptWord } from './scenes.ts'
```

por:

<!-- prettier-ignore -->
```ts
import type { CharacterStyleId } from './characters.ts'
import type { ColorFilterId, GemSections, StyleCharacter } from './styles.ts'
import type { ImageProviderId } from './image-provider.ts'
import type { MusicGenerationParams } from './music.ts'
import type { SceneSummary, TranscriptWord } from './scenes.ts'
```

Edición 2 de 3 — reemplazar:

<!-- prettier-ignore -->
```ts
export interface ProjectCustomStyle {
  styleId: string
  name: string
  systemPrompt: string
  shots?: string[]
  // Qué declaró la gema sobre su protagonista (snapshot). Ausente = el
  // proyecto manda (comportamiento previo a ADR-0020, intacto).
```

por:

<!-- prettier-ignore -->
```ts
export interface ProjectCustomStyle {
  styleId: string
  name: string
  /** Gema vieja. Excluyente con `sections`. */
  systemPrompt?: string
  sections?: GemSections
  templateVersion?: number
  colorFilter?: ColorFilterId
  /** Entrega 2: estilo del catálogo del que sale esta copia. */
  catalogStyleId?: string
  shots?: string[]
  // Qué declaró la gema sobre su protagonista (snapshot). Ausente = el
  // proyecto manda (comportamiento previo a ADR-0020, intacto).
```

Edición 3 de 3 — reemplazar:

<!-- prettier-ignore -->
```ts
//  - fallback-request — la Fase 1 no dejó nada y lo resolvió el pedido JSON.
//  - recovered        — proyecto anterior a este campo: se leyó de los prompts
//                       de escena ya guardados.
export type StyleProtagonistSource =
  'style-phase' | 'platform-phase' | 'fallback-request' | 'recovered'

export interface StyleProtagonist {
  // Lo que se replica en el turno de assistant de la Fase 2.
```

por:

<!-- prettier-ignore -->
```ts
//  - fallback-request — la Fase 1 no dejó nada y lo resolvió el pedido JSON.
//  - recovered        — proyecto anterior a este campo: se leyó de los prompts
//                       de escena ya guardados.
//  - style-section    — gema de plantilla (ADR-0041): lo define su sección
//                       `character`, sin Fase 1.
export type StyleProtagonistSource =
  | 'style-phase'
  | 'platform-phase'
  | 'fallback-request'
  | 'recovered'
  | 'style-section'

export interface StyleProtagonist {
  // Lo que se replica en el turno de assistant de la Fase 2.
```

En `pipeline/types/scenes.ts`:

Edición 1 de 1 — reemplazar:

<!-- prettier-ignore -->
```ts
  // escenas se reescriben en las pasadas de recuperación.
  contentRejected?: boolean
  imageTask?: SceneImageTask
}

export type SceneImageStatus = 'pending' | 'generating' | 'ok' | 'error'
```

por:

<!-- prettier-ignore -->
```ts
  // escenas se reescriben en las pasadas de recuperación.
  contentRejected?: boolean
  imageTask?: SceneImageTask
  // El tratamiento que declaró la etiqueta `[T:…]` del prompt de una gema de
  // plantilla con dinamismo (ADR-0041). Solo diagnóstico: mide el reparto.
  treatment?: SceneTreatment
}

export type SceneImageStatus = 'pending' | 'generating' | 'ok' | 'error'
```

- [ ] **Paso 2: correr los tipos y ver qué deja de compilar**

Run: `pnpm exec tsc -p tsconfig.pipeline.json --noEmit`
Expected: FAIL con exactamente estos cinco errores (los mensajes siguen con el detalle de TS2345/TS2322):

```
pipeline/commands/characters/generate-character-preview.ts(115,50): error TS2345: Argument of type 'CustomStyleSummary' is not assignable to parameter of type '{ systemPrompt: string; shots?: string[] | undefined; }'.
pipeline/commands/styles/generate-style-samples.ts(86,53): error TS2345: Argument of type 'CustomStyleSummary' is not assignable to parameter of type '{ systemPrompt: string; shots?: string[] | undefined; }'.
pipeline/commands/styles/generate-style-samples.ts(121,50): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts(434,7): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
pipeline/stages/shared/project-style.ts(16,48): error TS2345: Argument of type 'ProjectCustomStyle' is not assignable to parameter of type '{ systemPrompt: string; shots?: string[] | undefined; }'.
```

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit`
Expected: FAIL con exactamente estos cuatro errores:

```
src/modules/videos/components/CustomStyleCard.tsx(226,20): error TS18048: 'style.systemPrompt' is possibly 'undefined'.
src/modules/videos/components/CustomStyleGallery.tsx(38,5): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
src/modules/videos/components/CustomStyleGallery.tsx(102,7): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
src/modules/videos/utilities/selectedCustomStyle.ts(12,5): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
```

`tsconfig.node.json` no se ve afectado. `create-video-project.ts`, `style-store.ts`, `style-save.ts` y `pipeline/commands/demo/pack.ts` compilan sin cambios.

- [ ] **Paso 3: los arreglos mínimos, sin cambiar comportamiento**

`buildCustomStyleSystemPrompt` acepta la gema sin texto (arregla `generate-character-preview.ts`, `generate-style-samples.ts:86` y `project-style.ts` de una vez). En `pipeline/prompts/custom-style.ts`:

Edición 1 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
// del origen. El envío VERBATIM sin envoltorio es del carril verbatim (rama
// posterior del roadmap, ADR-0016).
export function buildCustomStyleSystemPrompt(style: {
  systemPrompt: string
  shots?: string[]
}): string {
  const shots = (style.shots ?? []).filter(Boolean)
```

por:

<!-- prettier-ignore -->
```ts
// del origen. El envío VERBATIM sin envoltorio es del carril verbatim (rama
// posterior del roadmap, ADR-0016).
export function buildCustomStyleSystemPrompt(style: {
  systemPrompt?: string
  shots?: string[]
}): string {
  const shots = (style.shots ?? []).filter(Boolean)
```

Edición 2 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
          .join('\n')}`
      : ''

  return `${style.systemPrompt}${shotsBlock}\n\n${GLOBAL_RULES}`
}
```

por:

<!-- prettier-ignore -->
```ts
          .join('\n')}`
      : ''

  return `${style.systemPrompt ?? ''}${shotsBlock}\n\n${GLOBAL_RULES}`
}
```

En `pipeline/commands/styles/generate-style-samples.ts`:

Edición 1 de 1 — reemplazar:

<!-- prettier-ignore -->
```ts
  try {
    character =
      resolved.mode === 'design'
        ? await designSampleProtagonist(context, style.systemPrompt)
        : resolved
    context.emitter.emit({
      type: 'log',
```

por:

<!-- prettier-ignore -->
```ts
  try {
    character =
      resolved.mode === 'design'
        ? await designSampleProtagonist(context, style.systemPrompt ?? '')
        : resolved
    context.emitter.emit({
      type: 'log',
```

En `pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts`:

Edición 1 de 1 — reemplazar:

<!-- prettier-ignore -->
```ts
      // La gema del usuario, VERBATIM: el snapshot del proyecto, sin los
      // ALLOWED SHOTS ni las GLOBAL_RULES del carril de la casa (paridad con el
      // origen: los planos solo gobiernan el carril del catálogo).
      gem: customStyle.systemPrompt,
      // El modelo elegido en el proyecto; el writer lo resuelve (retirado o
      // desconocido → el de la casa, con aviso).
      modelId: context.options.promptModel,
```

por:

<!-- prettier-ignore -->
```ts
      // La gema del usuario, VERBATIM: el snapshot del proyecto, sin los
      // ALLOWED SHOTS ni las GLOBAL_RULES del carril de la casa (paridad con el
      // origen: los planos solo gobiernan el carril del catálogo).
      gem: customStyle.systemPrompt ?? '',
      // El modelo elegido en el proyecto; el writer lo resuelve (retirado o
      // desconocido → el de la casa, con aviso).
      modelId: context.options.promptModel,
```

En `src/modules/videos/utilities/selectedCustomStyle.ts`:

Edición 1 de 1 — reemplazar:

<!-- prettier-ignore -->
```ts
  return {
    styleId: style.id,
    name: style.name,
    systemPrompt: style.systemPrompt,
    shots: style.shots,
    ...(style.character ? { character: style.character } : {}),
  }
```

por:

<!-- prettier-ignore -->
```ts
  return {
    styleId: style.id,
    name: style.name,
    systemPrompt: style.systemPrompt ?? '',
    shots: style.shots,
    ...(style.character ? { character: style.character } : {}),
  }
```

En `src/modules/videos/components/CustomStyleGallery.tsx`:

Edición 1 de 2 — reemplazar:

<!-- prettier-ignore -->
```tsx
function toDraft(style: CustomStyleSummary): CustomStyleDraft {
  return {
    name: style.name,
    systemPrompt: style.systemPrompt,
    shots: style.shots,
    ...(style.character ? { character: style.character } : {}),
  }
```

por:

<!-- prettier-ignore -->
```tsx
function toDraft(style: CustomStyleSummary): CustomStyleDraft {
  return {
    name: style.name,
    systemPrompt: style.systemPrompt ?? '',
    shots: style.shots,
    ...(style.character ? { character: style.character } : {}),
  }
```

Edición 2 de 2 — reemplazar:

<!-- prettier-ignore -->
```tsx
    onSelect({
      styleId: payload.id,
      name: payload.name,
      systemPrompt: payload.systemPrompt,
      shots: payload.shots ?? [],
      ...(payload.character ? { character: payload.character } : {}),
    })
```

por:

<!-- prettier-ignore -->
```tsx
    onSelect({
      styleId: payload.id,
      name: payload.name,
      systemPrompt: payload.systemPrompt ?? '',
      shots: payload.shots ?? [],
      ...(payload.character ? { character: payload.character } : {}),
    })
```

En `src/modules/videos/components/CustomStyleCard.tsx`:

Edición 1 de 1 — reemplazar:

<!-- prettier-ignore -->
```tsx
        </p>
        <p className="truncate font-body text-xs text-muted-foreground">
          {t('create.customStyles.charsCount', {
            chars: style.systemPrompt.length.toLocaleString(),
          })}
        </p>
      </div>
```

por:

<!-- prettier-ignore -->
```tsx
        </p>
        <p className="truncate font-body text-xs text-muted-foreground">
          {t('create.customStyles.charsCount', {
            chars: (style.systemPrompt ?? '').length.toLocaleString(),
          })}
        </p>
      </div>
```

- [ ] **Paso 4: correr y ver que todo compila y la batería sigue verde**

Run: `pnpm exec tsc -p tsconfig.pipeline.json --noEmit && pnpm exec tsc -p tsconfig.app.json --noEmit && echo OK`
Expected: `OK`, sin errores.

Run: `pnpm build`
Expected: `tsc -b` sin errores y `vite build` terminado (`✓ built in …`). Solo en la Ola 0.

Run: la batería del carril (ver «Cómo se trabaja en este frente»).
Expected: `ℹ tests 111`, `ℹ pass 111`, `ℹ fail 0`.

- [ ] **Paso 5: formato y lint de lo tocado**

Run: `pnpm exec prettier --write pipeline/types/styles.ts pipeline/types/video-project.ts pipeline/types/scenes.ts pipeline/prompts/custom-style.ts pipeline/commands/styles/generate-style-samples.ts pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts src/modules/videos/utilities/selectedCustomStyle.ts src/modules/videos/components/CustomStyleGallery.tsx src/modules/videos/components/CustomStyleCard.tsx`
Expected: cada archivo listado como `(unchanged)`.

Run: `pnpm exec eslint pipeline/types/styles.ts pipeline/types/video-project.ts pipeline/types/scenes.ts pipeline/prompts/custom-style.ts pipeline/commands/styles/generate-style-samples.ts pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts src/modules/videos/utilities/selectedCustomStyle.ts src/modules/videos/components/CustomStyleGallery.tsx src/modules/videos/components/CustomStyleCard.tsx`
Expected: sin salida (exit 0).

- [ ] **Paso 6: Commit (orquestador), junto con la ADR-0041 de la Tarea O1**

```bash
git add pipeline/types/styles.ts pipeline/types/video-project.ts pipeline/types/scenes.ts pipeline/prompts/custom-style.ts pipeline/commands/styles/generate-style-samples.ts pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts src/modules/videos/utilities/selectedCustomStyle.ts src/modules/videos/components/CustomStyleGallery.tsx src/modules/videos/components/CustomStyleCard.tsx docs/adr/ADR-0041-gemas-por-secciones-y-agente-reconstructor.md docs/adr/README.es.md docs/adr/README.md
git commit -F- <<'EOF'
feat: add section-based gem contracts

Qué: pipeline/types suma el contrato de las gemas por secciones: GemSections,
GemSectionKey, GEM_SECTION_KEYS, GEM_TEMPLATE_VERSION, COLOR_FILTER_IDS,
ColorFilterId y GemOrigin; los campos nuevos de CustomStyleSummary,
StyleSavePayload, GenerateStyleSamplesPayload (promptModel) y
ProjectCustomStyle, donde systemPrompt pasa a ser opcional; la fuente
'style-section' del protagonista y Scene.treatment. Donde el código asumía que
systemPrompt siempre existe van arreglos mínimos (`?? ''`): custom-style,
generate-style-samples y verbatim-lane en pipeline/, y selectedCustomStyle,
CustomStyleGallery y CustomStyleCard en src/. Suma la ADR-0041.

Por qué: congela en la Ola 0 el contrato que comparten los frentes A (sidecar),
B (vimo-landing) y C (app) de la Entrega 1, antes de abrir el trabajo en
paralelo.

Con qué interactúa: ningún comportamiento cambia. Toda gema guardada hoy trae
systemPrompt (readStyleEntry descarta la que no) y create-video-project lo sigue
exigiendo hasta la Tarea A8 del plan del sidecar. La app consume estos tipos
con `import type` desde @pipeline/types.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Tarea A1 · Almacén de estilos con secciones

`style-store` valida y lee secciones; `style-save` guarda una gema vieja o una de plantilla. Los
límites van junto a los de siempre, toda la validación ocurre antes de tocar el disco, y lo que una
escritura no trae se conserva con el mismo guard que ya protege al bloque `character` (v1.19.2 del
origen): una sección editada desde el modal no borra el respaldo del agente, el filtro ni el origen.

**Files:**

- Modify (contenido completo): `pipeline/commands/styles/style-store.ts`
- Modify (contenido completo): `pipeline/commands/styles/style-save.ts`
- Sin cambios de código: `pipeline/commands/styles/styles-list.ts` (lista con `readStyleEntry`, donde vive la lectura tolerante)
- Test: `scripts/test/check-gem-sections-store.mjs`

**Interfaces:**

- Consumes: de la Tarea 0, `GemSections`, `GemSectionKey`, `GEM_SECTION_KEYS`, `GEM_TEMPLATE_VERSION`, `COLOR_FILTER_IDS`, `ColorFilterId`, `GemOrigin`, `CustomStyleSummary`, `StyleSavePayload`; `MAX_WOVEN_IDENTITY_CHARS` (700) de `stages/scene-prompts/verbatim/subject-weaver.ts`; `isCharacterStyleId(value: unknown): value is CharacterStyleId` de `prompts/visual-styles.ts`.
- Produces (`pipeline/commands/styles/style-store.ts`):
  - `const GEM_SECTION_CHAR_LIMIT = 12_000`, `const GEM_SECTIONS_TOTAL_CHAR_LIMIT = SYSTEM_PROMPT_CHAR_LIMIT` (30 000), `const CHARACTER_SECTION_CHAR_LIMIT = MAX_WOVEN_IDENTITY_CHARS` (700), `const FIXED_PHRASE_CHAR_LIMIT = 600`, `const SOURCE_PROMPT_CHAR_LIMIT = SYSTEM_PROMPT_CHAR_LIMIT`.
  - `readGemSections(value: unknown): GemSections | undefined` (tolerante: sin `visualStyle` no hay secciones; lo que no es texto o está vacío no está).
  - `assertGemSections(value: unknown, field: string): GemSections` (estricta; devuelve las secciones recortadas, sin vacías ni claves ajenas; `invalid_payload` con `${field}.<clave>` en el mensaje).
  - `assertTemplateVersion(value: unknown, field: string): asserts value is number` (entero entre 1 y `GEM_TEMPLATE_VERSION`).
  - `readColorFilter(value: unknown): ColorFilterId | undefined` y `assertColorFilter(value: unknown, field: string): asserts value is ColorFilterId`.
  - `isCatalogStyleId(value: unknown): value is string` (uno de los 5 ids heredados o `STYLE_ID_PATTERN`).
  - `readGemOrigin(value: unknown): GemOrigin | undefined` y `assertGemOrigin(value: unknown, field: string): asserts value is GemOrigin`.
  - `interface StoredStyle { name; systemPrompt?; sections?; templateVersion?; sourcePrompt?; colorFilter?; origin?; shots; character?; createdAt; updatedAt? }`.
  - `readStyleEntry(context, id)`: si el archivo trae secciones y `systemPrompt`, mandan las secciones; el resumen nunca lleva los dos; campos opcionales inválidos se omiten; sin ninguna gema usable, `null`.
- Produces (`style-save`, contrato para el frente C):
  - Exactamente uno de `systemPrompt` o `sections`; si no, `invalid_payload`.
  - Con `sections`: `templateVersion` entero 1..`GEM_TEMPLATE_VERSION`; ausente → se conserva el guardado o `GEM_TEMPLATE_VERSION`. Con `systemPrompt`, `templateVersion` es `invalid_payload`. Guardar secciones deja afuera el `systemPrompt` guardado.
  - `sourcePrompt`, `colorFilter`, `origin` y `character` ausentes se conservan; `sourcePrompt: ''` borra el respaldo.
  - `updatedAt` en cada guardado; `createdAt` se conserva; `shots` se guarda como llega (las gemas de plantilla no lo usan: su sección `camera` lo reemplaza).

- [ ] **Paso 1: escribir el guard que falla**

Crear `scripts/test/check-gem-sections-store.mjs`:

<!-- prettier-ignore -->
```js
// Gemas por secciones en la galería de «Mi estilo» (ADR-0041): style-save
// valida y guarda las secciones con los límites del spec §4.1, una gema es
// vieja o de plantilla (nunca las dos), el respaldo del agente, el filtro de
// color y el origen se conservan cuando la escritura no los trae, y la lectura
// tolera un style.json raro sin romper el listado. Sin HTTP: solo disco
// temporal.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { styleSave } from '../../pipeline/commands/styles/style-save.ts'
import { stylesList } from '../../pipeline/commands/styles/styles-list.ts'
import {
  CHARACTER_SECTION_CHAR_LIMIT,
  FIXED_PHRASE_CHAR_LIMIT,
  GEM_SECTION_CHAR_LIMIT,
  GEM_SECTIONS_TOTAL_CHAR_LIMIT,
  SYSTEM_PROMPT_CHAR_LIMIT,
  readStyleEntry,
} from '../../pipeline/commands/styles/style-store.ts'
import { GEM_TEMPLATE_VERSION } from '../../pipeline/types/styles.ts'

const sections = {
  visualStyle: '  Hand-drawn watercolor with indigo washes and rough paper.  ',
  character:
    'A curious red-haired girl with freckles and round green glasses. Outfit: a green hoodie and blue jeans.',
  dynamism:
    'Show the protagonist in half of the scenes; use a metaphor or an object in the rest.',
  camera: 'Alternate wide shots and close-ups.',
  rules: 'Never draw text on screens.',
  promptStart: 'Watercolor illustration:',
  promptEnd: 'Indigo washes on rough paper.',
}
const trimmedVisualStyle =
  'Hand-drawn watercolor with indigo washes and rough paper.'

async function galleryRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-store-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
function context(root, payload) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: {},
      binaryPaths: {},
      payload,
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit() {} },
  }
}
function save(root, payload) {
  return styleSave(
    context(root, { id: 'st-fixture', name: 'Acuarela', ...payload }),
  )
}
async function storedJson(root, id = 'st-fixture') {
  return JSON.parse(
    await readFile(join(root, '_styles', id, 'style.json'), 'utf8'),
  )
}
const invalid = { code: 'invalid_payload' }

// ── Límites ──

test('the limits are the ones of the spec', () => {
  assert.equal(GEM_SECTION_CHAR_LIMIT, 12_000)
  assert.equal(GEM_SECTIONS_TOTAL_CHAR_LIMIT, 30_000)
  assert.equal(GEM_SECTIONS_TOTAL_CHAR_LIMIT, SYSTEM_PROMPT_CHAR_LIMIT)
  assert.equal(CHARACTER_SECTION_CHAR_LIMIT, 700)
  assert.equal(FIXED_PHRASE_CHAR_LIMIT, 600)
})

// ── Guardar una gema de plantilla ──

test('a template gem is saved with trimmed sections, its version and both dates', async (t) => {
  const root = await galleryRoot(t)
  const { entry } = await save(root, {
    sections: { ...sections, camera: '   ' },
    templateVersion: GEM_TEMPLATE_VERSION,
    sourcePrompt: 'La gema completa que pegó el autor.',
    colorFilter: 'fantasy',
  })

  const stored = await storedJson(root)
  assert.equal(stored.systemPrompt, undefined)
  assert.equal(stored.sections.visualStyle, trimmedVisualStyle)
  assert.equal(
    stored.sections.camera,
    undefined,
    'una sección vacía no se guarda',
  )
  assert.equal(stored.templateVersion, GEM_TEMPLATE_VERSION)
  assert.equal(stored.sourcePrompt, 'La gema completa que pegó el autor.')
  assert.equal(stored.colorFilter, 'fantasy')
  assert.ok(Date.parse(stored.createdAt) > 0)
  assert.ok(Date.parse(stored.updatedAt) >= Date.parse(stored.createdAt))

  assert.equal(entry.systemPrompt, undefined)
  assert.deepEqual(entry.sections, stored.sections)
  assert.equal(entry.templateVersion, GEM_TEMPLATE_VERSION)
  assert.equal(entry.colorFilter, 'fantasy')
  const { entries } = await stylesList(context(root))
  assert.deepEqual(
    entries.map((style) => style.id),
    ['st-fixture'],
  )
  assert.deepEqual(entries[0].sections, stored.sections)
})

test('saving sections over an old gem drops its system prompt and keeps its creation date', async (t) => {
  const root = await galleryRoot(t)
  await save(root, { systemPrompt: 'Old watercolor gem.' })
  const { createdAt } = await storedJson(root)

  await save(root, {
    sections: { visualStyle: 'Watercolor.' },
    sourcePrompt: 'Old watercolor gem.',
  })
  const stored = await storedJson(root)
  assert.equal(stored.systemPrompt, undefined)
  assert.deepEqual(stored.sections, { visualStyle: 'Watercolor.' })
  assert.equal(
    stored.templateVersion,
    GEM_TEMPLATE_VERSION,
    'sin versión, la actual',
  )
  assert.equal(stored.sourcePrompt, 'Old watercolor gem.')
  assert.equal(stored.createdAt, createdAt)
})

test('an old gem is still saved as before, now with its update date', async (t) => {
  const root = await galleryRoot(t)
  const { entry } = await save(root, {
    systemPrompt: '  Old watercolor gem.  ',
    shots: ['Wide shot'],
    character: { mode: 'none' },
  })
  const stored = await storedJson(root)
  assert.deepEqual(Object.keys(stored).sort(), [
    'character',
    'createdAt',
    'name',
    'shots',
    'systemPrompt',
    'updatedAt',
  ])
  assert.equal(stored.systemPrompt, 'Old watercolor gem.')
  assert.equal(entry.sections, undefined)
  assert.equal(entry.templateVersion, undefined)
})

// ── Rechazos ──

for (const [name, payload] of [
  ['both kinds of gem', { systemPrompt: 'x', sections }],
  ['neither kind of gem', {}],
  ['no visual style', { sections: { ...sections, visualStyle: '   ' } }],
  ['a section that is not text', { sections: { ...sections, rules: 3 } }],
  ['sections that are not an object', { sections: 'Watercolor.' }],
  [
    'a section over 12 000',
    { sections: { visualStyle: 'x'.repeat(GEM_SECTION_CHAR_LIMIT + 1) } },
  ],
  [
    'a character over 700',
    { sections: { ...sections, character: 'x'.repeat(701) } },
  ],
  [
    'a fixed start over 600',
    { sections: { ...sections, promptStart: 'x'.repeat(601) } },
  ],
  [
    'a fixed end over 600',
    { sections: { ...sections, promptEnd: 'x'.repeat(601) } },
  ],
  [
    'sections over 30 000 in total',
    {
      sections: {
        visualStyle: 'x'.repeat(12_000),
        dynamism: 'x'.repeat(12_000),
        camera: 'x'.repeat(6_001),
      },
    },
  ],
  [
    'a newer template version',
    { sections, templateVersion: GEM_TEMPLATE_VERSION + 1 },
  ],
  ['a template version of 0', { sections, templateVersion: 0 }],
  [
    'a template version that is not an integer',
    { sections, templateVersion: 1.5 },
  ],
  [
    'a template version on an old gem',
    { systemPrompt: 'x', templateVersion: 1 },
  ],
  ['an unknown color filter', { sections, colorFilter: 'sepia' }],
  [
    'an origin that is not from the catalog',
    {
      sections,
      origin: { kind: 'friend', catalogStyleId: 'terror', name: 'Terror' },
    },
  ],
  [
    'an origin with an unsafe id',
    {
      sections,
      origin: { kind: 'catalog', catalogStyleId: '../evil', name: 'Terror' },
    },
  ],
  [
    'a backup over 30 000',
    { sections, sourcePrompt: 'x'.repeat(SYSTEM_PROMPT_CHAR_LIMIT + 1) },
  ],
]) {
  test('style-save rejects ' + name + ' and writes nothing', async (t) => {
    const root = await galleryRoot(t)
    await assert.rejects(save(root, payload), invalid)
    await assert.rejects(storedJson(root), { code: 'ENOENT' })
  })
}

test('a rejected edit leaves the stored gem untouched', async (t) => {
  const root = await galleryRoot(t)
  await save(root, { sections })
  const before = await storedJson(root)
  await assert.rejects(
    save(root, { sections: { ...sections, character: 'x'.repeat(701) } }),
    invalid,
  )
  assert.deepEqual(await storedJson(root), before)
})

// ── Conservación ──

test('an edit without backup, color filter, origin or character keeps them', async (t) => {
  const root = await galleryRoot(t)
  await save(root, {
    sections,
    sourcePrompt: 'Original gem.',
    colorFilter: 'horror-bw',
    origin: { kind: 'catalog', catalogStyleId: 'terror', name: 'Terror' },
    character: { mode: 'none' },
  })
  // Editar una sección: la UI manda solo las secciones.
  await save(root, { sections: { ...sections, rules: 'Never draw blood.' } })
  const stored = await storedJson(root)
  assert.equal(stored.sections.rules, 'Never draw blood.')
  assert.equal(stored.sourcePrompt, 'Original gem.')
  assert.equal(stored.colorFilter, 'horror-bw')
  assert.deepEqual(stored.origin, {
    kind: 'catalog',
    catalogStyleId: 'terror',
    name: 'Terror',
  })
  assert.deepEqual(stored.character, { mode: 'none' })
  assert.equal(stored.templateVersion, GEM_TEMPLATE_VERSION)

  // Un valor explícito reemplaza; un respaldo vacío lo borra.
  await save(root, { sections, colorFilter: 'none', sourcePrompt: '' })
  const replaced = await storedJson(root)
  assert.equal(replaced.colorFilter, 'none')
  assert.equal(replaced.sourcePrompt, undefined)
})

test('a new catalog id in an origin follows the gallery pattern', async (t) => {
  const root = await galleryRoot(t)
  const { entry } = await save(root, {
    sections,
    origin: { kind: 'catalog', catalogStyleId: 'st-noir-2', name: 'Noir' },
  })
  assert.equal(entry.origin.catalogStyleId, 'st-noir-2')
})

// ── Lectura tolerante ──

async function writeRaw(root, id, content) {
  const directory = join(root, '_styles', id)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'style.json'), JSON.stringify(content))
}

test('a style.json with both kinds of gem reads as a template gem', async (t) => {
  const root = await galleryRoot(t)
  await writeRaw(root, 'st-both', {
    name: 'Both',
    systemPrompt: 'Old text.',
    sections: { visualStyle: 'Watercolor.', rules: 7, camera: '  ' },
    templateVersion: '1',
    colorFilter: 'sepia',
    origin: { kind: 'catalog', catalogStyleId: 'terror' },
    shots: [],
    createdAt: '2026-09-30T00:00:00.000Z',
  })
  const entry = await readStyleEntry(context(root), 'st-both')
  assert.equal(entry.systemPrompt, undefined)
  assert.deepEqual(entry.sections, { visualStyle: 'Watercolor.' })
  assert.equal(entry.templateVersion, undefined)
  assert.equal(entry.colorFilter, undefined)
  assert.equal(entry.origin, undefined)
})

test('broken sections fall back to the old text, and nothing usable is not listed', async (t) => {
  const root = await galleryRoot(t)
  await writeRaw(root, 'st-old', {
    name: 'Old',
    systemPrompt: 'Old text.',
    sections: { camera: 'Wide.' },
    shots: [],
    createdAt: '2026-09-30T00:00:00.000Z',
  })
  await writeRaw(root, 'st-empty', {
    name: 'Empty',
    sections: { visualStyle: '' },
    shots: [],
    createdAt: '2026-09-30T00:00:01.000Z',
  })
  const { entries } = await stylesList(context(root))
  assert.deepEqual(
    entries.map((style) => style.id),
    ['st-old'],
  )
  assert.equal(entries[0].systemPrompt, 'Old text.')
  assert.equal(entries[0].sections, undefined)
})
```

- [ ] **Paso 2: correr y ver que falla**

Run: `node --test scripts/test/check-gem-sections-store.mjs`
Expected: FAIL al cargar: `SyntaxError: The requested module '../../pipeline/commands/styles/style-store.ts' does not provide an export named 'CHARACTER_SECTION_CHAR_LIMIT'`.

- [ ] **Paso 3: reemplazar `style-store.ts`**

Reemplazar el contenido completo de `pipeline/commands/styles/style-store.ts` por:

<!-- prettier-ignore -->
```ts
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { isCharacterStyleId } from '../../prompts/visual-styles.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { MAX_WOVEN_IDENTITY_CHARS } from '../../stages/scene-prompts/verbatim/subject-weaver.ts'
import {
  COLOR_FILTER_IDS,
  GEM_SECTION_KEYS,
  GEM_TEMPLATE_VERSION,
  type ColorFilterId,
  type CustomStyleSummary,
  type GemOrigin,
  type GemSectionKey,
  type GemSections,
  type StyleCharacter,
  type StyleSample,
} from '../../types/styles.ts'

// Galería de estilos propios: `<projectsRoot>/_styles/<id>/` con style.json y
// sample-N.jpg — espejo de `estilos-propios/<id>/` del origen y del patrón
// `_history/` de música (la raíz la elige el usuario, ADR-0009).
export const STYLES_SUBDIRECTORY = '_styles'
export const STYLE_FILE = 'style.json'
export const SAMPLE_FILE_PATTERN = /^sample-(\d+)\.jpg$/

// Límites portados del origen (rutas/estilos.ts + util/estilosPropios.ts).
export const STYLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/
export const SYSTEM_PROMPT_CHAR_LIMIT = 30_000
export const MAX_SHOTS = 20
export const MAX_SAMPLES = 8
export const MAX_SAMPLE_BYTES = 4 * 1024 * 1024
// El origen no capaba el nombre; acá se espeja PROJECT_NAME_LIMIT (desviación
// deliberada: un nombre sin tope rompe las tarjetas de la galería).
export const STYLE_NAME_LIMIT = 80
export const DEFAULT_CHARACTER_ID_LIMIT = 120

// Límites de una gema de plantilla (spec §4.1, ADR-0041): cada sección hasta
// 12 000 y la suma hasta el tope de siempre. `character` se teje entera en
// cada escena, así que su tope es el de la identidad tejida; el inicio y el
// final fijos se pegan en cada prompt de imagen.
export const GEM_SECTION_CHAR_LIMIT = 12_000
export const GEM_SECTIONS_TOTAL_CHAR_LIMIT = SYSTEM_PROMPT_CHAR_LIMIT
export const CHARACTER_SECTION_CHAR_LIMIT = MAX_WOVEN_IDENTITY_CHARS
export const FIXED_PHRASE_CHAR_LIMIT = 600
// El texto original que se mandó al agente (solo respaldo): el mismo tope
// que acepta el agente.
export const SOURCE_PROMPT_CHAR_LIMIT = SYSTEM_PROMPT_CHAR_LIMIT

const STYLE_CHARACTER_MODES: readonly string[] = ['own', 'generic', 'none']

// Lectura tolerante del bloque de personaje: modo fuera de la lista → como si
// no estuviera (= genérico); el puntero solo cuenta con `own`.
export function readStyleCharacter(value: unknown): StyleCharacter | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as { mode?: unknown; defaultCharacterId?: unknown }
  if (
    typeof record.mode !== 'string' ||
    !STYLE_CHARACTER_MODES.includes(record.mode)
  )
    return undefined
  const mode = record.mode as StyleCharacter['mode']
  const id =
    mode === 'own' &&
    typeof record.defaultCharacterId === 'string' &&
    record.defaultCharacterId.trim().length > 0 &&
    record.defaultCharacterId.length <= DEFAULT_CHARACTER_ID_LIMIT
      ? record.defaultCharacterId.trim()
      : undefined
  return id ? { mode, defaultCharacterId: id } : { mode }
}

// Validación estricta del bloque que llega del webview (style-save y el
// snapshot inline de create-video-project): lo que el lector tolera, el
// escritor lo rechaza — un modo inventado es un llamador roto.
export function assertStyleCharacter(
  value: unknown,
  field: string,
): asserts value is StyleCharacter {
  if (!value || typeof value !== 'object')
    throw new PipelineFailure('invalid_payload', `${field} must be an object`)
  const record = value as { mode?: unknown; defaultCharacterId?: unknown }
  if (
    typeof record.mode !== 'string' ||
    !STYLE_CHARACTER_MODES.includes(record.mode)
  )
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.mode must be one of ${STYLE_CHARACTER_MODES.join(', ')}`,
    )
  if (record.defaultCharacterId === undefined) return
  if (record.mode !== 'own')
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.defaultCharacterId only applies to mode own`,
    )
  if (
    typeof record.defaultCharacterId !== 'string' ||
    !record.defaultCharacterId.trim() ||
    record.defaultCharacterId.length > DEFAULT_CHARACTER_ID_LIMIT
  )
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.defaultCharacterId must be a non-empty string of at most ${DEFAULT_CHARACTER_ID_LIMIT} characters`,
    )
}

function sectionCharLimit(key: GemSectionKey): number {
  if (key === 'character') return CHARACTER_SECTION_CHAR_LIMIT
  if (key === 'promptStart' || key === 'promptEnd')
    return FIXED_PHRASE_CHAR_LIMIT
  return GEM_SECTION_CHAR_LIMIT
}

// Lectura tolerante de las secciones: sin `visualStyle` no hay gema de
// plantilla; una sección que no es texto, o que quedó vacía, no está.
export function readGemSections(value: unknown): GemSections | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const visualStyle =
    typeof record.visualStyle === 'string' ? record.visualStyle.trim() : ''
  if (!visualStyle) return undefined

  const sections: GemSections = { visualStyle }
  for (const key of GEM_SECTION_KEYS) {
    if (key === 'visualStyle') continue
    const text = record[key]
    if (typeof text === 'string' && text.trim()) sections[key] = text.trim()
  }
  return sections
}

// Validación estricta de las secciones que llegan del webview. Devuelve las
// secciones normalizadas: recortadas, sin las vacías y sin claves ajenas.
export function assertGemSections(value: unknown, field: string): GemSections {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PipelineFailure('invalid_payload', `${field} must be an object`)
  const record = value as Record<string, unknown>

  const sections: Partial<GemSections> = {}
  let total = 0
  for (const key of GEM_SECTION_KEYS) {
    const text = record[key]
    if (text === undefined) continue
    if (typeof text !== 'string')
      throw new PipelineFailure(
        'invalid_payload',
        `${field}.${key} must be a string`,
      )
    const trimmed = text.trim()
    if (!trimmed) continue
    const limit = sectionCharLimit(key)
    if (trimmed.length > limit)
      throw new PipelineFailure(
        'invalid_payload',
        `${field}.${key} exceeds ${limit} characters`,
      )
    total += trimmed.length
    sections[key] = trimmed
  }

  if (!sections.visualStyle)
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.visualStyle is required`,
    )
  if (total > GEM_SECTIONS_TOTAL_CHAR_LIMIT)
    throw new PipelineFailure(
      'invalid_payload',
      `${field} exceed ${GEM_SECTIONS_TOTAL_CHAR_LIMIT} characters in total`,
    )
  return { ...sections, visualStyle: sections.visualStyle }
}

export function assertTemplateVersion(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > GEM_TEMPLATE_VERSION
  )
    throw new PipelineFailure(
      'invalid_payload',
      `${field} must be an integer between 1 and ${GEM_TEMPLATE_VERSION}`,
    )
}

function readTemplateVersion(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
    return undefined
  return value
}

// Ausente o fuera de la lista = sin preset (se lee como `none`).
export function readColorFilter(value: unknown): ColorFilterId | undefined {
  return COLOR_FILTER_IDS.find((id) => id === value)
}

export function assertColorFilter(
  value: unknown,
  field: string,
): asserts value is ColorFilterId {
  if (readColorFilter(value) === undefined)
    throw new PipelineFailure(
      'invalid_payload',
      `${field} must be one of ${COLOR_FILTER_IDS.join(', ')}`,
    )
}

// Id de un estilo del catálogo dentro de una copia o de un snapshot: uno de
// los 5 heredados o uno nuevo con el patrón de la galería (spec §8).
export function isCatalogStyleId(value: unknown): value is string {
  if (isCharacterStyleId(value)) return true
  return typeof value === 'string' && STYLE_ID_PATTERN.test(value)
}

export function readGemOrigin(value: unknown): GemOrigin | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as {
    kind?: unknown
    catalogStyleId?: unknown
    name?: unknown
  }
  if (record.kind !== 'catalog') return undefined
  if (!isCatalogStyleId(record.catalogStyleId)) return undefined
  if (typeof record.name !== 'string' || !record.name.trim()) return undefined
  return {
    kind: 'catalog',
    catalogStyleId: record.catalogStyleId,
    name: record.name.trim(),
  }
}

export function assertGemOrigin(
  value: unknown,
  field: string,
): asserts value is GemOrigin {
  if (!value || typeof value !== 'object')
    throw new PipelineFailure('invalid_payload', `${field} must be an object`)
  const record = value as {
    kind?: unknown
    catalogStyleId?: unknown
    name?: unknown
  }
  if (record.kind !== 'catalog')
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.kind must be catalog`,
    )
  if (!isCatalogStyleId(record.catalogStyleId))
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.catalogStyleId is not a valid style id`,
    )
  if (
    typeof record.name !== 'string' ||
    !record.name.trim() ||
    record.name.trim().length > STYLE_NAME_LIMIT
  )
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.name must be a non-empty string of at most ${STYLE_NAME_LIMIT} characters`,
    )
}

// Guard anti path-traversal: el id viene del webview (patrón de music).
export function assertValidStyleId(id: string): void {
  if (!STYLE_ID_PATTERN.test(id))
    throw new PipelineFailure('invalid_payload', `invalid style id "${id}"`)
}

export function stylesRoot(context: PipelineContext): string {
  const projectsRoot = context.job.projectsRoot
  if (!projectsRoot)
    throw new PipelineFailure(
      'missing_projects_root',
      'the job did not include projectsRoot',
    )

  return join(projectsRoot, STYLES_SUBDIRECTORY)
}

export function styleDirectory(context: PipelineContext, id: string): string {
  return join(stylesRoot(context), id)
}

// Lo persistido en style.json: sin rutas absolutas ni muestras — se derivan
// al leer, así la carpeta puede moverse. Una gema es VIEJA (`systemPrompt`) o
// de PLANTILLA (`sections`), nunca las dos (ADR-0041).
export interface StoredStyle {
  name: string
  systemPrompt?: string
  sections?: GemSections
  templateVersion?: number
  // Respaldo del texto que se mandó al agente: no se usa para generar.
  sourcePrompt?: string
  colorFilter?: ColorFilterId
  origin?: GemOrigin
  shots: string[]
  // Se escribe solo si hay: una gema sin bloque sigue siendo un JSON
  // idéntico al de ADR-0018 y se lee como `generic`.
  character?: StyleCharacter
  createdAt: string
  updatedAt?: string
}

export async function readStyleSamples(
  directory: string,
): Promise<StyleSample[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }

  const samples: StyleSample[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!SAMPLE_FILE_PATTERN.test(entry.name)) continue
    const path = join(directory, entry.name)
    try {
      const info = await stat(path)
      samples.push({
        file: entry.name,
        path,
        mtimeMs: Math.round(info.mtimeMs),
      })
    } catch {
      // Borrada entre el readdir y el stat: se salta.
    }
  }

  samples.sort((a, b) => sampleNumber(a.file) - sampleNumber(b.file))
  return samples
}

function sampleNumber(file: string): number {
  const match = file.match(SAMPLE_FILE_PATTERN)
  return match ? parseInt(match[1], 10) : 0
}

// null = carpeta ajena o style.json corrupto: se ignora sin romper el listado
// (patrón de music-history y del listado de proyectos). Si un archivo trae
// secciones Y systemPrompt, mandan las secciones: el resumen nunca lleva los
// dos.
export async function readStyleEntry(
  context: PipelineContext,
  id: string,
): Promise<CustomStyleSummary | null> {
  const directory = styleDirectory(context, id)

  let stored: StoredStyle
  try {
    stored = JSON.parse(
      await readFile(join(directory, STYLE_FILE), 'utf8'),
    ) as StoredStyle
  } catch {
    return null
  }
  if (typeof stored.name !== 'string') return null
  const sections = readGemSections(stored.sections)
  if (!sections && typeof stored.systemPrompt !== 'string') return null

  const templateVersion = sections
    ? readTemplateVersion(stored.templateVersion)
    : undefined
  const sourcePrompt =
    typeof stored.sourcePrompt === 'string' && stored.sourcePrompt.trim()
      ? stored.sourcePrompt
      : undefined
  const colorFilter = readColorFilter(stored.colorFilter)
  const origin = readGemOrigin(stored.origin)
  const character = readStyleCharacter(stored.character)
  return {
    id,
    name: stored.name,
    ...(sections ? { sections } : { systemPrompt: stored.systemPrompt }),
    ...(templateVersion ? { templateVersion } : {}),
    ...(sourcePrompt ? { sourcePrompt } : {}),
    ...(colorFilter ? { colorFilter } : {}),
    ...(origin ? { origin } : {}),
    shots: Array.isArray(stored.shots)
      ? stored.shots.filter((shot) => typeof shot === 'string')
      : [],
    ...(character ? { character } : {}),
    createdAt: typeof stored.createdAt === 'string' ? stored.createdAt : '',
    ...(typeof stored.updatedAt === 'string'
      ? { updatedAt: stored.updatedAt }
      : {}),
    samples: await readStyleSamples(directory),
  }
}
```

- [ ] **Paso 4: reemplazar `style-save.ts`**

Reemplazar el contenido completo de `pipeline/commands/styles/style-save.ts` por:

<!-- prettier-ignore -->
```ts
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import {
  GEM_TEMPLATE_VERSION,
  type GemSections,
  type StyleSavePayload,
  type StyleSaveResult,
} from '../../types/styles.ts'
import { writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  MAX_SHOTS,
  SOURCE_PROMPT_CHAR_LIMIT,
  STYLE_FILE,
  STYLE_NAME_LIMIT,
  SYSTEM_PROMPT_CHAR_LIMIT,
  assertColorFilter,
  assertGemOrigin,
  assertGemSections,
  assertStyleCharacter,
  assertTemplateVersion,
  assertValidStyleId,
  readStyleEntry,
  styleDirectory,
  type StoredStyle,
} from './style-store.ts'

// Lo que define el estilo: el texto de una gema vieja o las secciones de una
// de plantilla (ADR-0041), nunca las dos.
type GemContent = { systemPrompt: string } | { sections: GemSections }

// Crea o actualiza un estilo propio. Un update conserva el createdAt y las
// muestras existentes (las muestras solo las toca generate-style-samples).
export async function styleSave(
  context: PipelineContext,
): Promise<StyleSaveResult> {
  const payload = context.job.payload as StyleSavePayload | undefined
  if (!payload?.id)
    throw new PipelineFailure('invalid_payload', 'payload.id is required')
  assertValidStyleId(payload.id)

  const name = payload.name?.trim() ?? ''
  if (!name)
    throw new PipelineFailure('invalid_payload', 'payload.name is required')
  if (name.length > STYLE_NAME_LIMIT)
    throw new PipelineFailure('invalid_payload', 'payload.name is too long')

  const content = readGemContent(payload)

  const shots = (payload.shots ?? [])
    .map((shot) => (typeof shot === 'string' ? shot.trim() : ''))
    .filter(Boolean)
  if (shots.length > MAX_SHOTS)
    throw new PipelineFailure(
      'invalid_payload',
      `at most ${MAX_SHOTS} shots per style`,
    )

  if (payload.character !== undefined)
    assertStyleCharacter(payload.character, 'payload.character')
  if (payload.colorFilter !== undefined)
    assertColorFilter(payload.colorFilter, 'payload.colorFilter')
  if (payload.origin !== undefined)
    assertGemOrigin(payload.origin, 'payload.origin')
  if (
    payload.sourcePrompt !== undefined &&
    (typeof payload.sourcePrompt !== 'string' ||
      payload.sourcePrompt.length > SOURCE_PROMPT_CHAR_LIMIT)
  )
    throw new PipelineFailure(
      'invalid_payload',
      `payload.sourcePrompt must be a string of at most ${SOURCE_PROMPT_CHAR_LIMIT} characters`,
    )

  const directory = styleDirectory(context, payload.id)
  await mkdir(directory, { recursive: true })

  const existing = await readStyleEntry(context, payload.id)
  // Guard v1.19.2 del origen: el bloque de personaje se CONSERVA si esta
  // escritura no lo trae. Quien quiera cambiarlo manda el bloque nuevo (la UI
  // siempre tiene exactamente un modo encendido, así que «volver a genérico»
  // viaja como { mode: 'generic' }, nunca como ausencia). Sin esto, cualquier
  // camino que guarde el estilo sin conocer el campo le borra al usuario, en
  // silencio, la decisión que tomó sobre su protagonista. El mismo guard
  // protege el respaldo del agente, el filtro de color y el origen de una
  // copia del catálogo (ADR-0041).
  const character = payload.character ?? existing?.character
  const colorFilter = payload.colorFilter ?? existing?.colorFilter
  const origin = payload.origin ?? existing?.origin
  // Un `sourcePrompt` vacío borra el respaldo; ausente, lo conserva.
  const sourcePrompt =
    payload.sourcePrompt === undefined
      ? existing?.sourcePrompt
      : payload.sourcePrompt.trim()
  const now = new Date().toISOString()
  const stored: StoredStyle = {
    name,
    ...('sections' in content
      ? {
          sections: content.sections,
          // Editar una sección no pasa por el agente: sin versión nueva, se
          // conserva la de las secciones guardadas.
          templateVersion:
            payload.templateVersion ??
            existing?.templateVersion ??
            GEM_TEMPLATE_VERSION,
        }
      : { systemPrompt: content.systemPrompt }),
    ...(sourcePrompt ? { sourcePrompt } : {}),
    ...(colorFilter ? { colorFilter } : {}),
    ...(origin ? { origin } : {}),
    shots,
    ...(character ? { character } : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
  await writeFileAtomic(
    join(directory, STYLE_FILE),
    `${JSON.stringify(stored, null, 2)}\n`,
  )

  const entry = await readStyleEntry(context, payload.id)
  if (!entry)
    throw new PipelineFailure('style_save_failed', 'style.json unreadable')
  return { entry }
}

// Exactamente uno de `systemPrompt` o `sections`. Guardar secciones deja
// afuera el `systemPrompt` que hubiera: así una gema reconstruida por el
// agente pasa a ser de plantilla (su texto viejo viaja como `sourcePrompt`).
function readGemContent(payload: StyleSavePayload): GemContent {
  const hasSections = payload.sections !== undefined
  const hasSystemPrompt = payload.systemPrompt !== undefined
  if (hasSections && hasSystemPrompt)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.systemPrompt and payload.sections are mutually exclusive',
    )

  if (hasSections) {
    const sections = assertGemSections(payload.sections, 'payload.sections')
    if (payload.templateVersion !== undefined)
      assertTemplateVersion(payload.templateVersion, 'payload.templateVersion')
    return { sections }
  }

  if (payload.templateVersion !== undefined)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.templateVersion only applies to payload.sections',
    )
  const systemPrompt =
    typeof payload.systemPrompt === 'string' ? payload.systemPrompt.trim() : ''
  if (!systemPrompt)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.systemPrompt is required',
    )
  if (systemPrompt.length > SYSTEM_PROMPT_CHAR_LIMIT)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.systemPrompt exceeds ${SYSTEM_PROMPT_CHAR_LIMIT} characters`,
    )
  return { systemPrompt }
}
```

- [ ] **Paso 5: correr y ver que pasa**

Run: `node --test scripts/test/check-gem-sections-store.mjs`
Expected: `ℹ tests 27`, `ℹ pass 27`, `ℹ fail 0`.

Run: la batería del carril.
Expected: `ℹ pass 111`, `ℹ fail 0` (las muestras y el preview leen con `readStyleEntry`).

- [ ] **Paso 6: formato, lint y tipos**

Run: `pnpm exec prettier --write pipeline/commands/styles/style-store.ts pipeline/commands/styles/style-save.ts scripts/test/check-gem-sections-store.mjs`
Expected: los tres `(unchanged)`.

Run: `pnpm exec eslint pipeline/commands/styles/style-store.ts pipeline/commands/styles/style-save.ts scripts/test/check-gem-sections-store.mjs && pnpm exec tsc -p tsconfig.pipeline.json --noEmit`
Expected: sin salida (exit 0). Si algo cambia código, volver al Paso 5.

- [ ] **Paso 7: Commit (orquestador)**

```bash
git add pipeline/commands/styles/style-store.ts pipeline/commands/styles/style-save.ts scripts/test/check-gem-sections-store.mjs
git commit -F- <<'EOF'
feat: store custom styles as template sections

Qué: style-store suma los límites de la gema por secciones junto a los de
siempre (12 000 por sección y 30 000 en total, 700 para character, 600 para
cada frase fija), la validación estricta de secciones, versión, filtro de
color y origen, y una lectura tolerante que nunca devuelve secciones y
systemPrompt a la vez. style-save guarda exactamente uno de los dos: guardar
secciones deja afuera el systemPrompt viejo, y el respaldo del agente, el
filtro, el origen y el personaje se conservan cuando la escritura no los trae.
Cada guardado deja updatedAt.

Por qué: la gema por secciones (ADR-0041, spec §4) necesita un almacén que la
acepte sin romper las gemas viejas ni sus muestras, y editar una sección no
puede borrar en silencio lo que el modal no manda.

Con qué interactúa: styles-list, generate-style-samples y
generate-character-preview leen con readStyleEntry; create-video-project
reutiliza estas validaciones en la Tarea A8; el modal de Mi estilo (frente C)
guarda con este contrato. Guard nuevo: check-gem-sections-store.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Tarea A2 · Presets de color

Los tres presets del spec §5.5, con los filtros de FFmpeg copiados tal cual de `VISUAL_STYLES`, y el
resolver único del estilo del proyecto (ADR-0018) toma `filterFinal` del preset. El render ya aplica
`style.filterFinal`: no se toca.

**Files:**

- Create: `pipeline/prompts/color-filters.ts`
- Modify: `pipeline/stages/shared/project-style.ts`
- Test: `scripts/test/check-gem-color-filters.mjs`

**Interfaces:**

- Consumes: `COLOR_FILTER_IDS`, `ColorFilterId` (Tarea 0); `resolveProjectStyle(options: VideoProjectOptions): VisualStyle` (existente).
- Produces: `const COLOR_FILTERS: Readonly<Record<ColorFilterId, string>>`; `colorFilterFor(id: string | undefined): string` (ausente o desconocido = `''`); `resolveProjectStyle(options).filterFinal === colorFilterFor(options.customStyle.colorFilter)` con estilo propio; sin estilo propio devuelve el mismo objeto de `VISUAL_STYLES`.

- [ ] **Paso 1: escribir el guard que falla**

Crear `scripts/test/check-gem-color-filters.mjs`:

<!-- prettier-ignore -->
```js
// Presets de color de un estilo (spec §5.5): los tres filtros de FFmpeg son
// los mismos de VISUAL_STYLES, y el resolver del proyecto toma el del estilo
// propio. Sin estilo propio, el catálogo de siempre (misma identidad de
// objeto, ADR-0018).

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COLOR_FILTERS,
  colorFilterFor,
} from '../../pipeline/prompts/color-filters.ts'
import { VISUAL_STYLES } from '../../pipeline/prompts/visual-styles.ts'
import { resolveProjectStyle } from '../../pipeline/stages/shared/project-style.ts'
import { COLOR_FILTER_IDS } from '../../pipeline/types/styles.ts'

function options(customStyle) {
  return {
    styleId: 'normal',
    sceneCount: 0,
    narrationMode: 'tts',
    imageProvider: 'fal',
    useBgm: false,
    useOverlay: false,
    confirmScenes: false,
    ...(customStyle ? { customStyle } : {}),
  }
}
const gem = {
  styleId: 'st-fixture',
  name: 'Acuarela',
  sections: { visualStyle: 'Watercolor.' },
}

test('there is one filter per preset and they are the catalog ones', () => {
  assert.deepEqual(
    Object.keys(COLOR_FILTERS).sort(),
    [...COLOR_FILTER_IDS].sort(),
  )
  assert.equal(COLOR_FILTERS.none, '')
  assert.equal(COLOR_FILTERS.fantasy, VISUAL_STYLES.fantasia.filterFinal)
  assert.equal(COLOR_FILTERS['horror-bw'], VISUAL_STYLES.terror.filterFinal)
  assert.equal(
    COLOR_FILTERS.fantasy,
    'eq=saturation=1.25:brightness=0.03:gamma=1.05',
  )
  assert.equal(
    COLOR_FILTERS['horror-bw'],
    "format=gray,curves=master='0/0 0.4/0.3 1/0.95',eq=contrast=1.1",
  )
})

test('an absent or unknown preset means no color adjustment', () => {
  assert.equal(colorFilterFor(undefined), '')
  assert.equal(colorFilterFor('sepia'), '')
  assert.equal(colorFilterFor('none'), '')
})

test('the project resolver takes the filter of the custom style', () => {
  for (const id of COLOR_FILTER_IDS)
    assert.equal(
      resolveProjectStyle(options({ ...gem, colorFilter: id })).filterFinal,
      COLOR_FILTERS[id],
    )
  assert.equal(resolveProjectStyle(options(gem)).filterFinal, '')
  // Un proyecto viejo con gema de texto tampoco cambia.
  assert.equal(
    resolveProjectStyle(
      options({ styleId: 'st-old', name: 'Old', systemPrompt: 'Watercolor.' }),
    ).filterFinal,
    '',
  )
})

test('without a custom style the catalog style is returned as is', () => {
  for (const styleId of Object.keys(VISUAL_STYLES))
    assert.equal(
      resolveProjectStyle({ ...options(), styleId }),
      VISUAL_STYLES[styleId],
    )
})
```

- [ ] **Paso 2: correr y ver que falla**

Run: `node --test scripts/test/check-gem-color-filters.mjs`
Expected: FAIL al cargar: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/pipeline/prompts/color-filters.ts'`.

- [ ] **Paso 3: crear los presets**

Crear `pipeline/prompts/color-filters.ts`:

<!-- prettier-ignore -->
```ts
import { COLOR_FILTER_IDS, type ColorFilterId } from '../types/styles.ts'

// Presets de color de un estilo (spec §5.5, decisión F5): el filtro de FFmpeg
// que el render le aplica al video final. Los filtros se copiaron tal cual de
// `VISUAL_STYLES` (Fantasía mágica y Terror); el guard check-gem-color-filters
// verifica que no se separen mientras los dos existan.
export const COLOR_FILTERS: Readonly<Record<ColorFilterId, string>> = {
  none: '',
  fantasy: 'eq=saturation=1.25:brightness=0.03:gamma=1.05',
  'horror-bw': "format=gray,curves=master='0/0 0.4/0.3 1/0.95',eq=contrast=1.1",
}

// El filtro de un preset. Ausente (gemas y proyectos previos) o desconocido
// (un project.json editado a mano) = sin ajuste de color, como siempre.
export function colorFilterFor(id: string | undefined): string {
  const preset = COLOR_FILTER_IDS.find((candidate) => candidate === id)
  return preset ? COLOR_FILTERS[preset] : ''
}
```

- [ ] **Paso 4: el resolver toma el preset**

En `pipeline/stages/shared/project-style.ts`:

Edición 1 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
import { buildCustomStyleSystemPrompt } from '../../prompts/custom-style.ts'
import { VISUAL_STYLES, type VisualStyle } from '../../prompts/visual-styles.ts'
import type { VideoProjectOptions } from '../../types/video-project.ts'
```

por:

<!-- prettier-ignore -->
```ts
import { colorFilterFor } from '../../prompts/color-filters.ts'
import { buildCustomStyleSystemPrompt } from '../../prompts/custom-style.ts'
import { VISUAL_STYLES, type VisualStyle } from '../../prompts/visual-styles.ts'
import type { VideoProjectOptions } from '../../types/video-project.ts'
```

Edición 2 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
    id: 'custom',
    name: custom.name,
    systemPrompt: buildCustomStyleSystemPrompt(custom),
    // Un estilo propio no trae ajuste de color del render.
    filterFinal: '',
  }
}
```

por:

<!-- prettier-ignore -->
```ts
    id: 'custom',
    name: custom.name,
    systemPrompt: buildCustomStyleSystemPrompt(custom),
    // El ajuste de color del render es el preset del estilo (spec §5.5); sin
    // preset, ninguno — como siempre.
    filterFinal: colorFilterFor(custom.colorFilter),
  }
}
```

- [ ] **Paso 5: correr y ver que pasa**

Run: `node --test scripts/test/check-gem-color-filters.mjs`
Expected: `ℹ tests 4`, `ℹ pass 4`, `ℹ fail 0`.

Run: `node --test scripts/test/check-gem-*.mjs` y la batería del carril.
Expected: `ℹ pass 31` y `ℹ pass 111`, sin fallos.

- [ ] **Paso 6: formato, lint y tipos**

Run: `pnpm exec prettier --write pipeline/prompts/color-filters.ts pipeline/stages/shared/project-style.ts scripts/test/check-gem-color-filters.mjs`
Expected: los tres `(unchanged)`.

Run: `pnpm exec eslint pipeline/prompts/color-filters.ts pipeline/stages/shared/project-style.ts scripts/test/check-gem-color-filters.mjs && pnpm exec tsc -p tsconfig.pipeline.json --noEmit`
Expected: sin salida.

- [ ] **Paso 7: Commit (orquestador)**

```bash
git add pipeline/prompts/color-filters.ts pipeline/stages/shared/project-style.ts scripts/test/check-gem-color-filters.mjs
git commit -F- <<'EOF'
feat: add color filter presets to custom styles

Qué: prompts/color-filters.ts define los tres presets de color de un estilo
(none, fantasy y horror-bw) con los filtros de FFmpeg copiados tal cual de
VISUAL_STYLES, y resolveProjectStyle toma filterFinal del colorFilter del
estilo propio. Un preset ausente o desconocido no ajusta el color.

Por qué: decisión F5 del spec (§5.5): el filtro de color es un preset del
estilo, elegido de una lista, y ya no un atributo fijo del catálogo.

Con qué interactúa: el render ya aplica style.filterFinal en la mezcla final,
así que no cambia; los proyectos sin preset y los del catálogo siguen igual
(el resolver devuelve el mismo objeto de VISUAL_STYLES). El modal de Mi estilo
(frente C) ofrece la lista. Guard nuevo: check-gem-color-filters.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Tarea A3 · El marco (funciones puras)

`buildTemplateSystem` arma el `system` de una gema de plantilla en el orden del spec §5.1 y
`composeGemText` da la gema como texto plano para los usos que hoy reciben «la gema» (Fase 1 del
carril, diseño del personaje, preview, estilo del fallback de imágenes). Para que el marco y la gema
vieja sumen exactamente las mismas reglas en el mismo orden, `buildVerbatimSystem` pasa a ser
`gema + platformSystemRules(mode, options)`: su salida no cambia un byte (el guard la compara con la
composición de siempre).

Decisiones de este diseño que el spec no fija (ver también «Problemas del contrato»):

- Bloques separados por una línea en blanco, como `buildVerbatimSystem`; cada sección es `# TÍTULO` + salto + texto; una sección opcional vacía o en blanco no deja título.
- `TREATMENT_TAG_RULE` va dentro del bloque de dinamismo, después del texto del autor; en cinemático (`none`) le sigue `DYNAMISM_WITHOUT_PROTAGONIST_RULE`, que se suma siempre que haya dinamismo (el dinamismo habla de «el protagonista» por definición, en el idioma del autor, así que no se busca la palabra por código).
- La regla de frases fijas avisa que existen y cuál (inicio, cierre) pero no muestra las frases: las pega el código (Tarea A6) y quita una copia si el modelo igual la escribe.
- `composeGemText` excluye la sección `character` (sus usos diseñan o dibujan OTRO personaje, o uno desde el guion) e incluye las frases fijas bajo títulos propios.

**Files:**

- Create: `pipeline/prompts/template-frame.ts`
- Modify: `pipeline/prompts/verbatim-messages.ts`
- Test: `scripts/test/check-gem-template-frame.mjs`

**Interfaces:**

- Consumes: `GemSections` (Tarea 0); de `verbatim-messages.ts`: `VerbatimCharacterMode`, `VerbatimMessageOptions`, `SCENE_ID_RULE`, `OUTPUT_LANGUAGE_RULE`, `USER_PROTAGONIST_RULE`, `SCENE_WITHOUT_PROTAGONIST_RULE`, `SCENE_WARDROBE_RULE`, `VERBATIM_OUTPUT_LANGUAGE_RULE`, `VERBATIM_SCENE_WARDROBE`, `modeCarriesUserProtagonist`.
- Produces (`verbatim-messages.ts`): `export function architectureRuleFor(mode: VerbatimCharacterMode): string` (antes privada); `export type VerbatimSystemOptions = VerbatimMessageOptions & { withoutScriptProtagonist?: boolean }`; `export function platformSystemRules(mode: VerbatimCharacterMode = 'generic', options?: VerbatimSystemOptions): string`; `buildVerbatimSystem(gem: string, mode?: VerbatimCharacterMode, options?: VerbatimSystemOptions): string` con la misma salida de hoy.
- Produces (`template-frame.ts`): `VISUAL_STYLE_HEADING`, `CAMERA_HEADING`, `DYNAMISM_HEADING`, `STYLE_RULES_HEADING`, `FIXED_START_HEADING`, `FIXED_END_HEADING`; `CONTENT_SAFETY_RULE`, `OUTPUT_FORMAT_RULE`, `FIXED_PHRASES_RULE`, `FIXED_START_NOTE`, `FIXED_END_NOTE`, `TREATMENT_TAG_RULE`, `DYNAMISM_WITHOUT_PROTAGONIST_RULE` (strings); `fixedPhrasesRuleFor(sections: Pick<GemSections, 'promptStart' | 'promptEnd'>): string` (`''` sin frases); `buildTemplateSystem(sections: GemSections, mode: VerbatimCharacterMode = 'generic', options?: VerbatimSystemOptions): string`; `composeGemText(sections: GemSections): string`.

- [ ] **Paso 1: escribir el guard que falla**

Crear `scripts/test/check-gem-template-frame.mjs`:

<!-- prettier-ignore -->
```js
// El marco de Vimo (spec §5.1): el system de una gema de plantilla, byte a
// byte, en los cuatro modos del carril y con o sin cada sección opcional. La
// sección `character` nunca entra al system, las reglas nuevas son reglas de
// plataforma declaradas (español sin acentos) y la gema vieja sigue saliendo
// exactamente igual que antes. Funciones puras: sin HTTP ni disco.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildTemplateSystem,
  CAMERA_HEADING,
  composeGemText,
  CONTENT_SAFETY_RULE,
  DYNAMISM_HEADING,
  DYNAMISM_WITHOUT_PROTAGONIST_RULE,
  FIXED_END_HEADING,
  FIXED_END_NOTE,
  FIXED_PHRASES_RULE,
  FIXED_START_HEADING,
  FIXED_START_NOTE,
  fixedPhrasesRuleFor,
  OUTPUT_FORMAT_RULE,
  STYLE_RULES_HEADING,
  TREATMENT_TAG_RULE,
  VISUAL_STYLE_HEADING,
} from '../../pipeline/prompts/template-frame.ts'
import {
  buildVerbatimSystem,
  OUTPUT_LANGUAGE_RULE,
  platformSystemRules,
  PROMPT_ARCHITECTURE_RULE,
  PROMPT_ARCHITECTURE_RULE_NO_SUBJECT,
  PROMPT_ARCHITECTURE_RULE_REFERENCE,
  SCENE_ID_RULE,
  SCENE_WARDROBE_RULE,
  SCENE_WITHOUT_PROTAGONIST_RULE,
  USER_PROTAGONIST_RULE,
} from '../../pipeline/prompts/verbatim-messages.ts'
import { SCENE_TREATMENTS } from '../../pipeline/types/scenes.ts'

const MODES = ['generic', 'text', 'reference', 'none']
const ARCHITECTURE = {
  generic: PROMPT_ARCHITECTURE_RULE,
  text: PROMPT_ARCHITECTURE_RULE,
  reference: PROMPT_ARCHITECTURE_RULE_REFERENCE,
  none: PROMPT_ARCHITECTURE_RULE_NO_SUBJECT,
}
const sections = {
  visualStyle: 'Hand-drawn watercolor with indigo washes and rough paper.',
  character:
    'A curious red-haired girl with freckles and round green glasses. Outfit: a green hoodie.',
  dynamism: 'Show the protagonist in half of the scenes; objects in the rest.',
  camera: 'Alternate wide shots and close-ups.',
  rules: 'Never draw text on screens.',
  promptStart: 'Watercolor illustration:',
  promptEnd: 'Indigo washes on rough paper.',
}
const OPTIONAL = [
  'character',
  'dynamism',
  'camera',
  'rules',
  'promptStart',
  'promptEnd',
]

// Las reglas de plataforma de siempre, escritas a mano en su orden (el mismo
// que pinea check-verbatim-prompt-language para la gema vieja).
function platformTail(
  mode,
  { language = true, wardrobe = true, withoutScript = false } = {},
) {
  const rules = [SCENE_ID_RULE, ARCHITECTURE[mode]]
  if (language) rules.push(OUTPUT_LANGUAGE_RULE)
  if (mode === 'text' || mode === 'reference') rules.push(USER_PROTAGONIST_RULE)
  if (mode === 'none' && withoutScript)
    rules.push(SCENE_WITHOUT_PROTAGONIST_RULE)
  if (wardrobe && mode !== 'none') rules.push(SCENE_WARDROBE_RULE)
  return rules.join('\n\n')
}

// El layout del spec §5.1, escrito a mano.
function expectedSystem(gem, mode, platform = {}) {
  const blocks = [VISUAL_STYLE_HEADING + '\n' + gem.visualStyle]
  if (gem.camera) blocks.push(CAMERA_HEADING + '\n' + gem.camera)
  if (gem.dynamism)
    blocks.push(
      DYNAMISM_HEADING +
        '\n' +
        gem.dynamism +
        '\n\n' +
        TREATMENT_TAG_RULE +
        (mode === 'none' ? '\n\n' + DYNAMISM_WITHOUT_PROTAGONIST_RULE : ''),
    )
  if (gem.rules) blocks.push(STYLE_RULES_HEADING + '\n' + gem.rules)
  blocks.push(CONTENT_SAFETY_RULE, OUTPUT_FORMAT_RULE)
  const notes = [
    ...(gem.promptStart ? [FIXED_START_NOTE] : []),
    ...(gem.promptEnd ? [FIXED_END_NOTE] : []),
  ]
  if (notes.length > 0) blocks.push([FIXED_PHRASES_RULE, ...notes].join(' '))
  blocks.push(platformTail(mode, platform))
  return blocks.join('\n\n')
}

// ── Las reglas nuevas ──

test('the new rules are declared platform rules, in Spanish without accents', () => {
  for (const rule of [
    CONTENT_SAFETY_RULE,
    OUTPUT_FORMAT_RULE,
    FIXED_PHRASES_RULE,
    TREATMENT_TAG_RULE,
    DYNAMISM_WITHOUT_PROTAGONIST_RULE,
  ])
    assert.match(
      rule,
      /^[A-Z ]+ \(regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo\): /,
    )
  for (const text of [
    CONTENT_SAFETY_RULE,
    OUTPUT_FORMAT_RULE,
    FIXED_PHRASES_RULE,
    FIXED_START_NOTE,
    FIXED_END_NOTE,
    TREATMENT_TAG_RULE,
    DYNAMISM_WITHOUT_PROTAGONIST_RULE,
  ])
    assert.doesNotMatch(text, /[áéíóúÁÉÍÓÚñÑ]/)
})

test('the content safety rule brings what the catalog forbids', () => {
  for (const forbidden of [
    /gore/,
    /sangre/,
    /violencia explicita/,
    /persona real/,
    /derechos de autor/,
  ])
    assert.match(CONTENT_SAFETY_RULE, forbidden)
})

test('the treatment tag rule asks for ((n)) [T:…] and offers every scene treatment', () => {
  assert.match(TREATMENT_TAG_RULE, /\(\(n\)\) \[T:tratamiento\]/)
  for (const treatment of SCENE_TREATMENTS)
    assert.ok(TREATMENT_TAG_RULE.includes(treatment + ' ('), treatment)
})

// ── El system, byte a byte ──

test('with every section, each mode composes exactly the spec layout', () => {
  assert.equal(
    buildTemplateSystem(sections, 'generic'),
    '# VISUAL STYLE\n' +
      sections.visualStyle +
      '\n\n# CAMERA AND FRAMING\n' +
      sections.camera +
      '\n\n# DYNAMISM\n' +
      sections.dynamism +
      '\n\n' +
      TREATMENT_TAG_RULE +
      '\n\n# STYLE RULES\n' +
      sections.rules +
      '\n\n' +
      CONTENT_SAFETY_RULE +
      '\n\n' +
      OUTPUT_FORMAT_RULE +
      '\n\n' +
      FIXED_PHRASES_RULE +
      ' ' +
      FIXED_START_NOTE +
      ' ' +
      FIXED_END_NOTE +
      '\n\n' +
      SCENE_ID_RULE +
      '\n\n' +
      PROMPT_ARCHITECTURE_RULE +
      '\n\n' +
      OUTPUT_LANGUAGE_RULE +
      '\n\n' +
      SCENE_WARDROBE_RULE,
  )
  for (const mode of MODES)
    assert.equal(
      buildTemplateSystem(sections, mode),
      expectedSystem(sections, mode),
      mode,
    )
})

test('with and without each optional section, in every mode', () => {
  for (const mode of MODES) {
    assert.equal(
      buildTemplateSystem({ visualStyle: sections.visualStyle }, mode),
      expectedSystem({ visualStyle: sections.visualStyle }, mode),
      mode + ' only the visual style',
    )
    for (const key of OPTIONAL) {
      const without = { ...sections, [key]: undefined }
      assert.equal(
        buildTemplateSystem(without, mode),
        expectedSystem(without, mode),
        mode + ' without ' + key,
      )
      const blank = { ...sections, [key]: '   ' }
      assert.equal(
        buildTemplateSystem(blank, mode),
        expectedSystem(without, mode),
        mode + ' with a blank ' + key,
      )
      const only = { visualStyle: sections.visualStyle, [key]: sections[key] }
      assert.equal(
        buildTemplateSystem(only, mode),
        expectedSystem(only, mode),
        mode + ' only ' + key,
      )
    }
  }
})

test('the platform options keep working inside the frame', () => {
  for (const mode of MODES)
    assert.equal(
      buildTemplateSystem(sections, mode, {
        outputLanguageRule: false,
        sceneWardrobe: false,
        withoutScriptProtagonist: true,
      }),
      expectedSystem(sections, mode, {
        language: false,
        wardrobe: false,
        withoutScript: true,
      }),
      mode,
    )
})

test('the character section never enters the system', () => {
  for (const mode of MODES) {
    const system = buildTemplateSystem(sections, mode)
    assert.ok(!system.includes(sections.character), mode)
  }
})

test('the fixed phrases rule only carries the notes of the phrases the style has', () => {
  assert.equal(fixedPhrasesRuleFor({}), '')
  assert.equal(fixedPhrasesRuleFor({ promptStart: '  ', promptEnd: '' }), '')
  assert.equal(
    fixedPhrasesRuleFor({ promptStart: 'Start.' }),
    FIXED_PHRASES_RULE + ' ' + FIXED_START_NOTE,
  )
  assert.equal(
    fixedPhrasesRuleFor({ promptEnd: 'End.' }),
    FIXED_PHRASES_RULE + ' ' + FIXED_END_NOTE,
  )
  // Las frases mismas no viajan en el system: las pega el código.
  const system = buildTemplateSystem(sections, 'generic')
  assert.ok(!system.includes(sections.promptStart))
  assert.ok(!system.includes(sections.promptEnd))
})

// ── La gema vieja, intacta ──

test('the old gem system is byte-identical to before the frame', () => {
  const gem = 'Render every scene as a watercolor.'
  for (const mode of MODES) {
    assert.equal(
      buildVerbatimSystem(gem, mode),
      gem + '\n\n' + platformTail(mode),
    )
    assert.equal(platformSystemRules(mode), platformTail(mode))
    assert.equal(
      buildVerbatimSystem('  ' + gem + '  ', mode, {
        outputLanguageRule: false,
        sceneWardrobe: false,
        withoutScriptProtagonist: true,
      }),
      gem +
        '\n\n' +
        platformTail(mode, {
          language: false,
          wardrobe: false,
          withoutScript: true,
        }),
    )
  }
})

// ── La gema como texto ──

test('the gem as text carries every section but the character, with its heading', () => {
  assert.equal(
    composeGemText(sections),
    '# VISUAL STYLE\n' +
      sections.visualStyle +
      '\n\n# CAMERA AND FRAMING\n' +
      sections.camera +
      '\n\n# DYNAMISM\n' +
      sections.dynamism +
      '\n\n# STYLE RULES\n' +
      sections.rules +
      '\n\n' +
      FIXED_START_HEADING +
      '\n' +
      sections.promptStart +
      '\n\n' +
      FIXED_END_HEADING +
      '\n' +
      sections.promptEnd,
  )
  assert.equal(
    composeGemText({ visualStyle: '  Watercolor.  ', camera: ' ' }),
    '# VISUAL STYLE\nWatercolor.',
  )
  const text = composeGemText(sections)
  for (const rule of [
    CONTENT_SAFETY_RULE,
    OUTPUT_FORMAT_RULE,
    TREATMENT_TAG_RULE,
    SCENE_ID_RULE,
  ])
    assert.ok(!text.includes(rule))
  assert.ok(!text.includes(sections.character))
})
```

- [ ] **Paso 2: correr y ver que falla**

Run: `node --test scripts/test/check-gem-template-frame.mjs`
Expected: FAIL al cargar: `ERR_MODULE_NOT_FOUND` de `pipeline/prompts/template-frame.ts` (y, una vez creado el archivo, `does not provide an export named 'platformSystemRules'` hasta el Paso 4).

- [ ] **Paso 3: crear el marco, con el texto completo de cada regla nueva**

Crear `pipeline/prompts/template-frame.ts`:

<!-- prettier-ignore -->
```ts
import type { GemSections } from '../types/styles.ts'
import {
  platformSystemRules,
  type VerbatimCharacterMode,
  type VerbatimSystemOptions,
} from './verbatim-messages.ts'

// EL MARCO DE VIMO (ADR-0041, spec §5): cómo se arma el `system` de la Fase 2
// cuando la gema viene por SECCIONES. La gema vieja (texto libre) sigue por
// `buildVerbatimSystem`, byte por byte; acá las secciones del autor van bajo
// títulos fijos y la plataforma suma sus reglas DECLARADAS, con el mismo
// mecanismo de siempre (ADR-0019): reglas técnicas en español sin acentos,
// que se suman y no cambian el estilo. La sección `character` NUNCA entra al
// system: en el modo genérico viaja como turno del retrato y se teje por
// código; en «Mi personaje» y en cinemático no viaja (spec §5.2).

export const VISUAL_STYLE_HEADING = '# VISUAL STYLE'
export const CAMERA_HEADING = '# CAMERA AND FRAMING'
export const DYNAMISM_HEADING = '# DYNAMISM'
export const STYLE_RULES_HEADING = '# STYLE RULES'
// Solo en el texto plano de la gema (`composeGemText`): en el system las
// frases fijas no se muestran, las pega el código.
export const FIXED_START_HEADING = '# FIXED START OF EVERY IMAGE PROMPT'
export const FIXED_END_HEADING = '# FIXED END OF EVERY IMAGE PROMPT'

/**
 * La seguridad de contenido que hoy solo tiene el catálogo (`GLOBAL_RULES` y
 * el bloque de Terror), traída al carril: el generador rechaza estos prompts
 * y una escena rechazada cuesta una vuelta de recuperación.
 */
export const CONTENT_SAFETY_RULE =
  'SEGURIDAD DE CONTENIDO (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'el generador de imagenes rechaza los prompts con contenido sensible, asi que cada prompt de escena tiene que pasar sus filtros automaticos. ' +
  'NUNCA escribas gore, sangre, heridas, mutilaciones, visceras, cadaveres en detalle o en descomposicion, violencia explicita o en curso (apunalar, disparar, golpear, un ataque en marcha), armas usadas contra alguien, tortura, suicidio, autolesiones, ahorcamientos, desnudos ni contenido sexual, menores en peligro, simbolos de odio ni consumo explicito de drogas. ' +
  'Si el guion narra un momento violento o sensible, cuentalo con atmosfera, simbolos y consecuencias: lenguaje corporal tenso, sombras y siluetas, una figura caida o quieta sin heridas visibles, un objeto volcado o vacio, luz dramatica, niebla, expresiones de miedo o de duelo. ' +
  'NUNCA escribas el nombre de una persona real (famosos, deportistas, politicos) ni el de un personaje con derechos de autor: usa arquetipos genericos. ' +
  'Ante la duda, elige la palabra mas suave y atmosferica.'

/**
 * El formato que hoy fija cada gema a su manera: un bloque de código, un
 * prompt por fragmento, separados por una línea en blanco y con su id
 * `((n))`. Es exactamente lo que el parser del carril ya lee.
 */
export const OUTPUT_FORMAT_RULE =
  'FORMATO DE SALIDA (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'responde UNICAMENTE con un bloque de codigo que contenga los prompts de escena, uno por fragmento y en el mismo orden en que llegan, separados entre si por una linea en blanco. ' +
  'Cada prompt es un solo parrafo de texto corrido que empieza con el numero de su fragmento en la forma ((n)): sin titulos, sin listas, sin numeracion extra, sin comillas y sin JSON. ' +
  'Fuera del bloque no escribas nada: ni saludos, ni explicaciones, ni preguntas.'

/**
 * El inicio y el final fijos los pega el código (spec §5.4): el modelo no los
 * escribe. La regla solo avisa que existen; las dos notas dicen cuál.
 */
export const FIXED_PHRASES_RULE =
  'FRASES FIJAS DE TU ESTILO (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'tu estilo tiene frases fijas que la plataforma pega por su cuenta, palabra por palabra, en cada prompt de escena. ' +
  'NUNCA las escribas tu, ni enteras, ni resumidas, ni traducidas: escribe solo la parte de cada prompt que cambia con la escena.'

export const FIXED_START_NOTE =
  'La frase fija de INICIO va antes de tu texto: no presentes el estilo al empezar, arranca directo por la toma o el encuadre.'

/** Con final fijo la cola de estilo ya es determinística (spec §5.4). */
export const FIXED_END_NOTE =
  'La frase fija de CIERRE va despues de tu texto y ES la cola de estilo de la arquitectura del prompt: termina cada prompt con la parte (2), donde ocurre y de que esta hecho el decorado, sin escribir ninguna cola de estilo.'

/**
 * La etiqueta de tratamiento (spec §5.3): solo con dinamismo. Mide el reparto
 * del video; el parser la lee y la quita, y si falta o no es válida el prompt
 * igual vale. Las palabras son los `SCENE_TREATMENTS` del director.
 */
export const TREATMENT_TAG_RULE =
  'ETIQUETA DE TRATAMIENTO (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'decide para cada fragmento que tratamiento visual le toca segun el dinamismo de tu estilo y declaralo al comienzo de su prompt, justo despues del numero, en la forma ((n)) [T:tratamiento] ' +
  '— por ejemplo: ((7)) [T:metaphor] Low angle shot of... ' +
  'El tratamiento es UNA de estas palabras, en ingles y tal cual: action (alguien vive en plena accion lo que narra el fragmento), metaphor (una metafora visual concreta de una idea abstracta), object (un objeto clave en primer plano), place (el lugar mismo, con un punto de interes claro), group (otras personas, una escena social), memory (un recuerdo o un flashback), diagram (una explicacion visual dentro del mundo de la historia) o bubble (una burbuja de pensamiento con una sola imagen adentro). ' +
  'Usa solo los tratamientos que tu dinamismo permita. La plataforma lee la etiqueta y la quita antes de generar la imagen: no la expliques y no la repitas dentro del prompt.'

/**
 * Cinemático con dinamismo (spec §5.2): el dinamismo habla de «el
 * protagonista», y en este modo no hay. Sin esta regla el modelo inventaba a
 * alguien que se repite para cumplir el reparto.
 */
export const DYNAMISM_WITHOUT_PROTAGONIST_RULE =
  'DINAMISMO SIN PROTAGONISTA (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'este video no tiene protagonista recurrente. Cuando tu dinamismo pida mostrar al protagonista en una escena, muestra esa escena sin el: el entorno, un objeto, el resultado de la accion o las personas anonimas que la escena pida, nunca una misma persona que se repita de escena en escena. ' +
  'El resto de tu dinamismo (metaforas, objetos, lugares y proporciones) se aplica igual.'

function sectionBlock(heading: string, text: string): string {
  return `${heading}\n${text.trim()}`
}

// La regla de las frases fijas con la nota de cada frase que el estilo trae.
// "" = el estilo no tiene frases fijas y la regla no va.
export function fixedPhrasesRuleFor(
  sections: Pick<GemSections, 'promptStart' | 'promptEnd'>,
): string {
  const notes = [
    sections.promptStart?.trim() ? FIXED_START_NOTE : '',
    sections.promptEnd?.trim() ? FIXED_END_NOTE : '',
  ].filter(Boolean)
  if (notes.length === 0) return ''
  return [FIXED_PHRASES_RULE, ...notes].join(' ')
}

function dynamismBlock(dynamism: string, mode: VerbatimCharacterMode): string {
  const block = `${sectionBlock(DYNAMISM_HEADING, dynamism)}\n\n${TREATMENT_TAG_RULE}`
  if (mode !== 'none') return block
  return `${block}\n\n${DYNAMISM_WITHOUT_PROTAGONIST_RULE}`
}

/**
 * El `system` de la Fase 2 para una gema de plantilla (spec §5.1), en este
 * orden: estilo visual, cámara, dinamismo con su etiqueta, reglas del
 * estilo, seguridad de contenido, formato de salida, frases fijas y las
 * reglas de plataforma de siempre (`platformSystemRules`). Una sección
 * opcional vacía no deja título.
 */
export function buildTemplateSystem(
  sections: GemSections,
  mode: VerbatimCharacterMode = 'generic',
  options?: VerbatimSystemOptions,
): string {
  const blocks = [sectionBlock(VISUAL_STYLE_HEADING, sections.visualStyle)]
  const camera = sections.camera?.trim()
  if (camera) blocks.push(sectionBlock(CAMERA_HEADING, camera))
  const dynamism = sections.dynamism?.trim()
  if (dynamism) blocks.push(dynamismBlock(dynamism, mode))
  const rules = sections.rules?.trim()
  if (rules) blocks.push(sectionBlock(STYLE_RULES_HEADING, rules))
  blocks.push(CONTENT_SAFETY_RULE, OUTPUT_FORMAT_RULE)
  const fixedPhrases = fixedPhrasesRuleFor(sections)
  if (fixedPhrases) blocks.push(fixedPhrases)
  blocks.push(platformSystemRules(mode, options))
  return blocks.join('\n\n')
}

/**
 * La gema de plantilla como TEXTO, para los usos que hoy reciben «la gema»
 * entera: la Fase 1 del carril, el diseño del personaje con el estilo, el
 * preview de un personaje y el estilo del fallback de imágenes. Las secciones
 * con sus títulos y sin reglas de plataforma. La sección `character` no va:
 * esos usos diseñan o dibujan OTRO personaje (o uno desde el guion), y el del
 * estilo solo viaja en el modo genérico (spec §5.2).
 */
export function composeGemText(sections: GemSections): string {
  const parts: [string, string | undefined][] = [
    [VISUAL_STYLE_HEADING, sections.visualStyle],
    [CAMERA_HEADING, sections.camera],
    [DYNAMISM_HEADING, sections.dynamism],
    [STYLE_RULES_HEADING, sections.rules],
    [FIXED_START_HEADING, sections.promptStart],
    [FIXED_END_HEADING, sections.promptEnd],
  ]
  return parts
    .flatMap(([heading, text]) =>
      text?.trim() ? [sectionBlock(heading, text)] : [],
    )
    .join('\n\n')
}
```

- [ ] **Paso 4: una sola fuente para las reglas de plataforma**

En `pipeline/prompts/verbatim-messages.ts`:

Edición 1 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
  'Las demas personas que la escena pida (gente alrededor, una multitud, personajes secundarios) SI pueden aparecer al fondo.'

/** Cuál de las tres arquitecturas le toca a este video. */
function architectureRuleFor(mode: VerbatimCharacterMode): string {
  switch (mode) {
    case 'reference':
      return PROMPT_ARCHITECTURE_RULE_REFERENCE
```

por:

<!-- prettier-ignore -->
```ts
  'Las demas personas que la escena pida (gente alrededor, una multitud, personajes secundarios) SI pueden aparecer al fondo.'

/** Cuál de las tres arquitecturas le toca a este video. */
export function architectureRuleFor(mode: VerbatimCharacterMode): string {
  switch (mode) {
    case 'reference':
      return PROMPT_ARCHITECTURE_RULE_REFERENCE
```

Edición 2 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
  }
}

/**
 * El system de la Fase 2: la gema del usuario + las reglas técnicas de la
 * plataforma (ids de escena, arquitectura y — solo cuando corresponde — el
 * protagonista del usuario / la escena desmarcada). La gema viaja intacta,
 * palabra por palabra; todo lo nuestro va DECLARADO y sumado al final.
 */
export function buildVerbatimSystem(
  gem: string,
  mode: VerbatimCharacterMode = 'generic',
  options?: VerbatimMessageOptions & { withoutScriptProtagonist?: boolean },
): string {
  const base = `${gem.trim()}\n\n${SCENE_ID_RULE}\n\n${architectureRuleFor(mode)}`
  // Idioma de salida: regla de FORMA del entregable, junto a los ids y la
  // arquitectura, en los cuatro modos.
  const outputLanguageRule =
    options?.outputLanguageRule ?? VERBATIM_OUTPUT_LANGUAGE_RULE
  const withLanguage = outputLanguageRule
    ? `${base}\n\n${OUTPUT_LANGUAGE_RULE}`
    : base
  // v1.31.3 (E47) — Con el personaje del USUARIO, la identidad de la gema no
  // aplica y hay que DECIRLO.
  const withProtagonist = modeCarriesUserProtagonist(mode)
    ? `${withLanguage}\n\n${USER_PROTAGONIST_RULE}`
    : withLanguage
  // v1.32.1 (E49) — Reescritura de escena DESMARCADA: el protagonista del
  // guion tampoco aparece.
  const withoutScript =
    mode === 'none' && options?.withoutScriptProtagonist
      ? `${withProtagonist}\n\n${SCENE_WITHOUT_PROTAGONIST_RULE}`
      : withProtagonist
  // Vestuario por escena: la ULTIMA regla, solo con protagonista.
  const sceneWardrobe = options?.sceneWardrobe ?? VERBATIM_SCENE_WARDROBE
  return sceneWardrobe && mode !== 'none'
    ? `${withoutScript}\n\n${SCENE_WARDROBE_RULE}`
    : withoutScript
}

export interface VerbatimFragment {
```

por:

<!-- prettier-ignore -->
```ts
  }
}

/** Opciones del system de la Fase 2 (la gema vieja y el marco las comparten). */
export type VerbatimSystemOptions = VerbatimMessageOptions & {
  withoutScriptProtagonist?: boolean
}

/**
 * Las reglas técnicas de la plataforma que cierran el system de la Fase 2, en
 * su orden de siempre: ids de escena, arquitectura, idioma y — solo cuando
 * corresponde — el protagonista del usuario, la escena desmarcada y el
 * vestuario. Las comparten la gema vieja (`buildVerbatimSystem`) y el marco
 * de las gemas de plantilla (`buildTemplateSystem`, ADR-0041).
 */
export function platformSystemRules(
  mode: VerbatimCharacterMode = 'generic',
  options?: VerbatimSystemOptions,
): string {
  const rules = [SCENE_ID_RULE, architectureRuleFor(mode)]
  // Idioma de salida: regla de FORMA del entregable, junto a los ids y la
  // arquitectura, en los cuatro modos.
  if (options?.outputLanguageRule ?? VERBATIM_OUTPUT_LANGUAGE_RULE)
    rules.push(OUTPUT_LANGUAGE_RULE)
  // v1.31.3 (E47) — Con el personaje del USUARIO, la identidad de la gema no
  // aplica y hay que DECIRLO.
  if (modeCarriesUserProtagonist(mode)) rules.push(USER_PROTAGONIST_RULE)
  // v1.32.1 (E49) — Reescritura de escena DESMARCADA: el protagonista del
  // guion tampoco aparece.
  if (mode === 'none' && options?.withoutScriptProtagonist)
    rules.push(SCENE_WITHOUT_PROTAGONIST_RULE)
  // Vestuario por escena: la ULTIMA regla, solo con protagonista.
  if ((options?.sceneWardrobe ?? VERBATIM_SCENE_WARDROBE) && mode !== 'none')
    rules.push(SCENE_WARDROBE_RULE)
  return rules.join('\n\n')
}

/**
 * El system de la Fase 2 de una gema VIEJA: la gema del usuario + las reglas
 * técnicas de la plataforma. La gema viaja intacta, palabra por palabra; todo
 * lo nuestro va DECLARADO y sumado al final.
 */
export function buildVerbatimSystem(
  gem: string,
  mode: VerbatimCharacterMode = 'generic',
  options?: VerbatimSystemOptions,
): string {
  return `${gem.trim()}\n\n${platformSystemRules(mode, options)}`
}

export interface VerbatimFragment {
```

- [ ] **Paso 5: correr y ver que pasa**

Run: `node --test scripts/test/check-gem-template-frame.mjs`
Expected: `ℹ tests 10`, `ℹ pass 10`, `ℹ fail 0`.

Run: `node --test scripts/test/check-gem-*.mjs` y la batería del carril.
Expected: `ℹ pass 41` y `ℹ pass 111` (check-verbatim-prompt-language y check-scene-wardrobe pinean `buildVerbatimSystem`).

- [ ] **Paso 6: formato, lint y tipos**

Run: `pnpm exec prettier --write pipeline/prompts/template-frame.ts pipeline/prompts/verbatim-messages.ts scripts/test/check-gem-template-frame.mjs`
Expected: los tres `(unchanged)`.

Run: `pnpm exec eslint pipeline/prompts/template-frame.ts pipeline/prompts/verbatim-messages.ts scripts/test/check-gem-template-frame.mjs && pnpm exec tsc -p tsconfig.pipeline.json --noEmit`
Expected: sin salida.

- [ ] **Paso 7: Commit (orquestador)**

```bash
git add pipeline/prompts/template-frame.ts pipeline/prompts/verbatim-messages.ts scripts/test/check-gem-template-frame.mjs
git commit -F- <<'EOF'
feat: add the Vimo frame for section-based gems

Qué: prompts/template-frame.ts arma el system de una gema de plantilla
(buildTemplateSystem: estilo visual, cámara, dinamismo con su etiqueta, reglas
del estilo, seguridad de contenido, formato de salida, frases fijas y las
reglas de plataforma de siempre) y su texto plano (composeGemText, sin la
sección character). Suma cinco reglas de plataforma declaradas, en español sin
acentos: CONTENT_SAFETY_RULE, OUTPUT_FORMAT_RULE, FIXED_PHRASES_RULE,
TREATMENT_TAG_RULE y DYNAMISM_WITHOUT_PROTAGONIST_RULE. verbatim-messages
extrae platformSystemRules y exporta architectureRuleFor, así la gema vieja y
el marco suman las mismas reglas en el mismo orden.

Por qué: spec §5.1 y ADR-0041: con una sola estructura de gema, el personaje,
el dinamismo, la seguridad y el formato se aplican por código, igual para
todas.

Con qué interactúa: el carril verbatim lo usa desde la Tarea A4.
buildVerbatimSystem devuelve el mismo texto byte a byte (lo pinean este guard,
check-verbatim-prompt-language y check-scene-wardrobe). La sección character
nunca entra al system. Guard nuevo: check-gem-template-frame.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Tarea A4 · Carril verbatim con secciones

Con `customStyle.sections`, el writer arma el `system` con el marco y la Fase 1 (y el pedido de
último recurso) recibe la gema como texto (`composeGemText`). En el modo genérico (declarado o
ausente), si la gema trae sección `character`, ese texto es el protagonista: no corre la Fase 1, va
como turno del retrato y se teje en cada escena que lo nombra; se guarda en `styleProtagonist` con
`source: 'style-section'` antes del primer lote. La sección termina con una oración que empieza
exactamente con «Outfit:», el mismo formato que hoy exige la Fase 1 (`CHARACTER_OUTFIT_SENTENCE_RULE`,
spec §4.1), así que pasa tal cual por `splitOutfit`, sin cambios y sin soporte para otras formas, y
el vestuario por escena la trata igual que a una ficha de la Fase 1; una sección sin esa oración
viaja entera. En «Mi personaje» (`own`, también cuando cae a genérico por no traer
personajes) y en cinemático (`none`) la sección no viaja. La recuperación por política de contenido
(E34, `images.ts`) y el editor (`regenerate-scene-images`) llaman al mismo carril: usan el mismo marco
y el protagonista guardado.

**Files:**

- Modify: `pipeline/stages/scene-prompts/verbatim/subject-weaver.ts`
- Modify: `pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts`
- Modify: `pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts`
- Test: `scripts/test/check-gem-verbatim-lane.mjs`

**Interfaces:**

- Consumes: `buildTemplateSystem`, `composeGemText` (A3); `splitOutfit(description: string): IdentitySplit`, `capWovenIdentity(description: string): string` (existentes); `GemSections`, `ProjectCustomStyle`, `StyleProtagonist` (Tarea 0).
- Produces: `protagonistFromSection(section: string): StyleProtagonist` en `subject-weaver.ts` (`{ portrait: <sección recortada>, description: <la misma sección, con el tope de 700 que ya cumple>, outfit?: <lo que `splitOutfit` separa de su oración «Outfit:»>, source: 'style-section' }`); `VerbatimWriterOptions.sections?: GemSections` (con secciones, el `system` de la Fase 2 es `buildTemplateSystem(sections, mode, …)`; sin ellas, `buildVerbatimSystem(gem, mode, …)` como hoy); en el lane, `gem` = `composeGemText(sections)` o el `systemPrompt` viejo.

- [ ] **Paso 1: escribir el guard que falla**

Crear `scripts/test/check-gem-verbatim-lane.mjs`. Las cuatro huellas de `LEGACY_FINGERPRINTS` se
tomaron corriendo este mismo fixture sobre el código previo a la tarea (idénticas en `e50be2a1` y
tras la Tarea 0): no se recalculan.

<!-- prettier-ignore -->
````js
// El carril verbatim con gemas por secciones (ADR-0041, spec §5.2): el marco
// arma el system en los cuatro modos, la sección `character` es el
// protagonista del modo genérico sin Fase 1 y no viaja en «Mi personaje» ni
// en cinemático, y la recuperación por política de contenido y el editor usan
// el mismo marco. Una gema vieja sale byte a byte igual que antes: las huellas
// de abajo se tomaron con el código previo a este cambio. Proveedores HTTP
// simulados y proyectos temporales.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { regenerateSceneImages } from '../../pipeline/commands/videos/regenerate-scene-images.ts'
import {
  resolveProjectPaths,
  sceneImageFile,
} from '../../pipeline/project/paths.ts'
import { readScenes, writeScenes } from '../../pipeline/project/scenes-file.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { imagesStage } from '../../pipeline/stages/images/images.ts'
import {
  CONTENT_POLICY_RETRY_NOTE,
  runVerbatimLane,
} from '../../pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts'
import { protagonistFromSection } from '../../pipeline/stages/scene-prompts/verbatim/subject-weaver.ts'
import {
  buildTemplateSystem,
  composeGemText,
} from '../../pipeline/prompts/template-frame.ts'
import {
  buildAssistantCharacterTurn,
  CHARACTER_DESIGN_INSTRUCTION,
  USER_PROTAGONIST_RULE,
} from '../../pipeline/prompts/verbatim-messages.ts'
import { DESCRIPTION_HEADER } from '../../pipeline/prompts/verbatim-identity.ts'

const legacyGem =
  'Render every scene as a hand-drawn watercolor illustration with indigo washes and rough paper. Keep the story action and setting.'
const script =
  'Mila repairs a red antenna outside the station. The greenhouse glows at night. She smiles at the stars.'
const sceneTexts = [
  'Mila repairs the red antenna.',
  'The greenhouse glows at night.',
  'She smiles at the stars.',
]
const sheet =
  'A curious red-haired girl, slender build, freckles across the nose, round green glasses. Outfit: a green hoodie, blue jeans and white sneakers.'
const tail = 'Style: hand-drawn watercolor illustration, indigo washes.'
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const library = {
  name: 'Elena',
  description:
    'a young astronaut with brown hair, green eyes, a blue jacket and silver boots',
}
const sectionCharacter =
  'A stickman doll with a round white head, two black dot eyes and thin black line limbs. Outfit: white gloves and white rounded shoes.'
const sections = {
  visualStyle:
    'Simple stickman drawings with clean black lines on a colorful, softly shaded background.',
  character: sectionCharacter,
  dynamism:
    'Show the protagonist in about half of the scenes; in the rest, a metaphor, a key object or the place.',
  camera: 'Alternate wide shots and close-ups.',
  rules: 'Never draw readable text.',
}

function stream(content) {
  return new Response(
    'data: ' +
      JSON.stringify({
        choices: [{ delta: { content }, finish_reason: 'stop' }],
      }) +
      '\n\ndata: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
function lastUserMessage(request) {
  return request.messages.at(-1).content
}
function fragmentsOf(request) {
  return [...lastUserMessage(request).matchAll(/^(\d+)\. /gm)].map((match) =>
    Number(match[1]),
  )
}
function isPhaseOne(request) {
  return lastUserMessage(request).includes(CHARACTER_DESIGN_INSTRUCTION)
}
const scenePrompt = (id) =>
  id === 2
    ? `((${id})) Wide shot of an orbital greenhouse glowing at night, silver panels. ${tail}`
    : `((${id})) [subject] (wearing: a white space suit) repairs a red antenna beside an orbital greenhouse, warm light. ${tail}`

// El LLM de siempre: Fase 1 → la ficha; Fase 2 → un prompt por fragmento.
function llm(t, { onImage } = {}) {
  const requests = []
  const images = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url)
    if (target.includes('chat/completions')) {
      const request = JSON.parse(init.body)
      requests.push(request)
      if (isPhaseOne(request)) return stream('```text\n' + sheet + '\n```')
      return stream(fragmentsOf(request).map(scenePrompt).join('\n\n'))
    }
    if (target.startsWith('https://fal.run/')) {
      const body = JSON.parse(init.body)
      images.push(body)
      const rejected = onImage?.(body, images.length)
      if (rejected) return rejected
      return Response.json({
        images: [{ url: 'https://fixture.invalid/image.png' }],
      })
    }
    assert.equal(target, 'https://fixture.invalid/image.png')
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  return { requests, images }
}

async function fixture(
  t,
  customStyle,
  { characters, photo = false, prompts } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-lane-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  await mkdir(paths.charactersDirectory, { recursive: true })
  if (photo)
    await writeFile(join(paths.charactersDirectory, 'reference.png'), bytes)
  await writeFile(
    paths.metadataFile,
    JSON.stringify({
      id: 'fixture',
      name: 'Fixture',
      options: {
        styleId: 'normal',
        imageProvider: 'fal',
        imageQuality: 'low',
        videoFormat: '16:9',
        ...(characters ? { characters } : {}),
        customStyle,
      },
      state: 'draft',
      completedStages: [],
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    }),
  )
  await writeFile(paths.scriptFile, script)
  await writeScenes(
    paths,
    sceneTexts.map((text, index) => ({
      id: index + 1,
      text,
      startSeconds: index * 4,
      endSeconds: (index + 1) * 4,
      ...(prompts ? { imagePrompt: prompts[index] } : {}),
    })),
  )
  const events = []
  const base = {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fixture', fal: 'fixture' },
      binaryPaths: {},
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: {
      emit(event) {
        events.push(event)
      },
    },
  }
  return { paths, base, events }
}

async function runLane(t, customStyle, extra) {
  const { paths, base, events } = await fixture(t, customStyle, extra)
  const { requests } = llm(t)
  const context = await buildCreateVideoContext(base, 'fixture')
  const lane = await runVerbatimLane(context, await readScenes(paths), script)
  await writeScenes(paths, lane.scenes)
  return { requests, lane, paths, events }
}
async function storedMetadata(paths) {
  return JSON.parse(await readFile(paths.metadataFile, 'utf8'))
}
function template(mode, extra = {}) {
  return {
    styleId: 'st-template',
    name: 'Stickman',
    sections,
    templateVersion: 1,
    character: { mode },
    ...extra,
  }
}
function everyMessage(requests) {
  return requests.flatMap((request) =>
    request.messages.map((message) => message.content),
  )
}

// ── La gema vieja, byte a byte ──

const LEGACY_MODES = {
  generic: { style: { mode: 'generic' } },
  text: {
    style: { mode: 'own' },
    characters: [{ ...library, mode: 'text' }],
  },
  reference: {
    style: { mode: 'own' },
    photo: true,
    characters: [
      { ...library, mode: 'photo', referenceImageFile: 'reference.png' },
    ],
  },
  none: { style: { mode: 'none' } },
}
// Huellas de la conversación entera (system, guion, retrato y lote) y de los
// prompts finales, tomadas con el código anterior al marco.
const LEGACY_FINGERPRINTS = {
  generic: 'dbc4da2ff5e1d72a5325445719fdf87d3b75bea7829c85d704e645b98da11e3a',
  text: '5b5de4d3a48df4d3b249eb445f118fd5771984ec6f99e13c2a91e9156c858e09',
  reference: '1802a9d621debd854d13ef1c113690d6fdf529488addd55c9e220de9045df035',
  none: '6ef06a139f62368c7981b4256266df8f420a89d42d4104b85506831ddf0e3319',
}
function fingerprint(requests, lane) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        messages: requests.map((request) => request.messages),
        scenes: lane.scenes.map((scene) => ({
          id: scene.id,
          imagePrompt: scene.imagePrompt,
          charactersPresent: scene.charactersPresent,
        })),
      }),
    )
    .digest('hex')
}

for (const [mode, setup] of Object.entries(LEGACY_MODES)) {
  test(
    'an old gem in mode ' + mode + ' is byte-identical to before',
    async (t) => {
      const { requests, lane } = await runLane(
        t,
        {
          styleId: 'st-legacy',
          name: 'Watercolor',
          systemPrompt: legacyGem,
          character: setup.style,
        },
        setup,
      )
      assert.ok(
        requests[0].messages[0].content.startsWith(legacyGem),
        'gema intacta',
      )
      assert.equal(
        fingerprint(requests, lane),
        LEGACY_FINGERPRINTS[mode],
        'la conversación o los prompts finales de una gema vieja cambiaron',
      )
    },
  )
}

// ── Genérico con sección `character` ──

test('the character section is the portrait, and its Outfit sentence is the base outfit', () => {
  assert.deepEqual(protagonistFromSection(sectionCharacter), {
    portrait: sectionCharacter,
    description: sectionCharacter,
    outfit: 'white gloves and white rounded shoes',
    source: 'style-section',
  })
  // Sin la oración «Outfit:» no hay ropa base que separar: viaja entera.
  const withoutOutfit = 'A stickman doll with a round white head and dot eyes.'
  assert.deepEqual(protagonistFromSection('  ' + withoutOutfit + '  '), {
    portrait: withoutOutfit,
    description: withoutOutfit,
    source: 'style-section',
  })
})

test('generic with a character section: no phase 1, the section is the portrait and the woven identity', async (t) => {
  const { requests, lane, paths, events } = await runLane(
    t,
    template('generic'),
    {
      characters: [{ ...library, mode: 'text' }],
    },
  )

  assert.equal(requests.filter(isPhaseOne).length, 0, 'sin Fase 1')
  const [system, scriptTurn, portraitTurn] = requests[0].messages
  assert.equal(system.content, buildTemplateSystem(sections, 'generic'))
  assert.equal(scriptTurn.role, 'user')
  assert.equal(portraitTurn.role, 'assistant')
  assert.equal(
    portraitTurn.content,
    buildAssistantCharacterTurn(sectionCharacter),
  )

  const stored = (await storedMetadata(paths)).styleProtagonist
  assert.equal(stored.source, 'style-section')
  assert.equal(stored.portrait, sectionCharacter)
  assert.equal(stored.outfit, 'white gloves and white rounded shoes')

  const woven = lane.scenes[0].imagePrompt
  assert.match(woven, /white space suit/, 'la ropa de la escena')
  assert.ok(woven.includes(DESCRIPTION_HEADER + ' A stickman doll'))
  assert.match(woven, /Their usual look, for reference: white gloves/)
  assert.doesNotMatch(
    woven,
    /blue jacket/,
    'el personaje del proyecto no viaja',
  )
  assert.ok(
    events.some((event) =>
      event.message?.includes('character section of the style'),
    ),
  )
})

test('a resume reuses the stored section protagonist and still skips phase 1', async (t) => {
  const { paths, base } = await fixture(t, template('generic'))
  llm(t)
  const first = await buildCreateVideoContext(base, 'fixture')
  const lane = await runVerbatimLane(first, await readScenes(paths), script)
  await writeScenes(
    paths,
    lane.scenes.map((scene) =>
      scene.id === 3 ? { ...scene, imagePrompt: undefined } : scene,
    ),
  )
  t.mock.restoreAll()

  const { requests } = llm(t)
  const again = await buildCreateVideoContext(base, 'fixture')
  await runVerbatimLane(again, await readScenes(paths), script)
  assert.equal(requests.filter(isPhaseOne).length, 0)
  assert.deepEqual(fragmentsOf(requests[0]), [3])
  assert.equal(
    requests[0].messages[2].content,
    buildAssistantCharacterTurn(sectionCharacter),
  )
})

// ── Genérico sin sección: la Fase 1 con la gema como texto ──

test('generic without a character section designs the protagonist from the gem text', async (t) => {
  const withoutCharacter = { ...sections, character: undefined }
  const { requests } = await runLane(
    t,
    template('generic', { sections: withoutCharacter }),
  )
  const phaseOne = requests.filter(isPhaseOne)
  assert.equal(phaseOne.length, 1)
  assert.equal(
    phaseOne[0].messages[0].content,
    composeGemText(withoutCharacter),
  )
  const batch = requests.find((request) => !isPhaseOne(request))
  assert.equal(
    batch.messages[0].content,
    buildTemplateSystem(withoutCharacter, 'generic'),
  )
})

// ── «Mi personaje» y cinemático: la sección no viaja ──

for (const [name, extra, mode] of [
  [
    'own with a text character',
    { characters: [{ ...library, mode: 'text' }] },
    'text',
  ],
  [
    'own with a photo',
    {
      photo: true,
      characters: [
        { ...library, mode: 'photo', referenceImageFile: 'reference.png' },
      ],
    },
    'reference',
  ],
]) {
  test(
    name + ': the frame carries the user protagonist and never the section',
    async (t) => {
      const { requests, lane } = await runLane(t, template('own'), extra)
      assert.equal(requests.filter(isPhaseOne).length, 0)
      const system = requests[0].messages[0].content
      assert.equal(system, buildTemplateSystem(sections, mode))
      assert.ok(system.includes(USER_PROTAGONIST_RULE))
      for (const content of everyMessage(requests))
        assert.ok(!content.includes('stickman doll'), 'la sección no viaja')
      assert.doesNotMatch(lane.scenes[0].imagePrompt, /stickman doll/)
    },
  )
}

test('own without characters falls back to phase 1 without the section', async (t) => {
  const { requests } = await runLane(t, template('own'))
  const phaseOne = requests.filter(isPhaseOne)
  assert.equal(phaseOne.length, 1)
  assert.equal(phaseOne[0].messages[0].content, composeGemText(sections))
  for (const content of everyMessage(requests))
    assert.ok(!content.includes('stickman doll'), 'la sección no viaja')
})

test('none: the cinematic frame, no phase 1, no portrait and never the section', async (t) => {
  const { requests, lane } = await runLane(t, template('none'))
  assert.equal(requests.length, 1)
  assert.equal(
    requests[0].messages[0].content,
    buildTemplateSystem(sections, 'none'),
  )
  assert.ok(
    !requests[0].messages.some((message) => message.role === 'assistant'),
  )
  for (const content of everyMessage(requests))
    assert.ok(!content.includes('stickman doll'))
  for (const scene of lane.scenes) {
    assert.doesNotMatch(scene.imagePrompt, /\[subject\]/)
    assert.ok(!scene.imagePrompt.includes(DESCRIPTION_HEADER))
  }
})

// ── E34 y el editor, con el mismo marco ──

test('a content-policy rewrite goes through the same frame, with the retry note', async (t) => {
  const stored = sceneTexts.map(
    (_, index) =>
      `Scene number ${index + 1}, a stickman doll outdoors. ${tail}`,
  )
  const { paths, base } = await fixture(t, template('none'), {
    prompts: stored,
  })
  const { requests, images } = llm(t, {
    onImage: (body) =>
      body.prompt.startsWith('Scene number 1,')
        ? Response.json(
            { type: 'content_policy_violation', detail: 'flagged' },
            { status: 400 },
          )
        : undefined,
  })
  const context = await buildCreateVideoContext(base, 'fixture')
  await imagesStage.run(context)

  assert.equal(requests.length, 1, 'solo la escena rechazada se reescribe')
  assert.equal(
    requests[0].messages[0].content,
    buildTemplateSystem(sections, 'none'),
  )
  assert.deepEqual(fragmentsOf(requests[0]), [1])
  assert.ok(lastUserMessage(requests[0]).includes(CONTENT_POLICY_RETRY_NOTE))
  assert.equal(images.length, 4, 'tres a la primera y la reescrita')
  assert.match((await readScenes(paths))[0].imagePrompt, /orbital greenhouse/)
})

test('the editor rewrite goes through the same frame and reuses the section protagonist', async (t) => {
  const { paths, base } = await fixture(t, template('generic'))
  llm(t)
  const context = await buildCreateVideoContext(base, 'fixture')
  const lane = await runVerbatimLane(context, await readScenes(paths), script)
  await writeScenes(paths, lane.scenes)
  for (const id of [1, 2, 3]) await writeFile(sceneImageFile(paths, id), bytes)
  t.mock.restoreAll()

  const { requests } = llm(t)
  await regenerateSceneImages({
    ...base,
    job: {
      ...base.job,
      payload: {
        projectId: 'fixture',
        scenes: [{ id: 1, rewritePrompt: true }],
      },
    },
  })
  assert.equal(requests.filter(isPhaseOne).length, 0)
  assert.equal(requests.length, 1)
  assert.equal(
    requests[0].messages[0].content,
    buildTemplateSystem(sections, 'generic'),
  )
  assert.equal(
    requests[0].messages[2].content,
    buildAssistantCharacterTurn(sectionCharacter),
  )
})
````

- [ ] **Paso 2: correr y ver que falla**

Run: `node --test scripts/test/check-gem-verbatim-lane.mjs`
Expected: FAIL al cargar: `SyntaxError: The requested module '../../pipeline/stages/scene-prompts/verbatim/subject-weaver.ts' does not provide an export named 'protagonistFromSection'`.

- [ ] **Paso 3: el protagonista de la sección**

En `pipeline/stages/scene-prompts/verbatim/subject-weaver.ts`:

Edición 1 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
  signatureLookNote,
} from '../../../prompts/verbatim-identity.ts'
import type { Scene } from '../../../types/scenes.ts'
import { bodyWithoutFinalClauses } from '../../shared/prompt-safety.ts'

/** Reemplazo de `[subject]` cuando el diseño del personaje falló del todo. */
```

por:

<!-- prettier-ignore -->
```ts
  signatureLookNote,
} from '../../../prompts/verbatim-identity.ts'
import type { Scene } from '../../../types/scenes.ts'
import type { StyleProtagonist } from '../../../types/video-project.ts'
import { bodyWithoutFinalClauses } from '../../shared/prompt-safety.ts'

/** Reemplazo de `[subject]` cuando el diseño del personaje falló del todo. */
```

Edición 2 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
  if (!outfit || countWords(core) < MIN_DESCRIPTION_WORDS)
    return { core: description.trim() }
  return { core: /[.!?]$/.test(core) ? core : `${core}.`, outfit }
}

/** Solo el primer `[subject]` lleva la ropa; los demás quedan como el rol. */
```

por:

<!-- prettier-ignore -->
```ts
  if (!outfit || countWords(core) < MIN_DESCRIPTION_WORDS)
    return { core: description.trim() }
  return { core: /[.!?]$/.test(core) ? core : `${core}.`, outfit }
}

/**
 * El protagonista que define la sección `character` de una gema de plantilla
 * (modo genérico, ADR-0041): sin Fase 1. La sección llega con el formato de la
 * ficha de la Fase 1 —la identidad y, al final, la oración «Outfit: …» con la
 * ropa base (`CHARACTER_OUTFIT_SENTENCE_RULE`)—, así que es a la vez el retrato
 * del turno de assistant y la descripción que se teje, y `splitOutfit` separa
 * su ropa como siempre. El tope de la identidad tejida no la cambia: la
 * sección ya llega validada con 700 caracteres como máximo.
 */
export function protagonistFromSection(section: string): StyleProtagonist {
  const portrait = section.trim()
  const description = capWovenIdentity(portrait)
  const outfit = splitOutfit(description).outfit
  return {
    portrait,
    description,
    ...(outfit ? { outfit } : {}),
    source: 'style-section',
  }
}

/** Solo el primer `[subject]` lleva la ropa; los demás quedan como el rol. */
```

- [ ] **Paso 4: el writer arma el system con el marco**

En `pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts`:

Edición 1 de 4 — reemplazar:

<!-- prettier-ignore -->
```ts
  type VerbatimMessage,
} from '../../../providers/llm/verbatim-client.ts'
import type { LlmModelProfile } from '../../../types/llm-models.ts'
import type { StyleProtagonist } from '../../../types/video-project.ts'
import { isInsufficientCreditsFailure } from '../../../utils/insufficient-credits.ts'
import { buildProtagonistDesignMessage } from '../../../prompts/protagonist-request.ts'
```

por:

<!-- prettier-ignore -->
```ts
  type VerbatimMessage,
} from '../../../providers/llm/verbatim-client.ts'
import type { LlmModelProfile } from '../../../types/llm-models.ts'
import type { GemSections } from '../../../types/styles.ts'
import type { StyleProtagonist } from '../../../types/video-project.ts'
import { isInsufficientCreditsFailure } from '../../../utils/insufficient-credits.ts'
import { buildProtagonistDesignMessage } from '../../../prompts/protagonist-request.ts'
```

Edición 2 de 4 — reemplazar:

<!-- prettier-ignore -->
```ts
  PROTAGONIST_TOKENS_BUDGET,
} from '../../shared/protagonist-description.ts'
import { FINAL_PROMPT_BODY_BUDGET } from '../../shared/prompt-safety.ts'
import {
  buildAssistantCharacterTurn,
  buildCharacterDesignMessage,
```

por:

<!-- prettier-ignore -->
```ts
  PROTAGONIST_TOKENS_BUDGET,
} from '../../shared/protagonist-description.ts'
import { FINAL_PROMPT_BODY_BUDGET } from '../../shared/prompt-safety.ts'
import { buildTemplateSystem } from '../../../prompts/template-frame.ts'
import {
  buildAssistantCharacterTurn,
  buildCharacterDesignMessage,
```

Edición 3 de 4 — reemplazar:

<!-- prettier-ignore -->
```ts
}

export interface VerbatimWriterOptions {
  /** La gema del usuario. Viaja VERBATIM como `system`. */
  gem: string
  /** Modelo elegido en el proyecto. Vacío → el de la casa. */
  modelId?: string
  /** Qué hace este video con el protagonista. Ausente = `generic`. */
```

por:

<!-- prettier-ignore -->
```ts
}

export interface VerbatimWriterOptions {
  /** La gema del usuario. Viaja VERBATIM como `system` (en una gema de
   *  plantilla, sus secciones como texto: la Fase 1 la recibe así). */
  gem: string
  /** Gema de plantilla (ADR-0041): el `system` de la Fase 2 lo arma el marco
   *  de Vimo con estas secciones. Ausente = gema vieja, camino de siempre. */
  sections?: GemSections
  /** Modelo elegido en el proyecto. Vacío → el de la casa. */
  modelId?: string
  /** Qué hace este video con el protagonista. Ausente = `generic`. */
```

Edición 4 de 4 — reemplazar:

<!-- prettier-ignore -->
```ts
    // devolvió (con personaje del usuario, su texto: el modelo cree que ese
    // retrato lo escribió él). Con FOTO o SIN protagonista no hay turno que
    // replicar — el preámbulo del lote es el que dice qué hacer.
    const messages: VerbatimMessage[] = [
      {
        role: 'system',
        content: buildVerbatimSystem(options.gem, mode, {
          withoutScriptProtagonist,
          sceneWardrobe: options.sceneWardrobe,
          outputLanguageRule: options.outputLanguageRule,
        }),
      },
      { role: 'user', content: buildScriptMessage(fullScript) },
      ...(character.portrait
```

por:

<!-- prettier-ignore -->
```ts
    // devolvió (con personaje del usuario, su texto: el modelo cree que ese
    // retrato lo escribió él). Con FOTO o SIN protagonista no hay turno que
    // replicar — el preámbulo del lote es el que dice qué hacer.
    const systemOptions = {
      withoutScriptProtagonist,
      sceneWardrobe: options.sceneWardrobe,
      outputLanguageRule: options.outputLanguageRule,
    }
    const messages: VerbatimMessage[] = [
      {
        role: 'system',
        content: options.sections
          ? buildTemplateSystem(options.sections, mode, systemOptions)
          : buildVerbatimSystem(options.gem, mode, systemOptions),
      },
      { role: 'user', content: buildScriptMessage(fullScript) },
      ...(character.portrait
```

- [ ] **Paso 5: el lane manda la gema como texto y resuelve el protagonista de la sección**

En `pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts`:

Edición 1 de 6 — reemplazar:

<!-- prettier-ignore -->
```ts
import type { StyleCharacter } from '../../../types/styles.ts'
import type {
  ProjectCharacter,
  StyleProtagonist,
} from '../../../types/video-project.ts'
import type { VerbatimFragment } from '../../../prompts/verbatim-messages.ts'
import type { CreateVideoContext } from '../../context.ts'
import { narrationFragmentFor } from '../prompt-composer.ts'
```

por:

<!-- prettier-ignore -->
```ts
import type { StyleCharacter } from '../../../types/styles.ts'
import type {
  ProjectCharacter,
  ProjectCustomStyle,
  StyleProtagonist,
} from '../../../types/video-project.ts'
import { composeGemText } from '../../../prompts/template-frame.ts'
import type { VerbatimFragment } from '../../../prompts/verbatim-messages.ts'
import type { CreateVideoContext } from '../../context.ts'
import { narrationFragmentFor } from '../prompt-composer.ts'
```

Edición 2 de 6 — reemplazar:

<!-- prettier-ignore -->
```ts
  namesByName,
  namesSubject,
  mentionsProtagonist,
  recoverProtagonistFromScenes,
} from './subject-weaver.ts'
```

por:

<!-- prettier-ignore -->
```ts
  namesByName,
  namesSubject,
  mentionsProtagonist,
  protagonistFromSection,
  recoverProtagonistFromScenes,
} from './subject-weaver.ts'
```

Edición 3 de 6 — reemplazar:

<!-- prettier-ignore -->
```ts
}

/**
 * El protagonista que este proyecto YA tiene resuelto para sus grupos
 * `generic` (sin personaje del usuario): el guardado en project.json o, en
 * proyectos anteriores a ese campo, el que sus prompts de escena ya vienen
 * tejiendo. `undefined` = primera vez: lo diseña la Fase 1.
 *
```

por:

<!-- prettier-ignore -->
```ts
}

/**
 * La sección `character` de una gema de plantilla, cuando viaja: solo en el
 * modo genérico (declarado o ausente). En «Mi personaje» el protagonista es el
 * del usuario y en cinemático no hay (spec §5.2).
 */
function sectionCharacterOf(
  customStyle: ProjectCustomStyle | undefined,
): string | undefined {
  const mode = customStyle?.character?.mode
  if (mode === 'own' || mode === 'none') return undefined
  return customStyle?.sections?.character?.trim() || undefined
}

/**
 * El protagonista que este proyecto YA tiene resuelto para sus grupos
 * `generic` (sin personaje del usuario): el guardado en project.json; el que
 * define la sección `character` de una gema de plantilla (sin Fase 1); o, en
 * proyectos anteriores a ese campo, el que sus prompts de escena ya vienen
 * tejiendo. `undefined` = primera vez: lo diseña la Fase 1.
 *
```

Edición 4 de 6 — reemplazar:

<!-- prettier-ignore -->
```ts
): StyleProtagonist | undefined {
  const stored = context.metadata.styleProtagonist
  if (stored?.description.trim()) return stored
  if (projectHasCharacters) return undefined

  const recovered = recoverProtagonistFromScenes(scenes)
```

por:

<!-- prettier-ignore -->
```ts
): StyleProtagonist | undefined {
  const stored = context.metadata.styleProtagonist
  if (stored?.description.trim()) return stored
  const section = sectionCharacterOf(context.options.customStyle)
  if (section) return protagonistFromSection(section)
  if (projectHasCharacters) return undefined

  const recovered = recoverProtagonistFromScenes(scenes)
```

Edición 5 de 6 — reemplazar:

<!-- prettier-ignore -->
```ts
      })
      await saveStyleProtagonist(knownProtagonist)
    }
    for (const group of genericGroups)
      group.input = { mode: 'generic', designed: knownProtagonist }
  }
```

por:

<!-- prettier-ignore -->
```ts
      })
      await saveStyleProtagonist(knownProtagonist)
    }
    if (
      knownProtagonist.source === 'style-section' &&
      !context.metadata.styleProtagonist
    ) {
      context.emitter.emit({
        type: 'log',
        level: 'info',
        message:
          'protagonist taken from the character section of the style: no character design phase',
      })
      await saveStyleProtagonist(knownProtagonist)
    }
    for (const group of genericGroups)
      group.input = { mode: 'generic', designed: knownProtagonist }
  }
```

Edición 6 de 6 — reemplazar:

<!-- prettier-ignore -->
```ts
    const result = await generateVerbatimPrompts(fragments, fullScript, {
      // La gema del usuario, VERBATIM: el snapshot del proyecto, sin los
      // ALLOWED SHOTS ni las GLOBAL_RULES del carril de la casa (paridad con el
      // origen: los planos solo gobiernan el carril del catálogo).
      gem: customStyle.systemPrompt ?? '',
      // El modelo elegido en el proyecto; el writer lo resuelve (retirado o
      // desconocido → el de la casa, con aviso).
      modelId: context.options.promptModel,
```

por:

<!-- prettier-ignore -->
```ts
    const result = await generateVerbatimPrompts(fragments, fullScript, {
      // La gema del usuario, VERBATIM: el snapshot del proyecto, sin los
      // ALLOWED SHOTS ni las GLOBAL_RULES del carril de la casa (paridad con el
      // origen: los planos solo gobiernan el carril del catálogo). Una gema de
      // plantilla viaja por secciones: el marco arma su system y la Fase 1
      // recibe su texto (ADR-0041).
      gem: customStyle.sections
        ? composeGemText(customStyle.sections)
        : (customStyle.systemPrompt ?? ''),
      sections: customStyle.sections,
      // El modelo elegido en el proyecto; el writer lo resuelve (retirado o
      // desconocido → el de la casa, con aviso).
      modelId: context.options.promptModel,
```

- [ ] **Paso 6: correr y ver que pasa**

Run: `node --test scripts/test/check-gem-verbatim-lane.mjs`
Expected: `ℹ tests 14`, `ℹ pass 14`, `ℹ fail 0` (las cuatro huellas del camino viejo incluidas).

Run: `node --test scripts/test/check-gem-*.mjs` y la batería del carril.
Expected: `ℹ pass 55` y `ℹ pass 111`.

- [ ] **Paso 7: formato, lint y tipos**

Run: `pnpm exec prettier --write pipeline/stages/scene-prompts/verbatim/subject-weaver.ts pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts scripts/test/check-gem-verbatim-lane.mjs`
Expected: los cuatro `(unchanged)`.

Run: `pnpm exec eslint pipeline/stages/scene-prompts/verbatim/subject-weaver.ts pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts scripts/test/check-gem-verbatim-lane.mjs && pnpm exec tsc -p tsconfig.pipeline.json --noEmit`
Expected: sin salida.

- [ ] **Paso 8: Commit (orquestador)**

```bash
git add pipeline/stages/scene-prompts/verbatim/subject-weaver.ts pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts scripts/test/check-gem-verbatim-lane.mjs
git commit -F- <<'EOF'
feat: write template gem prompts through the verbatim lane

Qué: con customStyle.sections el writer arma el system de la Fase 2 con el
marco de Vimo y la Fase 1 recibe la gema como texto. En el modo genérico, la
sección character es el protagonista sin Fase 1: turno del retrato y
descripción tejida; como termina con la oración «Outfit:» de la ficha de la
Fase 1, splitOutfit separa su ropa base sin cambios. Se guarda en
styleProtagonist con source 'style-section' antes del primer lote. En «Mi
personaje» y en cinemático la sección no viaja. subject-weaver suma
protagonistFromSection.

Por qué: spec §5.2: el personaje se controla por código y no solo por
instrucción; una gema con su personaje escrito ya no puede colarlo en un video
cinemático ni pisar al personaje del usuario.

Con qué interactúa: la recuperación por política de contenido (images) y el
editor reusan el carril, el marco y el protagonista guardado. Una gema vieja
produce la misma conversación y los mismos prompts: el guard nuevo
check-gem-verbatim-lane lo pinea con huellas tomadas del código previo.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Tarea A5 · Etiqueta de tratamiento

Cuando la gema tiene dinamismo, el marco pide `((n)) [T:<tratamiento>]` (A3). El parser lee la
etiqueta después del id y la quita **antes** de mirar defectos (por su mayúscula, el guard de huecos
E33 la tomaría por una ranura de plantilla), guarda `scene.treatment` si es un `SceneTreatment`
válido, y la quita igual si no lo es: el prompt vale, no hay reintento. Un trozo que era solo el id y
la etiqueta cuenta como escena faltante. Un prompt nuevo sin tratamiento borra el tratamiento viejo
de su escena. Al cerrar `scene-prompts`, un `log` informa el reparto de las escenas escritas en esa
pasada. Sin dinamismo (y con una gema vieja) la lectura es la de siempre, byte por byte.

**Allowlist de diagnóstico (Rust):** el reparto viaja como un evento `log` con `type`, `level` y
`message`, las tres ya en `ALLOWED_EVENT_KEYS` de `src-tauri/src/diagnostics/redaction.rs`. No hacen
falta claves nuevas ni tocar Rust; el guard verifica que el evento no trae otras claves. El mensaje
solo lleva conteos (ningún contenido del usuario).

**Files:**

- Modify: `pipeline/stages/scene-prompts/verbatim/parser.ts`
- Modify: `pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts`
- Create: `pipeline/stages/scene-prompts/verbatim/treatments.ts`
- Modify: `pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts`
- Modify: `pipeline/stages/scene-prompts/verbatim/verbatim-persistence.ts`
- Modify: `pipeline/stages/scene-prompts/scene-prompts.ts`
- Test: `scripts/test/check-gem-treatment-tags.mjs`

**Interfaces:**

- Consumes: `SCENE_TREATMENTS`, `SceneTreatment`, `Scene.treatment` (Tarea 0); `VerbatimWriterOptions.sections` (A4).
- Produces:
  - `parser.ts`: `interface TreatmentTagReading { text: string; treatment?: SceneTreatment }`; `readTreatmentTag(prompt: string): TreatmentTagReading`.
  - `verbatim-writer.ts`: `interface BatchReadingOptions { treatmentTags?: boolean }`; `readBatchPrompts(raw: string, batch: readonly VerbatimFragment[], options: BatchReadingOptions = {}): BatchReading`; `BatchReading.good: { n: number; prompt: string; treatment?: SceneTreatment }[]`; `VerbatimBatchPrompts.treatments: ReadonlyMap<number, SceneTreatment>`; `VerbatimResult.treatments: Map<number, SceneTreatment>`. El writer pide etiquetas solo con `sections.dynamism` no vacío.
  - `treatments.ts`: `withTreatment(scene: Scene, treatment: SceneTreatment | undefined): Scene`; `describeTreatmentMix(scenes: readonly Scene[], written: ReadonlySet<number>, scenesWithSubject: readonly number[]): string` con la forma `treatment mix of the <n> written scene(s): <tratamiento> <cantidad>, …, untagged <cantidad> — protagonist in <p>% (<k> of <n>)`.
  - `verbatim-lane.ts`: `VerbatimScenePrompt.treatment?: SceneTreatment`; `VerbatimLaneResult.scenesWithSubject: number[]`.

- [ ] **Paso 1: escribir el guard que falla**

Crear `scripts/test/check-gem-treatment-tags.mjs`:

<!-- prettier-ignore -->
```js
// La etiqueta de tratamiento de las gemas con dinamismo (spec §5.3): el
// parser la lee y la quita después del id `((n))`, guarda un tratamiento
// válido en `scene.treatment` y, si falta o no es válida, el prompt igual
// vale sin reintento. Al cerrar la fase de prompts un `log` cuenta el
// reparto. Una gema sin dinamismo o una gema vieja no ven nada de esto.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'
import { readScenes, writeScenes } from '../../pipeline/project/scenes-file.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { scenePromptsStage } from '../../pipeline/stages/scene-prompts/scene-prompts.ts'
import { readTreatmentTag } from '../../pipeline/stages/scene-prompts/verbatim/parser.ts'
import {
  describeTreatmentMix,
  withTreatment,
} from '../../pipeline/stages/scene-prompts/verbatim/treatments.ts'
import {
  generateVerbatimPrompts,
  readBatchPrompts,
} from '../../pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts'

const tail = 'Style: simple stickman drawing, colorful background.'
const batch = [1, 2, 3].map((n) => ({ n, text: 'Fragment ' + n + '.' }))
const scene = (id, body) => `((${id})) ${body} ${tail}`
const body = {
  1: '[T:action] [subject] runs across a bright park with a kite.',
  2: '[T:Metaphor] A giant clock melting over a quiet city at dawn.',
  3: '[T:close-up] A red kite caught in the branches of an old tree.',
}
const sections = {
  visualStyle: 'Simple stickman drawings on colorful backgrounds.',
  dynamism:
    'Show the protagonist in half of the scenes; metaphors in the rest.',
}

// ── La etiqueta ──

test('the tag is read and removed; an unknown one is removed without a treatment', () => {
  assert.deepEqual(readTreatmentTag('[T:action] Wide shot.'), {
    text: 'Wide shot.',
    treatment: 'action',
  })
  assert.deepEqual(readTreatmentTag('[ t : Place ]  Wide shot.'), {
    text: 'Wide shot.',
    treatment: 'place',
  })
  assert.deepEqual(readTreatmentTag('[T:close-up] Wide shot.'), {
    text: 'Wide shot.',
  })
  assert.deepEqual(readTreatmentTag('Wide shot. [T:action]'), {
    text: 'Wide shot. [T:action]',
  })
  assert.deepEqual(readTreatmentTag('[SUBJECT] Wide shot.'), {
    text: '[SUBJECT] Wide shot.',
  })
})

test('with tags on, a batch keeps every prompt and records the valid treatments', () => {
  const answer = [1, 2, 3].map((id) => scene(id, body[id])).join('\n\n')
  const reading = readBatchPrompts(answer, batch, { treatmentTags: true })
  assert.deepEqual(reading.defective, [])
  assert.deepEqual(
    reading.good.map((entry) => [entry.n, entry.treatment]),
    [
      [1, 'action'],
      [2, 'metaphor'],
      [3, undefined],
    ],
  )
  for (const entry of reading.good) assert.doesNotMatch(entry.prompt, /\[T:/)

  // Sin ids (lectura por orden) y en JSON también.
  const byOrder = readBatchPrompts(
    [1, 2, 3].map((id) => body[id] + ' ' + tail).join('\n\n'),
    batch,
    { treatmentTags: true },
  )
  assert.deepEqual(
    byOrder.good.map((entry) => entry.treatment),
    ['action', 'metaphor', undefined],
  )
  const fromJson = readBatchPrompts(
    JSON.stringify({
      prompts: [1, 2, 3].map((id) => ({ id, prompt: body[id] + ' ' + tail })),
    }),
    batch,
    { treatmentTags: true },
  )
  assert.deepEqual(
    fromJson.good.map((entry) => entry.treatment),
    ['action', 'metaphor', undefined],
  )
})

test('a piece with only its id and its tag is missing, not an empty prompt', () => {
  const reading = readBatchPrompts(
    [scene(1, body[1]), '((2)) [T:object]', scene(3, body[3])].join('\n\n'),
    batch,
    { treatmentTags: true },
  )
  assert.deepEqual(
    reading.good.map((entry) => entry.n),
    [1, 3],
  )
  assert.deepEqual(
    reading.defective.map((entry) => entry.n),
    [2],
  )
})

test('with tags off, the reading is the one of always (the tag looks like a template slot)', () => {
  const reading = readBatchPrompts(scene(1, body[1]), batch.slice(0, 1))
  assert.deepEqual(reading.good, [])
  assert.match(
    reading.defective[0].reason,
    /unfilled template slot: \[T:action\]/,
  )
})

// ── El escritor ──

function fakeClient(answer) {
  const requests = []
  return {
    requests,
    async call(request) {
      requests.push(request)
      const ids = [...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm)]
      return {
        content: ids.map((match) => answer(Number(match[1]))).join('\n\n'),
        inputTokens: 1,
        outputTokens: 1,
      }
    },
  }
}

test('a template gem with dynamism keeps its treatments and never re-asks for a bad tag', async () => {
  const client = fakeClient((id) => scene(id, body[id]))
  const result = await generateVerbatimPrompts(batch, 'A short story.', {
    gem: 'unused',
    sections,
    client,
    character: { mode: 'none' },
  })
  assert.equal(client.requests.length, 1, 'una etiqueta inválida no se re-pide')
  assert.deepEqual(
    [...result.treatments],
    [
      [1, 'action'],
      [2, 'metaphor'],
    ],
  )
  for (const prompt of result.prompts.values())
    assert.doesNotMatch(prompt, /\[T:/)
})

// ── La escena y el log ──

test('the scene carries the new treatment and loses a stale one', () => {
  const base = { id: 1, text: 'x' }
  assert.deepEqual(withTreatment(base, 'object'), {
    ...base,
    treatment: 'object',
  })
  assert.deepEqual(
    withTreatment({ ...base, treatment: 'place' }, undefined),
    base,
  )
  assert.equal(
    withTreatment(base, undefined),
    base,
    'sin campo, la misma escena',
  )
})

test('the mix counts each treatment, the untagged ones and the protagonist share', () => {
  const scenes = [
    { id: 1, text: '', treatment: 'action' },
    { id: 2, text: '', treatment: 'metaphor' },
    { id: 3, text: '' },
    { id: 4, text: '', treatment: 'action' },
    { id: 5, text: '', treatment: 'place' },
  ]
  assert.equal(
    describeTreatmentMix(scenes, new Set([1, 2, 3, 4]), [1, 4, 5]),
    'treatment mix of the 4 written scene(s): action 2, metaphor 1, untagged 1 — protagonist in 50% (2 of 4)',
  )
})

function stream(content) {
  return new Response(
    'data: ' +
      JSON.stringify({
        choices: [{ delta: { content }, finish_reason: 'stop' }],
      }) +
      '\n\ndata: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
async function fixture(t, customStyle, answer = (id) => scene(id, body[id])) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-tags-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  await writeFile(
    paths.metadataFile,
    JSON.stringify({
      id: 'fixture',
      name: 'Fixture',
      options: {
        styleId: 'normal',
        imageProvider: 'fal',
        imageQuality: 'low',
        videoFormat: '16:9',
        customStyle,
      },
      state: 'draft',
      completedStages: [],
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    }),
  )
  await writeFile(paths.scriptFile, 'A short story in three moments.')
  await writeScenes(
    paths,
    batch.map((fragment, index) => ({
      id: fragment.n,
      text: fragment.text,
      startSeconds: index * 4,
      endSeconds: (index + 1) * 4,
    })),
  )
  const events = []
  const base = {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fixture' },
      binaryPaths: {},
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: {
      emit(event) {
        events.push(event)
      },
    },
  }
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body)
    const ids = [
      ...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm),
    ].map((match) => Number(match[1]))
    return stream(ids.map(answer).join('\n\n'))
  })
  return { paths, base, events }
}
const mixLogs = (events) =>
  events.filter(
    (event) =>
      event.type === 'log' && event.message.startsWith('treatment mix'),
  )

test('scene-prompts stores the treatments and logs the mix once, with the allowed keys only', async (t) => {
  const { paths, base, events } = await fixture(t, {
    styleId: 'st-template',
    name: 'Stickman',
    sections,
    templateVersion: 1,
    character: { mode: 'none' },
  })
  await scenePromptsStage.run(await buildCreateVideoContext(base, 'fixture'))

  const scenes = await readScenes(paths)
  assert.deepEqual(
    scenes.map((item) => item.treatment),
    ['action', 'metaphor', undefined],
  )
  for (const item of scenes) assert.doesNotMatch(item.imagePrompt, /\[T:/)
  const logs = mixLogs(events)
  assert.equal(logs.length, 1)
  assert.equal(
    logs[0].message,
    'treatment mix of the 3 written scene(s): action 1, metaphor 1, untagged 1 — protagonist in 33% (1 of 3)',
  )
  // El log de soporte sube type, level y message (ADR-0038): nada nuevo.
  assert.deepEqual(Object.keys(logs[0]).sort(), ['level', 'message', 'type'])
})

test('without dynamism, and with an old gem, there is no treatment and no mix', async (t) => {
  // Sin dinamismo el marco no pide la etiqueta y el modelo no la escribe.
  const untagged = (id) => scene(id, body[id].replace(/^\[T:[^\]]*\] /, ''))
  for (const customStyle of [
    {
      styleId: 'st-static',
      name: 'Static',
      sections: { visualStyle: sections.visualStyle },
      templateVersion: 1,
      character: { mode: 'none' },
    },
    {
      styleId: 'st-legacy',
      name: 'Legacy',
      systemPrompt: 'Simple stickman drawings.',
      character: { mode: 'none' },
    },
  ]) {
    const { paths, base, events } = await fixture(t, customStyle, untagged)
    await scenePromptsStage.run(await buildCreateVideoContext(base, 'fixture'))
    assert.equal(mixLogs(events).length, 0)
    for (const item of await readScenes(paths)) {
      assert.ok(item.imagePrompt)
      assert.equal('treatment' in item, false)
    }
    t.mock.restoreAll()
  }
})
```

- [ ] **Paso 2: correr y ver que falla**

Run: `node --test scripts/test/check-gem-treatment-tags.mjs`
Expected: FAIL al cargar: `ERR_MODULE_NOT_FOUND` de `pipeline/stages/scene-prompts/verbatim/treatments.ts` (con el archivo creado, `does not provide an export named 'readTreatmentTag'` hasta el Paso 3).

- [ ] **Paso 3: leer y quitar la etiqueta**

En `pipeline/stages/scene-prompts/verbatim/parser.ts`:

Edición 1 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
// PARSEO de la respuesta del carril verbatim. Port de
// `motor-web/verbatim/parseo.ts` del origen — funciones PURAS sobre texto,
// testeables sin gastar un crédito.
```

por:

<!-- prettier-ignore -->
```ts
import { SCENE_TREATMENTS, type SceneTreatment } from '../../../types/scenes.ts'

// PARSEO de la respuesta del carril verbatim. Port de
// `motor-web/verbatim/parseo.ts` del origen — funciones PURAS sobre texto,
// testeables sin gastar un crédito.
```

Edición 2 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
}

/**
 * Pela un marcador `((n))` que haya quedado al FRENTE de un texto (defensivo:
 * un modelo que numeró «a medias» no puede mandar el marcador al generador
 * como ruido).
```

por:

<!-- prettier-ignore -->
```ts
}

/**
 * La etiqueta de tratamiento que `TREATMENT_TAG_RULE` pide a una gema de
 * plantilla con dinamismo (ADR-0041): `[T:<tratamiento>]` al frente del
 * prompt, después del id `((n))`. Hay que quitarla ANTES de mirar defectos:
 * por su mayúscula, el guard de huecos (E33) la leería como una ranura de
 * plantilla sin rellenar.
 */
const TREATMENT_TAG_REGEX = /^\[\s*T\s*:\s*([^\]\n]{0,40})\]\s*/i

export interface TreatmentTagReading {
  /** El prompt sin la etiqueta. */
  text: string
  /** Solo si la etiqueta nombra un tratamiento del catálogo. */
  treatment?: SceneTreatment
}

/**
 * Lee y QUITA la etiqueta del frente del prompt. Una etiqueta inválida se
 * quita igual y la escena queda sin tratamiento; sin etiqueta, el texto va
 * tal cual. En ningún caso el prompt deja de valer ni se re-pide (spec §5.3).
 */
export function readTreatmentTag(prompt: string): TreatmentTagReading {
  const match = TREATMENT_TAG_REGEX.exec(prompt)
  if (!match) return { text: prompt }
  const text = prompt.slice(match[0].length).trim()
  const value = match[1].trim().toLowerCase()
  const treatment = SCENE_TREATMENTS.find((candidate) => candidate === value)
  return treatment ? { text, treatment } : { text }
}

/**
 * Pela un marcador `((n))` que haya quedado al FRENTE de un texto (defensivo:
 * un modelo que numeró «a medias» no puede mandar el marcador al generador
 * como ruido).
```

- [ ] **Paso 4: la lectura del lote y el tratamiento en el writer**

En `pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts`:

Edición 1 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
  type VerbatimMessage,
} from '../../../providers/llm/verbatim-client.ts'
import type { LlmModelProfile } from '../../../types/llm-models.ts'
import type { GemSections } from '../../../types/styles.ts'
import type { StyleProtagonist } from '../../../types/video-project.ts'
import { isInsufficientCreditsFailure } from '../../../utils/insufficient-credits.ts'
```

por:

<!-- prettier-ignore -->
```ts
  type VerbatimMessage,
} from '../../../providers/llm/verbatim-client.ts'
import type { LlmModelProfile } from '../../../types/llm-models.ts'
import type { SceneTreatment } from '../../../types/scenes.ts'
import type { GemSections } from '../../../types/styles.ts'
import type { StyleProtagonist } from '../../../types/video-project.ts'
import { isInsufficientCreditsFailure } from '../../../utils/insufficient-credits.ts'
```

Edición 2 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
  LIMIT_PROTOCOL_REGEX,
  localSceneDefect,
  readIdMarkers,
  responseContamination,
  restoreStyleTail,
  splitPrompts,
```

por:

<!-- prettier-ignore -->
```ts
  LIMIT_PROTOCOL_REGEX,
  localSceneDefect,
  readIdMarkers,
  readTreatmentTag,
  responseContamination,
  restoreStyleTail,
  splitPrompts,
```

Edición 3 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
  trimEmbeddedCharacterSheet,
  unwrapJsonPrompts,
  validateCharacterPrompt,
} from './parser.ts'
import {
  capWovenIdentity,
```

por:

<!-- prettier-ignore -->
```ts
  trimEmbeddedCharacterSheet,
  unwrapJsonPrompts,
  validateCharacterPrompt,
  type TreatmentTagReading,
} from './parser.ts'
import {
  capWovenIdentity,
```

Edición 4 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
export interface VerbatimBatchPrompts {
  prompts: ReadonlyMap<number, string>
  scenesWithSubject: readonly number[]
}

export interface VerbatimWriterOptions {
```

por:

<!-- prettier-ignore -->
```ts
export interface VerbatimBatchPrompts {
  prompts: ReadonlyMap<number, string>
  scenesWithSubject: readonly number[]
  /** El tratamiento que declaró la etiqueta `[T:…]` de cada escena que la
   *  trajo válida (gema de plantilla con dinamismo). */
  treatments: ReadonlyMap<number, SceneTreatment>
}

export interface VerbatimWriterOptions {
```

Edición 5 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
   * dato que decide qué escenas llevan la foto de referencia adjunta.
   */
  scenesWithSubject: number[]
  profile: LlmModelProfile
  inputTokens: number
  outputTokens: number
```

por:

<!-- prettier-ignore -->
```ts
   * dato que decide qué escenas llevan la foto de referencia adjunta.
   */
  scenesWithSubject: number[]
  /** Tratamiento por escena, de las etiquetas `[T:…]` válidas. */
  treatments: Map<number, SceneTreatment>
  profile: LlmModelProfile
  inputTokens: number
  outputTokens: number
```

Edición 6 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
 * demás se COSECHAN.
 */
export interface BatchReading {
  good: { n: number; prompt: string }[]
  defective: { n: number; reason: string }[]
  /** Prompts sobrantes descartados del final, textuales: el log dice QUÉ se
   *  tiró y no solo cuántos. */
```

por:

<!-- prettier-ignore -->
```ts
 * demás se COSECHAN.
 */
export interface BatchReading {
  good: { n: number; prompt: string; treatment?: SceneTreatment }[]
  defective: { n: number; reason: string }[]
  /** Prompts sobrantes descartados del final, textuales: el log dice QUÉ se
   *  tiró y no solo cuántos. */
```

Edición 7 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
 * vuelve con la misma ficha (un video real quemó las 3 rondas). El recorte se
 * re-valida ENTERO: un hueco E33 no se cura cortando.
 */
function classifyScene(n: number, prompt: string, target: BatchReading): void {
  const defect = localSceneDefect(prompt)
  if (!defect) {
    target.good.push({ n, prompt })
    return
  }
  const trimmedPrompt = trimEmbeddedCharacterSheet(prompt)
```

por:

<!-- prettier-ignore -->
```ts
 * vuelve con la misma ficha (un video real quemó las 3 rondas). El recorte se
 * re-valida ENTERO: un hueco E33 no se cura cortando.
 */
function classifyScene(
  n: number,
  prompt: string,
  target: BatchReading,
  treatment?: SceneTreatment,
): void {
  const tagged = treatment ? { treatment } : {}
  const defect = localSceneDefect(prompt)
  if (!defect) {
    target.good.push({ n, prompt, ...tagged })
    return
  }
  const trimmedPrompt = trimEmbeddedCharacterSheet(prompt)
```

Edición 8 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
    trimmedPrompt !== undefined &&
    localSceneDefect(trimmedPrompt) === undefined
  ) {
    target.good.push({ n, prompt: trimmedPrompt })
    target.repaired.push({ n, removed: whatWasRemoved(prompt, trimmedPrompt) })
    return
  }
```

por:

<!-- prettier-ignore -->
```ts
    trimmedPrompt !== undefined &&
    localSceneDefect(trimmedPrompt) === undefined
  ) {
    target.good.push({ n, prompt: trimmedPrompt, ...tagged })
    target.repaired.push({ n, removed: whatWasRemoved(prompt, trimmedPrompt) })
    return
  }
```

Edición 9 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
  return new Error(message)
}

export function readBatchPrompts(
  raw: string,
  batch: readonly VerbatimFragment[],
): BatchReading {
  const clean = stripReasoning(raw)
  const block = extractCodeBlock(clean)
  // RED DE DES-ENVOLTURA (v1.29.0): si la respuesta vino en JSON (una gema
```

por:

<!-- prettier-ignore -->
```ts
  return new Error(message)
}

export interface BatchReadingOptions {
  /** La gema de plantilla tiene dinamismo: cada prompt puede abrir con la
   *  etiqueta `[T:<tratamiento>]`, que se lee y se quita (ADR-0041). Ausente
   *  = la lectura de siempre, byte por byte. */
  treatmentTags?: boolean
}

export function readBatchPrompts(
  raw: string,
  batch: readonly VerbatimFragment[],
  options: BatchReadingOptions = {},
): BatchReading {
  const tagged = (text: string): TreatmentTagReading =>
    options.treatmentTags ? readTreatmentTag(text) : { text }
  const clean = stripReasoning(raw)
  const block = extractCodeBlock(clean)
  // RED DE DES-ENVOLTURA (v1.29.0): si la respuesta vino en JSON (una gema
```

Edición 10 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
      fromJson
        .map((item) => ({
          n: item.n as number,
          text: stripIdMarker(item.text),
        }))
        .filter((item) => item.text.length > 0),
      batch,
```

por:

<!-- prettier-ignore -->
```ts
      fromJson
        .map((item) => ({
          n: item.n as number,
          ...tagged(stripIdMarker(item.text)),
        }))
        .filter((item) => item.text.length > 0),
      batch,
```

Edición 11 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
  // correspondencia es por ID y el conteo deja de ser un juicio de vida o
  // muerte. Sin marcadores completos, el camino por ORDEN de siempre.
  const byId = readIdMarkers(pieces)
  if (byId) return readById(byId, batch)

  const texts = pieces.map(stripIdMarker)

  // El recorte del entusiasmo tiene TOPE: +1/+2 es lo medido. Muchos más ya
  // no es entusiasmo: es el modelo re-haciendo el video entero, y ahí el
```

por:

<!-- prettier-ignore -->
```ts
  // correspondencia es por ID y el conteo deja de ser un juicio de vida o
  // muerte. Sin marcadores completos, el camino por ORDEN de siempre.
  const byId = readIdMarkers(pieces)
  if (byId)
    return readById(
      byId
        .map((entry) => ({ n: entry.n, ...tagged(entry.text) }))
        // Un trozo que era solo el id y la etiqueta queda vacío: falta.
        .filter((entry) => entry.text.length > 0),
      batch,
    )

  const readings = pieces.map((piece) => tagged(stripIdMarker(piece)))
  const texts = readings.map((reading) => reading.text)

  // El recorte del entusiasmo tiene TOPE: +1/+2 es lo medido. Muchos más ya
  // no es entusiasmo: es el modelo re-haciendo el video entero, y ahí el
```

Edición 12 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
      )
    const contamination = responseContamination(prompt)
    if (contamination) throw contaminationFailure(fragment.n, contamination)
    classifyScene(fragment.n, prompt, reading)
  })
  reading.styleRestored = restoreStyleTail(reading.good)
  return reading
```

por:

<!-- prettier-ignore -->
```ts
      )
    const contamination = responseContamination(prompt)
    if (contamination) throw contaminationFailure(fragment.n, contamination)
    classifyScene(fragment.n, prompt, reading, readings[index]?.treatment)
  })
  reading.styleRestored = restoreStyleTail(reading.good)
  return reading
```

Edición 13 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
 * contaminación en CUALQUIER trozo → condena al lote entero.
 */
function readById(
  byId: readonly { n: number; text: string }[],
  batch: readonly VerbatimFragment[],
): BatchReading {
  for (const { n, text } of byId) {
```

por:

<!-- prettier-ignore -->
```ts
 * contaminación en CUALQUIER trozo → condena al lote entero.
 */
function readById(
  byId: readonly { n: number; text: string; treatment?: SceneTreatment }[],
  batch: readonly VerbatimFragment[],
): BatchReading {
  for (const { n, text } of byId) {
```

Edición 14 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
  const trimmed: string[] = []
  const batchIds = new Set(batch.map((fragment) => fragment.n))
  const byNumber = new Map<number, string>()
  for (const { n, text } of byId) {
    if (!batchIds.has(n)) {
      trimmed.push(`((${n})) outside the batch: ${text}`)
    } else if (byNumber.has(n)) {
      trimmed.push(`((${n})) duplicated: ${text}`)
    } else {
      byNumber.set(n, text)
    }
  }
```

por:

<!-- prettier-ignore -->
```ts
  const trimmed: string[] = []
  const batchIds = new Set(batch.map((fragment) => fragment.n))
  const byNumber = new Map<number, string>()
  const treatments = new Map<number, SceneTreatment>()
  for (const { n, text, treatment } of byId) {
    if (!batchIds.has(n)) {
      trimmed.push(`((${n})) outside the batch: ${text}`)
    } else if (byNumber.has(n)) {
      trimmed.push(`((${n})) duplicated: ${text}`)
    } else {
      byNumber.set(n, text)
      if (treatment) treatments.set(n, treatment)
    }
  }
```

Edición 15 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
      })
      continue
    }
    classifyScene(fragment.n, prompt, reading)
  }
  reading.styleRestored = restoreStyleTail(reading.good)
  return reading
```

por:

<!-- prettier-ignore -->
```ts
      })
      continue
    }
    classifyScene(fragment.n, prompt, reading, treatments.get(fragment.n))
  }
  reading.styleRestored = restoreStyleTail(reading.good)
  return reading
```

Edición 16 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
  // los lotes caen con llm_network y no hay a quién culpar.
  let chosenModelBlamed = false
  const obtained = new Map<number, string>()
  let lastError = ''

  // Progreso REAL: cada lote informa cuántos prompts lleva escritos y acá se
```

por:

<!-- prettier-ignore -->
```ts
  // los lotes caen con llm_network y no hay a quién culpar.
  let chosenModelBlamed = false
  const obtained = new Map<number, string>()
  // El tratamiento de cada escena cosechada, si su etiqueta era válida.
  const treatments = new Map<number, SceneTreatment>()
  const treatmentTags = Boolean(options.sections?.dynamism?.trim())
  let lastError = ''

  // Progreso REAL: cada lote informa cuántos prompts lleva escritos y acá se
```

Edición 17 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
            : undefined,
        })
        count(response.inputTokens, response.outputTokens)
        const reading = readBatchPrompts(response.content, batch)
        if (options.validatePrompt) {
          reading.good = reading.good.filter((entry) => {
            if (options.validatePrompt!(entry.prompt, entry.n)) return true
```

por:

<!-- prettier-ignore -->
```ts
            : undefined,
        })
        count(response.inputTokens, response.outputTokens)
        const reading = readBatchPrompts(response.content, batch, {
          treatmentTags,
        })
        if (options.validatePrompt) {
          reading.good = reading.good.filter((entry) => {
            if (options.validatePrompt!(entry.prompt, entry.n)) return true
```

Edición 18 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
          for (const entry of reading.good) {
            if (obtained.has(entry.n)) continue
            obtained.set(entry.n, entry.prompt)
            justObtained.add(entry.n)
          }
          // Trazabilidad del recorte: QUÉ se descartó, no solo cuántos.
```

por:

<!-- prettier-ignore -->
```ts
          for (const entry of reading.good) {
            if (obtained.has(entry.n)) continue
            obtained.set(entry.n, entry.prompt)
            if (entry.treatment) treatments.set(entry.n, entry.treatment)
            justObtained.add(entry.n)
          }
          // Trazabilidad del recorte: QUÉ se descartó, no solo cuántos.
```

Edición 19 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
              await options.onBatchReady({
                prompts: ready.prompts,
                scenesWithSubject: ready.scenesWithSubject,
              })
            } catch (error) {
              // Un problema de disco NO es un fallo del modelo: si esto cayera
```

por:

<!-- prettier-ignore -->
```ts
              await options.onBatchReady({
                prompts: ready.prompts,
                scenesWithSubject: ready.scenesWithSubject,
                treatments,
              })
            } catch (error) {
              // Un problema de disco NO es un fallo del modelo: si esto cayera
```

Edición 20 de 20 — reemplazar:

<!-- prettier-ignore -->
```ts
    prompts,
    missing,
    scenesWithSubject,
    profile,
    inputTokens,
    outputTokens,
```

por:

<!-- prettier-ignore -->
```ts
    prompts,
    missing,
    scenesWithSubject,
    treatments,
    profile,
    inputTokens,
    outputTokens,
```

- [ ] **Paso 5: el tratamiento de la escena y el texto del reparto**

Crear `pipeline/stages/scene-prompts/verbatim/treatments.ts`:

<!-- prettier-ignore -->
```ts
import {
  SCENE_TREATMENTS,
  type Scene,
  type SceneTreatment,
} from '../../../types/scenes.ts'

// El TRATAMIENTO de las escenas de una gema de plantilla con dinamismo
// (ADR-0041, spec §5.3): lo declara la etiqueta `[T:…]` de cada prompt y se
// guarda en `scene.treatment` para medir el reparto del video. Solo
// diagnóstico: no hay verificación por código (decisión F6).

/**
 * La escena con el tratamiento de su prompt NUEVO. Sin tratamiento se borra
 * el que hubiera (era de un prompt anterior); una escena que nunca tuvo queda
 * idéntica, así las gemas viejas no ven este campo.
 */
export function withTreatment(
  scene: Scene,
  treatment: SceneTreatment | undefined,
): Scene {
  if (treatment) return { ...scene, treatment }
  if (scene.treatment === undefined) return scene
  const next = { ...scene }
  delete next.treatment
  return next
}

/**
 * El reparto de las escenas escritas en esta pasada, para el log del cierre
 * de la fase: cuántas de cada tratamiento, cuántas sin etiqueta válida y el
 * porcentaje que nombró al protagonista.
 */
export function describeTreatmentMix(
  scenes: readonly Scene[],
  written: ReadonlySet<number>,
  scenesWithSubject: readonly number[],
): string {
  const writtenScenes = scenes.filter((scene) => written.has(scene.id))
  const total = writtenScenes.length
  const counts = SCENE_TREATMENTS.map((treatment): [string, number] => [
    treatment,
    writtenScenes.filter((scene) => scene.treatment === treatment).length,
  ]).filter(([, count]) => count > 0)
  const untagged = writtenScenes.filter((scene) => !scene.treatment).length
  if (untagged > 0) counts.push(['untagged', untagged])

  const withSubject = new Set(scenesWithSubject.filter((id) => written.has(id)))
    .size
  const percent = total > 0 ? Math.round((withSubject / total) * 100) : 0
  const mix = counts.map(([name, count]) => `${name} ${count}`).join(', ')
  return `treatment mix of the ${total} written scene(s): ${mix || 'none'} — protagonist in ${percent}% (${withSubject} of ${total})`
}
```

- [ ] **Paso 6: el lane lleva el tratamiento a cada escena**

En `pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts`:

Edición 1 de 8 — reemplazar:

<!-- prettier-ignore -->
```ts
} from '../../../project/characters.ts'
import { PipelineFailure } from '../../../runner/failure.ts'
import type { LlmModelProfile } from '../../../types/llm-models.ts'
import type { Scene } from '../../../types/scenes.ts'
import type { StyleCharacter } from '../../../types/styles.ts'
import type {
  ProjectCharacter,
```

por:

<!-- prettier-ignore -->
```ts
} from '../../../project/characters.ts'
import { PipelineFailure } from '../../../runner/failure.ts'
import type { LlmModelProfile } from '../../../types/llm-models.ts'
import type { Scene, SceneTreatment } from '../../../types/scenes.ts'
import type { StyleCharacter } from '../../../types/styles.ts'
import type {
  ProjectCharacter,
```

Edición 2 de 8 — reemplazar:

<!-- prettier-ignore -->
```ts
  protagonistFromSection,
  recoverProtagonistFromScenes,
} from './subject-weaver.ts'

// El PUENTE entre las stages y el motor verbatim (port de
// `motor-web/puente/fase_prompts.ts` del origen, sin el carril Storytime):
```

por:

<!-- prettier-ignore -->
```ts
  protagonistFromSection,
  recoverProtagonistFromScenes,
} from './subject-weaver.ts'
import { withTreatment } from './treatments.ts'

// El PUENTE entre las stages y el motor verbatim (port de
// `motor-web/puente/fase_prompts.ts` del origen, sin el carril Storytime):
```

Edición 3 de 8 — reemplazar:

<!-- prettier-ignore -->
```ts
  missing: number[]
  /** Ids de escena que este pase ESCRIBIÓ (para persistir/emitir solo esas). */
  written: Set<number>
  /** El modelo que escribió de verdad (tras la degradación, si la hubo) y lo
   *  que movió: el llamador lo persiste como auditoría en project.json. */
  profile: LlmModelProfile
```

por:

<!-- prettier-ignore -->
```ts
  missing: number[]
  /** Ids de escena que este pase ESCRIBIÓ (para persistir/emitir solo esas). */
  written: Set<number>
  /** Ids de las escritas en este pase que nombraron al protagonista (el
   *  reparto del log de una gema con dinamismo). */
  scenesWithSubject: number[]
  /** El modelo que escribió de verdad (tras la degradación, si la hubo) y lo
   *  que movió: el llamador lo persiste como auditoría en project.json. */
  profile: LlmModelProfile
```

Edición 4 de 8 — reemplazar:

<!-- prettier-ignore -->
```ts
  imagePrompt: string
  /** Ausente = el proyecto no trae personaje que indexar: no tocar el campo. */
  charactersPresent?: number[]
}

export interface VerbatimLaneOptions {
```

por:

<!-- prettier-ignore -->
```ts
  imagePrompt: string
  /** Ausente = el proyecto no trae personaje que indexar: no tocar el campo. */
  charactersPresent?: number[]
  /** El tratamiento que declaró su etiqueta `[T:…]` (gema con dinamismo). */
  treatment?: SceneTreatment
}

export interface VerbatimLaneOptions {
```

Edición 5 de 8 — reemplazar:

<!-- prettier-ignore -->
```ts
      scenes,
      missing: [],
      written: new Set(),
      profile: resolveVerbatimModel(context.options.promptModel).profile,
      inputTokens: 0,
      outputTokens: 0,
```

por:

<!-- prettier-ignore -->
```ts
      scenes,
      missing: [],
      written: new Set(),
      scenesWithSubject: [],
      profile: resolveVerbatimModel(context.options.promptModel).profile,
      inputTokens: 0,
      outputTokens: 0,
```

Edición 6 de 8 — reemplazar:

<!-- prettier-ignore -->
```ts
                character.index,
                carriers.has(id),
              )
              written.push({
                id,
                imagePrompt,
                ...(charactersPresent === undefined
                  ? {}
                  : { charactersPresent }),
              })
            }
            if (written.length === 0) return
```

por:

<!-- prettier-ignore -->
```ts
                character.index,
                carriers.has(id),
              )
              const treatment = batch.treatments.get(id)
              written.push({
                id,
                imagePrompt,
                ...(charactersPresent === undefined
                  ? {}
                  : { charactersPresent }),
                ...(treatment ? { treatment } : {}),
              })
            }
            if (written.length === 0) return
```

Edición 7 de 8 — reemplazar:

<!-- prettier-ignore -->
```ts
    }),
  )

  const written = new Set(prompts.keys())
  const withPrompts = scenes.map((scene) => {
    const prompt = prompts.get(scene.id)
    // Un prompt del motor nunca es fallback: si la escena traía uno, deja de
    // serlo.
    return prompt
      ? {
          ...scene,
          imagePrompt: prompt,
          promptIsFallback: false,
          ...(presence.has(scene.id)
            ? { charactersPresent: presence.get(scene.id)! }
            : {}),
        }
      : scene
  })

  return {
```

por:

<!-- prettier-ignore -->
```ts
    }),
  )

  const treatments = new Map(
    results.flatMap(({ result }) => [...result.treatments]),
  )
  const scenesWithSubject = results.flatMap(
    ({ result }) => result.scenesWithSubject,
  )

  const written = new Set(prompts.keys())
  const withPrompts = scenes.map((scene) => {
    const prompt = prompts.get(scene.id)
    if (!prompt) return scene
    // Un prompt del motor nunca es fallback: si la escena traía uno, deja de
    // serlo. Su tratamiento es el del prompt nuevo.
    return withTreatment(
      {
        ...scene,
        imagePrompt: prompt,
        promptIsFallback: false,
        ...(presence.has(scene.id)
          ? { charactersPresent: presence.get(scene.id)! }
          : {}),
      },
      treatments.get(scene.id),
    )
  })

  return {
```

Edición 8 de 8 — reemplazar:

<!-- prettier-ignore -->
```ts
      : markSubjectPresence(
          withPrompts,
          written,
          results.flatMap(({ result }) => result.scenesWithSubject),
          character.index,
        ),
    missing: results.flatMap(({ result }) => result.missing),
    written,
    profile: results[0]!.result.profile,
    inputTokens: results.reduce(
      (total, { result }) => total + result.inputTokens,
```

por:

<!-- prettier-ignore -->
```ts
      : markSubjectPresence(
          withPrompts,
          written,
          scenesWithSubject,
          character.index,
        ),
    missing: results.flatMap(({ result }) => result.missing),
    written,
    scenesWithSubject,
    profile: results[0]!.result.profile,
    inputTokens: results.reduce(
      (total, { result }) => total + result.inputTokens,
```

- [ ] **Paso 7: la persistencia por lote guarda el tratamiento**

En `pipeline/stages/scene-prompts/verbatim/verbatim-persistence.ts`:

Edición 1 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
import type { Scene } from '../../../types/scenes.ts'
import type { CreateVideoContext } from '../../context.ts'
import type { VerbatimScenePrompt } from './verbatim-lane.ts'

/**
 * Persistencia incremental del carril verbatim: escribe `scenes.json` cada vez
```

por:

<!-- prettier-ignore -->
```ts
import type { Scene } from '../../../types/scenes.ts'
import type { CreateVideoContext } from '../../context.ts'
import type { VerbatimScenePrompt } from './verbatim-lane.ts'
import { withTreatment } from './treatments.ts'

/**
 * Persistencia incremental del carril verbatim: escribe `scenes.json` cada vez
```

Edición 2 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
  const apply = (prompt: VerbatimScenePrompt) => {
    const index = buffer.findIndex((scene) => scene.id === prompt.id)
    if (index < 0) return
    buffer[index] = {
      ...buffer[index]!,
      imagePrompt: prompt.imagePrompt,
      // Un prompt del motor nunca es relleno: si la escena traía uno, deja de serlo.
      promptIsFallback: false,
      ...(prompt.charactersPresent === undefined
        ? {}
        : { charactersPresent: prompt.charactersPresent }),
    }
  }

  return {
```

por:

<!-- prettier-ignore -->
```ts
  const apply = (prompt: VerbatimScenePrompt) => {
    const index = buffer.findIndex((scene) => scene.id === prompt.id)
    if (index < 0) return
    buffer[index] = withTreatment(
      {
        ...buffer[index]!,
        imagePrompt: prompt.imagePrompt,
        // Un prompt del motor nunca es relleno: si la escena traía uno, deja de serlo.
        promptIsFallback: false,
        ...(prompt.charactersPresent === undefined
          ? {}
          : { charactersPresent: prompt.charactersPresent }),
      },
      prompt.treatment,
    )
  }

  return {
```

- [ ] **Paso 8: el log del reparto al cerrar la fase**

En `pipeline/stages/scene-prompts/scene-prompts.ts`:

Edición 1 de 3 — reemplazar:

<!-- prettier-ignore -->
```ts
  runVerbatimLane,
} from './verbatim/verbatim-lane.ts'
import { createVerbatimPromptPersistence } from './verbatim/verbatim-persistence.ts'
import { guaranteePrompts } from './prompt-writer.ts'
import { directScenes, scenesNeedPlan } from './scene-director.ts'
import { loadOrGenerateVisualBible } from '../shared/visual-bible.ts'
```

por:

<!-- prettier-ignore -->
```ts
  runVerbatimLane,
} from './verbatim/verbatim-lane.ts'
import { createVerbatimPromptPersistence } from './verbatim/verbatim-persistence.ts'
import { describeTreatmentMix } from './verbatim/treatments.ts'
import { guaranteePrompts } from './prompt-writer.ts'
import { directScenes, scenesNeedPlan } from './scene-director.ts'
import { loadOrGenerateVisualBible } from '../shared/visual-bible.ts'
```

Edición 2 de 3 — reemplazar:

<!-- prettier-ignore -->
```ts
    // (paridad con el origen — el estilo trae el ritmo, el guion completo es
    // el contexto, y la presencia del sujeto la informa el propio motor). El
    // carril de la casa queda byte-idéntico más abajo.
    if (context.options.customStyle) {
      // Los prompts se van a disco LOTE A LOTE: si el job muere a mitad —o la
      // UI lo cancela porque el modelo da errores (ADR-0028)— lo ya pagado
      // queda escrito y el reintento solo pide lo que falta. Antes se perdía
```

por:

<!-- prettier-ignore -->
```ts
    // (paridad con el origen — el estilo trae el ritmo, el guion completo es
    // el contexto, y la presencia del sujeto la informa el propio motor). El
    // carril de la casa queda byte-idéntico más abajo.
    const customStyle = context.options.customStyle
    if (customStyle) {
      // Los prompts se van a disco LOTE A LOTE: si el job muere a mitad —o la
      // UI lo cancela porque el modelo da errores (ADR-0028)— lo ya pagado
      // queda escrito y el reintento solo pide lo que falta. Antes se perdía
```

Edición 3 de 3 — reemplazar:

<!-- prettier-ignore -->
```ts
          type: 'log',
          level: 'warn',
          message: `${lane.missing.length} scene(s) ended without a verbatim prompt: ${lane.missing.join(', ')}`,
        })
      return undefined
    }
```

por:

<!-- prettier-ignore -->
```ts
          type: 'log',
          level: 'warn',
          message: `${lane.missing.length} scene(s) ended without a verbatim prompt: ${lane.missing.join(', ')}`,
        })
      // El reparto de una gema con dinamismo (spec §5.3): solo diagnóstico,
      // con las claves que el log de soporte ya sube (type, level, message).
      if (customStyle.sections?.dynamism?.trim() && lane.written.size > 0)
        context.emitter.emit({
          type: 'log',
          level: 'info',
          message: describeTreatmentMix(
            lane.scenes,
            lane.written,
            lane.scenesWithSubject,
          ),
        })
      return undefined
    }
```

- [ ] **Paso 9: correr y ver que pasa**

Run: `node --test scripts/test/check-gem-treatment-tags.mjs`
Expected: `ℹ tests 9`, `ℹ pass 9`, `ℹ fail 0`.

Run: `node --test scripts/test/check-gem-*.mjs` y la batería del carril.
Expected: `ℹ pass 64` y `ℹ pass 111` (las huellas de A4 siguen iguales).

- [ ] **Paso 10: formato, lint y tipos**

Run: `pnpm exec prettier --write pipeline/stages/scene-prompts/verbatim/parser.ts pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts pipeline/stages/scene-prompts/verbatim/treatments.ts pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts pipeline/stages/scene-prompts/verbatim/verbatim-persistence.ts pipeline/stages/scene-prompts/scene-prompts.ts scripts/test/check-gem-treatment-tags.mjs`
Expected: todos `(unchanged)`.

Run: `pnpm exec eslint pipeline/stages/scene-prompts scripts/test/check-gem-treatment-tags.mjs && pnpm exec tsc -p tsconfig.pipeline.json --noEmit`
Expected: sin salida.

- [ ] **Paso 11: Commit (orquestador)**

```bash
git add pipeline/stages/scene-prompts/verbatim/parser.ts pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts pipeline/stages/scene-prompts/verbatim/treatments.ts pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts pipeline/stages/scene-prompts/verbatim/verbatim-persistence.ts pipeline/stages/scene-prompts/scene-prompts.ts scripts/test/check-gem-treatment-tags.mjs
git commit -F- <<'EOF'
feat: read treatment tags from template gem prompts

Qué: con una gema de plantilla con dinamismo, el parser lee y quita la
etiqueta [T:<tratamiento>] después del id ((n)) antes de buscar defectos; un
tratamiento válido llega a scene.treatment (lote a lote y al cierre) y uno
inválido o ausente deja el prompt válido, sin reintento. Un prompt nuevo sin
tratamiento borra el viejo de su escena. Al cerrar scene-prompts, un log cuenta
el reparto de las escenas escritas y el porcentaje con protagonista
(treatments.ts).

Por qué: spec §5.3 y decisión F6: medir el reparto del dinamismo sin
verificarlo por código hasta que la QA lo pida.

Con qué interactúa: sin dinamismo, o con una gema vieja, la lectura del lote es
la de siempre (las huellas de check-gem-verbatim-lane no cambian). El log usa
type, level y message, ya permitidos en ALLOWED_EVENT_KEYS del log de
diagnóstico (ADR-0038): Rust no cambia. Guard nuevo: check-gem-treatment-tags.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Tarea A6 · Inicio y final fijos

Después de tejer `[subject]`, el prompt final de una gema de plantilla es
`promptStart + ' ' + escena tejida + ' ' + promptEnd` (una copia de las frases que el modelo haya
escrito igual se quita antes de tejer). Con `promptEnd` no corre `restoreStyleTail`: el cierre ya es
determinístico. El recorte final (`sanitizeFinalPrompt` → `fitBody`) recibe las frases y, si el
prompt no entra, cede primero el núcleo de la escena (hasta su piso de 300), después `promptEnd` y la
identidad al final; `promptStart` no se corta nunca. Como el spec §4.1 define las frases para «cada
prompt de imagen», el fallback determinístico (Capa 4) de una gema de plantilla también las lleva.

**Files:**

- Modify: `pipeline/prompts/template-frame.ts`
- Modify: `pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts`
- Modify: `pipeline/stages/shared/prompt-safety.ts`
- Modify: `pipeline/stages/images/images.ts`
- Test: `scripts/test/check-gem-fixed-phrases.mjs`

**Interfaces:**

- Consumes: `GemSections` (Tarea 0); `readBatchPrompts` y `BatchReadingOptions` (A5); `VerbatimWriterOptions.sections` (A4); `DESCRIPTION_HEADER_PREFIX`, `cutAtSentence`, `MIN_SCENE_CORE_CHARS` (existentes en `prompt-safety.ts`).
- Produces:
  - `template-frame.ts`: `type FixedPhrases = Pick<GemSections, 'promptStart' | 'promptEnd'>`; `stripFixedPhrases(scenePrompt: string, phrases: FixedPhrases): string`; `applyFixedPhrases(wovenPrompt: string, phrases: FixedPhrases): string`.
  - `verbatim-writer.ts`: `BatchReadingOptions.restoreTail?: boolean` (ausente = `true`); el writer lo apaga con `sections.promptEnd`.
  - `prompt-safety.ts`: `sanitizeFinalPrompt(prompt: string, eraContext?: FinalPromptEraContext, fixedPhrases?: FixedPhrases): string` (sin `fixedPhrases`, el recorte de siempre).

- [ ] **Paso 1: escribir el guard que falla**

Crear `scripts/test/check-gem-fixed-phrases.mjs`:

<!-- prettier-ignore -->
```js
// Inicio y final fijos de una gema de plantilla (spec §5.4): después de tejer
// `[subject]`, el código arma inicio + escena + final; con final fijo no corre
// la cola de estilo restaurada; el recorte final cede primero el núcleo de la
// escena, después el final fijo y la identidad al último, y nunca corta el
// inicio. Las frases viajan tal cual aunque estén en otro idioma. También el
// fallback de imágenes las lleva.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'
import { writeScenes } from '../../pipeline/project/scenes-file.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { imagesStage } from '../../pipeline/stages/images/images.ts'
import {
  applyFixedPhrases,
  stripFixedPhrases,
} from '../../pipeline/prompts/template-frame.ts'
import { DESCRIPTION_HEADER } from '../../pipeline/prompts/verbatim-identity.ts'
import { MAX_PROMPT_CHARS } from '../../pipeline/prompts/prompt-limits.ts'
import { sanitizeFinalPrompt } from '../../pipeline/stages/shared/prompt-safety.ts'
import { protagonistFromSection } from '../../pipeline/stages/scene-prompts/verbatim/subject-weaver.ts'
import {
  generateVerbatimPrompts,
  readBatchPrompts,
} from '../../pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts'

const promptStart = 'A simple stickman doll drawing with a round white head:'
const promptEnd =
  'Clean black lines, colorful softly shaded background, no text.'
const phrases = { promptStart, promptEnd }
const sections = {
  visualStyle: 'Simple stickman drawings on colorful backgrounds.',
  ...phrases,
}
const fragments = [1, 2, 3, 4, 5].map((n) => ({ n, text: 'Fragment ' + n }))
const sharedTail =
  'Style: simple stickman drawing, colorful background with soft shading everywhere.'

function fakeClient(answer) {
  const requests = []
  return {
    requests,
    async call(request) {
      requests.push(request)
      const ids = [
        ...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm),
      ].map((match) => Number(match[1]))
      return {
        content: ids.map((id) => `((${id})) ${answer(id)}`).join('\n\n'),
        inputTokens: 1,
        outputTokens: 1,
      }
    },
  }
}
function write(answer, extra = {}) {
  return generateVerbatimPrompts(fragments, 'A short story.', {
    gem: 'unused',
    sections,
    client: fakeClient(answer),
    character: { mode: 'none' },
    ...extra,
  })
}

// ── Pegar y quitar ──

test('the phrases wrap the woven scene, and a copy the model wrote is dropped', () => {
  assert.equal(
    applyFixedPhrases('  The girl runs. ', phrases),
    promptStart + ' The girl runs. ' + promptEnd,
  )
  assert.equal(applyFixedPhrases('The girl runs.', {}), 'The girl runs.')
  assert.equal(
    applyFixedPhrases('The girl runs.', { promptEnd }),
    'The girl runs. ' + promptEnd,
  )
  assert.equal(
    stripFixedPhrases(
      promptStart.toUpperCase() + ' The girl runs. ' + promptEnd.slice(0, -1),
      phrases,
    ),
    'The girl runs.',
  )
  assert.equal(stripFixedPhrases('The girl runs.', phrases), 'The girl runs.')
  assert.equal(
    stripFixedPhrases(promptEnd, phrases),
    promptEnd,
    'nada que salvar',
  )
})

test('every final prompt is start + woven scene + end, with no duplicated phrase', async () => {
  const result = await write((id) =>
    id === 1
      ? `${promptStart} A park with a red kite over the trees. ${promptEnd}`
      : `A park with a red kite over the trees, moment ${id}.`,
  )
  for (const [id, prompt] of result.prompts) {
    assert.ok(prompt.startsWith(promptStart + ' '), String(id))
    assert.ok(prompt.endsWith(' ' + promptEnd), String(id))
    assert.equal(prompt.split(promptStart).length, 2, 'un solo inicio')
    assert.equal(prompt.split(promptEnd).length, 2, 'un solo final')
  }
})

test('with a fixed end the style tail is not restored; without it, it is', async () => {
  // Cuatro de cinco cierran con la misma cola: la restauración se la
  // devolvería a la quinta.
  const answer = (id) =>
    id === 5
      ? 'A quiet street at dusk with a lone lamp post and wet cobblestones.'
      : `A quiet street at dusk, lamp number ${id} glowing warmly. ${sharedTail}`
  const batch = fragments.map((fragment) => ({ ...fragment }))
  const raw = batch
    .map((fragment) => `((${fragment.n})) ${answer(fragment.n)}`)
    .join('\n\n')
  assert.equal(readBatchPrompts(raw, batch).styleRestored.length, 1)
  assert.deepEqual(
    readBatchPrompts(raw, batch, { restoreTail: false }).styleRestored,
    [],
  )

  const withEnd = await write(answer)
  assert.ok(!withEnd.prompts.get(5).includes(sharedTail))
  const onlyStart = await write(answer, {
    sections: { visualStyle: sections.visualStyle, promptStart },
  })
  assert.ok(onlyStart.prompts.get(5).includes(sharedTail))
})

test('the phrases and the character section travel as written, even in Spanish', async () => {
  const spanishEnd = 'Acuarela suelta sobre papel rugoso, sin texto.'
  const spanishCharacter =
    'Una nena pelirroja con pecas y anteojos verdes. Outfit: un buzo verde y zapatillas blancas.'
  const result = await write(() => '[subject] flies a red kite in a park.', {
    sections: {
      visualStyle: sections.visualStyle,
      character: spanishCharacter,
      promptEnd: spanishEnd,
    },
    character: {
      mode: 'generic',
      designed: protagonistFromSection(spanishCharacter),
    },
  })
  assert.deepEqual(result.missing, [])
  for (const prompt of result.prompts.values()) {
    assert.ok(prompt.endsWith(' ' + spanishEnd))
    assert.ok(prompt.includes(DESCRIPTION_HEADER + ' ' + spanishCharacter))
  }
})

// ── El recorte final ──

const identity =
  'A stickman doll with a round white head, two black dot eyes and thin black line limbs. Outfit: white gloves and white rounded shoes.'
function longScene(sentences) {
  return Array.from(
    { length: sentences },
    (_, index) =>
      `The doll climbs step number ${index} of a long spiral staircase under a warm light.`,
  ).join(' ')
}

test('a long prompt keeps the start whole and cuts the scene core first', () => {
  const prompt = `${promptStart} ${longScene(40)} ${DESCRIPTION_HEADER} ${identity} ${promptEnd}`
  assert.ok(prompt.length > MAX_PROMPT_CHARS)
  const final = sanitizeFinalPrompt(prompt, undefined, phrases)
  assert.ok(final.length <= MAX_PROMPT_CHARS)
  assert.ok(final.startsWith(promptStart + ' The doll climbs step number 0'))
  assert.ok(final.includes(DESCRIPTION_HEADER + ' ' + identity))
  assert.ok(final.includes(promptEnd), 'el final fijo sigue entero')
  assert.ok(!final.includes('step number 39'), 'cedió el núcleo de la escena')
  assert.ok(final.includes('the narration is spoken, not written'))
})

test('when even the floor does not fit, the fixed end yields before the identity', () => {
  const hugeStart = 'S'.repeat(599) + ':'
  const hugeEnd = 'E '.repeat(299) + 'end.'
  const hugeIdentity =
    DESCRIPTION_HEADER +
    ' ' +
    Array.from(
      { length: 20 },
      (_, index) => `Trait number ${index} of the doll stays fixed.`,
    ).join(' ')
  const prompt = `${hugeStart} ${longScene(20)} ${hugeIdentity} ${hugeEnd}`
  const final = sanitizeFinalPrompt(prompt, undefined, {
    promptStart: hugeStart,
    promptEnd: hugeEnd,
  })
  assert.ok(final.length <= MAX_PROMPT_CHARS)
  assert.ok(final.startsWith(hugeStart), 'el inicio no se corta')
  assert.ok(final.includes(hugeIdentity), 'la identidad entera')
  assert.ok(!final.includes('end.'), 'el final fijo cedió')
})

test('without phrases the cut is the one of always', () => {
  const prompt = `${promptStart} ${longScene(40)} ${DESCRIPTION_HEADER} ${identity} ${promptEnd}`
  assert.equal(
    sanitizeFinalPrompt(prompt, undefined, undefined),
    sanitizeFinalPrompt(prompt),
  )
  const plain = 'A quiet harbor at dawn. '.repeat(200).trim()
  assert.equal(
    sanitizeFinalPrompt(plain, undefined, phrases),
    sanitizeFinalPrompt(plain),
  )
})

// ── La fase de imágenes ──

const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
test('the image fallback and the final request carry both phrases', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-phrases-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  await writeFile(
    paths.metadataFile,
    JSON.stringify({
      id: 'fixture',
      name: 'Fixture',
      options: {
        styleId: 'normal',
        imageProvider: 'fal',
        imageQuality: 'low',
        videoFormat: '16:9',
        customStyle: {
          styleId: 'st-template',
          name: 'Stickman',
          sections,
          templateVersion: 1,
          character: { mode: 'none' },
        },
      },
      state: 'draft',
      completedStages: [],
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    }),
  )
  await writeFile(paths.scriptFile, 'The doll flies a kite in the park.')
  // Sin prompt: la Capa 4 lo arma con el fallback determinístico.
  await writeScenes(paths, [
    {
      id: 1,
      text: 'The doll flies a kite in the park.',
      startSeconds: 0,
      endSeconds: 4,
    },
  ])
  const posts = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).startsWith('https://fal.run/')) {
      posts.push(JSON.parse(init.body).prompt)
      return Response.json({
        images: [{ url: 'https://fixture.invalid/image.png' }],
      })
    }
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  const context = await buildCreateVideoContext(
    {
      job: {
        jobId: 'fixture',
        projectsRoot: root,
        apiKeys: { fal: 'fixture' },
        binaryPaths: {},
      },
      config: resolvePipelineConfig(),
      signal: new AbortController().signal,
      emitter: { emit() {} },
    },
    'fixture',
  )
  await imagesStage.run(context)
  assert.equal(posts.length, 1)
  // El fallback trae su propia cláusula de texto: el final fijo va después
  // de todo el cuerpo y antes de la cláusula de anonimato.
  assert.ok(posts[0].startsWith(promptStart + ' Show the best single visual'))
  assert.ok(
    posts[0].indexOf(' ' + promptEnd) >
      posts[0].indexOf('Depict it faithfully'),
  )
})
```

- [ ] **Paso 2: correr y ver que falla**

Run: `node --test scripts/test/check-gem-fixed-phrases.mjs`
Expected: FAIL al cargar: `SyntaxError: The requested module '../../pipeline/prompts/template-frame.ts' does not provide an export named 'applyFixedPhrases'`.

- [ ] **Paso 3: pegar y quitar las frases**

En `pipeline/prompts/template-frame.ts` (se agrega al final del archivo):

Edición 1 de 1 — reemplazar:

<!-- prettier-ignore -->
```ts
    )
    .join('\n\n')
}
```

por:

<!-- prettier-ignore -->
```ts
    )
    .join('\n\n')
}

// ─── Inicio y final fijos (spec §5.4) ───

/** Las frases que Vimo pega por código a cada prompt de imagen (spec §4.1). */
export type FixedPhrases = Pick<GemSections, 'promptStart' | 'promptEnd'>

const TRAILING_PUNCTUATION_REGEX = /[\s.!?,;:]+$/

/**
 * El texto del modelo SIN una copia de las frases fijas: si igual las
 * escribió (la regla se lo prohíbe), el código no las duplica. Solo quita una
 * coincidencia exacta, sin distinguir mayúsculas, al frente o al final. Si no
 * quedara nada, devuelve el texto tal cual.
 */
export function stripFixedPhrases(
  scenePrompt: string,
  phrases: FixedPhrases,
): string {
  let text = scenePrompt.trim()
  const start = phrases.promptStart?.trim()
  if (start && text.toLowerCase().startsWith(start.toLowerCase()))
    text = text.slice(start.length).trim()

  const end = phrases.promptEnd?.trim().replace(TRAILING_PUNCTUATION_REGEX, '')
  const body = text.replace(TRAILING_PUNCTUATION_REGEX, '')
  if (end && body.toLowerCase().endsWith(end.toLowerCase()))
    text = body
      .slice(0, body.length - end.length)
      .replace(/[\s,;:]+$/, '')
      .trim()
  return text || scenePrompt.trim()
}

/**
 * El prompt final de una gema de plantilla: el inicio fijo, la escena ya
 * tejida y el final fijo, separados por un espacio (spec §5.4). Sin frases,
 * la escena tal cual.
 */
export function applyFixedPhrases(
  wovenPrompt: string,
  phrases: FixedPhrases,
): string {
  return [
    phrases.promptStart?.trim(),
    wovenPrompt.trim(),
    phrases.promptEnd?.trim(),
  ]
    .filter((part) => part)
    .join(' ')
}
```

- [ ] **Paso 4: el prompt final del writer y la cola de estilo**

En `pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts`:

Edición 1 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
  PROTAGONIST_TOKENS_BUDGET,
} from '../../shared/protagonist-description.ts'
import { FINAL_PROMPT_BODY_BUDGET } from '../../shared/prompt-safety.ts'
import { buildTemplateSystem } from '../../../prompts/template-frame.ts'
import {
  buildAssistantCharacterTurn,
  buildCharacterDesignMessage,
```

por:

<!-- prettier-ignore -->
```ts
  PROTAGONIST_TOKENS_BUDGET,
} from '../../shared/protagonist-description.ts'
import { FINAL_PROMPT_BODY_BUDGET } from '../../shared/prompt-safety.ts'
import {
  applyFixedPhrases,
  buildTemplateSystem,
  stripFixedPhrases,
  type FixedPhrases,
} from '../../../prompts/template-frame.ts'
import {
  buildAssistantCharacterTurn,
  buildCharacterDesignMessage,
```

Edición 2 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
 * `obtained` completo porque su regla de continuidad mira la escena anterior
 * (la N hereda la ropa de la N-1 cuando se parecen). Acotar la cadena al lote
 * rompería esa herencia, que es justo lo que sostiene el vestuario por escena.
 */
function finalizeVerbatimPrompts(
  obtained: ReadonlyMap<number, string>,
  character: CharacterPlan,
  sceneWardrobe: boolean,
  only?: ReadonlySet<number>,
): FinalizedVerbatimPrompts {
  const prompts = new Map<number, string>()
```

por:

<!-- prettier-ignore -->
```ts
 * `obtained` completo porque su regla de continuidad mira la escena anterior
 * (la N hereda la ropa de la N-1 cuando se parecen). Acotar la cadena al lote
 * rompería esa herencia, que es justo lo que sostiene el vestuario por escena.
 *
 * Con las frases fijas de una gema de plantilla (spec §5.4), la copia que el
 * modelo haya escrito se quita antes de tejer y el inicio y el final se pegan
 * después: `promptStart + ' ' + escena tejida + ' ' + promptEnd`.
 */
function finalizeVerbatimPrompts(
  obtained: ReadonlyMap<number, string>,
  character: CharacterPlan,
  sceneWardrobe: boolean,
  phrases: FixedPhrases | undefined,
  only?: ReadonlySet<number>,
): FinalizedVerbatimPrompts {
  const prompts = new Map<number, string>()
```

Edición 3 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
  for (const [n, rawPrompt] of obtained) {
    if (only && !only.has(n)) continue
    const prompt = wardrobes?.scenes.get(n) ?? rawPrompt
    // Con FOTO, una escena también «trae al protagonista» si el modelo
    // escribió su NOMBRE directo en vez de la etiqueta (v1.27.0). Y en los
    // modos con DESCRIPCIÓN, también si lo mencionó de forma genérica sin
```

por:

<!-- prettier-ignore -->
```ts
  for (const [n, rawPrompt] of obtained) {
    if (only && !only.has(n)) continue
    const withoutMarkers = wardrobes?.scenes.get(n) ?? rawPrompt
    const prompt = phrases
      ? stripFixedPhrases(withoutMarkers, phrases)
      : withoutMarkers
    // Con FOTO, una escena también «trae al protagonista» si el modelo
    // escribió su NOMBRE directo en vez de la etiqueta (v1.27.0). Y en los
    // modos con DESCRIPCIÓN, también si lo mencionó de forma genérica sin
```

Edición 4 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
      if (character.mode === 'none') sneakedIn++
      if (isBare) bare++
    }
    const finalPrompt = composeFinalPrompt(
      prompt,
      character,
      wardrobes?.wardrobes.get(n),
    )
    if (finalPrompt.length > FINAL_PROMPT_BODY_BUDGET) overBudget.push(n)
    prompts.set(n, finalPrompt)
  }
```

por:

<!-- prettier-ignore -->
```ts
      if (character.mode === 'none') sneakedIn++
      if (isBare) bare++
    }
    const woven = composeFinalPrompt(
      prompt,
      character,
      wardrobes?.wardrobes.get(n),
    )
    const finalPrompt = phrases ? applyFixedPhrases(woven, phrases) : woven
    if (finalPrompt.length > FINAL_PROMPT_BODY_BUDGET) overBudget.push(n)
    prompts.set(n, finalPrompt)
  }
```

Edición 5 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
   *  etiqueta `[T:<tratamiento>]`, que se lee y se quita (ADR-0041). Ausente
   *  = la lectura de siempre, byte por byte. */
  treatmentTags?: boolean
}

export function readBatchPrompts(
```

por:

<!-- prettier-ignore -->
```ts
   *  etiqueta `[T:<tratamiento>]`, que se lee y se quita (ADR-0041). Ausente
   *  = la lectura de siempre, byte por byte. */
  treatmentTags?: boolean
  /** false = no devolverle la cola de estilo a quien la perdió: con final
   *  fijo (spec §5.4) el cierre ya lo pega el código. Ausente = true. */
  restoreTail?: boolean
}

export function readBatchPrompts(
```

Edición 6 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
): BatchReading {
  const tagged = (text: string): TreatmentTagReading =>
    options.treatmentTags ? readTreatmentTag(text) : { text }
  const clean = stripReasoning(raw)
  const block = extractCodeBlock(clean)
  // RED DE DES-ENVOLTURA (v1.29.0): si la respuesta vino en JSON (una gema
```

por:

<!-- prettier-ignore -->
```ts
): BatchReading {
  const tagged = (text: string): TreatmentTagReading =>
    options.treatmentTags ? readTreatmentTag(text) : { text }
  const restoreTail = options.restoreTail ?? true
  const clean = stripReasoning(raw)
  const block = extractCodeBlock(clean)
  // RED DE DES-ENVOLTURA (v1.29.0): si la respuesta vino en JSON (una gema
```

Edición 7 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
        }))
        .filter((item) => item.text.length > 0),
      batch,
    )
  }
  const pieces = fromJson
```

por:

<!-- prettier-ignore -->
```ts
        }))
        .filter((item) => item.text.length > 0),
      batch,
      restoreTail,
    )
  }
  const pieces = fromJson
```

Edición 8 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
        // Un trozo que era solo el id y la etiqueta queda vacío: falta.
        .filter((entry) => entry.text.length > 0),
      batch,
    )

  const readings = pieces.map((piece) => tagged(stripIdMarker(piece)))
```

por:

<!-- prettier-ignore -->
```ts
        // Un trozo que era solo el id y la etiqueta queda vacío: falta.
        .filter((entry) => entry.text.length > 0),
      batch,
      restoreTail,
    )

  const readings = pieces.map((piece) => tagged(stripIdMarker(piece)))
```

Edición 9 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
    if (contamination) throw contaminationFailure(fragment.n, contamination)
    classifyScene(fragment.n, prompt, reading, readings[index]?.treatment)
  })
  reading.styleRestored = restoreStyleTail(reading.good)
  return reading
}
```

por:

<!-- prettier-ignore -->
```ts
    if (contamination) throw contaminationFailure(fragment.n, contamination)
    classifyScene(fragment.n, prompt, reading, readings[index]?.treatment)
  })
  if (restoreTail) reading.styleRestored = restoreStyleTail(reading.good)
  return reading
}
```

Edición 10 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
function readById(
  byId: readonly { n: number; text: string; treatment?: SceneTreatment }[],
  batch: readonly VerbatimFragment[],
): BatchReading {
  for (const { n, text } of byId) {
    const contamination = responseContamination(text)
```

por:

<!-- prettier-ignore -->
```ts
function readById(
  byId: readonly { n: number; text: string; treatment?: SceneTreatment }[],
  batch: readonly VerbatimFragment[],
  restoreTail: boolean,
): BatchReading {
  for (const { n, text } of byId) {
    const contamination = responseContamination(text)
```

Edición 11 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
    }
    classifyScene(fragment.n, prompt, reading, treatments.get(fragment.n))
  }
  reading.styleRestored = restoreStyleTail(reading.good)
  return reading
}
```

por:

<!-- prettier-ignore -->
```ts
    }
    classifyScene(fragment.n, prompt, reading, treatments.get(fragment.n))
  }
  if (restoreTail) reading.styleRestored = restoreStyleTail(reading.good)
  return reading
}
```

Edición 12 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
  // El tratamiento de cada escena cosechada, si su etiqueta era válida.
  const treatments = new Map<number, SceneTreatment>()
  const treatmentTags = Boolean(options.sections?.dynamism?.trim())
  let lastError = ''

  // Progreso REAL: cada lote informa cuántos prompts lleva escritos y acá se
```

por:

<!-- prettier-ignore -->
```ts
  // El tratamiento de cada escena cosechada, si su etiqueta era válida.
  const treatments = new Map<number, SceneTreatment>()
  const treatmentTags = Boolean(options.sections?.dynamism?.trim())
  // Con final fijo la cola de estilo ya es determinística (spec §5.4).
  const restoreTail = !options.sections?.promptEnd?.trim()
  let lastError = ''

  // Progreso REAL: cada lote informa cuántos prompts lleva escritos y acá se
```

Edición 13 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
        count(response.inputTokens, response.outputTokens)
        const reading = readBatchPrompts(response.content, batch, {
          treatmentTags,
        })
        if (options.validatePrompt) {
          reading.good = reading.good.filter((entry) => {
```

por:

<!-- prettier-ignore -->
```ts
        count(response.inputTokens, response.outputTokens)
        const reading = readBatchPrompts(response.content, batch, {
          treatmentTags,
          restoreTail,
        })
        if (options.validatePrompt) {
          reading.good = reading.good.filter((entry) => {
```

Edición 14 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
              obtained,
              character,
              sceneWardrobe,
              justObtained,
            )
            try {
```

por:

<!-- prettier-ignore -->
```ts
              obtained,
              character,
              sceneWardrobe,
              options.sections,
              justObtained,
            )
            try {
```

Edición 15 de 15 — reemplazar:

<!-- prettier-ignore -->
```ts
  // persiste es exactamente lo que va a recibir el generador. Y es la ÚNICA
  // ventana donde se puede saber qué escenas nombran al protagonista: un
  // renglón más abajo la etiqueta ya no existe.
  const finalized = finalizeVerbatimPrompts(obtained, character, sceneWardrobe)
  const { prompts, scenesWithSubject, overBudget, sneakedIn, bare } = finalized
  if (finalized.rejectedWardrobes.size > 0) {
    options.onWarn?.(
```

por:

<!-- prettier-ignore -->
```ts
  // persiste es exactamente lo que va a recibir el generador. Y es la ÚNICA
  // ventana donde se puede saber qué escenas nombran al protagonista: un
  // renglón más abajo la etiqueta ya no existe.
  const finalized = finalizeVerbatimPrompts(
    obtained,
    character,
    sceneWardrobe,
    options.sections,
  )
  const { prompts, scenesWithSubject, overBudget, sneakedIn, bare } = finalized
  if (finalized.rejectedWardrobes.size > 0) {
    options.onWarn?.(
```

- [ ] **Paso 5: el recorte final protege las frases**

En `pipeline/stages/shared/prompt-safety.ts`:

Edición 1 de 13 — reemplazar:

<!-- prettier-ignore -->
```ts
import { MAX_PROMPT_CHARS } from '../../prompts/prompt-limits.ts'
import { DESCRIPTION_HEADER_PREFIX } from '../../prompts/verbatim-identity.ts'
import {
  ANONYMITY_CLAUSE,
```

por:

<!-- prettier-ignore -->
```ts
import { MAX_PROMPT_CHARS } from '../../prompts/prompt-limits.ts'
import type { FixedPhrases } from '../../prompts/template-frame.ts'
import { DESCRIPTION_HEADER_PREFIX } from '../../prompts/verbatim-identity.ts'
import {
  ANONYMITY_CLAUSE,
```

Edición 2 de 13 — reemplazar:

<!-- prettier-ignore -->
```ts
// Dos separadores entre los tres tramos + un punto de cierre por tramo.
const JOINED_PARTS_OVERHEAD = 5

// Corta en el último cierre de oración que entre; si el cierre queda muy
// atrás (una oración larguísima, típica de una cola de estilo), corta en
// palabra entera: perder media frase es mejor que perder medio prompt.
```

por:

<!-- prettier-ignore -->
```ts
// Dos separadores entre los tres tramos + un punto de cierre por tramo.
const JOINED_PARTS_OVERHEAD = 5

// Con frases fijas: tres separadores entre los cuatro tramos + un punto de
// cierre por cada tramo que se puede cortar.
const FRAMED_PARTS_OVERHEAD = 6

// Corta en el último cierre de oración que entre; si el cierre queda muy
// atrás (una oración larguísima, típica de una cola de estilo), corta en
// palabra entera: perder media frase es mejor que perder medio prompt.
```

Edición 3 de 13 — reemplazar:

<!-- prettier-ignore -->
```ts
  return boundary > 0 ? boundary + 2 : scene.length
}

// Hace entrar el cuerpo en `space`. Sin identidad tejida (todo el carril del
// catálogo) es el corte de siempre, byte por byte. Con identidad tejida (carril
// verbatim) el cuerpo es escena → cola de estilo → identidad, y cortar por el
// final borraba justo la identidad: el personaje desaparecía en silencio de las
// escenas con cola de estilo larga. Acá se cede en orden inverso de valor:
// primero el núcleo de la escena (hasta su piso), después la cola de estilo y
// la identidad recién al final.
function fitBody(body: string, space: number): string {
  if (body.length <= space) return body

  const identityIndex = body.lastIndexOf(DESCRIPTION_HEADER_PREFIX)
  if (identityIndex < 0) return body.slice(0, Math.max(0, space)).trim()
```

por:

<!-- prettier-ignore -->
```ts
  return boundary > 0 ? boundary + 2 : scene.length
}

interface FramedBody {
  start: string
  middle: string
  end: string
}

// El inicio y el final fijos de una gema de plantilla, separados del cuerpo.
// undefined = el cuerpo no los trae (otro camino, o un prompt anterior a la
// plantilla): se recorta como siempre.
function splitFixedPhrases(
  body: string,
  phrases: FixedPhrases,
): FramedBody | undefined {
  const start = phrases.promptStart?.trim() ?? ''
  const end = phrases.promptEnd?.trim() ?? ''
  const hasStart = start.length > 0 && body.startsWith(start)
  const middleStart = hasStart ? start.length : 0
  // `endWithPunctuation` pudo sumarle un punto al final fijo.
  const endIndex = end ? body.lastIndexOf(end) : -1
  const hasEnd =
    endIndex >= middleStart &&
    /^[.!?\s]*$/.test(body.slice(endIndex + end.length))
  if (!hasStart && !hasEnd) return undefined
  return {
    start: hasStart ? start : '',
    middle: body.slice(middleStart, hasEnd ? endIndex : body.length).trim(),
    end: hasEnd ? body.slice(endIndex).trim() : '',
  }
}

// Con frases fijas (spec §5.4) el cuerpo es inicio → escena → identidad →
// final. Si no entra, cede primero el núcleo de la escena (hasta su piso),
// después el final fijo y la identidad recién al final. El inicio fijo no se
// corta nunca.
function fitFramedBody(framed: FramedBody, space: number): string {
  const budget = space - framed.start.length - FRAMED_PARTS_OVERHEAD
  const identityIndex = framed.middle.lastIndexOf(DESCRIPTION_HEADER_PREFIX)
  const scene =
    identityIndex < 0
      ? framed.middle
      : framed.middle.slice(0, identityIndex).trim()
  const identity =
    identityIndex < 0 ? '' : framed.middle.slice(identityIndex).trim()

  const sceneSpace = Math.max(
    MIN_SCENE_CORE_CHARS,
    budget - identity.length - framed.end.length,
  )
  const fittedScene = cutAtSentence(scene, sceneSpace)
  const endSpace = budget - fittedScene.length - identity.length
  const fittedEnd = cutAtSentence(framed.end, Math.max(0, endSpace))
  const identitySpace = budget - fittedScene.length - fittedEnd.length
  const fittedIdentity = cutAtSentence(identity, Math.max(0, identitySpace))

  const cut = [fittedScene, fittedIdentity, fittedEnd]
    .filter((part) => part.length > 0)
    .map(endWithPunctuation)
  return [framed.start, ...cut].filter((part) => part.length > 0).join(' ')
}

// Hace entrar el cuerpo en `space`. Sin identidad tejida (todo el carril del
// catálogo) es el corte de siempre, byte por byte. Con identidad tejida (carril
// verbatim) el cuerpo es escena → cola de estilo → identidad, y cortar por el
// final borraba justo la identidad: el personaje desaparecía en silencio de las
// escenas con cola de estilo larga. Acá se cede en orden inverso de valor:
// primero el núcleo de la escena (hasta su piso), después la cola de estilo y
// la identidad recién al final. Con las frases fijas de una gema de plantilla,
// el corte de `fitFramedBody`.
function fitBody(
  body: string,
  space: number,
  fixedPhrases?: FixedPhrases,
): string {
  if (body.length <= space) return body

  const framed = fixedPhrases
    ? splitFixedPhrases(body, fixedPhrases)
    : undefined
  if (framed) return fitFramedBody(framed, space)

  const identityIndex = body.lastIndexOf(DESCRIPTION_HEADER_PREFIX)
  if (identityIndex < 0) return body.slice(0, Math.max(0, space)).trim()
```

Edición 4 de 13 — reemplazar:

<!-- prettier-ignore -->
```ts
  prompt: string,
  clause: string,
  reservedAfter: number,
): string {
  const space = MAX_PROMPT_CHARS - clause.length - reservedAfter - 1
  const body = fitBody(endWithPunctuation(prompt.trim()), space)
  return `${body} ${clause}`.trim()
}
```

por:

<!-- prettier-ignore -->
```ts
  prompt: string,
  clause: string,
  reservedAfter: number,
  fixedPhrases?: FixedPhrases,
): string {
  const space = MAX_PROMPT_CHARS - clause.length - reservedAfter - 1
  const body = fitBody(endWithPunctuation(prompt.trim()), space, fixedPhrases)
  return `${body} ${clause}`.trim()
}
```

Edición 5 de 13 — reemplazar:

<!-- prettier-ignore -->
```ts
  return prompt.slice(0, Math.min(...starts)).trim()
}

function appendAnonymity(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return trimmed
  if (normalizeForDedupe(trimmed).includes('fictional, anonymous individual'))
    return trimmed
  return appendReservingSpace(trimmed, ANONYMITY_CLAUSE, 0)
}

function appendImageTextClause(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return trimmed
  // Mismo substring que traen las cláusulas del fallback determinístico: ni
```

por:

<!-- prettier-ignore -->
```ts
  return prompt.slice(0, Math.min(...starts)).trim()
}

function appendAnonymity(prompt: string, fixedPhrases?: FixedPhrases): string {
  const trimmed = prompt.trim()
  if (!trimmed) return trimmed
  if (normalizeForDedupe(trimmed).includes('fictional, anonymous individual'))
    return trimmed
  return appendReservingSpace(trimmed, ANONYMITY_CLAUSE, 0, fixedPhrases)
}

function appendImageTextClause(
  prompt: string,
  fixedPhrases?: FixedPhrases,
): string {
  const trimmed = prompt.trim()
  if (!trimmed) return trimmed
  // Mismo substring que traen las cláusulas del fallback determinístico: ni
```

Edición 6 de 13 — reemplazar:

<!-- prettier-ignore -->
```ts
    trimmed,
    IMAGE_TEXT_LANGUAGE_CLAUSE,
    ANONYMITY_CLAUSE.length + 1,
  )
}

function appendPeriodLock(prompt: string, era: string): string {
  const trimmed = prompt.trim()
  if (!trimmed || !era.trim()) return trimmed
  if (
```

por:

<!-- prettier-ignore -->
```ts
    trimmed,
    IMAGE_TEXT_LANGUAGE_CLAUSE,
    ANONYMITY_CLAUSE.length + 1,
    fixedPhrases,
  )
}

function appendPeriodLock(
  prompt: string,
  era: string,
  fixedPhrases?: FixedPhrases,
): string {
  const trimmed = prompt.trim()
  if (!trimmed || !era.trim()) return trimmed
  if (
```

Edición 7 de 13 — reemplazar:

<!-- prettier-ignore -->
```ts
    trimmed,
    clause,
    IMAGE_TEXT_LANGUAGE_CLAUSE.length + ANONYMITY_CLAUSE.length + 2,
  )
}

function appendImmersiveDiagram(prompt: string, styleId?: string): string {
  const isPhoto = isPhotorealisticStyle(styleId)
  const clause = isPhoto
    ? IMMERSIVE_DIAGRAM_PHOTO_CLAUSE
```

por:

<!-- prettier-ignore -->
```ts
    trimmed,
    clause,
    IMAGE_TEXT_LANGUAGE_CLAUSE.length + ANONYMITY_CLAUSE.length + 2,
    fixedPhrases,
  )
}

function appendImmersiveDiagram(
  prompt: string,
  styleId?: string,
  fixedPhrases?: FixedPhrases,
): string {
  const isPhoto = isPhotorealisticStyle(styleId)
  const clause = isPhoto
    ? IMMERSIVE_DIAGRAM_PHOTO_CLAUSE
```

Edición 8 de 13 — reemplazar:

<!-- prettier-ignore -->
```ts
  if (languageIndex >= 0) {
    const tail = trimmed.slice(languageIndex).trim()
    const space = MAX_PROMPT_CHARS - clause.length - tail.length - 2
    const body = fitBody(trimmed.slice(0, languageIndex).trim(), space)
    return `${body} ${clause} ${tail}`.trim()
  }
```

por:

<!-- prettier-ignore -->
```ts
  if (languageIndex >= 0) {
    const tail = trimmed.slice(languageIndex).trim()
    const space = MAX_PROMPT_CHARS - clause.length - tail.length - 2
    const body = fitBody(
      trimmed.slice(0, languageIndex).trim(),
      space,
      fixedPhrases,
    )
    return `${body} ${clause} ${tail}`.trim()
  }
```

Edición 9 de 13 — reemplazar:

<!-- prettier-ignore -->
```ts
    trimmed,
    clause,
    IMAGE_TEXT_LANGUAGE_CLAUSE.length + ANONYMITY_CLAUSE.length + 2,
  )
}
```

por:

<!-- prettier-ignore -->
```ts
    trimmed,
    clause,
    IMAGE_TEXT_LANGUAGE_CLAUSE.length + ANONYMITY_CLAUSE.length + 2,
    fixedPhrases,
  )
}
```

Edición 10 de 13 — reemplazar:

<!-- prettier-ignore -->
```ts
}

// Scrub FINAL del prompt ya ensamblado, justo antes del generador de imágenes.
export function sanitizeFinalPrompt(
  prompt: string,
  eraContext?: FinalPromptEraContext,
): string {
  // 1) Violencia/gore/armas/sexual/drogas → términos seguros.
  let result = applySafetyReplacements(prompt ?? '')
```

por:

<!-- prettier-ignore -->
```ts
}

// Scrub FINAL del prompt ya ensamblado, justo antes del generador de imágenes.
// `fixedPhrases`: las frases fijas de una gema de plantilla, que el recorte
// protege (spec §5.4). Ausente = el recorte de siempre.
export function sanitizeFinalPrompt(
  prompt: string,
  eraContext?: FinalPromptEraContext,
  fixedPhrases?: FixedPhrases,
): string {
  // 1) Violencia/gore/armas/sexual/drogas → términos seguros.
  let result = applySafetyReplacements(prompt ?? '')
```

Edición 11 de 13 — reemplazar:

<!-- prettier-ignore -->
```ts
      eraContext.window ?? '',
    )
  ) {
    result = appendPeriodLock(result, eraContext.era)
  }

  // 1.75) Escena de DIAGRAMA sin PERIOD LOCK → cláusula diegética. Con lock
```

por:

<!-- prettier-ignore -->
```ts
      eraContext.window ?? '',
    )
  ) {
    result = appendPeriodLock(result, eraContext.era, fixedPhrases)
  }

  // 1.75) Escena de DIAGRAMA sin PERIOD LOCK → cláusula diegética. Con lock
```

Edición 12 de 13 — reemplazar:

<!-- prettier-ignore -->
```ts
    'period lock — this story is set in',
  )
  if (eraContext?.isDiagram && !hasPeriodLock) {
    result = appendImmersiveDiagram(result, eraContext.styleId)
  } else if (
    eraContext?.isDiagram &&
    isPhotorealisticStyle(eraContext.styleId) &&
```

por:

<!-- prettier-ignore -->
```ts
    'period lock — this story is set in',
  )
  if (eraContext?.isDiagram && !hasPeriodLock) {
    result = appendImmersiveDiagram(result, eraContext.styleId, fixedPhrases)
  } else if (
    eraContext?.isDiagram &&
    isPhotorealisticStyle(eraContext.styleId) &&
```

Edición 13 de 13 — reemplazar:

<!-- prettier-ignore -->
```ts
  // solo para el rescate por content policy.
  // 3) Cláusula dura de texto-en-imagen, antes de la de anonimato (reserva el
  // espacio de ambas).
  result = appendImageTextClause(result)
  // 4) Cláusula condicional de anonimato.
  result = appendAnonymity(result)

  return result
}
```

por:

<!-- prettier-ignore -->
```ts
  // solo para el rescate por content policy.
  // 3) Cláusula dura de texto-en-imagen, antes de la de anonimato (reserva el
  // espacio de ambas).
  result = appendImageTextClause(result, fixedPhrases)
  // 4) Cláusula condicional de anonimato.
  result = appendAnonymity(result, fixedPhrases)

  return result
}
```

- [ ] **Paso 6: la fase de imágenes pasa las frases**

En `pipeline/stages/images/images.ts`:

Edición 1 de 5 — reemplazar:

<!-- prettier-ignore -->
```ts
  type AccountProbe,
} from './account-probe.ts'
import { sanitizeFinalPrompt } from '../shared/prompt-safety.ts'
import { rescueReferencePrompt } from '../scene-prompts/verbatim/subject-weaver.ts'

// Fase 5 (port de la Fase «imágenes» del orquestador + images.ts): dispatcher
```

por:

<!-- prettier-ignore -->
```ts
  type AccountProbe,
} from './account-probe.ts'
import { sanitizeFinalPrompt } from '../shared/prompt-safety.ts'
import { applyFixedPhrases } from '../../prompts/template-frame.ts'
import { rescueReferencePrompt } from '../scene-prompts/verbatim/subject-weaver.ts'

// Fase 5 (port de la Fase «imágenes» del orquestador + images.ts): dispatcher
```

Edición 2 de 5 — reemplazar:

<!-- prettier-ignore -->
```ts
  events: ImageLaneEvents,
): Promise<Scene[]> {
  const { context, style } = inputs
  context.signal.throwIfAborted()
  if (!context.options.customStyle) {
    const invalidIds: number[] = []
```

por:

<!-- prettier-ignore -->
```ts
  events: ImageLaneEvents,
): Promise<Scene[]> {
  const { context, style } = inputs
  // Las frases fijas de una gema de plantilla (spec §5.4): van también en el
  // fallback y el recorte final las protege.
  const fixedPhrases = context.options.customStyle?.sections
  context.signal.throwIfAborted()
  if (!context.options.customStyle) {
    const invalidIds: number[] = []
```

Edición 3 de 5 — reemplazar:

<!-- prettier-ignore -->
```ts
    // Catálogo jamás llega al fallback de compatibilidad de Mi estilo.
    if (!context.options.customStyle) return scene
    if (isValidPrompt(scene.imagePrompt)) return scene
    return {
      ...scene,
      imagePrompt: anchorNormalRealism(
        buildDeterministicFallbackPrompt(
          scene,
          inputs.visualBible,
          style,
          orderedScenes,
          inputs.promptCharacters,
          inputs.imageTextLanguage,
        ),
        style,
      ),
      promptIsFallback: true,
    }
  })
```

por:

<!-- prettier-ignore -->
```ts
    // Catálogo jamás llega al fallback de compatibilidad de Mi estilo.
    if (!context.options.customStyle) return scene
    if (isValidPrompt(scene.imagePrompt)) return scene
    const fallback = anchorNormalRealism(
      buildDeterministicFallbackPrompt(
        scene,
        inputs.visualBible,
        style,
        orderedScenes,
        inputs.promptCharacters,
        inputs.imageTextLanguage,
      ),
      style,
    )
    return {
      ...scene,
      imagePrompt: fixedPhrases
        ? applyFixedPhrases(fallback, fixedPhrases)
        : fallback,
      promptIsFallback: true,
    }
  })
```

Edición 4 de 5 — reemplazar:

<!-- prettier-ignore -->
```ts
      !scene.userPrompt?.trim() && scene.direction?.treatment === 'diagram'
    return {
      ...scene,
      imagePrompt: sanitizeFinalPrompt(scene.imagePrompt, {
        era: globalEra,
        sceneText: scene.userPrompt?.trim() || scene.text || '',
        window: eraEscapeWindow(sceneTexts, scene.id),
        isDiagram,
        styleId: style.id,
      }),
    }
  })
```

por:

<!-- prettier-ignore -->
```ts
      !scene.userPrompt?.trim() && scene.direction?.treatment === 'diagram'
    return {
      ...scene,
      imagePrompt: sanitizeFinalPrompt(
        scene.imagePrompt,
        {
          era: globalEra,
          sceneText: scene.userPrompt?.trim() || scene.text || '',
          window: eraEscapeWindow(sceneTexts, scene.id),
          isDiagram,
          styleId: style.id,
        },
        fixedPhrases,
      ),
    }
  })
```

Edición 5 de 5 — reemplazar:

<!-- prettier-ignore -->
```ts
      ...scene,
      imagePrompt: sanitizeFinalPrompt(
        rescueReferencePrompt(scene.imagePrompt, identities),
      ),
    }
  })
```

por:

<!-- prettier-ignore -->
```ts
      ...scene,
      imagePrompt: sanitizeFinalPrompt(
        rescueReferencePrompt(scene.imagePrompt, identities),
        undefined,
        inputs.context.options.customStyle?.sections,
      ),
    }
  })
```

- [ ] **Paso 7: correr y ver que pasa**

Run: `node --test scripts/test/check-gem-fixed-phrases.mjs`
Expected: `ℹ tests 8`, `ℹ pass 8`, `ℹ fail 0`.

Run: `node --test scripts/test/check-gem-*.mjs` y la batería del carril.
Expected: `ℹ pass 72` y `ℹ pass 111` (check-style-character-video pinea el recorte sin frases).

- [ ] **Paso 8: formato, lint y tipos**

Run: `pnpm exec prettier --write pipeline/prompts/template-frame.ts pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts pipeline/stages/shared/prompt-safety.ts pipeline/stages/images/images.ts scripts/test/check-gem-fixed-phrases.mjs`
Expected: todos `(unchanged)`.

Run: `pnpm exec eslint pipeline/prompts/template-frame.ts pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts pipeline/stages/shared/prompt-safety.ts pipeline/stages/images/images.ts scripts/test/check-gem-fixed-phrases.mjs && pnpm exec tsc -p tsconfig.pipeline.json --noEmit`
Expected: sin salida.

- [ ] **Paso 9: Commit (orquestador)**

```bash
git add pipeline/prompts/template-frame.ts pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts pipeline/stages/shared/prompt-safety.ts pipeline/stages/images/images.ts scripts/test/check-gem-fixed-phrases.mjs
git commit -F- <<'EOF'
feat: add fixed prompt start and end for template gems

Qué: template-frame suma applyFixedPhrases y stripFixedPhrases. El writer arma
el prompt final como inicio fijo + escena tejida + final fijo, quitando antes
la copia que el modelo haya escrito, y con final fijo no restaura la cola de
estilo. sanitizeFinalPrompt recibe las frases: si el prompt no entra, cede
primero el núcleo de la escena, después el final fijo y la identidad al
último, sin cortar nunca el inicio. La fase de imágenes pasa las frases al
recorte y al rescate sin referencia, y el fallback de una gema de plantilla
también las lleva.

Por qué: spec §4.1 y §5.4: las frases fijas se pegan por código a cada prompt
de imagen y el final ya no depende de que el modelo lo escriba.

Con qué interactúa: sin frases (catálogo y gemas viejas) el recorte es el de
siempre y los prompts no cambian (check-style-character-video y las huellas de
check-gem-verbatim-lane lo pinean). Guard nuevo: check-gem-fixed-phrases.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Tarea A7 · Muestras con el marco

Para una gema de plantilla, `generate-style-samples` escribe los 4 momentos fijos como UN lote del
carril verbatim: el mismo marco y el mismo modo de personaje que tendría el video (sección
`character` en genérico; Fase 1 con la gema como texto si no hay sección o si es «Mi personaje» sin
predeterminado; el personaje de la biblioteca, con o sin foto; o ninguno), el modelo `promptModel`
del payload (ausente = el de la casa, vía `resolveVerbatimModel`) y las frases fijas pegadas por
código. Con foto, el encargo lleva la referencia y, si falla, se reintenta una vez como texto con la
descripción de la biblioteca (`rescueReferencePrompt`, el mismo rescate que el video). Un prompt que
falta corta antes de pagar imágenes. Las gemas viejas siguen por el lote JSON de siempre; el ciclo de
imágenes se extrae a `generateSampleImages`, compartido por los dos caminos sin cambiar su
comportamiento. `sample-character.ts` y `prompts/style-samples.ts` se consumen sin cambios.

**Files:**

- Modify (contenido completo): `pipeline/commands/styles/generate-style-samples.ts`
- Sin cambios (se consumen): `pipeline/commands/styles/sample-character.ts`, `pipeline/prompts/style-samples.ts`
- Test: `scripts/test/check-gem-style-samples.mjs`

**Interfaces:**

- Consumes: `generateVerbatimPrompts(fragments, fullScript, options: VerbatimWriterOptions)` con `sections` (A4–A6); `VerbatimCharacterInput`; `composeGemText` (A3); `protagonistFromSection` (A4); `rescueReferencePrompt(prompt, identities)` (existente); `resolveSampleCharacter(context, style): Promise<ResolvedSampleCharacter>` (existente); `PROMPT_MODEL_ID_LIMIT` (200, de `commands/videos/create-video-project.ts`, mismo uso que `set-prompt-model`); `GenerateStyleSamplesPayload.promptModel` (Tarea 0).
- Produces: `generateStyleSamples(context): Promise<GenerateStyleSamplesResult>` con el mismo contrato de eventos (`progress` con `detail.phase` `prompts` | `images`, `sampleId`, `status`, y `path`/`mtimeMs` al completar). Con `payload.promptModel` que no es texto o supera 200 caracteres, y solo para una gema de plantilla: `invalid_payload` antes de cualquier pedido.

- [ ] **Paso 1: escribir el guard que falla**

Crear `scripts/test/check-gem-style-samples.mjs`:

<!-- prettier-ignore -->
````js
// Las muestras de una gema de plantilla (spec §5.6): los 4 momentos fijos
// salen como UN lote del carril verbatim, con el mismo marco y el mismo modo
// de personaje que el video, el modelo de Ajustes y las frases fijas pegadas
// por código. Una gema vieja sigue por el lote JSON de siempre. LLM y
// proveedor de imágenes simulados; galería en una carpeta temporal.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { generateStyleSamples } from '../../pipeline/commands/styles/generate-style-samples.ts'
import { DEFAULT_LLM_MODEL_ID } from '../../pipeline/providers/llm/model-catalog.ts'
import { SAMPLE_FRAGMENTS } from '../../pipeline/prompts/style-samples.ts'
import {
  buildTemplateSystem,
  composeGemText,
} from '../../pipeline/prompts/template-frame.ts'
import {
  buildAssistantCharacterTurn,
  CHARACTER_DESIGN_INSTRUCTION,
} from '../../pipeline/prompts/verbatim-messages.ts'
import { DESCRIPTION_HEADER } from '../../pipeline/prompts/verbatim-identity.ts'

const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const sectionCharacter =
  'A stickman doll with a round white head, two black dot eyes and thin black line limbs. Outfit: white gloves and white rounded shoes.'
const promptStart = 'A simple stickman doll drawing:'
const promptEnd = 'Clean black lines on a colorful, softly shaded background.'
const sections = {
  visualStyle: 'Simple stickman drawings on colorful backgrounds.',
  character: sectionCharacter,
  dynamism: 'Show the protagonist in half of the scenes; objects in the rest.',
  promptStart,
  promptEnd,
}
const sheet =
  'A curious red-haired girl, slender build, freckles across the nose, round green glasses. Outfit: a green hoodie and blue jeans.'
const CHOSEN_MODEL = 'deepseek-ai/DeepSeek-V4-Flash'

async function gallery(t, style, library = []) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-samples-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, '_styles', 'st-fixture')
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'style.json'),
    JSON.stringify({
      name: 'Stickman',
      shots: [],
      createdAt: '2026-09-30T00:00:00.000Z',
      ...style,
    }),
  )
  for (const entry of library) {
    const folder = join(root, 'characters', entry.id)
    await mkdir(folder, { recursive: true })
    await writeFile(join(folder, 'photo.png'), bytes)
    await writeFile(
      join(folder, 'metadata.json'),
      JSON.stringify({
        name: entry.name,
        description: 'A woman with curly red hair and a mustard raincoat.',
        createdAt: '2026-09-30T00:00:00.000Z',
        previews: [],
        photoFile: 'photo.png',
      }),
    )
  }
  return root
}
function context(root, payload) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fixture', fal: 'fixture' },
      binaryPaths: {},
      payload: { styleId: 'st-fixture', imageProvider: 'fal', ...payload },
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit() {} },
  }
}
function stream(content) {
  return new Response(
    'data: ' +
      JSON.stringify({
        choices: [{ delta: { content }, finish_reason: 'stop' }],
      }) +
      '\n\ndata: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
function isPhaseOne(request) {
  return request.messages.at(-1).content.includes(CHARACTER_DESIGN_INSTRUCTION)
}
function providers(t, { llmStatus } = {}) {
  const calls = { text: [], images: [] }
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = String(url)
    if (target.includes('chat/completions')) {
      const request = JSON.parse(init.body)
      calls.text.push(request)
      if (llmStatus) return new Response('', { status: llmStatus })
      if (isPhaseOne(request)) return stream('```text\n' + sheet + '\n```')
      const ids = [
        ...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm),
      ].map((match) => Number(match[1]))
      return stream(
        ids
          .map(
            (id) =>
              `((${id})) [T:action] Wide shot of [subject] exploring a bright forest, moment ${id}.`,
          )
          .join('\n\n'),
      )
    }
    if (target.startsWith('https://fal.run/')) {
      calls.images.push({ url: target, ...JSON.parse(init.body) })
      return Response.json({
        images: [{ url: 'https://fixture.invalid/' + calls.images.length }],
      })
    }
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  return calls
}
const template = (mode, extra = {}) => ({
  sections,
  templateVersion: 1,
  character: { mode },
  ...extra,
})

test('generic with a character section: one batch with the frame, the chosen model and the fixed phrases', async (t) => {
  const root = await gallery(t, template('generic'))
  const calls = providers(t)
  const result = await generateStyleSamples(
    context(root, { promptModel: CHOSEN_MODEL }),
  )

  assert.equal(result.samples.length, 4)
  assert.equal(
    calls.text.length,
    1,
    'sin Fase 1: el protagonista es la sección',
  )
  const [request] = calls.text
  assert.equal(request.model, CHOSEN_MODEL)
  assert.equal(
    request.messages[0].content,
    buildTemplateSystem(sections, 'generic'),
  )
  assert.equal(
    request.messages[2].content,
    buildAssistantCharacterTurn(sectionCharacter),
  )
  for (const fragment of SAMPLE_FRAGMENTS)
    assert.ok(
      request.messages
        .at(-1)
        .content.includes(`${fragment.id}. ${fragment.text}`),
    )
  assert.ok(!JSON.stringify(request).includes('PREVIEW BATCH OUTPUT FORMAT'))

  assert.equal(calls.images.length, 4)
  for (const image of calls.images) {
    assert.ok(image.prompt.startsWith(promptStart + ' '))
    assert.ok(image.prompt.endsWith(' ' + promptEnd))
    assert.ok(image.prompt.includes(DESCRIPTION_HEADER + ' A stickman doll'))
    assert.doesNotMatch(image.prompt, /\[subject\]|\[T:/)
  }
})

test('without a model in the payload the house model writes', async (t) => {
  const root = await gallery(t, template('generic'))
  const calls = providers(t)
  await generateStyleSamples(context(root))
  assert.equal(calls.text[0].model, DEFAULT_LLM_MODEL_ID)
})

test('generic without a section: phase 1 designs from the gem text, then the same batch', async (t) => {
  const withoutCharacter = { ...sections, character: undefined }
  const root = await gallery(
    t,
    template('generic', { sections: withoutCharacter }),
  )
  const calls = providers(t)
  await generateStyleSamples(context(root))
  assert.equal(calls.text.length, 2)
  assert.ok(isPhaseOne(calls.text[0]))
  assert.equal(
    calls.text[0].messages[0].content,
    composeGemText(withoutCharacter),
  )
  assert.equal(
    calls.text[1].messages[0].content,
    buildTemplateSystem(withoutCharacter, 'generic'),
  )
  for (const image of calls.images) assert.match(image.prompt, /green hoodie/)
})

test('cinematic: the none frame, no portrait and never the character section', async (t) => {
  const root = await gallery(t, template('none'))
  const calls = providers(t)
  await generateStyleSamples(context(root))
  assert.equal(calls.text.length, 1)
  const [request] = calls.text
  assert.equal(
    request.messages[0].content,
    buildTemplateSystem(sections, 'none'),
  )
  assert.ok(!request.messages.some((message) => message.role === 'assistant'))
  assert.ok(
    !JSON.stringify(request).includes('stickman doll with a round white head'),
  )
  for (const image of calls.images) {
    assert.ok(!image.prompt.includes(DESCRIPTION_HEADER))
    assert.ok(image.prompt.startsWith(promptStart))
  }
})

test('my character with a photo: the reference frame, the photo attached and the phrases inside the lock', async (t) => {
  const root = await gallery(
    t,
    template('own', {
      character: { mode: 'own', defaultCharacterId: 'lucia' },
    }),
    [{ id: 'lucia', name: 'Lucía' }],
  )
  const calls = providers(t)
  await generateStyleSamples(context(root))
  assert.equal(
    calls.text[0].messages[0].content,
    buildTemplateSystem(sections, 'reference'),
  )
  assert.ok(
    !JSON.stringify(calls.text[0]).includes(
      'stickman doll with a round white head',
    ),
  )
  for (const image of calls.images) {
    assert.ok(image.url.endsWith('/edit'))
    assert.ok(image.image_urls[0].startsWith('data:image/png'))
    assert.ok(image.prompt.startsWith('REFERENCE:'))
    assert.ok(
      image.prompt.includes(
        promptStart +
          ' Wide shot of Lucía (the person from the attached reference image)',
      ),
    )
    assert.match(image.prompt, /APPEARANCE LOCK/)
  }
})

test('a rejected key stops before paying any image', async (t) => {
  const root = await gallery(t, template('generic'))
  const calls = providers(t, { llmStatus: 401 })
  await assert.rejects(generateStyleSamples(context(root)), {
    code: 'llm_auth',
  })
  assert.equal(calls.images.length, 0)
})

test('a malformed model in the payload is rejected before any request', async (t) => {
  const root = await gallery(t, template('generic'))
  const calls = providers(t)
  await assert.rejects(
    generateStyleSamples(context(root, { promptModel: 42 })),
    {
      code: 'invalid_payload',
    },
  )
  assert.equal(calls.text.length + calls.images.length, 0)
})

test('an old gem keeps the preview batch of always', async (t) => {
  const root = await gallery(t, {
    systemPrompt: 'Illustrate the scene as a watercolor.',
    character: { mode: 'none' },
  })
  const calls = { batches: 0 }
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = String(url)
    if (target.includes('chat/completions')) {
      const request = JSON.parse(init.body)
      assert.ok(
        request.messages[0].content.includes('# PREVIEW BATCH OUTPUT FORMAT'),
      )
      calls.batches++
      return stream(
        JSON.stringify({
          samples: SAMPLE_FRAGMENTS.map((fragment) => ({
            sampleId: fragment.id,
            prompt: 'A watercolor forest in the morning, scene ' + fragment.id,
          })),
        }),
      )
    }
    if (target.startsWith('https://fal.run/'))
      return Response.json({ images: [{ url: 'https://fixture.invalid/x' }] })
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  const result = await generateStyleSamples(context(root))
  assert.equal(result.samples.length, 4)
  assert.equal(calls.batches, 1)
})
````

- [ ] **Paso 2: correr y ver que falla**

Run: `node --test scripts/test/check-gem-style-samples.mjs`
Expected: FAIL, `ℹ pass 2`, `ℹ fail 6`. Fallan «generic with a character section…», «without a model in the payload…», «generic without a section…», «cinematic…», «my character with a photo…» y «a malformed model in the payload…»; pasan «a rejected key stops before paying any image» y «an old gem keeps the preview batch of always», que pinean el camino de hoy.

- [ ] **Paso 3: reemplazar `generate-style-samples.ts`**

Reemplazar el contenido completo de `pipeline/commands/styles/generate-style-samples.ts` por:

<!-- prettier-ignore -->
````ts
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import {
  generateEvolinkImage,
  uploadEvolinkReference,
} from '../../providers/image/evolink.ts'
import { generateFalImage } from '../../providers/image/fal.ts'
import { createInteractiveLlm } from '../../providers/llm/interactive.ts'
import { buildCustomStyleReferencePrompt } from '../../prompts/character-reference.ts'
import { buildCustomStyleSystemPrompt } from '../../prompts/custom-style.ts'
import {
  SAMPLE_FRAGMENTS,
  SAMPLE_PROTAGONIST_REMINDER,
  SAMPLE_PROTAGONIST_RULE,
  SAMPLE_SCRIPT,
} from '../../prompts/style-samples.ts'
import { composeGemText } from '../../prompts/template-frame.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { isLlmAuthFailure } from '../../providers/llm/auth-failure.ts'
import { isInsufficientCreditsFailure } from '../../utils/insufficient-credits.ts'
import { extractImagePrompt } from '../../stages/scene-prompts/prompt-extraction.ts'
import {
  protagonistFromSection,
  rescueReferencePrompt,
} from '../../stages/scene-prompts/verbatim/subject-weaver.ts'
import {
  designStyleProtagonist,
  generateVerbatimPrompts,
  type VerbatimCharacterInput,
} from '../../stages/scene-prompts/verbatim/verbatim-writer.ts'
import { createVerbatimClient } from '../../providers/llm/verbatim-client.ts'
import type { DecodedImage } from '../../types/images.ts'
import type {
  CustomStyleSummary,
  GemSections,
  GenerateStyleSamplesPayload,
  GenerateStyleSamplesResult,
} from '../../types/styles.ts'
import { writeFileAtomic } from '../../utils/atomic-fs.ts'
import { createProviderFailureReporter } from '../../utils/provider-failure.ts'
import { startSimulatedProgress } from '../../utils/simulated-progress.ts'
import { PROMPT_MODEL_ID_LIMIT } from '../videos/create-video-project.ts'
import {
  neutralizeSampleSubject,
  pointSampleToReference,
  resolveSampleCharacter,
  weaveSampleIdentity,
  type ResolvedSampleCharacter,
  type SampleCharacter,
} from './sample-character.ts'
import {
  assertValidStyleId,
  readStyleEntry,
  readStyleSamples,
  styleDirectory,
} from './style-store.ts'

const PROMPT_EXPECTED_MS = 15_000
const PREVIEW_POLL_INTERVAL_MS = 1000
const PREVIEW_BATCH_TOKENS_BUDGET = 3600

type ImageProvider = 'fal' | 'evolink'

// Un encargo de imagen, con o sin referencias adjuntas.
type SampleImageRequest = (
  imagePrompt: string,
  references?: string[],
) => Promise<DecodedImage>

// Un pedido redacta los cuatro prompts; si el lote no sirve, se completan
// solo los faltantes en paralelo. Después arrancan los cuatro encargos. Cada imagen se guarda y se
// anuncia en cuanto llega, sin esperar al encargo más lento.
//
// Las cuatro muestras salen con el MISMO protagonista, el que tendrá el video:
// el personaje predeterminado de la gema («Mi personaje» + fijado) o, si no
// hay, el que la gema describe / uno diseñado para ella. Con imagen viaja como
// referencia adjunta; sin imagen, como descripción tejida al prompt; y un
// encargo con referencia que falla se reintenta una vez como texto. Una gema
// «sin personaje» genera sus pedidos como siempre.
//
// Una gema de PLANTILLA (ADR-0041, spec §5.6) no usa este camino: sus cuatro
// momentos salen del mismo carril que el video (`generateTemplateSamples`).
export async function generateStyleSamples(
  context: PipelineContext,
): Promise<GenerateStyleSamplesResult> {
  const payload = context.job.payload as GenerateStyleSamplesPayload | undefined
  if (!payload?.styleId)
    throw new PipelineFailure('invalid_payload', 'payload.styleId is required')
  assertValidStyleId(payload.styleId)

  const style = await readStyleEntry(context, payload.styleId)
  if (!style)
    throw new PipelineFailure(
      'style_not_found',
      `style "${payload.styleId}" does not exist`,
    )

  const provider = payload.imageProvider === 'fal' ? 'fal' : 'evolink'
  const apiKey = context.job.apiKeys[provider]
  if (!apiKey)
    throw new PipelineFailure(
      'missing_api_key',
      `${provider} API key is missing`,
    )

  if (style.sections)
    return generateTemplateSamples(
      context,
      style,
      style.sections,
      payload.promptModel,
      provider,
      apiKey,
    )
  return generateLegacySamples(context, style, provider, apiKey)
}

// El camino de siempre para una gema vieja: el lote JSON de previews con la
// gema como system, `GLOBAL_RULES` y los planos.
async function generateLegacySamples(
  context: PipelineContext,
  style: CustomStyleSummary,
  provider: ImageProvider,
  apiKey: string,
): Promise<GenerateStyleSamplesResult> {
  const llm = createInteractiveLlm(context)
  const resolved = await resolveSampleCharacter(context, style)
  const systemPrompt = buildCustomStyleSystemPrompt(style)

  let batchPercent = 0
  const reportBatch = (percent: number) => {
    batchPercent = Math.max(batchPercent, percent)
    for (const fragment of SAMPLE_FRAGMENTS)
      reportSample(context, fragment.id, 'prompts', batchPercent, 'processing')
  }
  reportBatch(0)
  const stopBatch = startSimulatedProgress(
    Date.now(),
    PROMPT_EXPECTED_MS,
    reportBatch,
  )
  let batch: PreviewPrompt[] = []
  // `none` hasta que se sepa con quién salen: si el diseño falla, las
  // muestras se generan como siempre en vez de perderse.
  let character: SampleCharacter = { mode: 'none' }
  let protagonistRule = ''
  let protagonistReminder = ''
  try {
    character =
      resolved.mode === 'design'
        ? await designSampleProtagonist(context, style.systemPrompt ?? '')
        : resolved
    context.emitter.emit({
      type: 'log',
      level: 'info',
      message: `style samples character mode: ${resolved.mode === 'design' ? `design → ${character.mode}` : character.mode}`,
    })
    // La regla va AL FINAL del system prompt (después del formato del lote) y
    // se repite junto a las escenas: más arriba, la gema con personaje propio
    // la ignoraba. Sin protagonista los pedidos quedan byte-idénticos.
    if (character.mode !== 'none') {
      protagonistRule = `\n\n${SAMPLE_PROTAGONIST_RULE}`
      protagonistReminder = `\n\n${SAMPLE_PROTAGONIST_REMINDER}`
    }
    batch = await llm.generate({
      maxAttempts: 1,
      contentTokensBudget: PREVIEW_BATCH_TOKENS_BUDGET,
      messages: [
        {
          role: 'system',
          content:
            systemPrompt +
            '\n\n# PREVIEW BATCH OUTPUT FORMAT\nFor this request, replace the single-scene output format above with {"samples":[{"sampleId":1,"prompt":"..."}]}. Return exactly one independent image prompt for EACH supplied scene ID, preserving IDs. Apply the style and allowed shots to every prompt. Do not merge scenes or return a collage. Return JSON only.' +
            protagonistRule,
        },
        {
          role: 'user',
          content: `FULL SCRIPT (context): ${SAMPLE_SCRIPT}\n\nSCENES TO ILLUSTRATE: ${JSON.stringify(SAMPLE_FRAGMENTS)}${protagonistReminder}`,
        },
      ],
      // Un lote parcial/incompatible no condena el modelo: todavía puede
      // redactar bien escenas individuales. Los errores HTTP sí lo descartan.
      parse: parsePreviewBatch,
      onProgress(content) {
        reportBatch(Math.min(95, Math.round(content.length / 80)))
      },
    })
  } catch (error) {
    context.signal.throwIfAborted()
    if (isLlmAuthFailure(error) || isInsufficientCreditsFailure(error))
      throw error
    if (!(error instanceof PipelineFailure)) throw error
  } finally {
    stopBatch()
  }
  context.signal.throwIfAborted()
  for (const prompt of batch)
    reportSample(context, prompt.sampleId, 'prompts', 100, 'completed')
  const missing = SAMPLE_FRAGMENTS.filter(
    (fragment) => !batch.some((prompt) => prompt.sampleId === fragment.id),
  )
  const promptResults = await Promise.allSettled(
    missing.map(async (fragment) => {
      let percent = batchPercent
      const progress = (next: number) => {
        percent = Math.max(percent, next)
        reportSample(context, fragment.id, 'prompts', percent, 'processing')
      }
      const stop = startSimulatedProgress(
        Date.now(),
        PROMPT_EXPECTED_MS,
        progress,
      )
      try {
        const imagePrompt = await llm.generate({
          messages: [
            { role: 'system', content: systemPrompt + protagonistRule },
            {
              role: 'user',
              content: `FULL SCRIPT (context): ${SAMPLE_SCRIPT}\n\nSCENE TO ILLUSTRATE: ${fragment.text}\n\nWrite the image prompt for this scene.${protagonistReminder}`,
            },
          ],
          parse(content) {
            const prompt = extractImagePrompt(content)
            return prompt || null
          },
          onProgress(content) {
            progress(Math.min(95, Math.round(content.length / 20)))
          },
        })
        reportSample(context, fragment.id, 'prompts', 100, 'completed')
        return { sampleId: fragment.id, imagePrompt }
      } finally {
        stop()
      }
    }),
  )
  context.signal.throwIfAborted()
  // Ningún prompt de relleno ni pago de imágenes con una fase incompleta.
  const promptFailure = promptResults.find(
    (result) => result.status === 'rejected',
  )
  if (promptFailure?.status === 'rejected') throw promptFailure.reason
  const prompts = [
    ...batch,
    ...promptResults.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    ),
  ].sort((left, right) => left.sampleId - right.sampleId)
  const referenceImageUrls = await sampleReferenceUrls(
    context,
    character,
    provider,
    apiKey,
  )
  return generateSampleImages(
    context,
    styleDirectory(context, style.id),
    prompts,
    provider,
    apiKey,
    (prompt, generate) =>
      generateSampleImage(
        context,
        character,
        prompt,
        referenceImageUrls,
        generate,
      ),
  )
}

// Una gema de PLANTILLA (spec §5.6): los cuatro momentos fijos salen como UN
// lote del carril verbatim, con el mismo marco y el mismo modo de personaje
// que el video, el modelo de Ajustes (`promptModel`; ausente = el de la casa)
// y las frases fijas pegadas por código. Los prompts llegan ya tejidos.
async function generateTemplateSamples(
  context: PipelineContext,
  style: CustomStyleSummary,
  sections: GemSections,
  promptModel: string | undefined,
  provider: ImageProvider,
  apiKey: string,
): Promise<GenerateStyleSamplesResult> {
  if (
    promptModel !== undefined &&
    (typeof promptModel !== 'string' ||
      promptModel.length > PROMPT_MODEL_ID_LIMIT)
  )
    throw new PipelineFailure(
      'invalid_payload',
      `payload.promptModel must be a string of at most ${PROMPT_MODEL_ID_LIMIT} characters`,
    )
  const deepinfraKey = context.job.apiKeys.deepinfra
  if (!deepinfraKey)
    throw new PipelineFailure('missing_api_key', 'deepinfra API key is missing')

  const resolved = await resolveSampleCharacter(context, style)
  const input = templateCharacterInput(resolved, style, sections)
  const log = (level: 'info' | 'warn') => (message: string) => {
    context.emitter.emit({ type: 'log', level, message })
  }
  log('info')(
    `style samples with the template frame · character mode: ${input.mode}`,
  )

  let batchPercent = 0
  const reportBatch = (percent: number) => {
    batchPercent = Math.max(batchPercent, percent)
    for (const fragment of SAMPLE_FRAGMENTS)
      reportSample(context, fragment.id, 'prompts', batchPercent, 'processing')
  }
  reportBatch(0)
  const stopBatch = startSimulatedProgress(
    Date.now(),
    PROMPT_EXPECTED_MS,
    reportBatch,
  )
  const written = await generateVerbatimPrompts(
    SAMPLE_FRAGMENTS.map((fragment) => ({
      n: fragment.id,
      text: fragment.text,
    })),
    SAMPLE_SCRIPT,
    {
      gem: composeGemText(sections),
      sections,
      modelId: promptModel,
      character: input,
      client: createVerbatimClient({
        apiKey: deepinfraKey,
        baseUrl: context.config.llm.baseUrl,
      }),
      signal: context.signal,
      onLog: log('info'),
      onWarn: log('warn'),
      onProgress: (ready, total) =>
        reportBatch(Math.min(95, Math.round((ready / total) * 100))),
    },
  ).finally(stopBatch)
  context.signal.throwIfAborted()
  // Ningún pago de imágenes con una fase incompleta.
  if (written.missing.length > 0)
    throw new PipelineFailure(
      'llm_empty_response',
      `the style did not write the sample prompts of moments ${written.missing.join(', ')}`,
    )

  const prompts = [...written.prompts]
    .map(([sampleId, imagePrompt]) => ({ sampleId, imagePrompt }))
    .sort((left, right) => left.sampleId - right.sampleId)
  for (const prompt of prompts)
    reportSample(context, prompt.sampleId, 'prompts', 100, 'completed')
  const referenceImageUrls = await sampleReferenceUrls(
    context,
    resolved.mode === 'design' ? { mode: 'none' } : resolved,
    provider,
    apiKey,
  )
  return generateSampleImages(
    context,
    styleDirectory(context, style.id),
    prompts,
    provider,
    apiKey,
    (prompt, generate) =>
      generateTemplateSampleImage(
        context,
        resolved,
        prompt,
        referenceImageUrls,
        generate,
      ),
  )
}

// El modo del carril para las muestras de una gema de plantilla: el mismo
// que tendría el video. Sin personaje del usuario, el de la sección
// `character` (salvo «Mi personaje»: ahí la sección no viaja) o el que diseña
// la Fase 1 con la gema como texto.
function templateCharacterInput(
  resolved: ResolvedSampleCharacter,
  style: CustomStyleSummary,
  sections: GemSections,
): VerbatimCharacterInput {
  if (resolved.mode === 'none') return { mode: 'none' }
  if (resolved.mode === 'text')
    return {
      mode: 'text',
      prompt: resolved.description,
      name: resolved.name,
    }
  if (resolved.mode === 'reference')
    return { mode: 'reference', name: resolved.name }

  const section =
    style.character?.mode === 'own' ? undefined : sections.character?.trim()
  if (section)
    return { mode: 'generic', designed: protagonistFromSection(section) }
  return { mode: 'generic' }
}

// Una muestra de gema de plantilla: el prompt ya viene tejido. Con foto viaja
// la referencia; sin referencia usable, o si el encargo con referencia falla,
// va como texto con la descripción de la biblioteca (el mismo rescate que el
// video). Cancelación, saldo agotado y clave rechazada salen tal cual.
async function generateTemplateSampleImage(
  context: PipelineContext,
  character: ResolvedSampleCharacter,
  prompt: PreviewPrompt,
  referenceImageUrls: string[],
  generate: SampleImageRequest,
): Promise<DecodedImage> {
  if (character.mode !== 'reference') return generate(prompt.imagePrompt)

  const asText = () =>
    rescueReferencePrompt(prompt.imagePrompt, [
      { name: character.name, description: character.description },
    ])
  if (referenceImageUrls.length === 0) return generate(asText())

  try {
    return await generate(
      buildCustomStyleReferencePrompt(character.name, prompt.imagePrompt),
      referenceImageUrls,
    )
  } catch (error) {
    context.signal.throwIfAborted()
    if (isInsufficientCreditsFailure(error) || isImageAuthFailure(error))
      throw error

    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `sample ${prompt.sampleId} failed with the character reference: retrying with the character as text`,
    })
    return generate(asText())
  }
}

function reportSample(
  context: PipelineContext,
  sampleId: number,
  phase: 'prompts' | 'images',
  percent: number,
  status: string,
): void {
  context.emitter.emit({
    type: 'progress',
    percent,
    detail: { phase, sampleId, status },
  })
}

// Las cuatro imágenes a la vez. Cada una se guarda y se anuncia en cuanto
// llega; `render` decide el encargo de cada muestra (con o sin referencia).
async function generateSampleImages(
  context: PipelineContext,
  directory: string,
  prompts: PreviewPrompt[],
  provider: ImageProvider,
  apiKey: string,
  render: (
    prompt: PreviewPrompt,
    generate: SampleImageRequest,
  ) => Promise<DecodedImage>,
): Promise<GenerateStyleSamplesResult> {
  // Publicar TODAS las tarjetas antes del primer POST.
  for (const prompt of prompts)
    reportSample(context, prompt.sampleId, 'images', 0, 'processing')
  const imageResults = await Promise.allSettled(
    prompts.map(async (prompt) => {
      const options = {
        apiKey,
        signal: context.signal,
        pollIntervalMs: PREVIEW_POLL_INTERVAL_MS,
        onFailure: createProviderFailureReporter(context.emitter),
        onProgress(progress: { percent: number; status: string }) {
          // 100 se reserva para el archivo escrito, no para el CDN listo.
          reportSample(
            context,
            prompt.sampleId,
            'images',
            Math.min(99, progress.percent),
            progress.status,
          )
        },
      }
      const generate: SampleImageRequest = (imagePrompt, references) => {
        const imageOptions = references
          ? { ...options, referenceImageUrls: references }
          : options
        if (provider === 'fal')
          return generateFalImage(imagePrompt, imageOptions)
        return generateEvolinkImage(imagePrompt, imageOptions)
      }
      try {
        const image = await render(prompt, generate)
        const path = join(directory, `sample-${prompt.sampleId}.jpg`)
        await writeFileAtomic(path, image.bytes)
        const { mtimeMs } = await stat(path)
        context.emitter.emit({
          type: 'progress',
          percent: 100,
          detail: {
            phase: 'images',
            sampleId: prompt.sampleId,
            status: 'completed',
            path,
            mtimeMs,
          },
        })
      } catch (error) {
        reportSample(context, prompt.sampleId, 'images', 0, 'failed')
        throw error
      }
    }),
  )
  context.signal.throwIfAborted()
  // Reemplazo atómico por muestra: jamás borrar las anteriores antes de
  // escribir las nuevas. Los éxitos parciales sobreviven a cualquier fallo.
  const failure = imageResults.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  return { samples: await readStyleSamples(directory) }
}

// Las referencias tal como las quiere cada proveedor: Fal recibe el data URI;
// Evolink, una URL pública que se sube UNA vez para las 4 muestras. Vacío =
// las muestras van por texto (sin personaje con imagen, o la subida falló —
// mismo degradado que el carril de personaje del video).
async function sampleReferenceUrls(
  context: PipelineContext,
  character: SampleCharacter,
  provider: ImageProvider,
  apiKey: string,
): Promise<string[]> {
  if (character.mode !== 'reference') return []
  if (provider === 'fal') return [character.imageDataUri]

  const url = await uploadEvolinkReference(character.imageDataUri, apiKey)
  context.signal.throwIfAborted()
  if (url) return [url]

  context.emitter.emit({
    type: 'log',
    level: 'warn',
    message:
      'the character reference could not be uploaded: samples carry the character as text',
  })
  return []
}

// Una muestra, con el personaje que corresponda. El encargo con referencia
// que falla se reintenta UNA vez como texto para no dejar la casilla vacía;
// cancelación, saldo agotado y clave rechazada salen tal cual — repetir el
// pedido fallaría igual.
async function generateSampleImage(
  context: PipelineContext,
  character: SampleCharacter,
  prompt: PreviewPrompt,
  referenceImageUrls: string[],
  generate: SampleImageRequest,
): Promise<DecodedImage> {
  // Sin protagonista el prompt viaja tal cual; la etiqueta pelada no puede
  // llegar al generador (una gema escrita para el video puede traerla).
  if (character.mode === 'none')
    return generate(neutralizeSampleSubject(prompt.imagePrompt))

  const textPrompt = weaveSampleIdentity(
    prompt.imagePrompt,
    character.description,
    character.name,
  )
  if (character.mode === 'text' || referenceImageUrls.length === 0)
    return generate(textPrompt)

  try {
    return await generate(
      buildCustomStyleReferencePrompt(
        character.name,
        pointSampleToReference(prompt.imagePrompt, character.name),
      ),
      referenceImageUrls,
    )
  } catch (error) {
    context.signal.throwIfAborted()
    if (isInsufficientCreditsFailure(error) || isImageAuthFailure(error))
      throw error

    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `sample ${prompt.sampleId} failed with the character reference: retrying with the character as text`,
    })
    return generate(textPrompt)
  }
}

// Gema sin personaje del usuario: ELLA dice quién es su protagonista (el que
// trae escrito, o uno diseñado) y ese mismo se teje en las cuatro muestras.
// Se resuelve con la MISMA Fase 1 del video (`designStyleProtagonist`): la
// gema cruda como system, la consigna portada con la precedencia del
// personaje del estilo, los recortes y el último recurso. Si no sale una
// descripción usable, las muestras se generan como siempre. Clave rechazada y
// saldo agotado cortan el job, igual que en la redacción.
async function designSampleProtagonist(
  context: PipelineContext,
  gem: string,
): Promise<SampleCharacter> {
  const apiKey = context.job.apiKeys.deepinfra
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'deepinfra API key is missing')

  const log = (level: 'info' | 'warn') => (message: string) => {
    context.emitter.emit({ type: 'log', level, message })
  }
  const protagonist = await designStyleProtagonist({
    gem,
    script: SAMPLE_SCRIPT,
    client: createVerbatimClient({
      apiKey,
      baseUrl: context.config.llm.baseUrl,
    }),
    signal: context.signal,
    onLog: log('info'),
    onWarn: log('warn'),
  })
  context.signal.throwIfAborted()
  if (protagonist)
    return { mode: 'text', name: '', description: protagonist.description }

  context.emitter.emit({
    type: 'log',
    level: 'warn',
    message:
      'the style protagonist could not be designed: samples are generated without a shared protagonist',
  })
  return { mode: 'none' }
}

function isImageAuthFailure(error: unknown): boolean {
  return (
    error instanceof PipelineFailure && error.code === 'image_invalid_api_key'
  )
}

interface PreviewPrompt {
  sampleId: number
  imagePrompt: string
}

interface BatchSample {
  sampleId?: unknown
  // Alias medido: una gema con formato de salida propio devuelve `id`.
  id?: unknown
  prompt?: unknown
}

// Un objeto de muestra suelto dentro de un texto que no es JSON válido.
const LOOSE_SAMPLE_REGEX =
  /\{\s*"(?:sampleId|id)"\s*:\s*\d+\s*,\s*"prompt"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}/g

// Las entradas del lote, venga como venga. El formato pedido es
// {"samples":[…]}, pero una gema que trae su propio formato de salida puede
// imponerlo (medido: {"prompts":[{"id":1,…}]}, un objeto por escena, a veces
// sin cerrar). Rescatar esas entradas evita cuatro pedidos individuales.
function batchEntries(content: string): unknown[] {
  const text = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    const parsed = JSON.parse(text) as { samples?: unknown; prompts?: unknown }
    if (Array.isArray(parsed?.samples)) return parsed.samples
    if (Array.isArray(parsed?.prompts)) return parsed.prompts
    return []
  } catch {
    return (text.match(LOOSE_SAMPLE_REGEX) ?? []).flatMap((piece) => {
      try {
        return [JSON.parse(piece) as unknown]
      } catch {
        return []
      }
    })
  }
}

// Solo IDs conocidos y únicos. Nunca asignar prompts por posición: el modelo
// puede devolver el lote fuera de orden o incompleto.
function parsePreviewBatch(content: string): PreviewPrompt[] {
  const prompts = new Map<number, string>()
  const seen = new Set<number>()
  for (const entry of batchEntries(content)) {
    if (!entry || typeof entry !== 'object') continue
    const sample = entry as BatchSample
    const id = sample.sampleId ?? sample.id
    if (
      typeof id !== 'number' ||
      !SAMPLE_FRAGMENTS.some((fragment) => fragment.id === id)
    )
      continue
    if (seen.has(id)) {
      prompts.delete(id)
      continue
    }
    seen.add(id)
    if (typeof sample.prompt !== 'string') continue
    const prompt = extractImagePrompt(
      JSON.stringify({ prompt_imagen: sample.prompt }),
    )
    if (prompt) prompts.set(id, prompt)
  }
  return [...prompts].map(([sampleId, imagePrompt]) => ({
    sampleId,
    imagePrompt,
  }))
}
````

- [ ] **Paso 4: correr y ver que pasa**

Run: `node --test scripts/test/check-gem-style-samples.mjs`
Expected: `ℹ tests 8`, `ℹ pass 8`, `ℹ fail 0`.

Run: `node --test scripts/test/check-gem-*.mjs` y la batería del carril.
Expected: `ℹ pass 80` y `ℹ pass 111` (check-preview-regressions pinea el camino de las gemas viejas: lote, concurrencia de las 4 imágenes, rescate y personaje).

- [ ] **Paso 5: formato, lint y tipos**

Run: `pnpm exec prettier --write pipeline/commands/styles/generate-style-samples.ts scripts/test/check-gem-style-samples.mjs`
Expected: los dos `(unchanged)`.

Run: `pnpm exec eslint pipeline/commands/styles/generate-style-samples.ts scripts/test/check-gem-style-samples.mjs && pnpm exec tsc -p tsconfig.pipeline.json --noEmit`
Expected: sin salida.

- [ ] **Paso 6: Commit (orquestador)**

```bash
git add pipeline/commands/styles/generate-style-samples.ts scripts/test/check-gem-style-samples.mjs
git commit -F- <<'EOF'
feat: generate template gem samples with the Vimo frame

Qué: para una gema de plantilla, generate-style-samples escribe los 4 momentos
fijos como un lote del carril verbatim, con el mismo marco y el mismo modo de
personaje que el video, el modelo promptModel del payload (ausente, el de la
casa) y las frases fijas pegadas por código. Con foto, el encargo lleva la
referencia y cae una vez a texto con el rescate del video. El ciclo de
imágenes pasa a generateSampleImages, compartido con el camino de siempre.

Por qué: spec §5.6: las muestras tienen que enseñar lo que va a salir en el
video, escrito por el mismo carril.

Con qué interactúa: las gemas viejas siguen por el lote JSON de previews
(check-preview-regressions intacto). La UI (frente C) manda promptModel desde
Ajustes. Guard nuevo: check-gem-style-samples.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Tarea A8 · Validación del proyecto y la gema como texto

Tres partes: **A8a** `create-video-project` acepta el snapshot con secciones; **A8b** los usos que
reciben «la gema como texto» leen las secciones (`buildCustomStyleSystemPrompt` usa `composeGemText`,
así lo hacen el preview de personaje de una gema de la galería y el estilo del fallback de imágenes,
que salen de `resolveProjectStyle`), y el retrato del preview lleva las frases fijas (spec §4.1);
**A8c** `design-style-character`, que necesita un campo que el contrato congelado no tiene: queda
condicionada a la propuesta P1 de «Problemas del contrato».

**Files:**

- Modify: `pipeline/commands/videos/create-video-project.ts` (A8a)
- Modify: `pipeline/prompts/custom-style.ts` (A8b)
- Modify: `pipeline/commands/characters/generate-character-preview.ts` (A8b)
- Test: `scripts/test/check-gem-project-snapshot.mjs` (A8a y A8b) y casos del harness
- A8c (solo con P1 aprobada): Modify `pipeline/types/styles.ts` y `pipeline/commands/styles/design-style-character.ts`; Test `scripts/test/check-gem-style-character-design.mjs`

**Interfaces:**

- Consumes: `assertGemSections`, `assertTemplateVersion`, `assertColorFilter`, `isCatalogStyleId`, `assertStyleCharacter`, `SYSTEM_PROMPT_CHAR_LIMIT`, `MAX_SHOTS` (A1); `composeGemText`, `applyFixedPhrases` (A3, A6); `ProjectCustomStyle` (Tarea 0).
- Produces:
  - `create-video-project`: con `options.customStyle`, nombre obligatorio y exactamente uno de `sections` o `systemPrompt` (mensajes `options.customStyle needs a name`, `… takes systemPrompt or sections, never both`, `… needs systemPrompt or sections`); secciones con los límites de la galería; `templateVersion` solo con secciones (1..`GEM_TEMPLATE_VERSION`); `colorFilter` de la lista; `catalogStyleId` que cumple `isCatalogStyleId`. El snapshot se guarda tal como llegó.
  - `buildCustomStyleSystemPrompt(style: { systemPrompt?: string; sections?: GemSections; shots?: string[] }): string`: con secciones, `composeGemText(sections) + '\n\n' + GLOBAL_RULES` (la sección `camera` reemplaza a los planos); sin ellas, lo de siempre.
  - `generate-character-preview`, rama de gema: el LLM recibe `buildCustomStyleSystemPrompt(style)`; con secciones, `finalPrompt = applyFixedPhrases(prompt del LLM, style.sections)`.
  - A8c (con P1): `DesignStyleCharacterPayload.gem?: string` + `sections?: GemSections`, excluyentes; con secciones, la gema viaja como `composeGemText(sections)`.

### A8a y A8b

- [ ] **Paso 1: escribir el guard que falla**

Crear `scripts/test/check-gem-project-snapshot.mjs`:

<!-- prettier-ignore -->
```js
// El snapshot de una gema de plantilla en el proyecto (spec §4.2): create-
// video-project exige exactamente uno de `sections` o `systemPrompt`, con los
// límites de la galería, el filtro de color, la versión y el id del catálogo.
// Los usos que reciben «la gema como texto» (el estilo del fallback de
// imágenes y el preview de un personaje) usan `composeGemText`. Una gema
// vieja sigue igual.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { createVideoProject } from '../../pipeline/commands/videos/create-video-project.ts'
import { generateCharacterPreview } from '../../pipeline/commands/characters/generate-character-preview.ts'
import { buildCustomStyleSystemPrompt } from '../../pipeline/prompts/custom-style.ts'
import { composeGemText } from '../../pipeline/prompts/template-frame.ts'
import { GLOBAL_RULES } from '../../pipeline/prompts/visual-styles.ts'
import { resolveProjectStyle } from '../../pipeline/stages/shared/project-style.ts'

const sections = {
  visualStyle: 'Simple stickman drawings on colorful backgrounds.',
  character:
    'A stickman doll with a round white head. Outfit: white gloves and white shoes.',
  camera: 'Alternate wide shots and close-ups.',
  promptStart: 'A simple stickman doll drawing:',
  promptEnd: 'Clean black lines on a colorful background.',
}
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)

async function projectsRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-snapshot-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
function context(root, payload, apiKeys = {}) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys,
      binaryPaths: {},
      payload,
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit() {} },
  }
}
function create(root, customStyle) {
  return createVideoProject(
    context(root, {
      name: 'Gema de plantilla',
      script: 'Una historia corta para probar la gema por secciones.',
      options: {
        styleId: 'normal',
        sceneCount: 0,
        narrationMode: 'tts',
        imageProvider: 'fal',
        useBgm: false,
        useOverlay: false,
        confirmScenes: false,
        customStyle,
      },
    }),
  )
}
const template = (extra = {}) => ({
  styleId: 'st-stickman',
  name: 'Stickman',
  sections,
  templateVersion: 1,
  colorFilter: 'fantasy',
  character: { mode: 'generic' },
  ...extra,
})
const invalid = { code: 'invalid_payload' }

// ── create-video-project ──

test('a template snapshot is accepted and stored as sent', async (t) => {
  const root = await projectsRoot(t)
  const { projectDir } = await create(
    root,
    template({ catalogStyleId: 'pov_stickman' }),
  )
  const metadata = JSON.parse(
    await readFile(join(projectDir, 'project.json'), 'utf8'),
  )
  assert.deepEqual(metadata.options.customStyle.sections, sections)
  assert.equal(metadata.options.customStyle.templateVersion, 1)
  assert.equal(metadata.options.customStyle.colorFilter, 'fantasy')
  assert.equal(metadata.options.customStyle.catalogStyleId, 'pov_stickman')
  assert.equal(metadata.options.customStyle.systemPrompt, undefined)
})

test('an old gem snapshot is still accepted', async (t) => {
  const root = await projectsRoot(t)
  await create(root, {
    styleId: 'st-legacy',
    name: 'Watercolor',
    systemPrompt: 'Render every scene as a watercolor.',
    shots: ['Wide shot'],
    character: { mode: 'none' },
  })
})

test('a new catalog id with the gallery pattern is accepted', async (t) => {
  const root = await projectsRoot(t)
  await create(root, template({ catalogStyleId: 'st-noir' }))
})

for (const [name, customStyle] of [
  ['both kinds of gem', template({ systemPrompt: 'Watercolor.' })],
  [
    'neither kind of gem',
    template({ sections: undefined, templateVersion: undefined }),
  ],
  ['no name', template({ name: '  ' })],
  [
    'a blank visual style',
    template({ sections: { ...sections, visualStyle: ' ' } }),
  ],
  [
    'a section over 12 000',
    template({ sections: { visualStyle: 'x'.repeat(12_001) } }),
  ],
  [
    'a character over 700',
    template({ sections: { ...sections, character: 'x'.repeat(701) } }),
  ],
  [
    'a fixed end over 600',
    template({ sections: { ...sections, promptEnd: 'x'.repeat(601) } }),
  ],
  ['a newer template version', template({ templateVersion: 2 })],
  [
    'a template version on an old gem',
    {
      styleId: 'st-legacy',
      name: 'Old',
      systemPrompt: 'Watercolor.',
      templateVersion: 1,
    },
  ],
  ['an unknown color filter', template({ colorFilter: 'sepia' })],
  ['an unsafe catalog id', template({ catalogStyleId: '../evil' })],
  [
    'a catalog id with an underscore that is not a legacy one',
    template({ catalogStyleId: 'my_style' }),
  ],
]) {
  test('create-video-project rejects ' + name, async (t) => {
    const root = await projectsRoot(t)
    await assert.rejects(create(root, customStyle), invalid)
  })
}

// ── La gema como texto ──

test('the project style of a template gem is its text plus the house rules; an old gem is unchanged', () => {
  const options = (customStyle) => ({
    styleId: 'normal',
    sceneCount: 0,
    narrationMode: 'tts',
    imageProvider: 'fal',
    useBgm: false,
    useOverlay: false,
    confirmScenes: false,
    customStyle,
  })
  assert.equal(
    resolveProjectStyle(options(template({ shots: ['Wide shot'] })))
      .systemPrompt,
    composeGemText(sections) + '\n\n' + GLOBAL_RULES,
    'la sección de cámara reemplaza a los planos',
  )
  assert.equal(
    buildCustomStyleSystemPrompt({
      systemPrompt: 'Watercolor.',
      shots: ['Wide shot'],
    }),
    'Watercolor.\n\n# ALLOWED SHOTS (use ONLY these framings)\n- Wide shot\n\n' +
      GLOBAL_RULES,
  )
})

test('the character preview of a template gem writes with the gem text and carries the fixed phrases', async (t) => {
  const root = await projectsRoot(t)
  const directory = join(root, '_styles', 'st-stickman')
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'style.json'),
    JSON.stringify({
      name: 'Stickman',
      sections,
      templateVersion: 1,
      shots: [],
      createdAt: '2026-09-30T00:00:00.000Z',
    }),
  )
  const requests = { text: [], images: [] }
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = String(url)
    if (target.includes('chat/completions')) {
      requests.text.push(JSON.parse(init.body))
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                prompt_imagen:
                  'Full-body view of Elena standing on a plain neutral background.',
              }),
            },
          },
        ],
      })
    }
    if (target.startsWith('https://fal.run/')) {
      requests.images.push(JSON.parse(init.body))
      return Response.json({ images: [{ url: 'https://fixture.invalid/x' }] })
    }
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  const result = await generateCharacterPreview(
    context(
      root,
      {
        styleId: 'st-stickman',
        identityPrompt: 'Elena, a young woman with curly red hair.',
        provider: 'fal',
      },
      { deepinfra: 'fixture', fal: 'fixture' },
    ),
  )
  assert.equal(
    requests.text[0].messages[0].content,
    composeGemText(sections) + '\n\n' + GLOBAL_RULES,
  )
  assert.ok(
    !requests.text[0].messages[0].content.includes(
      'stickman doll with a round white head',
    ),
  )
  assert.equal(
    result.finalPrompt,
    sections.promptStart +
      ' Full-body view of Elena standing on a plain neutral background. ' +
      sections.promptEnd,
  )
  assert.equal(requests.images[0].prompt, result.finalPrompt)
})
```

- [ ] **Paso 2: correr y ver que falla**

Run: `node --test scripts/test/check-gem-project-snapshot.mjs`
Expected: FAIL, `ℹ pass 11`, `ℹ fail 6`. Fallan «a template snapshot is accepted and stored as sent», «a new catalog id with the gallery pattern is accepted», «create-video-project rejects both kinds of gem», «create-video-project rejects a template version on an old gem», «the project style of a template gem is its text plus the house rules…» y «the character preview of a template gem…».

- [ ] **Paso 3: validar el snapshot (A8a)**

En `pipeline/commands/videos/create-video-project.ts`:

Edición 1 de 4 — reemplazar:

<!-- prettier-ignore -->
```ts
import {
  MAX_SHOTS,
  SYSTEM_PROMPT_CHAR_LIMIT,
  assertStyleCharacter,
} from '../styles/style-store.ts'
import {
  MAX_SECONDS_PER_SCENE,
```

por:

<!-- prettier-ignore -->
```ts
import {
  MAX_SHOTS,
  SYSTEM_PROMPT_CHAR_LIMIT,
  assertColorFilter,
  assertGemSections,
  assertStyleCharacter,
  assertTemplateVersion,
  isCatalogStyleId,
} from '../styles/style-store.ts'
import {
  MAX_SECONDS_PER_SCENE,
```

Edición 2 de 4 — reemplazar:

<!-- prettier-ignore -->
```ts
  CreateVideoProjectResult,
  NewVideoProjectCharacter,
  ProjectCharacter,
  VideoProjectMetadata,
} from '../../types/video-project.ts'
import { TTS_TEXT_CHAR_LIMIT } from '../../providers/tts/text-limits.ts'
```

por:

<!-- prettier-ignore -->
```ts
  CreateVideoProjectResult,
  NewVideoProjectCharacter,
  ProjectCharacter,
  ProjectCustomStyle,
  VideoProjectMetadata,
} from '../../types/video-project.ts'
import { TTS_TEXT_CHAR_LIMIT } from '../../providers/tts/text-limits.ts'
```

Edición 3 de 4 — reemplazar:

<!-- prettier-ignore -->
```ts
  // Estilo propio inline (snapshot): mismos límites que la galería. styleId
  // se valida igual arriba — con customStyle la UI manda 'normal'.
  const customStyle = options.customStyle
  if (customStyle !== undefined) {
    if (!customStyle.name?.trim() || !customStyle.systemPrompt?.trim())
      throw new PipelineFailure(
        'invalid_payload',
        'options.customStyle needs name and systemPrompt',
      )
    if (customStyle.systemPrompt.length > SYSTEM_PROMPT_CHAR_LIMIT)
      throw new PipelineFailure(
        'invalid_payload',
        `options.customStyle.systemPrompt exceeds ${SYSTEM_PROMPT_CHAR_LIMIT} characters`,
      )
    if ((customStyle.shots?.length ?? 0) > MAX_SHOTS)
      throw new PipelineFailure(
        'invalid_payload',
        `options.customStyle allows at most ${MAX_SHOTS} shots`,
      )
    if (customStyle.character !== undefined)
      assertStyleCharacter(
        customStyle.character,
        'options.customStyle.character',
      )
  }

  const sceneCount = options.sceneCount
  if (
```

por:

<!-- prettier-ignore -->
```ts
  // Estilo propio inline (snapshot): mismos límites que la galería. styleId
  // se valida igual arriba — con customStyle la UI manda 'normal'.
  const customStyle = options.customStyle
  if (customStyle !== undefined) assertProjectCustomStyle(customStyle)

  const sceneCount = options.sceneCount
  if (
```

Edición 4 de 4 — reemplazar:

<!-- prettier-ignore -->
```ts
    throw new PipelineFailure(
      'invalid_payload',
      `at most ${MAX_PROJECT_CHARACTERS} characters per project`,
    )
}
```

por:

<!-- prettier-ignore -->
```ts
    throw new PipelineFailure(
      'invalid_payload',
      `at most ${MAX_PROJECT_CHARACTERS} characters per project`,
    )
}

// El snapshot de la gema (ADR-0018, ADR-0041): vieja (`systemPrompt`) o de
// plantilla (`sections`), nunca las dos, con los mismos límites que la
// galería. Lo demás del snapshot se valida igual para los dos tipos.
function assertProjectCustomStyle(customStyle: ProjectCustomStyle): void {
  if (!customStyle.name?.trim())
    throw new PipelineFailure(
      'invalid_payload',
      'options.customStyle needs a name',
    )
  if (customStyle.sections !== undefined) {
    if (customStyle.systemPrompt !== undefined)
      throw new PipelineFailure(
        'invalid_payload',
        'options.customStyle takes systemPrompt or sections, never both',
      )
    assertGemSections(customStyle.sections, 'options.customStyle.sections')
    if (customStyle.templateVersion !== undefined)
      assertTemplateVersion(
        customStyle.templateVersion,
        'options.customStyle.templateVersion',
      )
  } else {
    if (!customStyle.systemPrompt?.trim())
      throw new PipelineFailure(
        'invalid_payload',
        'options.customStyle needs systemPrompt or sections',
      )
    if (customStyle.systemPrompt.length > SYSTEM_PROMPT_CHAR_LIMIT)
      throw new PipelineFailure(
        'invalid_payload',
        `options.customStyle.systemPrompt exceeds ${SYSTEM_PROMPT_CHAR_LIMIT} characters`,
      )
    if (customStyle.templateVersion !== undefined)
      throw new PipelineFailure(
        'invalid_payload',
        'options.customStyle.templateVersion only applies to sections',
      )
  }
  if ((customStyle.shots?.length ?? 0) > MAX_SHOTS)
    throw new PipelineFailure(
      'invalid_payload',
      `options.customStyle allows at most ${MAX_SHOTS} shots`,
    )
  if (customStyle.character !== undefined)
    assertStyleCharacter(customStyle.character, 'options.customStyle.character')
  if (customStyle.colorFilter !== undefined)
    assertColorFilter(
      customStyle.colorFilter,
      'options.customStyle.colorFilter',
    )
  if (
    customStyle.catalogStyleId !== undefined &&
    !isCatalogStyleId(customStyle.catalogStyleId)
  )
    throw new PipelineFailure(
      'invalid_payload',
      'options.customStyle.catalogStyleId is not a valid style id',
    )
}
```

- [ ] **Paso 4: la gema como texto (A8b)**

En `pipeline/prompts/custom-style.ts`:

Edición 1 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
import { GLOBAL_RULES } from './visual-styles.ts'

// El systemPrompt del usuario define el ESTILO, pero no conoce el contrato de
```

por:

<!-- prettier-ignore -->
```ts
import type { GemSections } from '../types/styles.ts'
import { composeGemText } from './template-frame.ts'
import { GLOBAL_RULES } from './visual-styles.ts'

// El systemPrompt del usuario define el ESTILO, pero no conoce el contrato de
```

Edición 2 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
// prompt-extraction). Se le anexan los planos permitidos y las GLOBAL_RULES
// (CONTENT SAFETY + OUTPUT FORMAT) — mismo criterio que el carril Storytime
// del origen. El envío VERBATIM sin envoltorio es del carril verbatim (rama
// posterior del roadmap, ADR-0016).
export function buildCustomStyleSystemPrompt(style: {
  systemPrompt?: string
  shots?: string[]
}): string {
  const shots = (style.shots ?? []).filter(Boolean)
  const shotsBlock =
    shots.length > 0
```

por:

<!-- prettier-ignore -->
```ts
// prompt-extraction). Se le anexan los planos permitidos y las GLOBAL_RULES
// (CONTENT SAFETY + OUTPUT FORMAT) — mismo criterio que el carril Storytime
// del origen. El envío VERBATIM sin envoltorio es del carril verbatim (rama
// posterior del roadmap, ADR-0016). Una gema de PLANTILLA (ADR-0041) entra
// como el texto de sus secciones: su sección de cámara reemplaza a los planos.
export function buildCustomStyleSystemPrompt(style: {
  systemPrompt?: string
  sections?: GemSections
  shots?: string[]
}): string {
  if (style.sections)
    return `${composeGemText(style.sections)}\n\n${GLOBAL_RULES}`

  const shots = (style.shots ?? []).filter(Boolean)
  const shotsBlock =
    shots.length > 0
```

En `pipeline/commands/characters/generate-character-preview.ts`:

Edición 1 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
  buildPreviewScene,
} from '../../prompts/character-preview.ts'
import { buildCustomStyleSystemPrompt } from '../../prompts/custom-style.ts'
import {
  VISUAL_STYLES,
  assembleUserScenePrompt,
```

por:

<!-- prettier-ignore -->
```ts
  buildPreviewScene,
} from '../../prompts/character-preview.ts'
import { buildCustomStyleSystemPrompt } from '../../prompts/custom-style.ts'
import { applyFixedPhrases } from '../../prompts/template-frame.ts'
import {
  VISUAL_STYLES,
  assembleUserScenePrompt,
```

Edición 2 de 2 — reemplazar:

<!-- prettier-ignore -->
```ts
      'the style did not write a usable preview prompt',
    )

  return imagePrompt
}
```

por:

<!-- prettier-ignore -->
```ts
      'the style did not write a usable preview prompt',
    )

  // Una gema de plantilla pega sus frases fijas también al retrato: van en
  // cada prompt de imagen (spec §4.1).
  if (style.sections) return applyFixedPhrases(imagePrompt, style.sections)
  return imagePrompt
}
```

- [ ] **Paso 5: correr y ver que pasa**

Run: `node --test scripts/test/check-gem-project-snapshot.mjs`
Expected: `ℹ tests 17`, `ℹ pass 17`, `ℹ fail 0`.

Run: `node --test scripts/test/check-gem-*.mjs` y la batería del carril.
Expected: `ℹ pass 97` y `ℹ pass 111`.

- [ ] **Paso 6: casos del harness (sidecar real por CLI, sin claves)**

El harness escribe solo en la carpeta de `--root`. Correr desde la raíz del repo, todo en una misma
llamada (la variable `ROOT` no sobrevive entre llamadas de la terminal):

```bash
ROOT="$(mktemp -d)"
pnpm pipeline:harness create-video-project --root "$ROOT" --payload '{"name":"Gema plantilla","script":"Una historia corta para probar la gema por secciones.","options":{"styleId":"normal","sceneCount":0,"narrationMode":"tts","imageProvider":"fal","useBgm":false,"useOverlay":false,"confirmScenes":false,"customStyle":{"styleId":"st-harness","name":"Stickman","sections":{"visualStyle":"Simple stickman drawings on colorful backgrounds.","promptEnd":"Clean black lines."},"templateVersion":1,"colorFilter":"fantasy","character":{"mode":"none"}}}}'
pnpm pipeline:harness create-video-project --root "$ROOT" --payload '{"name":"Gema doble","script":"Una historia corta para probar la gema por secciones.","options":{"styleId":"normal","sceneCount":0,"narrationMode":"tts","imageProvider":"fal","useBgm":false,"useOverlay":false,"confirmScenes":false,"customStyle":{"styleId":"st-harness","name":"Stickman","systemPrompt":"Watercolor.","sections":{"visualStyle":"Simple stickman drawings."}}}}'
pnpm pipeline:harness create-video-project --root "$ROOT" --payload '{"name":"Gema vieja","script":"Una historia corta para probar la gema vieja.","options":{"styleId":"normal","sceneCount":0,"narrationMode":"tts","imageProvider":"fal","useBgm":false,"useOverlay":false,"confirmScenes":false,"customStyle":{"styleId":"st-legacy","name":"Acuarela","systemPrompt":"Watercolor illustration with indigo washes.","character":{"mode":"none"}}}}'
pnpm pipeline:harness style-save --root "$ROOT" --payload '{"id":"st-harness","name":"Stickman","sections":{"visualStyle":"Simple stickman drawings on colorful backgrounds."},"templateVersion":1,"colorFilter":"horror-bw"}'
pnpm pipeline:harness style-save --root "$ROOT" --payload '{"id":"st-harness","name":"Stickman","sections":{"visualStyle":"  "}}'
rm -rf "$ROOT"
```

Expected: cada comando imprime `{"type":"job-started",…}` y después, en este orden:

1. `{"type":"job-completed","result":{"projectId":"gema-plantilla","projectDir":"<ROOT>/gema-plantilla"},…}`
2. `{"type":"job-failed","code":"invalid_payload","message":"options.customStyle takes systemPrompt or sections, never both",…}`
3. `{"type":"job-completed","result":{"projectId":"gema-vieja",…},…}` (una gema vieja se crea como hoy)
4. `{"type":"job-completed","result":{"entry":{"id":"st-harness","name":"Stickman","sections":{"visualStyle":"Simple stickman drawings on colorful backgrounds."},"templateVersion":1,"colorFilter":"horror-bw","shots":[],"createdAt":"…","updatedAt":"…","samples":[]}},…}`
5. `{"type":"job-failed","code":"invalid_payload","message":"payload.sections.visualStyle is required",…}`

- [ ] **Paso 7: formato, lint y tipos**

Run: `pnpm exec prettier --write pipeline/commands/videos/create-video-project.ts pipeline/prompts/custom-style.ts pipeline/commands/characters/generate-character-preview.ts scripts/test/check-gem-project-snapshot.mjs`
Expected: todos `(unchanged)`.

Run: `pnpm exec eslint pipeline/commands/videos/create-video-project.ts pipeline/prompts/custom-style.ts pipeline/commands/characters/generate-character-preview.ts scripts/test/check-gem-project-snapshot.mjs && pnpm exec tsc -p tsconfig.pipeline.json --noEmit`
Expected: sin salida.

- [ ] **Paso 8: Commit (orquestador)**

```bash
git add pipeline/commands/videos/create-video-project.ts pipeline/prompts/custom-style.ts pipeline/commands/characters/generate-character-preview.ts scripts/test/check-gem-project-snapshot.mjs
git commit -F- <<'EOF'
feat: validate template gem snapshots and reuse the gem text

Qué: create-video-project acepta el snapshot de una gema de plantilla:
exactamente uno de sections o systemPrompt, los límites de la galería,
templateVersion solo con secciones, colorFilter de la lista y catalogStyleId
del catálogo heredado o con el patrón de la galería. buildCustomStyleSystemPrompt
usa composeGemText cuando la gema tiene secciones, así el preview de un
personaje con una gema de la galería y el estilo del fallback de imágenes leen
sus secciones; el retrato del preview lleva también las frases fijas.

Por qué: spec §4.2 (la copia de la gema en el proyecto) y los usos de «la gema
como texto» del spec §5; sin esto un proyecto con secciones no podía crearse.

Con qué interactúa: los proyectos con gema vieja se crean igual; run-video-pipeline
recibe el snapshot validado; el payload que arma el frente C en Crear
(formPayload) viaja con sections, templateVersion y colorFilter. Guard nuevo:
check-gem-project-snapshot, más los casos del harness.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### A8c · `design-style-character` con secciones (condicionada a P1)

**Solo si el orquestador aprueba la propuesta P1** (sumar `sections` a `DesignStyleCharacterPayload`)
con el dueño. Si no se aprueba, esta sub-tarea no se hace: `design-style-character` sigue aceptando
solo `gem` (texto) y el frente C no puede ofrecer «Crear personaje con mi estilo» con una gema de
plantilla. El resto de la Entrega 1 no depende de esto.

- [ ] **Paso 1: escribir el guard que falla**

Crear `scripts/test/check-gem-style-character-design.mjs`:

<!-- prettier-ignore -->
```js
// «Crear personaje con mi estilo» con una gema de plantilla (propuesta P1 del
// plan del sidecar): design-style-character recibe las secciones y usa la
// gema como texto (`composeGemText`), sin la sección `character`. La gema
// vieja, como siempre. LLM simulado.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { designStyleCharacter } from '../../pipeline/commands/styles/design-style-character.ts'
import { composeGemText } from '../../pipeline/prompts/template-frame.ts'

const sections = {
  visualStyle: 'Simple stickman drawings on colorful backgrounds.',
  character:
    'A stickman doll with a round white head. Outfit: white gloves and white shoes.',
  camera: 'Alternate wide shots and close-ups.',
}
const script =
  'Elena repara una antena roja fuera de la estación y sonríe a las estrellas.'
const sheet = {
  nombre: 'Elena',
  edad: '32 años',
  rol: 'ingeniera',
  descripcion:
    'Shoulder-length curly red hair, round green glasses, a teal work jacket over a grey shirt, dark cargo pants, sturdy brown boots, slim build, freckled light skin.',
}

function context(payload) {
  return {
    job: {
      jobId: 'fixture',
      apiKeys: { deepinfra: 'fixture' },
      binaryPaths: {},
      payload: { script, ...payload },
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit() {} },
  }
}
function llm(t) {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    requests.push(JSON.parse(init.body))
    return new Response(
      'data: ' +
        JSON.stringify({
          choices: [
            {
              delta: { content: JSON.stringify(sheet) },
              finish_reason: 'stop',
            },
          ],
        }) +
        '\n\ndata: [DONE]\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    )
  })
  return requests
}

test('a template gem travels as its text, without the character section', async (t) => {
  const requests = llm(t)
  const result = await designStyleCharacter(context({ sections }))
  assert.equal(result.name, 'Elena')
  const user = requests[0].messages[1].content
  assert.ok(user.includes('"""\n' + composeGemText(sections) + '\n"""'))
  assert.ok(!user.includes('stickman doll with a round white head'))
})

test('an old gem travels as always', async (t) => {
  const requests = llm(t)
  await designStyleCharacter(
    context({ gem: '  Render every scene as a watercolor.  ' }),
  )
  assert.ok(
    requests[0].messages[1].content.includes(
      '"""\nRender every scene as a watercolor.\n"""',
    ),
  )
})

for (const [name, payload] of [
  ['both kinds of gem', { gem: 'Watercolor.', sections }],
  ['neither kind of gem', {}],
  ['broken sections', { sections: { visualStyle: ' ' } }],
]) {
  test(
    'design-style-character rejects ' + name + ' before any request',
    async (t) => {
      const requests = llm(t)
      await assert.rejects(designStyleCharacter(context(payload)), {
        code: 'invalid_payload',
      })
      assert.equal(requests.length, 0)
    },
  )
}
```

- [ ] **Paso 2: correr y ver que falla**

Run: `node --test scripts/test/check-gem-style-character-design.mjs`
Expected: FAIL, `ℹ pass 3`, `ℹ fail 2`: fallan «a template gem travels as its text, without the character section» (`invalid_payload`: `payload.gem is required`) y «design-style-character rejects both kinds of gem before any request».

- [ ] **Paso 3: el campo del contrato (P1)**

En `pipeline/types/styles.ts`:

Edición 1 de 1 — reemplazar:

<!-- prettier-ignore -->
```ts
// del usuario como contexto (port de POST /estilos/personaje del origen) ───

export interface DesignStyleCharacterPayload {
  gem: string
  script: string
  // Modelo del carril verbatim; ausente = el de la casa.
  promptModel?: string
```

por:

<!-- prettier-ignore -->
```ts
// del usuario como contexto (port de POST /estilos/personaje del origen) ───

export interface DesignStyleCharacterPayload {
  /** Gema vieja como texto. Excluyente con `sections`. */
  gem?: string
  /** Gema de plantilla (ADR-0041): el sidecar la pasa a texto. Excluyente
   *  con `gem`. */
  sections?: GemSections
  script: string
  // Modelo del carril verbatim; ausente = el de la casa.
  promptModel?: string
```

- [ ] **Paso 4: la gema como texto en el diseño del personaje**

En `pipeline/commands/styles/design-style-character.ts`:

Edición 1 de 4 — reemplazar:

<!-- prettier-ignore -->
```ts
  STYLE_CHARACTER_INSTRUCTION,
  buildStyleCharacterRequest,
} from '../../prompts/style-character-designer.ts'
import { resolveVerbatimModel } from '../../providers/llm/model-catalog.ts'
import { createVerbatimClient } from '../../providers/llm/verbatim-client.ts'
import type { PipelineContext } from '../../runner/context.ts'
```

por:

<!-- prettier-ignore -->
```ts
  STYLE_CHARACTER_INSTRUCTION,
  buildStyleCharacterRequest,
} from '../../prompts/style-character-designer.ts'
import { composeGemText } from '../../prompts/template-frame.ts'
import { resolveVerbatimModel } from '../../providers/llm/model-catalog.ts'
import { createVerbatimClient } from '../../providers/llm/verbatim-client.ts'
import type { PipelineContext } from '../../runner/context.ts'
```

Edición 2 de 4 — reemplazar:

<!-- prettier-ignore -->
```ts
  DesignStyleCharacterPayload,
  DesignStyleCharacterResult,
} from '../../types/styles.ts'
import { SYSTEM_PROMPT_CHAR_LIMIT } from './style-store.ts'

// Límites del origen (rutas/estilos.ts): campos cortos a 80, borrador a
// 2.000, descripción devuelta a 1.500 y un mínimo de 60 tras la poda.
```

por:

<!-- prettier-ignore -->
```ts
  DesignStyleCharacterPayload,
  DesignStyleCharacterResult,
} from '../../types/styles.ts'
import { SYSTEM_PROMPT_CHAR_LIMIT, assertGemSections } from './style-store.ts'

// Límites del origen (rutas/estilos.ts): campos cortos a 80, borrador a
// 2.000, descripción devuelta a 1.500 y un mínimo de 60 tras la poda.
```

Edición 3 de 4 — reemplazar:

<!-- prettier-ignore -->
```ts
}

/**
 * Diseña al protagonista con el ESTILO del usuario como contexto (port de
 * POST /estilos/personaje del origen, v1.21.0): una sola llamada por el
 * cliente verbatim, con el modelo del proyecto. Respeta los campos que el
```

por:

<!-- prettier-ignore -->
```ts
}

/**
 * La gema como texto: la de una gema vieja, o las secciones de una de
 * plantilla (sin la sección `character`: acá se diseña OTRO personaje).
 * Exactamente una de las dos.
 */
function gemTextOf(payload: Partial<DesignStyleCharacterPayload>): string {
  const text = typeof payload.gem === 'string' ? payload.gem.trim() : ''
  if (payload.sections !== undefined) {
    if (text)
      throw new PipelineFailure(
        'invalid_payload',
        'payload.gem and payload.sections are mutually exclusive',
      )
    return composeGemText(
      assertGemSections(payload.sections, 'payload.sections'),
    )
  }
  if (!text)
    throw new PipelineFailure('invalid_payload', 'payload.gem is required')
  if (text.length > SYSTEM_PROMPT_CHAR_LIMIT)
    throw new PipelineFailure('invalid_payload', 'payload.gem is too long')
  return text
}

/**
 * Diseña al protagonista con el ESTILO del usuario como contexto (port de
 * POST /estilos/personaje del origen, v1.21.0): una sola llamada por el
 * cliente verbatim, con el modelo del proyecto. Respeta los campos que el
```

Edición 4 de 4 — reemplazar:

<!-- prettier-ignore -->
```ts
): Promise<DesignStyleCharacterResult> {
  const payload = (context.job.payload ??
    {}) as Partial<DesignStyleCharacterPayload>
  const gem = typeof payload.gem === 'string' ? payload.gem.trim() : ''
  const script = typeof payload.script === 'string' ? payload.script.trim() : ''
  if (!gem)
    throw new PipelineFailure('invalid_payload', 'payload.gem is required')
  if (gem.length > SYSTEM_PROMPT_CHAR_LIMIT)
    throw new PipelineFailure('invalid_payload', 'payload.gem is too long')
  if (script.length < MIN_SCRIPT_LENGTH)
    throw new PipelineFailure(
      'invalid_payload',
```

por:

<!-- prettier-ignore -->
```ts
): Promise<DesignStyleCharacterResult> {
  const payload = (context.job.payload ??
    {}) as Partial<DesignStyleCharacterPayload>
  const gem = gemTextOf(payload)
  const script = typeof payload.script === 'string' ? payload.script.trim() : ''
  if (script.length < MIN_SCRIPT_LENGTH)
    throw new PipelineFailure(
      'invalid_payload',
```

- [ ] **Paso 5: correr y ver que pasa**

Run: `node --test scripts/test/check-gem-style-character-design.mjs`
Expected: `ℹ tests 5`, `ℹ pass 5`, `ℹ fail 0`.

Run: `pnpm exec tsc -p tsconfig.pipeline.json --noEmit && pnpm exec tsc -p tsconfig.app.json --noEmit && echo OK`
Expected: `OK` (la app manda `gem` como hoy y `gem?` lo acepta).

Run: `node --test scripts/test/check-gem-*.mjs` y la batería del carril.
Expected: `ℹ pass 102` y `ℹ pass 111`.

- [ ] **Paso 6: formato y lint**

Run: `pnpm exec prettier --write pipeline/types/styles.ts pipeline/commands/styles/design-style-character.ts scripts/test/check-gem-style-character-design.mjs && pnpm exec eslint pipeline/types/styles.ts pipeline/commands/styles/design-style-character.ts scripts/test/check-gem-style-character-design.mjs`
Expected: los tres `(unchanged)` y ESLint sin salida.

- [ ] **Paso 7: Commit (orquestador)**

```bash
git add pipeline/types/styles.ts pipeline/commands/styles/design-style-character.ts scripts/test/check-gem-style-character-design.mjs
git commit -F- <<'EOF'
feat: design style characters from template gem sections

Qué: DesignStyleCharacterPayload acepta sections como alternativa excluyente a
gem, y design-style-character las pasa a texto con composeGemText (sin la
sección character: acá se diseña otro personaje). Rechaza las dos a la vez, o
ninguna, antes de cualquier pedido.

Por qué: «Crear personaje con mi estilo» (ADR-0020) recibe la gema como texto;
una gema de plantilla no tiene systemPrompt y la app no puede componer el
texto (solo importa tipos del sidecar). Amplía el contrato congelado de la
Ola 0 con la aprobación del dueño (propuesta P1 del plan del sidecar).

Con qué interactúa: CharacterSection (frente C) manda sections para una gema
de plantilla y gem para una vieja; el resto del flujo no cambia. Guard nuevo:
check-gem-style-character-design.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

## Cobertura del spec

| Requisito (spec)                                                                                                                   | Tarea                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| §4.1 secciones, idiomas y límites                                                                                                  | 0 (tipos), A1 (galería), A8a (snapshot)                     |
| §4.2 `sections`, `templateVersion`, `sourcePrompt`, `colorFilter`, `origin`, `updatedAt`; nunca `sections` y `systemPrompt` juntos | 0, A1, A8a                                                  |
| §4.3 editar una sección guarda directo; sin `visualStyle` no se guarda                                                             | A1                                                          |
| §4.4 gema vieja sigue por el camino viejo                                                                                          | A4 (huellas), A7 (lote de siempre), A8a                     |
| §5.1 orden del `system`, reglas nuevas, `character` fuera del `system`                                                             | A3                                                          |
| §5.2 modos `generic` (sección o Fase 1), `own`, `none`                                                                             | A4                                                          |
| §5.3 etiqueta `[T:…]`, `scene.treatment`, log del reparto                                                                          | A5                                                          |
| §5.4 inicio y final fijos, sin `restoreStyleTail`, recorte con prioridad                                                           | A6                                                          |
| §5.5 presets de color y `filterFinal`                                                                                              | A2                                                          |
| §5.6 muestras con el marco, `promptModel`, frases fijas                                                                            | A7                                                          |
| §5.7 lo que no cambia (lotes, escalera, rescate, E34, idioma, vestuario, `styleProtagonist`)                                       | A4 (huellas y E34/editor), batería del carril en cada tarea |
| §8 ids del catálogo heredados o con `STYLE_ID_PATTERN`                                                                             | A1 (`origin`), A8a (`catalogStyleId`)                       |
| §11 generación con gema de plantilla: mismo manejo de errores que el carril                                                        | A4–A7 (no se toca el manejo de errores del writer)          |
| §12 guards puros del sidecar                                                                                                       | A1–A8                                                       |

---

## Problemas del contrato

**P1 · `design-style-character` no puede recibir una gema de plantilla (bloqueante para una
función).** El contrato congelado solo tiene `DesignStyleCharacterPayload.gem: string`. Una gema de
plantilla no tiene `systemPrompt`, y la app no puede componer su texto porque solo importa tipos del
sidecar (el alias `@pipeline/*` es solo para `import type`): con el arreglo de la Tarea 0,
`CharacterSection` mandaría `gem: ''` y el sidecar respondería `invalid_payload`. **Propuesta:** en
`pipeline/types/styles.ts`, `DesignStyleCharacterPayload` pasa a `gem?: string` y suma
`sections?: GemSections`, excluyentes; el sidecar compone el texto con `composeGemText`. Es la
sub-tarea A8c, con el código completo y su guard; se ejecuta solo si el orquestador la aprueba con el
dueño, y el frente C manda `sections` cuando la gema en uso las tiene.

**P2 · `templateVersion` ausente al guardar secciones (aclaración, no bloquea).** El contrato no dice
qué pasa si `style-save` recibe `sections` sin `templateVersion`. Este plan conserva la versión
guardada o, si no hay, usa `GEM_TEMPLATE_VERSION`; con `systemPrompt`, `templateVersion` es
`invalid_payload`. El frente C debería mandar siempre la versión que devolvió el agente.

**P3 · Ids nuevos del catálogo (Entrega 3, no bloquea la Entrega 1).** El SQL del spec §9 permite
`_` en los ids (`^[a-z0-9][a-z0-9_-]{0,39}$`), pero el spec §8 dice que los ids nuevos siguen
`STYLE_ID_PATTERN` (sin `_`), y el sidecar valida `origin.catalogStyleId` y `catalogStyleId` con
«id heredado o `STYLE_ID_PATTERN`» (`isCatalogStyleId`). Un admin podría crear `mi_estilo` en
Supabase y el sidecar lo rechazaría. **Propuesta:** en la Entrega 3, que el `check` de
`catalog_styles.id` use el patrón de la galería para los ids nuevos (los 5 heredados van como
excepción explícita), o ampliar `isCatalogStyleId`.

**P4 · Decisiones de este plan donde el spec no fija el detalle (confirmar, no bloquean).**

- `composeGemText` excluye la sección `character`: el diseño de un personaje, el preview de uno de la biblioteca y la Fase 1 de «Mi personaje» sin personajes dibujan o diseñan OTRO personaje.
- Las frases fijas también van en el fallback determinístico de imágenes y en el retrato del preview de una gema de plantilla (spec §4.1: «cada prompt de imagen»).
- `FIXED_PHRASES_RULE` no muestra las frases al modelo; el código las pega y quita una copia si el modelo igual la escribe.
- `DYNAMISM_WITHOUT_PROTAGONIST_RULE` se suma en cinemático siempre que haya dinamismo, dentro del bloque de dinamismo.
- El reparto del log cuenta las escenas escritas en esa pasada; el porcentaje con protagonista usa las escenas cuyo prompt lo nombró (en cinemático, las que lo colaron igual).
- Las muestras de una gema de plantilla, como hoy las de una gema vieja, no pasan por `sanitizeFinalPrompt`.

**P5 · Límites deliberados (documentar en la ADR-0041 o en ARCHITECTURE).**

- Cuando una escena pierde su referencia de foto, `rescueReferencePrompt` pega la identidad al final del cuerpo, después de `promptEnd`. En ese rescate el orden queda inicio → escena → final → identidad, y el recorte trata al final fijo como parte de la escena (cede antes que la identidad).
- `recoverProtagonistFromScenes` no reconoce el final fijo. No hace falta: un proyecto con gema de plantilla siempre guarda `styleProtagonist` (de la sección o de la Fase 1) antes del primer lote.
- `create-video-project` guarda el snapshot tal como llega (sin recortar). El marco trata una sección en blanco como ausente, así que un snapshot con `camera: ''` no deja título vacío.
- En una gema de plantilla, `shots` se guarda pero nadie lo usa (lo reemplaza la sección `camera`). Si la migración de una gema vieja (frente C) quiere conservar sus planos, tiene que sumarlos al texto que manda al agente.

**Rust:** no hace falta ningún cambio. El único evento nuevo es un `log` (`type`, `level`, `message`),
ya permitido en `ALLOWED_EVENT_KEYS`, y el snapshot del proyecto (`options.customStyle`) es un objeto
anidado que `copy_keys` nunca sube.
