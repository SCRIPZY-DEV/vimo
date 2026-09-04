import type { CharacterStyleId } from '../types/characters.ts'

/**
 * Encuadre del preview (no se guarda en la identidad): cuerpo entero sobre
 * fondo neutro, para ver al personaje completo y limpio. Es lo único "de
 * escena" que se agrega, y solo para el preview.
 *
 * Es style-aware a propósito. Los estilos que describen un MEDIO (realista,
 * cartoon, fantasía, terror) dibujan bien la descripción humana cruda. STICKMAN
 * no: su plantilla describe un MUÑECO, así que meter la descripción humana
 * hacía que el modelo dibujara a la persona realista AL LADO del muñeco (dos
 * figuras). Acá la descripción se reencuadra como los rasgos del muñeco y se
 * exige UN solo stickman.
 */
export function buildPreviewScene(
  identityPrompt: string,
  styleId: CharacterStyleId,
): string {
  const identity = identityPrompt.trim().replace(/\s+/g, ' ')

  if (styleId === 'pov_stickman')
    return (
      `ONE single stickman doll character, full body, standing and facing the camera on a plain neutral studio background. ` +
      `Apply ONLY this character's hairstyle, hair color and clothing/accessories TO THE STICKMAN DOLL — the hair drawn on the round white head, the outfit and accessories worn by the doll, the facial expression as two black dot eyes and a matching mouth: ${identity}. ` +
      `Render EXACTLY ONE stickman doll and nothing else: do NOT draw a realistic human, do NOT draw a second person or a separate woman/man beside the doll — only the single stickman doll wearing those features.`
    )

  return `${identity} Full-body view of this exact character standing, facing the camera, on a plain neutral studio background.`
}

// Pedido al LLM cuando el estilo es PROPIO: la gema (system) no conoce al
// personaje, así que el encuadre del preview viaja como la escena a ilustrar,
// con el mismo formato de pedido que las muestras del estilo. Sin guion de
// contexto: el retrato es de una sola figura sobre fondo neutro.
export function buildCustomPreviewRequest(identityPrompt: string): string {
  const identity = identityPrompt.trim().replace(/\s+/g, ' ')

  return (
    `SCENE TO ILLUSTRATE: a character portrait. Full-body view of this exact character standing, facing the camera, on a plain neutral studio background. ` +
    `The character: ${identity}\n\n` +
    `Write the image prompt for this scene, keeping the character's physical identity exactly as described.`
  )
}
