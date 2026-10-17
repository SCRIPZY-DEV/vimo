import { flowAutoRecoveryPending } from '@pipeline/types/flow-auto-recovery.ts'
import type { FlowImageJob } from '@/modules/common/types/flow'

// Espejo tipado del predicado del coordinador. No se amplía por texto de error.
export function canRetryFlowGeneration(job: FlowImageJob): boolean {
  if (flowAutoRecoveryPending(job)) return false
  const error = job.error
  return (
    job.state === 'unknown' &&
    !!job.attemptId &&
    !job.result &&
    !job.cancelRequested &&
    job.generationRetry?.status !== 'pending' &&
    job.generationRetryCount < 2 &&
    error?.code === 'PROVIDER_INTERNAL_ERROR' &&
    error.submission === 'unknown' &&
    error.rpcCode === 13 &&
    error.responseKind === 'rpc_error' &&
    error.operation === 'generate' &&
    error.phase === undefined &&
    error.operationSubmission === undefined &&
    !(Number(error.retryAfterMs) > 0) &&
    !(Number(error.retryAfter) > 0)
  )
}

export function canCancelFlowJob(job: FlowImageJob): boolean {
  return (
    !job.result &&
    !job.cancelRequested &&
    (flowAutoRecoveryPending(job) ||
      !['ready', 'failed', 'canceled', 'deleted'].includes(job.state))
  )
}
