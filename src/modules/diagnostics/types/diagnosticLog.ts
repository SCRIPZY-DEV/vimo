import type { JsonValue } from '@pipeline/types/json.ts'

export const DiagnosticLogSource = {
  pipeline: 'pipeline',
  update: 'update',
} as const

export type DiagnosticLogSource =
  (typeof DiagnosticLogSource)[keyof typeof DiagnosticLogSource]

export const DiagnosticLogStatus = {
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  paused: 'paused',
  crashed: 'crashed',
} as const

export type DiagnosticLogStatus =
  (typeof DiagnosticLogStatus)[keyof typeof DiagnosticLogStatus]

// Registro de una ejecución tal como lo deja Rust en el spool (ADR-0038):
// ya viene redactado. Espejo de DiagnosticRecord en
// src-tauri/src/diagnostics/recorder.rs.
export interface DiagnosticLogRecord {
  id: string
  source: DiagnosticLogSource
  subcommand: string | null
  projectId: string | null
  projectName: string | null
  status: DiagnosticLogStatus
  errorCode: string | null
  errorMessage: string | null
  errorProvider: string | null
  errorHttpStatus: number | null
  failedStage: string | null
  startedAtMs: number
  finishedAtMs: number
  durationMs: number
  appVersion: string
  os: string
  osVersion: string | null
  arch: string
  context: JsonValue
  events: JsonValue[]
  eventsTruncated: boolean
}

// Quién sube el registro: sale de la sesión de Supabase y del idioma activo.
export interface DiagnosticLogUploader {
  userId: string
  email: string
  locale: string | null
}

// Fila de la tabla `diagnostic_logs` de Supabase.
export interface DiagnosticLogRow {
  id: string
  user_id: string
  user_email: string
  source: DiagnosticLogSource
  module: string
  subcommand: string | null
  project_id: string | null
  project_name: string | null
  status: DiagnosticLogStatus
  error_code: string | null
  error_message: string | null
  error_provider: string | null
  error_http_status: number | null
  failed_stage: string | null
  started_at: string
  finished_at: string
  duration_ms: number
  app_version: string
  os: string
  os_version: string | null
  arch: string
  locale: string | null
  context: JsonValue
  events: JsonValue[]
  events_truncated: boolean
}
