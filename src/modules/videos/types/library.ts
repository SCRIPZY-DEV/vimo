import type { CostEstimateLine } from '@/modules/common/types/credits'
import type { AvatarRenderPhase } from '@/modules/videos/types/create'
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
import type {
  AvatarBalanceResult,
  AvatarRenderScenesPayload,
  AvatarSceneMotionInput,
} from '@pipeline/types/avatar.ts'
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

// Pistas del timeline (ADR-0056). El orden, el silencio en el visor y el
// candado son estado de interfaz por proyecto: no viajan al archivo del
// proyecto ni al render.
export type TimelineTrackId = 'scenes' | 'narration' | 'music'
export type TimelineTrackKind = 'visual' | 'audio'
export interface TimelineLayout {
  order: TimelineTrackId[]
  // Solo tiene efecto en las pistas de audio.
  muted: Record<TimelineTrackId, boolean>
  locked: Record<TimelineTrackId, boolean>
}

// Tipo de un bloque con tarjeta propia en la pista de escenas (ADR-0057): el
// clip animado de Kie o la escena de avatar.
export type TimelineBlockKind = 'clip' | 'avatar'

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

// Una escena esperando regeneración. La cola se coalesce: UN job de regen
// por proyecto a la vez; lo encolado durante un job sale en el siguiente.
export interface RegenQueueEntry {
  id: number
  rewritePrompt: boolean
  // Instantánea de la intención; se guarda al adquirir el turno de escritura.
  userPrompt?: string
  imageProvider?: ImageProviderId
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
  // La persona pidió cancelar: se pide una sola vez y, si el invoke todavía no
  // devolvió el id, se cancela al llegar.
  cancelled: boolean
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

// Render de HeyGen de una escena de avatar en curso desde el editor (spec
// §3.3: «generando» vive en memoria, no en disco). Lo llena la tarea de
// `avatar-render-scenes` (entrega 2d, §20). `startedAt` es cuándo arrancó su
// render (el `avatar-scene-started` del job) y nunca se reinicia; `queued`, que
// todavía espera su turno (HeyGen renderiza de a AVATAR_RENDER_CONCURRENCY):
// el bloque dice «Generando el avatar…» sin porcentaje hasta que arranca.
// `phase` es el último paso que informó el carril (`avatar-scene-progress`):
// desde `render` la aparición está cobrada (AVATAR_CHARGED_PHASES, entrega 2h,
// spec §24.4) y «Cancelar» avisa antes de cortar. Sin fase todavía = nada que
// se haya cobrado.
export interface SceneAvatarRendering {
  startedAt: number
  queued?: boolean
  phase?: AvatarRenderPhase
}

// Qué ofrece el panel para una escena de avatar (spec §11.1, §3.3 y §21.4):
// generarla por primera vez (planeada), regenerarla (fallida, desactualizada o
// lista sin clip) o, desde la entrega 2e, volver a generar una lista y al día
// (`retake`: un render nuevo pagado aunque nada cambie; el clip actual queda
// hasta que el nuevo esté listo). «Regenerar todos» no cuenta `retake`.
export type AvatarSceneAction = 'generate' | 'regenerate' | 'retake'

// Lo que viaja con el pedido del avatar además de las escenas (entrega 2e,
// §21.4): las listas que la persona pidió regenerar y los ajustes de
// movimiento de la escena elegida; y, desde la 2g (§23.3), la duración nueva de
// las escenas que la cambiaron. Mismos campos que el payload del sidecar.
export type AvatarRenderRequestOptions = Pick<
  AvatarRenderScenesPayload,
  'regenerateSceneIds' | 'motion' | 'durations'
>

// Un pedido del avatar desde el editor: las escenas y lo que viaja con ellas.
// Lo guarda la confirmación abierta hasta que se paga.
export interface AvatarRenderRequest extends AvatarRenderRequestOptions {
  sceneIds: number[]
}

// El movimiento de una escena de V o IV como lo edita su panel (entrega 2e,
// §21.4): el prompt tal como lo dejó la persona y «más expresivo».
export type AvatarMotionDraft = Omit<AvatarSceneMotionInput, 'sceneId'>

// El borrador del movimiento junto con lo guardado en la escena cuando se
// escribió: si lo guardado cambia (la escena se generó o se releyó), el
// borrador ya no vale y el panel vuelve a mostrar lo guardado.
export interface AvatarMotionEdit {
  base: AvatarMotionDraft
  draft: AvatarMotionDraft
}

// Cómo terminó un «Generar» de la confirmación del avatar (entrega 2d):
// arrancó la tarea; el saldo releído no alcanzó y la confirmación sigue
// abierta con su aviso; o no se hizo nada (otro clic ya estaba releyendo, o
// el proyecto se ocupó y la confirmación se cerró). Solo el segundo mueve el
// foco a «Cancelar» del diálogo.
export type AvatarConfirmOutcome = 'started' | 'blocked' | 'skipped'

// La confirmación abierta de pagar el avatar de unas escenas desde el editor
// (entrega 2d, useAvatarRenderConfirmation): cuántas, lo que cuestan (null si
// el motor no tiene tarifa), el saldo de avatares leído (null mientras llega),
// si no alcanza y si se está releyendo antes de pagar. `retake`: vuelve a
// generar una lista (entrega 2e), con los textos de «Regenerar».
export interface AvatarRenderConfirmationState {
  count: number
  cost: CostEstimateLine | null
  balance: AvatarBalanceResult | null
  insufficient: boolean
  checking: boolean
  retake: boolean
}

// La tarea del editor que corre `avatar-render-scenes` (entrega 2d): una a la
// vez y exclusiva con las demás del proyecto. `failures` guarda el código de
// cada escena que falló en esta corrida, para el aviso del final;
// `regenerateSceneIds`, las listas que se pidió regenerar (entrega 2e): si una
// falla, conserva su clip anterior y el aviso lo dice.
export interface EditorAvatarRenderState {
  requestId: string
  jobId: string | null
  sceneIds: number[]
  regenerateSceneIds: number[]
  failures: Record<number, string>
  cancelled?: boolean
}

// El aviso de «Cancelar» con apariciones del avatar ya cobradas, como lo guarda
// useAvatarSceneRender (entrega 2h, spec §24.4): atado al job que lo abrió
// (`requestId`) y con la cuenta de lo cobrado y sin terminar al tocar
// «Cancelar», que solo sube mientras el aviso sigue abierto.
export interface AvatarCancelWarning {
  requestId: string
  count: number
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
export interface LibraryEditorTask {
  projectId: string
  // Reserva breve durante el guardado de descripciones anterior al encolado.
  savingScenes: boolean
  regenQueue: QueuedRegenEntry[]
  activeRegen: {
    requestId: string
    jobId: string | null
    sceneIds: number[]
    cancelled?: boolean
  } | null
  // Descripciones aceptadas que deben seguir disponibles ante fallo de guardado.
  sceneRegenDrafts: Record<number, string>
  // Override transitorio del proveedor para el próximo lote de regen.
  pendingImageProvider: ImageProviderId | null
  // Estados transitorios por escena (spinner de la cola y del job).
  sceneStatus: Record<number, SceneImageStatus>
  // Motivo (clave i18n) del último fallo por escena: sobrevive al cierre
  // del job y se borra al reintentar esa escena.
  sceneErrors: Record<number, string>
  // Cache-buster por escena: sube cuando llega una imagen nueva.
  sceneVersions: Record<number, number>
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
  // Render de avatares de HeyGen en curso (entrega 2d): exclusión con todo lo
  // demás del proyecto.
  avatarRender: EditorAvatarRenderState | null
  // Las escenas de ese render, en cola o generándose: el bloque del timeline
  // las muestra «generando» (spec §3.3). Cada una sale al quedar lista o
  // fallida, y todas al cerrar el job.
  sceneAvatarRendering: Record<number, SceneAvatarRendering>
  // Reemplazo de narración / música en curso (exclusión con regen/render).
  audioBusy: boolean
  errorKey: string | null
  // Código crudo del último fallo de job: con uno de saldo agotado la vista
  // muestra la alerta de la cuenta que rechazó (ADR-0031).
  errorCode: string | null
  // Sube al cerrar cada job: la vista invalida sus queries al verlo cambiar.
  revision: number
}
