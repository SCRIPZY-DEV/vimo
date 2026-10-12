import { isSettledInternalGenerationError } from './generation-errors.js'

// Explicit recovery is an authority distinct from the automatic checking state.
// The caller persists every issued/reserved/consumed transition before ACK/send.
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  )
const project = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
const jobId = (value) =>
  typeof value === 'string' &&
  /^(?!__proto__$|constructor$|prototype$)[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(
    value,
  )
export function safeRecoveryPermit(input) {
  if (
    input?.version !== 1 ||
    !uuid(input.id) ||
    !Number.isSafeInteger(input.sequence) ||
    input.sequence < 1 ||
    !/^[a-f0-9]{64}$/.test(input.accountKey ?? '') ||
    !project(input.projectId) ||
    !uuid(input.bindingId) ||
    !(input.consumedJobId === null || jobId(input.consumedJobId))
  )
    return null
  return {
    version: 1,
    id: input.id,
    sequence: input.sequence,
    accountKey: input.accountKey,
    projectId: input.projectId,
    bindingId: input.bindingId,
    consumedJobId: input.consumedJobId,
  }
}
export function recoveryPermitMatches(permit, binding, identity) {
  return Boolean(
    safeRecoveryPermit(permit) &&
    binding?.ready &&
    identity?.verified &&
    permit.accountKey === identity.accountKey &&
    permit.projectId === binding.projectId &&
    permit.bindingId === binding.bindingId,
  )
}
export function issueRecoveryPermit(sequence, id, binding, identity) {
  const permit = safeRecoveryPermit({
    version: 1,
    id,
    sequence: sequence + 1,
    accountKey: identity?.accountKey,
    projectId: binding?.projectId,
    bindingId: binding?.bindingId,
    consumedJobId: null,
  })
  if (!recoveryPermitMatches(permit, binding, identity))
    throw new Error('recovery_permit_context_invalid')
  return permit
}
export function mergeRecoveryPermit(previous, incoming) {
  const next = safeRecoveryPermit(incoming)
  if (!next) return previous ?? null // Keep the high-water mark, never recreate authority from a heartbeat.
  if (previous && next.sequence <= previous.sequence) {
    if (
      next.sequence !== previous.sequence ||
      next.id !== previous.id ||
      next.accountKey !== previous.accountKey ||
      next.projectId !== previous.projectId ||
      next.bindingId !== previous.bindingId
    )
      return previous
    if (
      next.consumedJobId &&
      previous.consumedJobId &&
      next.consumedJobId !== previous.consumedJobId
    )
      return { ...previous, revoked: true }
    return {
      ...previous,
      consumedJobId: previous.consumedJobId ?? next.consumedJobId,
    }
  }
  return { ...next, reservedBatchId: null, revoked: false }
}
export function currentRecoveryPermit(connection) {
  const permit = connection?.recoveryPermit
  return connection?.scheduling?.recoveryPermitVersion === 1 &&
    connection?.profileAvailability?.state === 'checking' &&
    connection.profileAvailability.checkingJobId === null &&
    connection.announcedRecoveryPermitId === permit?.id &&
    !permit?.revoked &&
    recoveryPermitMatches(permit, connection.binding, connection.identity)
    ? permit
    : null
}
export function freeRecoveryPermit(connection) {
  const permit = currentRecoveryPermit(connection)
  return permit && !permit.reservedBatchId && !permit.consumedJobId
    ? permit
    : null
}
export function reserveRecoveryPermit(connection, permitId, batchId) {
  const permit = currentRecoveryPermit(connection)
  if (
    !jobId(batchId) ||
    !permit ||
    permit.id !== permitId ||
    permit.consumedJobId ||
    (permit.reservedBatchId !== null && permit.reservedBatchId !== batchId)
  )
    throw new Error('recovery_permit_unavailable')
  return { ...permit, reservedBatchId: batchId }
}
export function recoveryDispatchAllowed(connection, job) {
  if (connection?.profileAvailability?.state !== 'checking')
    return !job?.recoveryPermitId
  if (!connection.announcedRecoveryPermitId && !job?.recoveryPermitId)
    return true // Existing automatic/legacy check.
  const permit = currentRecoveryPermit(connection)
  return Boolean(
    permit &&
    job?.recoveryPermitId === permit.id &&
    permit.reservedBatchId === job.batchId &&
    !permit.consumedJobId,
  )
}
export function consumeRecoveryPermit(connection, job) {
  if (!recoveryDispatchAllowed(connection, job))
    throw new Error('recovery_permit_unavailable')
  return job.recoveryPermitId
    ? { ...connection.recoveryPermit, consumedJobId: job.imageJobId }
    : connection.recoveryPermit
}

export function recoveryInFlightCount(connection, jobs) {
  const active = connection?.scheduling?.activeCount
  if (!Number.isSafeInteger(active) || active < 0 || active > 3) return Infinity
  const remote = Object.values(jobs).filter(
    (job) =>
      job.connectionId === connection.connectionId &&
      [
        'dispatching',
        'received',
        'uploading',
        'generating',
        'unknown',
        'completed',
      ].includes(job.state) &&
      !(job.state === 'unknown' && isSettledInternalGenerationError(job.error)),
  ).length
  // Status exposes only an aggregate, so overlap with coordinated jobs cannot
  // be proved. Reserve both sets conservatively. This can temporarily block a
  // slot counted by both; never replace the sum with max() without overlap proof.
  return remote + active
}
