import type {
  GemRebuildOrigin,
  GemRebuildResponse,
} from '@/modules/videos/types/gemRebuild'
import type { CatalogGem } from '@pipeline/types/catalog.ts'
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
// Una gema del catálogo nuevo (Entrega 2) viaja igual, con su id de catálogo.
export interface SelectedCustomStyle {
  styleId: string
  // El estilo del catálogo de Vimo del que sale (plan E2 §5.4); ausente = una
  // gema de Mi estilo.
  catalogStyleId?: string
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
  // El texto del que salieron las secciones, guardado de respaldo: el modal
  // lo muestra solo de lectura y no vuelve a guardarlo.
  sourcePrompt?: string
}

// El protagonista de un estilo mientras se edita en su modal (Mi estilo o
// «Ver» del catálogo), más lo que hay que recordar al pasar por otro modo: si
// la persona va a «Genérico» y vuelve a «Mi personaje», no pierde el personaje
// que ya había fijado (en disco solo se guarda con «own»). Lo mueve
// utilities/characterDraft.ts.
export interface CharacterDraft {
  character: StyleCharacter
  lastDefaultCharacterId?: string
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

// La gema pegada en «Pegá tu gema» al tocar «Preparar con IA»: se guarda tal
// cual, como texto, y se adapta a la plantilla en segundo plano.
export interface PastedGemDraft {
  id: string
  name: string
  text: string
  character: StyleCharacter
  colorFilter: ColorFilterId
}

// Algo con texto de gema: una tarjeta de la galería, el estilo elegido o el
// borrador del modal.
export type GemTextSource = Pick<
  CustomStyleSummary,
  'systemPrompt' | 'sections'
>

// En qué paso va una adaptación en vuelo: el agente ordena la gema o ya
// respondió y se guardan las secciones. La gema ya quedó guardada tal cual
// antes de empezar, así que ese paso siempre está hecho.
export type GemAdaptationPhase = 'agent' | 'saving'

// Migración automática de una gema vieja a la plantilla (spec §4.4): en vuelo,
// fallida o hecha. El nombre es el del momento de empezar: los avisos de la
// galería lo muestran.
export type GemMigrationState =
  | {
      status: 'pending'
      name: string
      // Cuándo arrancó y en qué paso va: la tarjeta estima el porcentaje por
      // tiempo, porque el agente no informa avance.
      startedAt: number
      phase: GemAdaptationPhase
    }
  | {
      status: 'failed'
      name: string
      // Por qué falló.
      error: unknown
    }
  | {
      // Guardada sin que la persona la viera: el aviso le pide revisar las
      // secciones, con lo que avisó el agente, hasta que lo descarte.
      status: 'migrated'
      name: string
      warnings: string[]
    }

// Cómo termina una migración que no falla: guardada, con los avisos del
// agente, o la gema ya no estaba (la persona la borró) y no se guardó nada.
export type GemMigrationOutcome =
  { status: 'migrated'; warnings: string[] } | { status: 'deleted' }

// Lo que una migración necesita de afuera: el hook pone el sidecar y el
// agente; el guard los simula.
export interface GemMigrationSteps {
  // La gema como está guardada AHORA; undefined si ya no existe.
  findStored: (styleId: string) => Promise<CustomStyleSummary | undefined>
  // El agente reconstructor con el texto de migración de esa gema y el origin
  // que queda en gem_rebuild_logs (una gema pegada o una vieja que se migra).
  rebuild: (
    style: CustomStyleSummary,
    origin: GemRebuildOrigin,
  ) => Promise<GemRebuildResponse>
  // Avisa en qué paso va (el agente respondió: se guardan las secciones).
  report?: (phase: GemAdaptationPhase) => void
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

// ── Catálogo de Vimo (Entrega 2) ──

// Lo que la memoria del modo de cada estilo usa de `localStorage` (los guards
// le pasan uno en memoria).
export type CatalogCharacterStorage = Pick<Storage, 'getItem' | 'setItem'>

// «Pasar a mi estilo»: la gema, el nombre que vio la persona (en su idioma) y
// el modo de personaje que eligió en «Ver».
export interface CatalogCopyRequest {
  gem: CatalogGem
  name: string
  character: StyleCharacter
}
