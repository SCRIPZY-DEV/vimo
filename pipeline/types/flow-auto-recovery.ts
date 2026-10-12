export interface FlowAutoRecoveryCapability {
  version: 1
  maxReplacements: 2
}

export interface FlowAutoRecovery {
  version: 1
  status:
    | 'pending'
    | 'reconciling'
    | 'backoff'
    | 'exhausted'
    | 'completed'
    | 'canceled'
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
  return (
    job.autoRecoveryVersion === 1 &&
    recovery?.version === 1 &&
    !['ready', 'canceled', 'deleted'].includes(job.state) &&
    ['pending', 'reconciling', 'backoff'].includes(recovery.status) &&
    Number.isInteger(recovery.replacementCount) &&
    recovery.replacementCount >= 0 &&
    recovery.replacementCount <= 2 &&
    Number.isInteger(recovery.attemptCount) &&
    recovery.attemptCount >= 0 &&
    recovery.attemptCount <= 3 &&
    (recovery.nextAttemptAt === null ||
      (Number.isFinite(recovery.nextAttemptAt) && recovery.nextAttemptAt >= 0))
  )
}
