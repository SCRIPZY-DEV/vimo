import { flowMinimumProfiles } from '@/modules/common/utilities/flowMinimumProfiles'
import type { FlowCapacityMessageOptions } from '@/modules/common/types/flowCapacity'

export function flowCapacityMessageKey({
  countKnown = true,
  native,
  isLoading,
  isError,
  ready,
  status,
  capacity,
}: FlowCapacityMessageOptions) {
  if (!native) return 'extension.helpDesktop'
  if (isError) return 'extension.capacityQueryFailed'
  if (isLoading || !status || !capacity) return 'extension.helpChecking'
  if (status.manualPaused) return 'extension.capacityManualPause'
  if (status.paused || capacity.blockedReason === 'provider_hold')
    return 'extension.capacityProviderHold'
  if (capacity.blockedReason) return 'extension.capacityReviewRequired'
  const connections = status.connections.filter(
    (connection) => !connection.revoked,
  )
  if (
    connections.length &&
    connections.every((connection) =>
      ['TOOLS_MODELS_EXHAUSTED', 'TOOLS_MODELS_UNAVAILABLE'].includes(
        connection.profileAvailability?.reason ?? '',
      ),
    )
  )
    return 'extension.accountsExhausted'
  const linked = capacity.linkedCount ?? status.linkedCount
  const minimum = flowMinimumProfiles(
    capacity.minimumProfiles,
    status.minimumProfiles,
  )
  if (countKnown && ready) return 'extension.capacityPrepared'
  if (linked < minimum) return 'extension.capacityMissingLinks'
  const configured = capacity.configuredProfiles ?? capacity.readyProfiles
  if (configured < minimum) return 'extension.capacityExistingUnavailable'
  if (!countKnown) {
    if (
      capacity.configuredProfiles === undefined &&
      status.readyProfiles < minimum
    )
      return 'extension.capacitySyncPending'
    return 'extension.capacityCountPending'
  }
  if (capacity.deficit > 0) return 'extension.capacityImageDeficit'
  return 'extension.capacitySyncPending'
}
