import { buildCustomStyleSystemPrompt } from '../../prompts/custom-style.ts'
import { VISUAL_STYLES, type VisualStyle } from '../../prompts/visual-styles.ts'
import type { VideoProjectOptions } from '../../types/video-project.ts'

// Resolver ÚNICO del estilo de un proyecto: con customStyle el estilo ES el
// snapshot persistido en project.json (el proyecto es autocontenido; la
// galería puede cambiar o desaparecer). Sin customStyle, el catálogo de
// siempre — comportamiento byte-idéntico para todo proyecto previo.
export function resolveProjectStyle(options: VideoProjectOptions): VisualStyle {
  const custom = options.customStyle
  if (!custom) return VISUAL_STYLES[options.styleId]

  return {
    id: 'custom',
    name: custom.name,
    systemPrompt: buildCustomStyleSystemPrompt(custom),
    // Un estilo propio no trae ajuste de color del render.
    filterFinal: '',
  }
}
