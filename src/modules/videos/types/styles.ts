import type { GemRebuildResponse } from '@/modules/videos/types/gemRebuild'
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

// Migración automática de una gema vieja a la plantilla (spec §4.4).
export interface GemMigrationState {
  status: 'pending' | 'failed'
  // El nombre al empezar: el aviso de la galería lo muestra.
  name: string
  // Por qué falló; null mientras está en vuelo.
  error: unknown
}

// Cómo termina una migración que no falla: guardada, o la gema ya no estaba
// (la persona la borró) y no se guardó nada.
export type GemMigrationOutcome = 'migrated' | 'deleted'

// Lo que una migración necesita de afuera: el hook pone el sidecar y el
// agente; el guard los simula.
export interface GemMigrationSteps {
  // La gema como está guardada AHORA; undefined si ya no existe.
  findStored: (styleId: string) => Promise<CustomStyleSummary | undefined>
  // El agente reconstructor con el texto de migración de esa gema.
  rebuild: (style: CustomStyleSummary) => Promise<GemRebuildResponse>
  // Guarda las secciones de esa gema y espera la lista nueva.
  save: (
    style: CustomStyleSummary,
    response: GemRebuildResponse,
  ) => Promise<void>
}

// Cómo se piden las muestras de un estilo.
export interface SampleGenerationOptions {
  // Gema de plantilla: sus muestras se escriben con el modelo de Ajustes (spec
  // §5.6). Una vieja sigue por el camino de siempre.
  templateGem: boolean
}

// La gema en uso como contexto de «Crear personaje con mi estilo»: una vieja
// como texto, una de plantilla por secciones (ADR-0048). Nunca las dos.
export type StyleContextGem = { gem: string } | { sections: GemSections }
