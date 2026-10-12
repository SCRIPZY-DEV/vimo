import {
  MIN_LINKED_PROFILES,
  MAX_LINKED_PROFILES,
  linkedCount,
  identityConflict,
} from './profiles.js'
import {
  normalizeExecutionPlan,
  executionCompatible,
  safeFlowToolsCapability,
} from '../extension/execution-plan.js'
import {
  normalizeAutoRecoveryVersion,
  recoveryCapacityJobs,
  uncertainAutomaticAttempt,
} from './automatic-recovery.js'
import {
  currentRecoveryPermit,
  freeRecoveryPermit,
  recoveryInFlightCount,
} from '../extension/recovery-permit.js'
// Local admission policy; identity matching does not verify Google quota or a single web session.
export const PROFILE_LIMIT = 500
// Compatibilidad explícita: cada worker conserva su presupuesto y consumo.
const SUPPORTED_PROFILE_LIMITS = new Set([400, PROFILE_LIMIT])
export const CAPACITY_FRESH_MS = 90_000
export const MAX_BATCH_IMAGES = 10_000
const PENDING = new Set([
  'queued',
  'dispatching',
  'received',
  'uploading',
  'generating',
  'unknown',
])

export function safeCapacity(input) {
  if (
    !input ||
    !Number.isSafeInteger(input.localReserved) ||
    input.localReserved < 0 ||
    !Number.isSafeInteger(input.historySlots) ||
    input.historySlots < 0 ||
    input.historySlots > 500
  )
    return null
  return {
    localReserved: input.localReserved,
    historySlots: input.historySlots,
  }
}

export function validPolicy(policy) {
  return (
    SUPPORTED_PROFILE_LIMITS.has(policy?.limit) &&
    policy.windowMs === 86_400_000 &&
    Number.isSafeInteger(policy.used) &&
    policy.used >= 0 &&
    Number.isSafeInteger(policy.remaining) &&
    policy.remaining === Math.max(0, policy.limit - policy.used)
  )
}

export function capacityReport({
  connections,
  jobs,
  batches,
  connectedIds,
  requestedCount,
  connectionIds,
  executionPlan,
  autoRecoveryVersion,
  now = Date.now(),
}) {
  if (
    !Number.isSafeInteger(requestedCount) ||
    requestedCount < 1 ||
    requestedCount > MAX_BATCH_IMAGES
  )
    throw new Error('batch_count_invalid')
  const plan = normalizeExecutionPlan(executionPlan)
  const recoveryVersion = normalizeAutoRecoveryVersion(autoRecoveryVersion)
  const capacityJobs = recoveryCapacityJobs(jobs)
  const selected = connectionIds ? new Set(connectionIds) : null
  const pending = new Map()
  let unassigned = 0
  for (const job of Object.values(capacityJobs)) {
    if (!PENDING.has(job.state) && !uncertainAutomaticAttempt(job)) continue
    const id = job.preferredConnectionId ?? job.connectionId
    if (id) pending.set(id, (pending.get(id) ?? 0) + 1)
    else unassigned++
  }
  const reserved = new Map()
  for (const batch of Object.values(batches)) {
    if (batch.status !== 'prepared') continue
    for (const allocation of batch.allocations)
      reserved.set(
        allocation.connectionId,
        (reserved.get(allocation.connectionId) ?? 0) +
          allocation.count -
          allocation.submitted,
      )
  }
  const seen = new Set()
  const profiles = Object.values(connections)
    .filter((connection) => !selected || selected.has(connection.connectionId))
    .map((connection) => {
      const reasons = []
      if (!executionCompatible(plan, connection))
        reasons.push('execution_plan_incompatible')
      if (recoveryVersion && connection.autoRecoveryVersion !== recoveryVersion)
        reasons.push('auto_recovery_upgrade_required')
      const policy = connection.accountPolicy
      if (connection.revoked) reasons.push('revoked')
      if (linkedCount(connections) > MAX_LINKED_PROFILES)
        reasons.push('connection_limit_exceeded')
      if (connection.identity?.verified !== true)
        reasons.push('identity_unverified')
      if (identityConflict(connections, connection))
        reasons.push('account_already_linked')
      const availability = connection.profileAvailability
      const checking =
        availability?.state === 'checking' &&
        availability.checkingJobId === null
      if (availability?.state !== 'ready' && !checking)
        reasons.push('profile_unavailable')
      if (connection.profileIncident) reasons.push('profile_cooldown')
      if (!connectedIds.has(connection.connectionId)) reasons.push('offline')
      if (!connection.reconciled) reasons.push('reconciling')
      if (!connection.binding?.ready) reasons.push('project_required')
      if (connection.paused || connection.providerNotBefore > now)
        reasons.push('paused')
      if (
        !connection.sessionObservedAt ||
        now - connection.sessionObservedAt > CAPACITY_FRESH_MS ||
        connection.sessionObservedAt > now
      )
        reasons.push('status_stale')
      if (!connection.capacity || !validPolicy(policy))
        reasons.push('capacity_unavailable')
      if (connection.scheduling?.protocolVersion !== 2)
        reasons.push('extension_update_required')
      if (seen.has(connection.installationId)) reasons.push('duplicate_profile')
      seen.add(connection.installationId)
      const bridgeReserved =
        (pending.get(connection.connectionId) ?? 0) +
        (reserved.get(connection.connectionId) ?? 0)
      const quotaRemaining = Math.max(
        0,
        Math.min(PROFILE_LIMIT, policy?.limit ?? 0, policy?.remaining ?? 0),
      )
      const localReserved = connection.capacity?.localReserved ?? 0
      const historySlots = connection.capacity?.historySlots ?? 0
      let available = reasons.length
        ? 0
        : Math.max(
            0,
            Math.min(
              quotaRemaining - localReserved - bridgeReserved,
              historySlots - bridgeReserved,
            ),
          )
      const permit = checking ? freeRecoveryPermit(connection) : null
      if (checking && connection.announcedRecoveryPermitId) {
        // Quota/history above still reserve every unknown. The explicit permit is
        // only one new intention; it never erases physical concurrency reservations.
        const remote = recoveryInFlightCount(connection, capacityJobs)
        const physical = connection.scheduling?.maxInFlight
        if (!currentRecoveryPermit(connection) || !permit)
          reasons.push('recovery_permit_unavailable')
        else if (!Number.isInteger(physical) || remote >= physical)
          reasons.push('in_flight_full')
        available = reasons.length
          ? 0
          : Math.min(available, Math.max(0, 1 - localReserved))
      } else if (checking)
        available = Math.min(
          available,
          Math.max(0, 1 - localReserved - bridgeReserved),
        )
      // Pre-upgrade jobs without an owner also consume capacity, conservatively.
      const legacyReserved = Math.min(unassigned, available)
      unassigned -= legacyReserved
      available -= legacyReserved
      if (!available && !reasons.length)
        reasons.push(
          historySlots <= bridgeReserved ? 'history_full' : 'budget_reserved',
        )
      return {
        connectionId: connection.connectionId,
        installationId: connection.installationId,
        alias: connection.alias,
        projectId: connection.binding?.projectId ?? null,
        flowTools: safeFlowToolsCapability(connection.flowTools),
        quotaRemaining,
        localReserved,
        bridgeReserved,
        historySlots,
        legacyReserved,
        available,
        reasons,
        ...(permit ? { recoveryPermitId: permit.id } : {}),
        identity: connection.identity ?? { verified: false },
        profileAvailability: availability ?? null,
      }
    })
  const available = profiles.reduce(
    (sum, profile) => sum + profile.available,
    0,
  )
  const deficit = Math.max(0, requestedCount - available)
  const readyProfiles = profiles.filter(
    (profile) => profile.available > 0,
  ).length
  const missingProfiles = Math.max(0, MIN_LINKED_PROFILES - readyProfiles)
  const requiredAdditionalProfiles = Math.max(
    missingProfiles,
    Math.ceil(deficit / PROFILE_LIMIT),
  )
  return {
    requestedCount,
    ...(plan ? { executionPlan: plan } : {}),
    available,
    deficit,
    requiredAdditionalProfiles,
    readyProfiles,
    minimumProfiles: MIN_LINKED_PROFILES,
    missingProfiles,
    minimumProfilesAtFullCapacity: Math.max(
      MIN_LINKED_PROFILES,
      Math.ceil(requestedCount / PROFILE_LIMIT),
    ),
    canPrepare: deficit === 0 && missingProfiles === 0,
    capacityBasis: 'local-profile-policy',
    googleAccountsVerified:
      profiles.some((profile) => profile.available > 0) &&
      profiles
        .filter((profile) => profile.available > 0)
        .every((profile) => profile.identity.verified),
    identityBasis: 'primary-chrome-matches-active-flow',
    singleGoogleSessionVerified: false,
    profiles,
    message: missingProfiles
      ? `Para iniciar un lote, conecta al menos ${MIN_LINKED_PROFILES} perfiles con cuentas Google distintas, extensión actualizada y proyecto listo. Hay ${readyProfiles} disponibles; faltan ${missingProfiles}. Capacidad disponible: ${available} imágenes; faltan ${deficit} imágenes de presupuesto.`
      : deficit
        ? `Este lote necesita ${requestedCount} imágenes y hay capacidad local para ${available}. Conecta al menos ${requiredAdditionalProfiles} perfil(es) con cuentas Google distintas, presupuesto disponible y un proyecto vinculado, o espera a recuperar capacidad. Faltan ${deficit} imágenes.`
        : `Hay capacidad local para reservar las ${requestedCount} imágenes del lote.`,
  }
}

export function allocateCapacity(report) {
  if (!report.canPrepare) throw new Error('batch_capacity_required')
  const allocations = report.profiles
    .filter((profile) => profile.available > 0)
    .map((profile) => ({
      connectionId: profile.connectionId,
      count: 0,
      submitted: 0,
      available: profile.available,
      ...(profile.recoveryPermitId
        ? { recoveryPermitId: profile.recoveryPermitId }
        : {}),
    }))
  let remaining = report.requestedCount
  // Round robin reservations distribute even small batches across distinct
  // accounts instead of filling one full account before the next.
  while (remaining > 0) {
    let progressed = false
    for (const item of allocations) {
      if (!remaining) break
      if (item.count >= item.available) continue
      item.count++
      remaining--
      progressed = true
    }
    if (!progressed) throw new Error('batch_capacity_required')
  }
  return allocations
    .filter((item) => item.count > 0)
    .map(({ available, ...item }) => item)
}
