import type { Scene } from '../../types/scenes.ts'
import { deriveEraFromBible, eraEscapeWindow } from '../../utils/story-era.ts'
import { sanitizeFinalPrompt } from './prompt-safety.ts'

// Redacción y compra revisan el MISMO texto, ya recortado al presupuesto.
// Si el saneado eliminó la idea central, la revisión exige reescribir antes
// de pagar una imagen. Reaplicar este paso no duplica cláusulas.
export function finalizeSceneImagePrompt(
  scene: Scene,
  scenes: readonly Scene[],
  prompt: string,
  styleId: string,
  visualBible?: string,
): string {
  return sanitizeFinalPrompt(prompt, {
    era: deriveEraFromBible(visualBible),
    sceneText: scene.userPrompt?.trim() || scene.text || '',
    window: eraEscapeWindow(
      scenes.map(({ id, text }) => ({ id, text })),
      scene.id,
    ),
    isDiagram:
      !scene.userPrompt?.trim() && scene.direction?.treatment === 'diagram',
    styleId,
  })
}
