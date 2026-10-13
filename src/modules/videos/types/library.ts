import type { FlowToolsExecutionPlan } from '@pipeline/types/flow-execution-plan.ts'
import type { FlowRestartRequest } from '@/modules/common/types/flow'
import type { SceneAnimationReviewOutcome } from '@/modules/videos/types/sceneImageReview'
import type { SceneImageStatus } from '@pipeline/types/scenes.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { RenderPhase } from '@pipeline/runner/events.ts'
import type {
  ReplaceNarrationPayload,
  SetProjectMusicPayload,
  UpdateAudioMixPayload,
} from '@pipeline/types/video-project.ts'
import type {
  AnimationRejection,
  SceneAnimationView,
  VideoCreditsResult,
} from '@pipeline/types/animation.ts'
import type { AnimationUnit } from '@pipeline/animation/planner.ts'
import type { VideoProviderId } from '@pipeline/types/video-provider.ts'

// Tipos de las vistas de biblioteca (Library, Player, Progress, Editor).

// Estado que muestra la tarjeta/el player. `interrupted` no existe en disco:
// se deriva cuando un proyecto quedó `generating` sin ningún job vivo (el
// sidecar es un proceso por job — si la app murió, nadie lo normaliza).
export type ProjectBadge =
  | 'ready'
  | 'outdated'
  | 'generating'
  | 'awaitingConfirmation'
  | 'interrupted'
  | 'paused'
  // Pausado por saldo agotado en el proveedor (ADR-0031): se reanuda tras
  // recargar.
  | 'noCredits'
  | 'error'
  | 'draft'

// Pestaña de la biblioteca: los videos horizontales y los shorts verticales
// se listan por separado; el formato del proyecto decide en cuál cae.
export type LibraryTab = 'long' | 'shorts'

// Estado del mp4 final del proyecto: decide la etiqueta del botón de render
// y si el preview reproduce el video o lo simula.
export type RenderedVideoState = 'none' | 'current' | 'outdated'

// Proveedor/calidad con que se regenera la escena seleccionada.
export interface SceneImageChoice {
  provider: ImageProviderId
  quality: string
}

// Lado de la escena que se edita tipeando en el panel: In (la frontera con
// la escena anterior) u Out (la frontera con la siguiente).
export type ClipEdge = 'in' | 'out'

// Operaciones de audio del editor: el mismo payload del sidecar sin el
// projectId, que lo aporta el hook del proyecto.
export type MusicChoice = Omit<SetProjectMusicPayload, 'projectId'>
export type NarrationReplacement = Omit<ReplaceNarrationPayload, 'projectId'>
export type AudioMixChange = Omit<UpdateAudioMixPayload, 'projectId'>
// La mezcla completa que edita el diálogo y previsualiza el player.
export type AudioMixValue = Required<AudioMixChange>

// API imperativa del preview del editor para los atajos y el timeline.
export interface EditorPlayerHandle {
  togglePlay(): void
  toggleMute(): void
  seekTo(seconds: number): void
  seekWithPlay(seconds: number): void
}

// Una escena esperando regeneración. El store captura su configuración y
// reserva sus IDs al despachar uno de los trabajos concurrentes.
export interface FlowRegenerationIntent {
  flowRecoverOnly?: boolean
  flowRegenerationRequestId?: string
  executionPlan?: FlowToolsExecutionPlan
}

export interface RegenQueueEntry extends FlowRegenerationIntent {
  flowRestartRequest?: FlowRestartRequest
  id: number
  rewritePrompt: boolean
  // Instantánea de la intención; se guarda al adquirir el turno de escritura.
  userPrompt?: string
  imageProvider?: ImageProviderId
  imageQuality?: string
  charactersPresent?: number[]
}

export interface QueuedRegenEntry extends RegenQueueEntry {
  order: number
}

export interface EditorRenderState {
  jobId: string | null
  percent: number
  phase: RenderPhase
}

export interface EditorExportState {
  jobId: string | null
  percent: number
}

// Estado transitorio de la animación de una escena mientras corre el job
// (ADR-0047); lo persistido lo trae el detail en `scene.animation`.
export type SceneAnimationActivity = 'generating' | 'ok' | 'error'

// Por qué falló el clip de una escena: el mensaje traducido y el motivo
// técnico crudo del proveedor, que el modal muestra tal cual. `retryable`
// es false cuando repetir el pedido repite el rechazo (moderación, escena
// sin imagen, marcas que el planificador no puede convertir en clip).
export interface SceneAnimationFailure {
  sceneId: number
  key: string
  detail?: string
  retryable: boolean
}

// Avance de un clip en curso (ADR-0047). PoYo informa porcentaje real; Kie
// no, y la UI lo simula desde `startedAt` con la duración típica de un clip.
// Viaja bajo cada escena que el clip cubre; `leadId` es la que lo encabeza.
export interface SceneAnimationProgress {
  leadId: number
  startedAt: number
  reportedPercent: number | null
  phase?: 'queued' | 'preparing' | 'rate-limited' | 'generating' | 'retrying'
  attempt?: number
  maxAttempts?: number
  animationId?: string
  startSeconds?: number
  endSeconds?: number
}

// Lo que el planificador haría con la escena seleccionada si se animara
// ahora (ADR-0041): la unidad (qué escenas absorbe, cuánto mide el hueco) o
// el motivo del rechazo. Sale del mismo planificador puro que usa el sidecar.
export interface AnimationPlanPreview {
  sceneIds?: number[]
  slotSeconds?: number
  readyClips?: SceneAnimationView[]
  unit?: AnimationUnit
  rejection?: AnimationRejection
  staticTailSceneId?: number
  staticTailPending?: boolean
  requestedSeconds?: number
  canResumeTask?: boolean
  canRecoverLocally?: boolean
}

// Todo lo que el panel de la escena necesita para animarla (ADR-0047): lo
// arma la vista y viaja como un solo objeto para no inflar las props.
export interface SceneAnimationUndoControls {
  sceneCount: number
  pending: boolean
  disabled: boolean
  reason?: string
  onUndo(): void
}

export interface SceneAnimationControls {
  busy?: boolean
  provider: VideoProviderId
  configuredProviders: ReadonlySet<string>
  credits: VideoCreditsResult | null
  creditsLoading: boolean
  creditsRefreshing: boolean
  onRefreshCredits(): void
  // Estado transitorio del job, avance del clip y último fallo de ESTA escena.
  activity: SceneAnimationActivity | undefined
  progress: SceneAnimationProgress | undefined
  error: SceneAnimationFailure | undefined
  // Qué haría el planificador con esta escena (undefined = sin tiempos).
  plan: AnimationPlanPreview | undefined
  undo?: SceneAnimationUndoControls
  onAnimate(): void
}

// El job de animación terminó con escenas sin clip: abre el modal de fallo.
export interface AnimationFailureNotice {
  provider: VideoProviderId
  failures: SceneAnimationFailure[]
}

export interface EditorAnimationRequest {
  onReviewFinished?: (outcome: SceneAnimationReviewOutcome) => void
  readySceneIds?: number[]
  id: string
  jobId: string | null
  sceneIds: number[]
  provider: VideoProviderId
  force: boolean
  minutes?: number
  retryFailed?: boolean
  started: boolean
  order: number
  cancelled?: boolean
}

export interface EditorAnimationState {
  jobId: string | null
  sceneIds: number[]
  provider: VideoProviderId
}

// Estado del editor de UN proyecto: vive fuera de React (los jobs siguen al
// navegar) y NO se persiste — un job muere con la app y el detail refetchea
// la verdad del disco al volver.
// Estado local de observación, nunca se persiste en scenes.json.
export type EditorSceneImageStatus =
  SceneImageStatus | 'awaiting_sync' | 'preparing'

export interface EditorRegenerationRequest {
  requestId: string
  jobId: string | null
  sceneIds: number[]
  imageProvider?: ImageProviderId
  cancelled?: boolean
}

export interface LibraryEditorTask {
  projectId: string
  // Reserva breve durante el guardado de descripciones anterior al encolado.
  savingScenes: boolean
  regenQueue: QueuedRegenEntry[]
  // Resumen compatible para las vistas; la autoría vive en cada solicitud.
  activeRegen: EditorRegenerationRequest | null
  activeRegenerations: EditorRegenerationRequest[]
  // Descripciones aceptadas que deben seguir disponibles ante fallo de guardado.
  sceneRegenDrafts: Record<number, string>
  // Override transitorio del proveedor para el próximo lote de regen.
  pendingImageProvider: ImageProviderId | null
  // Estados transitorios por escena (spinner de la cola y del job).
  sceneStatus: Record<number, EditorSceneImageStatus>
  // Motivo (clave i18n) del último fallo por escena: sobrevive al cierre
  // del job y se borra al reintentar esa escena.
  sceneErrors: Record<number, string>
  // Cache-buster por escena: sube cuando llega una imagen nueva.
  sceneVersions: Record<number, number>
  // Avanza sólo cuando el job confirma el éxito, no con un recibo aislado.
  sceneCompletionVersions: Record<number, number>
  render: EditorRenderState | null
  export: EditorExportState | null
  // Job de animación en curso (ADR-0047); exclusión con regen/render/export.
  animation: EditorAnimationState | null
  // Proveedor de animación elegido en el editor; null = el del proyecto (o
  // el primero con clave). Se persiste en project.json al animar.
  pendingVideoProvider: VideoProviderId | null
  // Estado transitorio de la animación por escena (encabezado del clip).
  sceneAnimationStatus: Record<number, SceneAnimationActivity>
  // Avance del clip en curso, bajo cada escena que cubre; se borra al
  // terminar (bien o mal) esa unidad.
  sceneAnimationProgress: Record<number, SceneAnimationProgress>
  // Último fallo de animación por escena: sobrevive al cierre del job y se
  // borra al reintentar esa escena.
  sceneAnimationErrors: Record<number, SceneAnimationFailure>
  // Fallos del último job de animación, para el modal; null = nada que
  // mostrar (o ya se cerró).
  animationFailure: AnimationFailureNotice | null
  // Reemplazo de narración / música en curso (exclusión con regen/render).
  audioBusy: boolean
  errorKey: string | null
  // Código crudo del último fallo de job: con uno de saldo agotado la vista
  // muestra la alerta de la cuenta que rechazó (ADR-0031).
  errorCode: string | null
  // Sube al cerrar cada job: la vista invalida sus queries al verlo cambiar.
  revision: number
}
