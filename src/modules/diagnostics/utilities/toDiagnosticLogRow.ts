import type {
  DiagnosticLogRecord,
  DiagnosticLogRow,
  DiagnosticLogUploader,
} from '../types/diagnosticLog'
import { resolveDiagnosticModule } from './resolveDiagnosticModule'

export function toDiagnosticLogRow(
  record: DiagnosticLogRecord,
  uploader: DiagnosticLogUploader,
): DiagnosticLogRow {
  return {
    id: record.id,
    user_id: uploader.userId,
    // La política RLS compara contra lower(email) del JWT.
    user_email: uploader.email.toLowerCase(),
    source: record.source,
    module: resolveDiagnosticModule(record.subcommand),
    subcommand: record.subcommand,
    project_id: record.projectId,
    project_name: record.projectName,
    status: record.status,
    error_code: record.errorCode,
    error_message: record.errorMessage,
    failed_stage: record.failedStage,
    started_at: new Date(record.startedAtMs).toISOString(),
    finished_at: new Date(record.finishedAtMs).toISOString(),
    duration_ms: record.durationMs,
    app_version: record.appVersion,
    os: record.os,
    os_version: record.osVersion,
    arch: record.arch,
    locale: uploader.locale,
    context: record.context,
    events: record.events,
    events_truncated: record.eventsTruncated,
  }
}
