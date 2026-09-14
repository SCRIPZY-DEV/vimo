import { isValidPrompt } from '../../prompts/prompt-limits.ts'
import type { VisualStyle } from '../../prompts/visual-styles.ts'
import type { Scene } from '../../types/scenes.ts'

// Compatibilidad con artefactos viejos: un sufijo de estilo por sí solo puede
// superar el mínimo de caracteres, pero no representa ninguna escena.
export function hasCatalogNarrative(
  prompt: string | undefined,
  style: VisualStyle,
): boolean {
  if (!isValidPrompt(prompt)) return false
  const normalize = (text: string) =>
    text.toLowerCase().replace(/\s+/g, ' ').trim()
  let body = normalize(prompt)
  for (const wrapper of [
    style.template?.prologue,
    style.template?.styleSuffix,
  ]) {
    if (wrapper?.trim()) body = body.replace(normalize(wrapper), '').trim()
  }
  return isValidPrompt(body.replace(/^scene\s*:\s*/i, ''))
}

export function hasCatalogPrompt(scene: Scene, style: VisualStyle): boolean {
  return (
    scene.promptIsFallback !== true &&
    hasCatalogNarrative(scene.imagePrompt, style)
  )
}
