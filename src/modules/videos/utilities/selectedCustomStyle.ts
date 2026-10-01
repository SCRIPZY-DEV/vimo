import type { SelectedCustomStyle } from '@/modules/videos/types/styles'
import type { CustomStyleSummary } from '@pipeline/types/styles.ts'

// Una tarjeta de la galería como estilo elegido del formulario (snapshot
// inline; el proyecto es autocontenido).
export function selectedCustomStyleFrom(
  style: CustomStyleSummary,
): SelectedCustomStyle {
  return {
    styleId: style.id,
    name: style.name,
    systemPrompt: style.systemPrompt ?? '',
    shots: style.shots,
    ...(style.character ? { character: style.character } : {}),
  }
}
