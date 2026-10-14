import { persistentAttemptReusable } from '../extension/generation-errors.js'
// Recovery changes physical attempts, never the logical image intent. Historical
// jobs without the explicit version are deliberately outside this policy.
export const AUTO_RECOVERY_CAPABILITY = Object.freeze({
  version: 1,
  maxReplacements: 4,
})
export const UNKNOWN_RECONCILE_MS = 120_000
export const STALLED_ATTEMPT_MS = 600_000
export const RECOVERY_BACKOFF_MS = Object.freeze([
  5_000, 15_000, 30_000, 60_000,
])
export const DOWNLOAD_BACKOFF_MS = Object.freeze([5_000, 15_000, 60_000])

export function normalizeAutoRecoveryVersion(value) {
  if (value === undefined) return undefined
  if (value !== 1) throw new Error('auto_recovery_version_invalid')
  return 1
}

export function newAutoRecovery() {
  return {
    version: 1,
    maxReplacements: 4,
    status: 'pending',
    replacementCount: 0,
    attempts: [],
    nextAttemptAt: null,
    reason: null,
    lastProgressAt: null,
    progressRank: 0,
    unknownSince: null,
    winner: null,
    downloadAttempts: 0,
  }
}

export const automaticJob = (job) =>
  job?.autoRecoveryVersion === 1 && job.autoRecovery?.version === 1
export const uncertainAutomaticAttempt = (job) =>
  job?.autoRecoveryVersion === 1 &&
  (job.state === 'unknown' ||
    (job.state === 'failed' &&
      job.error?.phase === 'upload' &&
      job.error?.operationSubmission === 'unknown'))
export const archivedAttempts = (job) =>
  automaticJob(job) ? job.autoRecovery.attempts : []

export function attemptSnapshot(job) {
  const { autoRecovery, file, ...attempt } = job
  return structuredClone({
    ...attempt,
    attemptStats: autoRecovery
      ? (autoRecovery.currentAttemptStats ?? null)
      : (attempt.attemptStats ?? null),
  })
}

export function recoveryCapacityJobs(jobs) {
  const records = Object.assign(Object.create(null), jobs)
  for (const job of Object.values(jobs))
    for (const attempt of archivedAttempts(job)) {
      // These records remain charged to their original owner, even after another
      // attempt has won. A missing receipt is never a released physical slot.
      records[`archived:${job.imageJobId}:${attempt.attemptId}`] = attempt
    }
  return records
}

export function recoverySummary(job) {
  if (!automaticJob(job)) return undefined
  const recovery = job.autoRecovery
  return {
    version: 1,
    ...(job.persistentRecoveryVersion === 1
      ? { persistentRecoveryVersion: 1 }
      : {}),
    status:
      job.state === 'ready'
        ? 'completed'
        : job.cancelRequested
          ? 'canceled'
          : recovery.status,
    maxReplacements: recovery.maxReplacements ?? 2,
    replacementCount: recovery.replacementCount,
    attemptCount: recovery.attempts.length + (job.attemptId ? 1 : 0),
    nextAttemptAt: recovery.nextAttemptAt,
    reason: recovery.reason,
  }
}

export function observeRecoveryProgress(job, now) {
  if (!automaticJob(job) || job.result) return
  const recovery = job.autoRecovery
  const rank =
    { dispatching: 1, received: 2, uploading: 3, generating: 4, completed: 5 }[
      job.state
    ] ?? 0
  if (rank > recovery.progressRank) {
    recovery.progressRank = rank
    recovery.lastProgressAt = now
  }
  // Duplicate snapshots and heartbeats cannot renew this reconciliation window.
  if (uncertainAutomaticAttempt(job) && recovery.unknownSince === null)
    recovery.unknownSince = now
}

export function persistentRecoveryChain(job) {
  return (
    job?.persistentRecoveryVersion === 1 &&
    automaticJob(job) &&
    persistentAttemptReusable(job, job.autoRecovery.currentAttemptStats) &&
    archivedAttempts(job).every((attempt) => persistentAttemptReusable(attempt))
  )
}

export function persistentRecoveryHistoryValid(job) {
  if (
    job.persistentRecoveryVersion !== undefined &&
    job.persistentRecoveryVersion !== 1
  )
    return false
  const attempts = [...archivedAttempts(job), ...(job.attemptId ? [job] : [])]
  if (
    new Set(attempts.map((attempt) => attempt.attemptId)).size !==
    attempts.length
  )
    return false
  const uuid = (value) =>
    typeof value === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  if (
    attempts.some(
      (attempt) =>
        (attempt.persistentRecoveryVersion !== undefined &&
          attempt.persistentRecoveryVersion !== 1) ||
        (attempt.previousLocalAttemptId !== undefined &&
          (attempt.persistentRecoveryVersion !== 1 ||
            !uuid(attempt.previousLocalAttemptId) ||
            attempt.previousLocalAttemptId === attempt.attemptId)),
    )
  )
    return false
  const ordered = attempts
    .slice()
    .sort((a, b) => a.automaticRetryCount - b.automaticRetryCount)
  if (
    ordered.some(
      (attempt, index) =>
        attempt.automaticRetryCount !== index ||
        (index > 0 &&
          (attempt.previousAttemptId !== ordered[index - 1].attemptId ||
            attempt.previousConnectionId !== ordered[index - 1].connectionId)),
    )
  )
    return false
  // Promoting an older real media receipt legitimately reorders the archive and
  // selects an earlier counter. Without a winner, the current attempt is latest.
  if (
    !job.result &&
    ((job.attemptId &&
      job.automaticRetryCount !== job.autoRecovery.replacementCount) ||
      archivedAttempts(job).some(
        (attempt, index) => attempt.automaticRetryCount !== index,
      ))
  )
    return false
  const local = new Map()
  for (const attempt of ordered) {
    if (
      (local.get(attempt.connectionId) ?? undefined) !==
      attempt.previousLocalAttemptId
    )
      return false
    local.set(attempt.connectionId, attempt.attemptId)
  }
  const repeatedOwner =
    new Set(attempts.map((attempt) => attempt.connectionId)).size !==
    attempts.length
  const extended =
    job.autoRecovery.replacementCount > (job.autoRecovery.maxReplacements ?? 2)
  return (
    (!extended && !repeatedOwner) ||
    (job.persistentRecoveryVersion === 1 &&
      archivedAttempts(job).every((attempt) =>
        persistentAttemptReusable(attempt),
      ))
  )
}
