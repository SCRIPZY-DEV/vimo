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

// Una tarjeta como borrador del modal: lo editable, sin id ni muestras, y lo
// que el modal muestra solo de lectura: el respaldo de una gema de plantilla y
// el estilo del catálogo del que es copia.
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
    ...(style.sourcePrompt ? { sourcePrompt: style.sourcePrompt } : {}),
    ...(style.origin ? { origin: style.origin } : {}),
  }
}

// La gema elegida en Crear es un snapshot. Si mientras tanto se migró a la
// plantilla (spec §4.4), el snapshot viejo se cambia por lo guardado: el envío
// sale por el marco nuevo sin volver a elegirla. En cualquier otro caso
// devuelve el MISMO objeto, así el formulario no cambia de identidad.
export function refreshedCustomStyle(
  selected: SelectedCustomStyle | null,
  styles: CustomStyleSummary[],
): SelectedCustomStyle | null {
  if (!selected || selected.sections) return selected
  const stored = styles.find((style) => style.id === selected.styleId)
  if (!stored?.sections) return selected
  return selectedCustomStyleFrom(stored)
}
