import type { JsonValue } from '../types/json.ts'
import type { StageId } from './stage.ts'

// Contrato de salida del sidecar (ADR-0010): cada evento es una línea NDJSON
// por stdout. Rust las parsea y re-emite por este canal con app.emit; la UI
// escucha con listen(). src/ consume estos tipos SOLO con `import type`.
export const PIPELINE_EVENT_CHANNEL = 'pipeline://event'

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
  | JobCompletedEvent
  | JobFailedEvent

// Lo que viaja de verdad por el canal: el payload sellado con el id del job.
export type PipelineEvent = PipelineEventPayload & { jobId: string }
