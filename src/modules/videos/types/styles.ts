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
}
