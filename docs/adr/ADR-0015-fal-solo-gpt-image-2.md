# ADR-0015 — Fal genera solo con gpt-image-2: retiro de Flux

- **Estado:** Aceptada
- **Fecha:** 2026-08-28
- **Área:** providers
- **Actualiza a:** [ADR-0008](ADR-0008-catalogo-de-costos-local.md) (catálogo de
  costos sin la entrada Flux) y [ADR-0014](ADR-0014-modulo-library-edicion-sobre-stages.md)
  (el editor ya no elige modelo por escena, solo calidad).

## Problema

Vimo genera imágenes con dos proveedores: **Evolink** (siempre `gpt-image-2`) y
**Fal.ai**, que hasta ahora ofrecía dos modelos, `gpt-image-2` y `flux-schnell`.
Por decisión editorial de la dirección del producto, Flux deja de usarse: el
resultado visual no es el que se quiere para los videos. Con un solo modelo por
proveedor, sostener el concepto «modelo de Fal» era deuda pura:

- Tres selectores de UI (crear video, editor de escena, preview de personaje)
  con una sola opción posible.
- Dos ramas de request en el provider (`image_size` preset vs `<W>x<H>` +
  `quality`), un estimador de progreso por modelo y una tabla de
  incompatibilidades de estilo (`pov_stickman` no funcionaba en Flux).
- Un campo `falModel` viajando por formulario, payloads, `project.json` e
  inputs de carril, más un tipo `FalImageModelId` importado desde ocho
  archivos.

Restricciones:

- Los proyectos ya guardados pueden tener `falModel: 'flux-schnell'` en
  `project.json` y escenas con `imageModel: 'flux-schnell'` +
  `imageQuality: 'landscape_16_9'`; deben seguir abriéndose y regenerándose.
- Rust (`src-tauri/`) nunca ve el modelo: el cambio es solo del sidecar y la UI.

## Decisión

**Fal genera únicamente con `gpt-image-2` y el concepto «modelo de Fal»
desaparece del contrato.** No queda un selector de un solo valor ni un tipo con
un solo literal: el modelo es una constante del proveedor.

- `pipeline/types/image-provider.ts` exporta `IMAGE_MODEL = 'gpt-image-2'` (el
  id que se estampa en `scene.imageModel` como dato de diagnóstico) y ya no
  declara `FalImageModelId`.
- `pipeline/providers/image/fal.ts`: `FAL_IMAGE_ENDPOINT = 'fal-ai/gpt-image-2'`;
  `generateFalImage(prompt, options)` y `falSceneRequestBody(prompt, quality)`
  no reciben modelo.
- `pipeline/stages/images/lane.ts`: `SceneLaneInputs` queda con `apiKey` y
  `qualityOption`; `fal-lane.ts` usa un `EXPECTED_MS` fijo para el progreso.
- `VideoProjectOptions` (`pipeline/types/video-project.ts`) y
  `GenerateCharacterPreviewPayload` (`pipeline/types/characters.ts`) pierden
  `falModel`; `visual-styles.ts` pierde `incompatibleModels`.
- UI: `ImageProviderSection.tsx` y `SceneQualityPicker.tsx` muestran proveedor
  - calidad; `CharacterPreviewPanel.tsx` solo proveedor. `CreateFormValue` y
    `SceneImageChoice` no tienen modelo. Los personajes de referencia se admiten
    con cualquier proveedor (`modelSupportsCharacters` desaparece).
- Costos: `src/modules/costs/catalog.ts` ya no lista Flux.

### Compatibilidad con proyectos viejos

Un valor viejo no rompe nada y **no decide nada**:

- `falModel` / `imageModel` = `'flux-schnell'` se ignoran (el campo sobrante de
  `project.json` se lee y descarta; `imageModel` es un `string` informativo).
- Una calidad que no siga la convención `<W>x<H>_<quality>` (el preset
  `landscape_16_9` de Flux) cae a la default: en el sidecar lo hace
  `falSceneRequestBody` (`DEFAULT_GPT_IMAGE_OPTION`), en el editor
  `normalizeQuality` (`src/modules/videos/utilities/imageQuality.ts`).
- Las imágenes ya generadas con Flux no se tocan; el fallback aplica solo al
  regenerar.

## Alternativas consideradas

- **Dejar el tipo con un solo valor (`FalImageModelId = 'gpt-image-2'`) y
  ocultar los selectores** — descartada: el contrato seguiría prometiendo una
  elección que no existe, y cada consumidor tendría que seguir pasando el campo.
  Si algún día Fal vuelve a ofrecer más de un modelo, reintroducir `falModel`
  desde esta ADR es un cambio acotado y explícito.
- **Ocultar solo la UI y dejar el pipeline intacto** — descartada: un
  `project.json` editado a mano o viejo seguiría llegando a
  `fal-ai/flux/schnell` y gastando créditos en un modelo vetado.
- **Quitar Flux pero conservar `incompatibleModels`** — descartada: sin un
  segundo modelo la tabla está siempre vacía; mantenerla es ruido.

## Consecuencias

- ✅ Menos código y menos UI: un selector menos en tres pantallas, una rama de
  request menos, un tipo y un campo de contrato menos.
- ✅ Los personajes de referencia ya no dependen del modelo elegido.
- ⚠️ Volver a ofrecer varios modelos en Fal exige reintroducir el campo en
  formulario, payload, `project.json` y carril: esta ADR es el punto de partida.
- ⚠️ Un proyecto viejo con Flux regenera en gpt-image-2 sin avisar: el costo por
  imagen sube (ver catálogo) y el estilo cambia respecto a las escenas previas.
- 🔒 No se agrega ni retira un modelo de imagen sin una ADR que lo registre.

## Verificación de cumplimiento

- **Build:** `pnpm format && pnpm lint && pnpm build && pnpm check:locales` en
  verde.
- **Greps ejecutables:**
  - `grep -rni "flux" src pipeline public README.md` → vacío.
  - `grep -rn "falModel\|FalImageModelId" src pipeline` → vacío.
  - `grep -rn "fal-ai/" pipeline` → solo `fal-ai/gpt-image-2`.
- **Harness:** `pnpm pipeline:harness generate-character-preview --payload
'{"identityPrompt":"…","styleId":"cartoon","provider":"fal"}'` genera con
  gpt-image-2.
- **Regresión típica:** un selector de modelo reapareciendo en la UI, o un
  request de Fal con `num_inference_steps` (parámetro exclusivo de Flux).

## Referencias

- ADR-0008 (catálogo de costos: se retiró la entrada Flux y se actualizó el
  spot-check).
- ADR-0014 (editor de Library: el picker por escena pasa a proveedor + calidad).
