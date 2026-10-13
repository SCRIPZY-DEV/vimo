import { flowAccountRecoveryGuide } from '@/modules/common/utilities/flowAccountRecoveryGuide'
import { flowCheckingState } from '@/modules/common/utilities/flowCheckingState'
import type { FlowCapacityProfile } from '@/modules/common/types/flow'

function reasonKey(reason: string, profile: FlowCapacityProfile) {
  switch (reason) {
    case 'execution_plan_incompatible':
      return 'extension.capacityReasonExecutionPlan'
    case 'offline':
      return 'extension.capacityReasonOffline'
    case 'reconciling':
      return 'extension.capacityReasonReconciling'
    case 'identity_unverified':
      return 'extension.capacityReasonIdentity'
    case 'project_required':
      return 'extension.capacityReasonProject'
    case 'status_stale':
      return 'extension.capacityReasonStale'
    case 'account_already_linked':
    case 'duplicate_profile':
      return 'extension.capacityReasonDuplicate'
    case 'profile_cooldown':
    case 'profile_unavailable':
    case 'paused': {
      const recovery = flowAccountRecoveryGuide(profile.profileAvailability)
      if (recovery) return recovery.titleKey
      if (reason === 'profile_cooldown')
        return 'extension.capacityReasonCooldown'
      if (reason === 'paused') return 'extension.capacityReasonPaused'

      if (
        flowCheckingState(profile.profileAvailability) === 'unconfirmed' ||
        flowCheckingState(profile.profileAvailability) === 'limited'
      )
        return 'extension.capacityReasonUnconfirmed'
      if (flowCheckingState(profile.profileAvailability) === 'running')
        return 'extension.capacityReasonChecking'
      if (profile.profileAvailability?.state === 'cooldown')
        return 'extension.capacityReasonCooldown'
      if (profile.profileAvailability?.reason === 'MANUAL_PAUSE')
        return 'extension.capacityReasonPaused'
      return 'extension.capacityReasonReview'
    }
    case 'capacity_unavailable':
      return 'extension.capacityReasonUnconfirmed'
    case 'extension_update_required':
      return 'extension.capacityReasonUpdate'
    case 'connection_limit_exceeded':
      return 'extension.capacityReasonLimit'
    case 'revoked':
      return 'extension.capacityReasonRevoked'
    case 'history_full':
      if (profile.historySlots === 0) return 'extension.capacityReasonHistory'
      return 'extension.capacityReasonReserved'
    case 'budget_reserved':
      if (profile.quotaRemaining === 0) return 'extension.capacityReasonQuota'
      if (flowCheckingState(profile.profileAvailability) === 'running')
        return 'extension.capacityReasonChecking'
      return 'extension.capacityReasonReserved'
    default:
      return 'extension.capacityReasonUnconfirmed'
  }
}

export function flowCapacityReasonKeys(profile: FlowCapacityProfile) {
  const keys = (profile.reasons ?? []).map((reason) =>
    reasonKey(reason, profile),
  )
  if (keys.length) return [...new Set(keys)]
  if (profile.available === 0) return ['extension.capacityReasonUnconfirmed']
  return []
}
