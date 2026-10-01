import type {
  CustomStyleDraft,
  SelectedCustomStyle,
} from '@/modules/videos/types/styles'
import type { CustomStyleSummary } from '@pipeline/types/styles.ts'

// Una tarjeta de la galería como estilo elegido del formulario (snapshot
// inline; el proyecto es autocontenido). Una gema vieja queda exactamente como
// antes de ADR-0048; una de plantilla suma secciones, versión y filtro, y su
// `systemPrompt` queda vacío porque no lo tiene.
export function selectedCustomStyleFrom(
  style: CustomStyleSummary,
): SelectedCustomStyle {
  return {
    styleId: style.id,
    name: style.name,
    systemPrompt: style.systemPrompt ?? '',
    shots: style.shots,
    ...(style.character ? { character: style.character } : {}),
    ...(style.sections ? { sections: style.sections } : {}),
    ...(style.templateVersion === undefined
      ? {}
      : { templateVersion: style.templateVersion }),
    ...(style.colorFilter ? { colorFilter: style.colorFilter } : {}),
  }
}

// Una tarjeta como borrador del modal: lo editable, sin id ni muestras.
export function customStyleDraftFrom(
  style: CustomStyleSummary,
): CustomStyleDraft {
  return {
    name: style.name,
    systemPrompt: style.systemPrompt ?? '',
    shots: style.shots,
    ...(style.character ? { character: style.character } : {}),
    ...(style.sections ? { sections: style.sections } : {}),
    ...(style.templateVersion === undefined
      ? {}
      : { templateVersion: style.templateVersion }),
    ...(style.colorFilter ? { colorFilter: style.colorFilter } : {}),
  }
}
