export interface FlowAutoRecoveryCapability {
  version: 1
  persistentRecoveryVersion?: 1
  maxReplacements: 2 | 4
}

export interface FlowAutoRecovery {
  version: 1
  persistentRecoveryVersion?: 1
  status:
    | 'pending'
    | 'reconciling'
    | 'backoff'
    | 'exhausted'
    | 'completed'
    | 'canceled'
  maxReplacements?: 2 | 4
  replacementCount: number
  attemptCount: number
  nextAttemptAt: number | null
  reason: string | null
}

// El estado terminal de un intento no termina su escena mientras el
// coordinador conserva una recuperación explícitamente autorizada y durable.
export function flowAutoRecoveryPending(job: {
  state: string
  autoRecoveryVersion?: number
  autoRecovery?: FlowAutoRecovery | null
}): boolean {
  const recovery = job.autoRecovery
  const persistent = recovery?.persistentRecoveryVersion === 1
  return (
    job.autoRecoveryVersion === 1 &&
    recovery?.version === 1 &&
    (recovery.persistentRecoveryVersion === undefined || persistent) &&
    (recovery.maxReplacements === undefined ||
      [2, 4].includes(recovery.maxReplacements)) &&
    !['ready', 'canceled', 'deleted'].includes(job.state) &&
    ['pending', 'reconciling', 'backoff'].includes(recovery.status) &&
    Number.isSafeInteger(recovery.replacementCount) &&
    recovery.replacementCount >= 0 &&
    (persistent ||
      recovery.replacementCount <= (recovery.maxReplacements ?? 2)) &&
    Number.isSafeInteger(recovery.attemptCount) &&
    recovery.attemptCount >= 0 &&
    recovery.attemptCount <=
      (persistent
        ? recovery.replacementCount + 1
        : (recovery.maxReplacements ?? 2) + 1) &&
    (recovery.nextAttemptAt === null ||
      (Number.isFinite(recovery.nextAttemptAt) && recovery.nextAttemptAt >= 0))
  )
}
