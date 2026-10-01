import type {
  ColorFilterId,
  CustomStyleSummary,
  GemSections,
  StyleCharacter,
} from '@pipeline/types/styles.ts'

// Dominio UI de los estilos visuales propios («Mi estilo»).

// De dónde sale el estilo del video: el catálogo de Vimo o la galería propia.
export type StyleSource = 'catalog' | 'custom'

// Estilo propio elegido en el formulario; viaja INLINE en el payload como
// snapshot (ProjectCustomStyle del pipeline): el proyecto es autocontenido.
export interface SelectedCustomStyle {
  styleId: string
  name: string
  // El texto de una gema vieja; vacío en una de plantilla, que no lo tiene.
  systemPrompt: string
  shots: string[]
  // Qué declaró la gema sobre su protagonista (ausente = genérico).
  character?: StyleCharacter
  // Gema de plantilla (ADR-0048): las secciones que envuelve el marco de Vimo.
  sections?: GemSections
  templateVersion?: number
  colorFilter?: ColorFilterId
}

// Lo editable de un estilo en el modal (sin id ni muestras).
export interface CustomStyleDraft {
  name: string
  // El texto del editor de siempre (gema vieja); vacío en una de plantilla.
  systemPrompt: string
  shots: string[]
  character?: StyleCharacter
  // Gema de plantilla (ADR-0048).
  sections?: GemSections
  templateVersion?: number
  colorFilter?: ColorFilterId
}

// Lo que el modal guarda de una gema de plantilla con style-save.
export interface TemplateStyleDraft {
  id: string
  name: string
  sections: GemSections
  templateVersion: number
  colorFilter: ColorFilterId
  character: StyleCharacter
  // El texto que se mandó al agente en esta apertura; null = conservar el
  // guardado.
  sourcePrompt: string | null
}

// Algo con texto de gema: una tarjeta de la galería, el estilo elegido o el
// borrador del modal.
export type GemTextSource = Pick<
  CustomStyleSummary,
  'systemPrompt' | 'sections'
>
