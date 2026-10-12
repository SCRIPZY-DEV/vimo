import { flowAutoRecoveryPending } from '@pipeline/types/flow-auto-recovery.ts'
import { flowSetupPreparation } from '@/modules/extension/utilities/flowSetupPreparation'
import { FLOW_TOOLS_EXECUTION_PLAN } from '@/modules/common/constants'
import { flowCapacityReady } from '@/modules/common/utilities/flowCapacityReady'
import {
  flowExecutionPlansEqual,
  supportsFlowToolsCoordinator,
} from '@/modules/common/utilities/flowExecutionPlan'
import { flowMinimumProfiles } from '@/modules/common/utilities/flowMinimumProfiles'
import type {
  FlowCapacityProfile,
  FlowConnection,
  FlowStatus,
} from '@/modules/common/types/flow'
import type {
  FlowSetupInput,
  FlowSetupState,
} from '@/modules/extension/types/flowSetup'

// Presentación: la admisión y las reservas siguen perteneciendo al coordinador.
export function flowSetupState({
  native,
  loading,
  failed,
  status,
  capacity,
}: FlowSetupInput): FlowSetupState {
  const minimum = flowMinimumProfiles(
    status?.minimumProfiles,
    capacity?.minimumProfiles,
  )
  const confirmed =
    native &&
    !failed &&
    !loading &&
    !!status &&
    !!capacity &&
    supportsFlowToolsCoordinator(status.capabilities?.flowTools) &&
    flowExecutionPlansEqual(capacity.executionPlan, FLOW_TOOLS_EXECUTION_PLAN)
  const linked = status?.linkedCount ?? null
  const preparation = confirmed
    ? status.connections
        .filter((connection) => !connection.revoked)
        .map((connection) =>
          flowSetupPreparation(connection, status, capacity, confirmed),
        )
    : []
  const prepared =
    confirmed &&
    preparation.length === linked &&
    !preparation.includes('unconfirmed')
      ? preparation.filter((state) => state === 'prepared').length
      : null
  const available = confirmed ? capacity.readyProfiles : null
  const limited = confirmed
    ? (capacity.profiles ?? []).filter(
        (profile) =>
          profile.available > 0 &&
          profile.profileAvailability?.state === 'checking',
      ).length
    : 0
  const result = { linked, prepared, available, minimum, limited, confirmed }
  if (!native)
    return { ...result, action: 'refresh', messageKey: 'extension.desktopOnly' }
  if (loading)
    return { ...result, action: 'refresh', messageKey: 'extension.checking' }
  if (!confirmed)
    return {
      ...result,
      action: 'refresh',
      messageKey: 'extension.setupUnconfirmed',
    }
  if (linked === null || linked < minimum)
    return { ...result, action: 'link', messageKey: 'extension.setupNeedLinks' }
  if (status.paused || status.manualPaused)
    return { ...result, action: 'guide', messageKey: 'extension.setupPaused' }
  if (prepared === null)
    return {
      ...result,
      action: 'refresh',
      messageKey: 'extension.setupUnconfirmed',
    }
  if (prepared < minimum)
    return {
      ...result,
      action: 'guide',
      messageKey: 'extension.setupNeedPreparation',
    }
  if (!flowCapacityReady(status, capacity, FLOW_TOOLS_EXECUTION_PLAN))
    return {
      ...result,
      action: 'review',
      messageKey: 'extension.setupPreparedWaiting',
    }
  return { ...result, action: 'create', messageKey: 'extension.setupReady' }
}

export function flowSetupAccountKey(
  connection: FlowConnection,
  profile: FlowCapacityProfile | undefined,
  confirmed: boolean,
): string {
  if (!confirmed) return 'extension.setupAccountUnconfirmed'
  if (!connection.connected || connection.revoked)
    return 'extension.availability_disconnected'
  if (connection.identityConflict) return 'extension.identityConflict'
  if (!connection.identity?.verified)
    return 'extension.availability_identityPending'
  if (!connection.binding?.ready) return 'extension.availability_projectPending'
  // Una preparación pendiente no debe tapar un bloqueo o revisión de Flow.
  if (connection.profileAvailability?.state === 'cooldown')
    return 'extension.availability_cooldown'
  if (
    connection.profileAvailability?.state === 'manual' &&
    connection.profileAvailability.reason !== 'MANUAL_PAUSE'
  )
    return 'extension.availability_manual'
  if (connection.paused) return 'extension.availability_paused'
  if (!profile) return 'extension.setupAccountUnconfirmed'
  if (profile.reasons?.includes('execution_plan_incompatible'))
    return 'extension.setupToolsPending'
  if (profile.reasons?.includes('extension_update_required'))
    return 'extension.setupExtensionUpdate'
  if (
    profile.reasons?.includes('status_stale') ||
    profile.reasons?.includes('reconciling')
  )
    return 'extension.setupAccountUnconfirmed'
  if (profile.available > 0) {
    if (connection.profileAvailability?.state === 'checking')
      return 'extension.setupAccountChecking'
    return 'extension.setupAccountReady'
  }
  if (
    profile.reasons?.includes('in_flight_full') ||
    profile.reasons?.includes('recovery_permit_unavailable') ||
    profile.reasons?.includes('budget_reserved') ||
    profile.reasons?.includes('history_full')
  )
    return 'extension.setupReserved'
  return 'extension.setupAccountReview'
}

export function flowSetupAccountHelpKey(stateKey: string): string {
  switch (stateKey) {
    case 'extension.availability_disconnected':
      return 'extension.setupNextOpen'
    case 'extension.identityConflict':
    case 'extension.availability_identityPending':
      return 'extension.setupNextIdentity'
    case 'extension.availability_projectPending':
      return 'extension.setupNextProject'
    case 'extension.availability_cooldown':
      return 'extension.setupNextWait'
    case 'extension.setupToolsPending':
      return 'extension.setupNextTools'
    case 'extension.setupExtensionUpdate':
      return 'extension.setupNextUpdate'
    case 'extension.setupReserved':
      return 'extension.setupNextHistory'
    case 'extension.setupAccountReady':
      return 'extension.setupNextReady'
    case 'extension.setupAccountChecking':
      return 'extension.setupNextChecking'
    case 'extension.setupAccountUnconfirmed':
      return 'extension.setupNextRefresh'
    default:
      return 'extension.setupNextReview'
  }
}

// Un resultado incierto conserva su lugar; no es actividad nueva por sí solo.
export function flowSetupQueueState(status: FlowStatus | null) {
  const unknown =
    status?.jobs.filter(
      (job) => job.state === 'unknown' && !flowAutoRecoveryPending(job),
    ).length ?? 0
  const hasCurrentWork =
    (status?.batches.some((batch) => batch.remainingCount > 0) ?? false) ||
    (status?.jobs.some((job) => {
      if (flowAutoRecoveryPending(job)) return true
      if (job.generationRetry?.status === 'pending') return true
      switch (job.state) {
        case 'unknown':
        case 'ready':
        case 'failed':
        case 'canceled':
        case 'download_failed':
        case 'deleted':
          return false
        default:
          return true
      }
    }) ??
      false)
  return { unknown, hasCurrentWork }
}
