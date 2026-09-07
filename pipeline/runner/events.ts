import type { JsonValue } from '../types/json.ts'
import type { SceneSummary } from '../types/scenes.ts'
import type { VoiceProviderId } from '../types/voices.ts'
import type { StageId } from './stage-id.ts'

// Contrato de salida del sidecar (ADR-0010): cada evento es una línea NDJSON
// por stdout. Rust las parsea y las reenvía por el Channel del invoke que
// lanzó el job. src/ consume estos tipos SOLO con `import type`.

export interface JobStartedEvent {
  type: 'job-started'
}

export interface StageStartedEvent {
  type: 'stage-started'
  stageId: StageId
}

export interface StageSkippedEvent {
  type: 'stage-skipped'
  stageId: StageId
}

export interface StageCompletedEvent {
  type: 'stage-completed'
  stageId: StageId
}

export interface ProgressEvent {
  type: 'progress'
  stageId?: StageId
  percent?: number
  message?: string
  // Datos extra propios de la tarea (p. ej. créditos estimados de música).
  detail?: JsonValue
}

export interface LogEvent {
  type: 'log'
  level: 'info' | 'warn' | 'error'
  message: string
}

// ─── Eventos del pipeline de video (Create, ADR-0013) ───
// Espejo tipado de los eventos del origen: eventos propios en vez de
// `progress.detail` para que el switch de la UI sea legible y los shapes
// viajen por `import type` sin casts.

// Las escenas quedaron definidas (tras los cortes, Fase 3).
export interface ScenesPlannedEvent {
  type: 'scenes-planned'
  scenes: SceneSummary[]
  audioDurationSeconds: number
}

// Una escena ya tiene su prompt de imagen (Fase 4, incremental).
export interface ScenePromptReadyEvent {
  type: 'scene-prompt-ready'
  scene: SceneSummary
}

// Avance del redactor mientras ESCRIBE (Fase 4, carril verbatim): cifras
// absolutas del stream, no incrementos — un evento perdido no descuadra.
// Espejo de `prompts-progreso` del origen; es lo que hace que la barra
// avance en vez de saltar de 0 a 100 cuando el lote termina.
export interface ScenePromptsProgressEvent {
  type: 'scene-prompts-progress'
  ready: number
  total: number
}

export interface SceneImageStartedEvent {
  type: 'scene-image-started'
  sceneId: number
}

export interface SceneImageReadyEvent {
  type: 'scene-image-ready'
  sceneId: number
  // Ruta absoluta; la UI la muestra vía convertFileSrc().
  imagePath: string
}

export interface SceneImageFailedEvent {
  type: 'scene-image-failed'
  sceneId: number
  // Clave estable para i18n, como el code de job-failed.
  code: string
  // Detalle técnico del proveedor (status HTTP, mensaje): para diagnóstico,
  // nunca se muestra crudo al usuario.
  detail?: string
}

// Progreso de una imagen en curso (solo Evolink informa avance).
export interface SceneImageProgressEvent {
  type: 'scene-image-progress'
  sceneId: number
  percent: number
  status: string
}

// Progreso de la síntesis de voz. Sin `percent` real (Minimax/Edge no lo
// informan) la UI dibuja su curva sintética desde elapsedSeconds.
export interface VoiceProgressEvent {
  type: 'voice-progress'
  provider: VoiceProviderId
  totalChars: number
  elapsedSeconds: number
  percent?: number
}

// Progreso de la música de fondo generada con IA (Evolink/Suno).
export interface BgmProgressEvent {
  type: 'bgm-progress'
  percent: number
  status: string
  elapsedSeconds: number
}

export type RenderPhase = 'chunks' | 'concat' | 'final'

export interface RenderProgressEvent {
  type: 'render-progress'
  percent: number
  phase: RenderPhase
}

// Pausa de confirmación (Fase 3): el job cierra LIMPIO después de esto —
// no es un completado; la UI muestra el diálogo y relanza tras
// confirm-scenes (semántica del origen, fuente histórica de bugs).
export interface AwaitingSceneConfirmationEvent {
  type: 'awaiting-scene-confirmation'
  suggestedScenes: number
  audioDurationSeconds: number
  wordCount: number
  // Presente solo en el carril de segundos (estilo propio): el diálogo pasa
  // a modo slider y `suggestedScenes` es el conteo que sale de ESTE valor.
  secondsPerScene?: number
}

export interface JobCompletedEvent {
  type: 'job-completed'
  result: JsonValue | null
}

export interface JobFailedEvent {
  type: 'job-failed'
  // Clave estable para i18n; `cancelled` marca una cancelación pedida.
  code: string
  message: string
}

export type PipelineEventPayload =
  | JobStartedEvent
  | StageStartedEvent
  | StageSkippedEvent
  | StageCompletedEvent
  | ProgressEvent
  | LogEvent
  | ScenesPlannedEvent
  | ScenePromptReadyEvent
  | ScenePromptsProgressEvent
  | SceneImageStartedEvent
  | SceneImageReadyEvent
  | SceneImageFailedEvent
  | SceneImageProgressEvent
  | VoiceProgressEvent
  | BgmProgressEvent
  | RenderProgressEvent
  | AwaitingSceneConfirmationEvent
  | JobCompletedEvent
  | JobFailedEvent

// Lo que viaja de verdad por el canal: el payload sellado con el id del job.
export type PipelineEvent = PipelineEventPayload & { jobId: string }
