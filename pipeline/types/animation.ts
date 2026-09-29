import type { VideoProviderId } from './video-provider.ts'

// Contrato de la animación de escenas (ADR-0047). Browser-safe: la UI importa
// estos tipos con `import type`, igual que scenes.ts y video-provider.ts.

// Estado PERSISTIDO de la animación de una escena. Solo tres valores, y
// ninguno transitorio: un job que muere a mitad no deja un «generando»
// huérfano en disco (misma lección que el `generating` de los proyectos).
//   - pending: encargada al proveedor (o prompt listo) y sin clip todavía; con
//     `task` presente, la próxima corrida la cosecha en vez de re-pagarla.
//   - ready: el clip está en disco y el render lo usa.
//   - error: falló tras los reintentos; la escena se renderiza estática.
export type SceneAnimationStatus = 'pending' | 'ready' | 'error'

// Tarea de video ya encargada (y potencialmente cobrada) al proveedor. Mismo
// guard que SceneImageTask (E26/E27): antes de re-encargar se consulta esta
// tarea, porque una tarea creada ya es plata de la persona. Un clip cuesta
// bastante más que una imagen, así que acá el guard importa todavía más.
export interface SceneAnimationTask {
  provider: VideoProviderId
  taskId: string
  // Huella del pedido (modelo + prompt + imágenes + duración): si el pedido
  // cambió, la tarea vieja ya no aplica y se encarga una nueva.
  hash: string
}

// Cómo encaja el clip en el timeline (motor de decisión del tablero, ADR-0041):
//   - merge: el clip absorbe dos o más escenas contiguas en una sola toma.
//   - direct: una sola escena, al menos tan larga como el clip.
//   - trim: una sola escena más corta que el clip; se paga el clip entero y
//     el render lo acelera o lo corta al largo de la escena.
export type AnimationStrategy = 'merge' | 'direct' | 'trim'

// Recibo durable: un POST ambiguo jamás habilita otro encargo automático.
export interface AnimationAttempt {
  model: string
  hash: string
  state: 'creating' | 'pending' | 'succeeded' | 'failed' | 'ambiguous'
  taskId?: string
  videoUrl?: string
  creditsConsumed?: number
  errorCode?: string
  requestedSeconds?: number
  aspectRatio?: '16:9' | '9:16'
  resolution?: string
}

// Animación persistida de una escena. Vive en scenes.json dentro de la escena
// que ENCABEZA el clip; las escenas absorbidas solo llevan `absorbedBy`.
export interface SceneAnimation {
  id?: string
  startSeconds?: number
  endSeconds?: number
  normalizedSeconds?: number
  // Nombre local validado; nunca una ruta arbitraria enviada por el webview.
  clipFile?: string
  attempts?: AnimationAttempt[]
  // La sustitución sigue siendo atómica aunque el próximo job no envíe force.
  replacementSceneIds?: number[]
  provider: VideoProviderId
  model: string
  // Ids de las escenas que cubre el clip, en orden, incluida la que encabeza.
  sceneIds: number[]
  // Largo del hueco del timeline. El clip se normaliza a este valor: es lo que
  // hace que animar no mueva el video ni un milisegundo.
  slotSeconds: number
  // Ausente en clips anteriores a ADR-0041: se lee como merge si cubre varias
  // escenas y como direct si cubre una.
  strategy?: AnimationStrategy
  // Segundos que se le pidieron al proveedor (y por los que se paga).
  requestedSeconds: number
  // Se persiste para que un reintento reuse la MISMA huella y pueda cosechar
  // una tarea ya pagada: un prompt reescrito es un pedido nuevo.
  prompt: string
  task?: SceneAnimationTask
  // Créditos que el proveedor dice haber cobrado de verdad. No se estima: se
  // lee de la respuesta, así el panel de costos nunca miente.
  creditsConsumed?: number
  status: SceneAnimationStatus
  errorCode?: string
}

export type AnimationRejectionReason =
  // La escena marcada ya está cubierta por el clip de otra escena.
  | 'already_covered'
  // Ni sola ni agrupada con sus vecinas entra en la ventana de duración: es
  // más larga que el máximo, o el video entero es más corto que el mínimo.
  | 'slot_out_of_range'

export interface AnimationRejection {
  sceneId: number
  reason: AnimationRejectionReason
  // Largo del mejor hueco que se pudo armar, para poder explicarlo.
  slotSeconds: number
}

// Payload del subcomando `animate-scenes`.
export interface AnimateScenesPayload {
  projectId: string
  // Escenas que la persona marcó para animar. El planificador decide cuáles
  // absorbe cada clip; una marca puede quedar cubierta por otra.
  sceneIds?: number[]
  minutes?: number
  retryFailed?: boolean
  provider?: VideoProviderId
  // Rehacer un clip que ya está listo (el equivalente a «regenerar»): sin
  // esto, una escena con clip válido y misma huella no se vuelve a pagar.
  force?: boolean
}

// Deshacer restaura las fuentes estáticas de todos los clips que cubren la escena.
export interface UndoSceneAnimationPayload {
  projectId: string
  sceneId: number
}

export interface UndoSceneAnimationResult {
  restored: number[]
}

export interface AnimateScenesResult {
  animated: number[]
  failed: number[]
  // Marcas que el planificador no pudo convertir en clip, con su motivo.
  rejected: AnimationRejection[]
  creditsConsumed?: number
}

// Proyección de la animación para la UI (viaja en el status y el detail del
// proyecto). El clip se deriva de la EXISTENCIA del archivo, como la imagen:
// un `ready` persistido sin archivo sale como error, nunca como listo.
export interface SceneAnimationView {
  canResumeTask?: boolean
  canRecoverLocally?: boolean
  submissionUnknown?: boolean
  id?: string
  startSeconds?: number
  endSeconds?: number
  normalizedSeconds?: number
  requestedSeconds?: number
  provider: VideoProviderId
  status: SceneAnimationStatus
  sceneIds: number[]
  slotSeconds: number
  strategy?: AnimationStrategy
  // Ruta absoluta para mostrarlo vía convertFileSrc(); solo si existe. El
  // mtime es el cache-buster: la ruta de un clip rehecho no cambia.
  clipPath?: string
  clipMtimeMs?: number
  creditsConsumed?: number
  errorCode?: string
}

// Resultado de `get-video-credits`: el saldo de los proveedores de animación,
// con la misma forma que `get-image-credits` para que la UI reuse
// `compareCostLines` y la pausa retomable de ADR-0031.
export interface ProviderVideoCredits {
  available: boolean
  remaining?: number
  // Con available false: por qué (missing_api_key, animation_invalid_api_key…).
  errorCode?: string
}

export interface VideoCreditsResult {
  kie: ProviderVideoCredits
  poyo: ProviderVideoCredits
}
