# Editor: regenerar ignoraba la descripción del usuario

Fecha: 2026-09-17. Rama: `fix/editor-view-regenerate-image-with-diferent-prompt`.

## Reporte

«Le pongo el prompt de lo que quiero en "Tu descripción para la imagen" y solo repite
la imagen que ya está creada.» No era un error de uso: con el mouse era prácticamente
imposible lograr que la descripción se aplicara.

## Qué estaba mal

Por escena hay dos textos: `userPrompt` (lo que escribe el usuario) e `imagePrompt`
(el prompt final que redacta el LLM y que recibe el proveedor de imagen). El sidecar
solo reescribe `imagePrompt` si el job trae `rewritePrompt: true`; si no, re-rollea
el prompt vigente.

1. La UI decidía `rewritePrompt` con «la descripción todavía no está guardada»
   (`userPromptDirty`). Pero la textarea guarda al perder el foco, y el clic en
   «Regenerar» le saca el foco: el guardado deshabilitaba el botón (**el primer clic
   se perdía**) y, al terminar, la descripción ya estaba en disco → `dirty = false` →
   el segundo clic mandaba `rewritePrompt: false`. Lo mismo al tocar antes el
   proveedor, el nivel o una casilla de personaje, o al salir y volver al editor.
2. `update-scenes` guarda `userPrompt` y deja intacto el `imagePrompt` viejo, que
   `scene-prompts` considera válido. Una descripción guardada quedaba inerte.
3. En «Mi estilo» la descripción viajaba solo como nota
   (`[PEDIDO DEL USUARIO…]`) junto a la narración, que seguía siendo el fragmento;
   en el catálogo, en cambio, la reemplaza. Aun reescribiendo, la imagen se parecía
   a la anterior.

Descartado: caché del archivo, cache-busting `?v=`, seed fija e invalidación de Query.

## Corrección

- Campo aditivo en `scenes.json`: `appliedUserPrompt`, la descripción desde la que se
  redactó el `imagePrompt` vigente. «Pendiente» se **deriva**
  (`hasPendingUserPrompt`: `userPrompt` ≠ `appliedUserPrompt`), sin bandera que
  limpiar. Proyectos ya afectados se curan solos: tienen `userPrompt` sin
  `appliedUserPrompt`, así que la próxima regeneración la aplica. Borrar una
  descripción aplicada también reescribe (desde la narración).
- `regenerate-scene-images` reescribe si el payload lo pide **o** si la escena tiene
  descripción pendiente, y al terminar registra `appliedUserPrompt` solo en las
  escenas que quedaron con prompt (si no, se reintenta la próxima vez).
- El detalle del proyecto proyecta `userPromptPending`; el editor lo combina con el
  borrador local para el rótulo «Regenerar con tu descripción» y para el flag.
- El botón Regenerar no le roba el foco a la textarea (`onMouseDown` +
  `preventDefault`): el clic ya no se pierde y `regenerateSelected` guarda y encola
  en orden. El guardado al salir de la textarea se mantiene.
- Carril verbatim («Mi estilo»): con `userPrompt`, la descripción es el fragmento;
  la nota queda para reintentos y personaje incluido. La gema no cambia. Una escena
  sin narración pero con descripción ahora también recibe prompt.

## Archivos tocados

- `pipeline/types/scenes.ts`, `pipeline/types/video-project.ts`: `appliedUserPrompt`, `userPromptPending`.
- `pipeline/project/user-prompt.ts`: `hasPendingUserPrompt`.
- `pipeline/commands/videos/regenerate-scene-images.ts`: decisión y registro.
- `pipeline/commands/videos/video-project-detail.ts`: proyección.
- `pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts`, `scene-prompts.ts`, `pipeline/prompts/verbatim-messages.ts`.
- `src/modules/videos/hooks/useLibraryEditor.ts`, `components/EditorScenePanel.tsx`, `views/LibraryEditor/LibraryEditor.tsx`.
- `scripts/test/check-editor-character-selection.mjs` (2 casos nuevos), `check-editor-character-ui.mjs` (prop renombrada).

## Hallazgo fuera de alcance: escenas con personaje con foto

Con un personaje con foto marcado, la escena va por `openai/gpt-image-2/edit` con la
foto como referencia y calidad forzada a `low`
(`pipeline/stages/images/character-lane.ts`). El prompt sí se respeta, pero las
imágenes sucesivas se parecen mucho entre sí. Si tras este fix el cliente sigue
viendo «la misma imagen» en esas escenas, revisar ese carril.

## QA

- `node --test scripts/test/check-editor-character-selection.mjs`.
- Manual, app instalada, catálogo y «Mi estilo»: escribir una descripción y hacer UN
  clic en Regenerar → el rótulo dice «Regenerar con tu descripción», `imagePrompt`
  cambia en `scenes.json` y queda `appliedUserPrompt`. Repetir tocando antes el nivel
  o una casilla, y saliendo y volviendo al editor. En un proyecto ya afectado,
  regenerar sin editar aplica la descripción guardada.
