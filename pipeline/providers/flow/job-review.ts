import type { FlowJobStatus } from './types.ts'

export function flowJobReviewCode(job: FlowJobStatus): string | null {
  // Diagnóstico, nunca permiso para reemplazar o reenviar un intento.
  if (!['failed', 'unknown'].includes(job.state) || job.result) return null

  if (
    job.autoRecovery?.reason === 'all_accounts_exhausted' ||
    ['TOOLS_MODELS_EXHAUSTED', 'TOOLS_MODELS_UNAVAILABLE'].includes(
      job.error?.code ?? '',
    )
  )
    return 'flow_accounts_exhausted'

  const error = job.error
  if (
    job.state === 'unknown' ||
    error?.submission === 'unknown' ||
    error?.operationSubmission === 'unknown'
  )
    return 'flow_submission_unknown'

  if (error?.code !== 'ACTIVITY_BLOCKED') return null

  if (
    error.operationSubmission !== undefined &&
    error.operationSubmission !== 'rejected'
  )
    return null

  if (
    error.submission === 'rejected' ||
    (error.phase === 'upload' &&
      error.submission === 'not-sent' &&
      error.operationSubmission === 'rejected')
  )
    return 'flow_account_review_required'

  return null
}
