import type { StyleCharacter } from '@pipeline/types/styles.ts'

// Dominio UI de los estilos visuales propios («Mi estilo»).

// De dónde sale el estilo del video: el catálogo de Vimo o la galería propia.
export type StyleSource = 'catalog' | 'custom'

// Estilo propio elegido en el formulario; viaja INLINE en el payload como
// snapshot (ProjectCustomStyle del pipeline): el proyecto es autocontenido.
export interface SelectedCustomStyle {
  styleId: string
  name: string
  systemPrompt: string
  shots: string[]
  // Qué declaró la gema sobre su protagonista (ausente = genérico).
  character?: StyleCharacter
}

// Lo editable de un estilo en el modal (sin id ni muestras).
export interface CustomStyleDraft {
  name: string
  systemPrompt: string
  shots: string[]
  character?: StyleCharacter
}
