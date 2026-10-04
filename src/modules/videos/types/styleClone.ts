import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type {
  StyleCloneCharacterTravel,
  StyleCloneDrawKind,
  StyleCloneDrawPayload,
  StyleCloneDrawProgressDetail,
  StyleCloneDrawResult,
  StyleCloneMaterialItem,
  StyleCloneOrigin,
  StyleClonePrepareResult,
  StyleCloneSavePayload,
  StyleCloneSaveResult,
  StyleCloneSource,
} from '@pipeline/types/style-clone.ts'
import type { GemSections } from '@pipeline/types/styles.ts'

// Creador de estilo con IA en la app (ADR-0050): una SESIÓN es una clonación en
// curso. Vive fuera del modal (store de `useStyleClones`), se guarda en
// localStorage y sigue trabajando aunque el modal se cierre; cuando necesita
// una respuesta se detiene y lo dice en su tarjeta.

// En qué anda la sesión. `awaiting` = espera a la persona; `failed` e
// `interrupted` se retoman con el mismo paso que estaba corriendo.
export type StyleCloneStatus =
  | 'preparing'
  | 'analyzing'
  | 'drawing'
  | 'awaiting'
  | 'saving'
  | 'failed'
  | 'interrupted'

// Qué se está probando: los diseños del personaje o las escenas.
export type StyleCloneStep = 'character' | 'scenes'

// Las partes de una acción, en orden. Cada una deja su resultado en la sesión
// antes de pasar a la siguiente: retomar repite solo la que estaba corriendo.
export type StyleClonePhase = 'prepare' | 'turn' | 'draw' | 'save'

// Lo que la sesión está haciendo (o tiene que reintentar).
export type StyleCloneAction =
  | { kind: 'analyze' }
  | { kind: 'adjust-character'; comment: string }
  | {
      kind: 'choose-character'
      option: number
      travel: StyleCloneCharacterTravel
    }
  | { kind: 'adjust-scenes'; comment: string }
  | { kind: 'approve' }
  // Volver a dibujar pruebas que fallaron, sin otro turno del servidor.
  | { kind: 'redraw'; target: StyleCloneDrawKind; indexes: number[] }

export interface StyleCloneTurn {
  role: 'user' | 'model'
  text: string
}

// Una prueba: su prompt y, cuando ya se dibujó, su imagen.
export interface StyleCloneTest {
  index: number
  prompt: string
  origin?: StyleCloneOrigin
  file?: string
  path?: string
  mtimeMs?: number
  originalPath?: string
  errorCode?: string
}

export interface StyleCloneIdentity {
  name: string
  description: string
}

export interface StyleCloneChoice {
  option: number
  travel: StyleCloneCharacterTravel
}

export interface StyleCloneSession {
  id: string
  createdAt: number
  source: StyleCloneSource
  // La respuesta a «¿Replicamos el personaje del video?».
  replicateCharacter: boolean
  imageProvider: ImageProviderId
  status: StyleCloneStatus
  // null hasta que llega el primer análisis.
  step: StyleCloneStep | null
  action: StyleCloneAction | null
  phase: StyleClonePhase | null
  material: StyleCloneMaterialItem[]
  // Título del video ('' con imágenes).
  title: string
  // La conversación con el modelo, tal como la devuelve el servidor.
  history: StyleCloneTurn[]
  // Nombre y descripción que propuso la IA; el nombre se puede editar.
  name: string
  description: string
  // Dónde se ve mejor el personaje del original; null = la IA no lo dijo.
  characterIn: StyleCloneOrigin | null
  designs: StyleCloneTest[]
  designsRound: number
  choice: StyleCloneChoice | null
  identity: StyleCloneIdentity | null
  scenes: StyleCloneTest[]
  scenesRound: number
  // El estilo final, guardado antes de escribirlo en disco: si el guardado
  // falla se reintenta sin pagar otro turno.
  sections: GemSections | null
  templateVersion: number | null
  errorCode: string | null
  // Con `style_clone_invalid_images`: posiciones (desde 1) de las inválidas.
  rejectedImages: number[]
}

// Lo que pide la persona al empezar una clonación.
export interface StyleCloneStartInput {
  source: StyleCloneSource
  replicateCharacter: boolean
  imageProvider: ImageProviderId
  // El nombre del estilo si la IA no propone uno (lo traduce quien empieza).
  fallbackName: string
}

// Lo que la persona responde cuando la sesión espera.
export type StyleCloneResponse =
  | { kind: 'adjust-character'; comment: string }
  | {
      kind: 'choose-character'
      option: number
      travel: StyleCloneCharacterTravel
    }
  | { kind: 'adjust-scenes'; comment: string }
  | { kind: 'approve' }
  | { kind: 'redraw'; target: StyleCloneDrawKind; indexes: number[] }

// ─── Contrato con vimo.click (POST /api/estilos/crear-con-ia) ───
// Los nombres van en español porque son los del servidor
// (SETUP_CREADOR_ESTILO_IA.md de vimo-landing).

export type StyleCloneServerAction =
  | 'analizar'
  | 'ajustar-personaje'
  | 'elegir-personaje'
  | 'ajustar-escenas'
  | 'aprobar'

export type StyleCloneServerSource =
  { tipo: 'youtube'; titulo: string } | { tipo: 'imagenes' }

// Un turno sin las imágenes: el `api/` les suma el base64, la versión de la
// app y el idioma.
export interface StyleCloneTurnDraft {
  accion: StyleCloneServerAction
  origen: StyleCloneServerSource
  replicarPersonaje: boolean
  historial: StyleCloneTurn[]
  comentario?: string
  eleccion?: { opcion: number; prompt: string }
}

export interface StyleCloneServerImage {
  tipo: 'mosaico' | 'fotograma' | 'miniatura' | 'imagen'
  mimeType: 'image/jpeg'
  data: string
  filas?: number
  columnas?: number
}

export interface StyleCloneTurnRequest extends StyleCloneTurnDraft {
  material: StyleCloneServerImage[]
  appVersion: string
  locale: string
}

// La respuesta de un turno, ya validada y con los nombres de la app.
export interface StyleCloneTurnResult {
  turns: StyleCloneTurn[]
  name?: string
  description?: string
  characterIn?: StyleCloneOrigin | null
  designs?: string[]
  scenes?: { prompt: string; origin: StyleCloneOrigin }[]
  identity?: StyleCloneIdentity
  sections?: GemSections
  templateVersion?: number
}

// ─── Lo que el store necesita de afuera ───
// Llega inyectado (el sidecar y vimo.click en la app, dobles en el guard
// check-app-style-clone), como los pasos de una migración de gemas.

export interface StyleCloneSteps {
  prepare(session: StyleCloneSession): Promise<StyleClonePrepareResult>
  turn(
    draft: StyleCloneTurnDraft,
    material: StyleCloneMaterialItem[],
  ): Promise<StyleCloneTurnResult>
  draw(
    payload: StyleCloneDrawPayload,
    onProgress: (detail: StyleCloneDrawProgressDetail) => void,
  ): Promise<StyleCloneDrawResult>
  save(payload: StyleCloneSavePayload): Promise<StyleCloneSaveResult>
  discard(sessionId: string): Promise<void>
  // El código estable de lo que falló, para el texto de la tarjeta.
  errorCode(error: unknown): string
  // El estilo ya está en disco: refrescar la galería y la biblioteca.
  saved(result: StyleCloneSaveResult, session: StyleCloneSession): void
}

export interface StyleCloneStorage {
  read(): string | null
  write(value: string): void
}

// ─── Lo que muestran la tarjeta y el modal (styleCloneView) ───

export type StyleCloneCardTone = 'working' | 'attention' | 'error'

export interface StyleCloneCardState {
  labelKey: string
  tone: StyleCloneCardTone
  // La sesión está trabajando: la etiqueta lleva el spinner.
  busy: boolean
}

// En qué paso abre el modal: el origen (una sesión nueva, o una con imágenes
// inválidas), el avance mientras trabaja, lo que espera a la persona o el fallo.
export type StyleCloneModalStep =
  'source' | 'working' | 'character' | 'scenes' | 'failed'

export interface StyleCloneWorkingStep {
  key: 'material' | 'analysis' | 'drawing' | 'saving'
  state: 'done' | 'active' | 'todo'
}

// Una imagen de la sesión para mostrar. `crop` recorta una celda de un
// mosaico con CSS (tamaño y posición del fondo).
export interface StyleCloneImageRef {
  path: string
  version?: number
  crop?: { size: string; position: string }
}
