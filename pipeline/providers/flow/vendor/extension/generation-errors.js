import { safeAttemptStats } from './attempt-audit.js'

// A completed RPC error is not proof that Google created no image. Only this
// narrow case releases a local execution slot; the result remains unknown.
export function isSettledInternalGenerationError(error) {
  return (
    error?.code === 'PROVIDER_INTERNAL_ERROR' &&
    error.submission === 'unknown' &&
    error.rpcCode === 13 &&
    error.responseKind === 'rpc_error' &&
    error.operation === 'generate' &&
    error.phase === undefined &&
    error.operationSubmission === undefined &&
    !(error.retryAfterMs > 0) &&
    !(error.retryAfter > 0)
  )
}

export function upgradeLegacyInternalGenerationError(job) {
  const error = job?.error
  if (
    job?.state !== 'unknown' ||
    job.result ||
    error?.code !== 'SUBMISSION_UNKNOWN' ||
    error.rpcCode !== 13 ||
    error.submission !== 'unknown' ||
    error.phase !== undefined ||
    error.operationSubmission !== undefined ||
    error.retryAfterMs > 0 ||
    error.retryAfter > 0 ||
    !job.generationRequest ||
    !job.attemptAudit?.entries?.some(
      (entry) =>
        entry.id === job.generationAttemptId &&
        entry.submission === 'confirmed',
    )
  )
    return null
  return {
    ...error,
    code: 'PROVIDER_INTERNAL_ERROR',
    responseKind: 'rpc_error',
    operation: 'generate',
  }
}

const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  )

// Pure transition: the caller durably stores this copy before acknowledging it.
// Replays return the same job, including after it has completed or failed again.
export function prepareExplicitGenerationRetry(
  job,
  message,
  connectionId,
  projectId,
  now,
) {
  const invalid = (code) => {
    const error = new Error(code)
    error.code = code
    throw error
  }
  if (
    !job ||
    job.source !== 'bridge' ||
    job.connectionId !== connectionId ||
    job.requestHash !== message.requestHash ||
    !uuid(message.attemptId) ||
    !uuid(message.previousAttemptId) ||
    !uuid(message.retryRequestId) ||
    message.attemptId === message.previousAttemptId
  )
    invalid('retry_context_invalid')
  const previous = job.generationRetry
  if (previous?.retryRequestId === message.retryRequestId) {
    if (
      previous.attemptId !== message.attemptId ||
      previous.previousAttemptId !== message.previousAttemptId ||
      job.attemptId !== message.attemptId
    )
      invalid('retry_context_invalid')
    return { job, replay: true }
  }
  if (
    job.attemptId !== message.previousAttemptId ||
    job.state !== 'unknown' ||
    job.result ||
    job.cancelRequested ||
    job.binding?.projectId !== projectId ||
    !isSettledInternalGenerationError(job.error)
  )
    invalid('retry_not_available')
  const history = job.generationRetryHistory ?? []
  if (!Array.isArray(history) || history.length >= 2)
    invalid('retry_limit_reached')
  const generationRetry = {
    retryRequestId: message.retryRequestId,
    previousAttemptId: message.previousAttemptId,
    attemptId: message.attemptId,
    status: 'accepted',
    acknowledgedAt: now,
    duplicateRiskAccepted: true,
  }
  const record = {
    ...generationRetry,
    previous: {
      attemptId: job.attemptId,
      state: job.state,
      error: job.error,
      generationAttemptId: job.generationAttemptId,
      generationRequest: job.generationRequest,
      sentAt: job.sentAt,
      submittedAt: job.submittedAt,
      attemptStats: job.attemptStats,
    },
  }
  return {
    replay: false,
    job: {
      ...job,
      attemptId: message.attemptId,
      state: message.cancelRequested === true ? 'canceled' : 'queued',
      updatedAt: now,
      cancelRequested: message.cancelRequested === true,
      generationRetry,
      generationRetryHistory: [...history, record],
      generationRetryCount: history.length + 1,
      error: null,
      generationAttemptId: null,
      generationScheduling: null,
      generationRequest: null,
      sentAt: null,
      submittedAt: null,
      budgetReservedAt: null,
      prePostCanceled: false,
      resultAcknowledged: false,
    },
  }
}

// Opt-in applies only to jobs admitted by a compatible coordinator. A SDK error
// after invocation is never evidence that another generation is safe.
export const AUTO_RETRY_VERSION = 1
export const MAX_AUTOMATIC_RETRIES = 4
const automaticNotSentCodes = new Set([
  'TOKEN_PREPARATION_FAILED',
  'NETWORK_ERROR',
  'PROVIDER_UNAVAILABLE',
  'TOOLS_PREPARATION_FAILED',
  'TOOLS_FRAME_UNAVAILABLE',
  'TOOLS_PORT_UNAVAILABLE',
])

export function automaticRecoveryEligible(error, attemptStats) {
  const stats = safeAttemptStats(attemptStats)
  if (
    stats &&
    ['TOOLS_MODELS_EXHAUSTED', 'TOOLS_MODELS_UNAVAILABLE'].includes(
      error?.code,
    ) &&
    error.submission === 'rejected' &&
    error.operation === 'generate' &&
    error.scope === 'account' &&
    error.phase === undefined &&
    error.operationSubmission === undefined
  )
    return true
  if (
    !stats ||
    stats.confirmedSubmissions !== 0 ||
    stats.uncertain !== 0 ||
    !error ||
    typeof error !== 'object' ||
    Array.isArray(error) ||
    !automaticNotSentCodes.has(error.code) ||
    !['not_sent', 'not-sent'].includes(error.submission) ||
    error.rpcCode !== undefined ||
    error.httpStatus !== undefined ||
    error.responseKind !== undefined ||
    error.scope !== undefined
  )
    return false
  for (const key of ['retryAfterMs', 'retryAfter']) {
    if (error[key] !== undefined && error[key] !== 0) return false
  }
  if (error.phase === undefined) {
    return (
      (error.operation === undefined || error.operation === 'generate') &&
      error.operationSubmission === undefined
    )
  }
  return (
    error.phase === 'upload' &&
    error.operation === 'upload' &&
    ['not_sent', 'not-sent'].includes(error.operationSubmission)
  )
}
