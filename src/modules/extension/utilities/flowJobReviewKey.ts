import { flowAutoRecoveryPending } from '@pipeline/types/flow-auto-recovery.ts'
import type { FlowImageJob } from '@/modules/common/types/flow'

// Espejo de presentación de job-review del sidecar; no decide acciones.
export function flowJobReviewKey(job: FlowImageJob): string | null {
  if (flowAutoRecoveryPending(job)) return null
  // Diagnóstico, nunca permiso para reemplazar o reenviar un intento.
  if (!['failed', 'unknown'].includes(job.state) || job.result) return null

  const error = job.error
  if (
    job.state === 'unknown' ||
    error?.submission === 'unknown' ||
    error?.operationSubmission === 'unknown'
  )
    return 'extension.submissionUnknown'

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
    return 'extension.accountReviewRequired'

  return null
}
