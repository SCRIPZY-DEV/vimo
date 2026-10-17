import { createHash } from 'node:crypto'

export const MAX_LINKED_PROFILES = 10
export const MIN_LINKED_PROFILES = 5
export const MAX_PROFILE_IN_FLIGHT = 3

export function safeScheduling(input) {
  if (
    input?.protocolVersion !== 2 ||
    ![1, 3].includes(input.maxInFlight) ||
    !Number.isSafeInteger(input.activeCount) ||
    input.activeCount < 0 ||
    input.activeCount > 3 ||
    !['normal', 'serial'].includes(input.mode) ||
    (input.mode === 'serial' && input.maxInFlight !== 1)
  )
    return null
  return {
    protocolVersion: 2,
    maxInFlight: input.maxInFlight,
    activeCount: input.activeCount,
    mode: input.mode,
    ...(input.recoveryPermitVersion === 1 ? { recoveryPermitVersion: 1 } : {}),
  }
}

export const DISCOVERY_TTL_MS = 90_000

function displayEmail(value) {
  if (
    typeof value !== 'string' ||
    value.length > 320 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    return null
  const normalized = value.trim().toLowerCase()
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(normalized) ? normalized : null
}

export function safeIdentity(input) {
  if (
    input?.verified !== true ||
    typeof input.accountKey !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.accountKey) ||
    typeof input.maskedEmail !== 'string' ||
    input.maskedEmail.length > 160 ||
    !input.maskedEmail.includes('*') ||
    /[\u0000-\u001f<>]/.test(input.maskedEmail)
  ) {
    return { verified: false, accountKey: null, maskedEmail: null }
  }
  const normalized = displayEmail(input.email)
  const email =
    normalized &&
    createHash('sha256')
      .update(`vimo-flow-account:v1\0${normalized}`)
      .digest('hex') === input.accountKey
      ? normalized
      : null
  // Optional display metadata: legacy peers retain their hash/masked label.
  return {
    verified: true,
    accountKey: input.accountKey,
    maskedEmail: input.maskedEmail,
    ...(email ? { email } : {}),
  }
}

export function safeAvailability(input) {
  const valid =
    ['ready', 'cooldown', 'checking', 'manual'].includes(input?.state) &&
    Number.isSafeInteger(input.checkAttempts) &&
    input.checkAttempts >= 0 &&
    input.checkAttempts <= 3 &&
    (input.nextCheckAt === null ||
      (Number.isSafeInteger(input.nextCheckAt) &&
        input.nextCheckAt >= 0 &&
        input.nextCheckAt <= 8640000000000000)) &&
    (input.checkingJobId === null ||
      (typeof input.checkingJobId === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(input.checkingJobId))) &&
    (input.state !== 'ready' ||
      (input.checkAttempts === 0 &&
        input.nextCheckAt === null &&
        input.checkingJobId === null)) &&
    (input.state !== 'cooldown' ||
      (input.nextCheckAt !== null && input.checkingJobId === null)) &&
    (input.state !== 'checking' || input.nextCheckAt === null) &&
    (input.state !== 'manual' || input.checkingJobId === null)
  if (!valid)
    return {
      state: 'manual',
      reason: 'STATUS_UNVERIFIED',
      nextCheckAt: null,
      checkAttempts: 0,
      checkingJobId: null,
    }
  return {
    state: input.state,
    reason:
      typeof input.reason === 'string' && /^[A-Z0-9_]{1,80}$/.test(input.reason)
        ? input.reason
        : null,
    nextCheckAt: input.nextCheckAt,
    checkAttempts: input.checkAttempts,
    checkingJobId: input.checkingJobId,
  }
}

export function linkedCount(connections) {
  return Object.values(connections).filter((connection) => !connection.revoked)
    .length
}

export function canLink(connections, installationId) {
  const existing = Object.values(connections).find(
    (connection) =>
      connection.installationId === installationId && !connection.revoked,
  )
  return Boolean(existing) || linkedCount(connections) < MAX_LINKED_PROFILES
}

export function identityConflict(connections, connection) {
  return (
    connection.identity?.verified === true &&
    Object.values(connections).some(
      (other) =>
        !other.revoked &&
        other.connectionId !== connection.connectionId &&
        ((other.identity?.verified &&
          other.identity.accountKey === connection.identity.accountKey) ||
          other.linkedAccountKey === connection.identity.accountKey),
    )
  )
}

export function profileEligible(
  connections,
  connection,
  { admission = false } = {},
) {
  if (
    linkedCount(connections) > MAX_LINKED_PROFILES ||
    connection.identity?.verified !== true ||
    identityConflict(connections, connection)
  )
    return false
  const availability = connection.profileAvailability
  if (availability?.state === 'ready') return true
  return (
    !admission &&
    availability?.state === 'checking' &&
    availability.checkingJobId === null
  )
}

export function profileScopedRejection(job) {
  // Only an explicit rejected operation can be scoped to this profile. Lost or
  // ambiguous submissions and generic rate limits keep the coordinator hold.
  const error = job.error
  const operationCertain =
    error?.operationSubmission === undefined ||
    error.operationSubmission === 'rejected'
  return (
    job.state !== 'unknown' &&
    error?.code === 'ACTIVITY_BLOCKED' &&
    operationCertain &&
    (error.submission === 'rejected' ||
      (error.phase === 'upload' &&
        error.submission === 'not-sent' &&
        error.operationSubmission === 'rejected'))
  )
}
