import type { RenderPhase } from '@pipeline/runner/events.ts'
import type { StageId } from '@pipeline/runner/stage-id.ts'
import type { SceneSummary } from '@pipeline/types/scenes.ts'
import type {
  BgmMode,
  CharacterFrequency,
  NarrationMode,
  ProbeTtsReason,
} from '@pipeline/types/video-project.ts'
import type { CharacterStyleId } from '@pipeline/types/characters.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
import type { VoiceProviderId } from '@pipeline/types/voices.ts'
import type {
  SelectedCustomStyle,
  StyleSource,
} from '@/modules/videos/types/styles'
import type { VoiceSettingsFormValue } from '@/modules/voices/types/voices'

export type CreateTaskStatus =
  'creating' | 'generating' | 'awaitingConfirmation' | 'completed' | 'error'

// Progreso de la síntesis de voz mientras corre la fase 1.
export interface VoiceProgressView {
  provider: VoiceProviderId
  totalChars: number
  elapsedSeconds: number
  percent: number | null
}

// Progreso de la música de fondo generada con IA.
export interface BgmProgressView {
  percent: number
  status: string
  elapsedSeconds: number
}

export interface RenderProgressView {
  percent: number
  phase: RenderPhase
}

// La pausa que abre el diálogo de confirmación de escenas.
export interface SceneConfirmationView {
  suggestedScenes: number
  audioDurationSeconds: number
  wordCount: number
  // Presente solo en el carril de segundos (estilo propio): el diálogo pasa
  // a modo slider con este valor vigente.
  secondsPerScene?: number
}

// Lo que el usuario confirmó en el diálogo: el conteo clásico, o los
// segundos por escena del carril de estilo propio.
export type SceneCutChoice =
  { sceneCount: number } | { secondsPerScene: number }

// Escena tal como la ve la pantalla de progreso: la del contrato más el
// avance de su imagen mientras se genera (scene-image-progress; solo
// Evolink lo informa).
export type SceneView = SceneSummary & { imageProgress?: number }

// Una generación de video de punta a punta. Vive fuera de React (módulo
// store) porque el layout desmonta la vista al navegar y el job sigue
// corriendo; se persiste en localStorage porque el proyecto queda en disco y
// la pausa de confirmación puede resolverse tras reabrir la app.
export interface CreateTask {
  id: string
  jobId: string | null
  projectId: string
  projectName: string
  status: CreateTaskStatus
  // Fase en curso; null antes de arrancar o al terminar.
  stage: StageId | null
  completedStages: StageId[]
  scenes: SceneView[]
  audioDurationSeconds: number | null
  voiceProgress: VoiceProgressView | null
  bgmProgress: BgmProgressView | null
  renderProgress: RenderProgressView | null
  confirmation: SceneConfirmationView | null
  // Últimas líneas de log del sidecar (capadas).
  logs: string[]
  videoPath: string | null
  errorKey: string | null
  startedAt: number
  // Cronómetro honesto (origen v1.1.0): el tiempo esperando a la persona no
  // cuenta. pausedAt marca la pausa en curso; pausedMs acumula las cerradas.
  pausedAt: number | null
  pausedMs: number
  // Congela el cronómetro al completar (la vista «Listo» muestra el total).
  finishedAt: number | null
  // Cuenta regresiva del reintento automático en curso; null = no hay.
  retry: RetryView | null
  // Reintentos automáticos ya consumidos (se agota en AUTO_RETRY_MAX_ATTEMPTS).
  retryAttempts: number
  // Formato del proyecto: la vista de progreso pinta la grilla sin refetch.
  videoFormat: VideoFormat
}

// Estado visible del reintento automático ante un fallo transitorio.
export interface RetryView {
  attempt: number
  maxAttempts: number
  secondsLeft: number
}

// Un personaje elegido en el formulario (hasta 2).
export interface SelectedCharacter {
  characterId: string
  name: string
  description: string
  // El preview del estilo actual, si la biblioteca ya lo tiene.
  previewPath: string | null
}

// Voz elegida en el picker.
export interface SelectedVoice {
  provider: VoiceProviderId
  voiceId: string
  name: string
}

// Estado completo del formulario de creación.
export interface CreateFormValue {
  name: string
  narrationMode: NarrationMode
  script: string
  // Ruta del audio elegido con el dialog nativo (modo own-audio).
  narrationFilePath: string | null
  styleId: CharacterStyleId
  // Fuente del estilo: con 'custom', customStyle manda y styleId viaja como
  // 'normal' (el contrato del pipeline lo sigue validando).
  styleSource: StyleSource
  customStyle: SelectedCustomStyle | null
  // 0 = cantidad automática.
  sceneCount: number
  imageProvider: ImageProviderId
  imageQuality: string
  voice: SelectedVoice | null
  voiceSettings: VoiceSettingsFormValue
  characters: SelectedCharacter[]
  characterFrequency: CharacterFrequency
  useBgm: boolean
  bgmMode: BgmMode
  bgmUrl: string
  bgmPrompt: string
  bgmInstrumental: boolean
  useOverlay: boolean
  overlayUrl: string
  confirmScenes: boolean
  // Con false (default), al terminar la generación se va al editor y el
  // render se dispara desde ahí (ADR-0016).
  autoRender: boolean
  videoFormat: VideoFormat
}

// Resultado cacheado del probe de TTS (por proveedor + voz).
export interface ProbeCacheEntry {
  ok: boolean
  reason: ProbeTtsReason
  expiresAt: number
}
