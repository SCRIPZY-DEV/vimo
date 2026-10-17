import { flowConnectionReadiness } from '@/modules/common/utilities/flowConnectionReadiness'
import type { FlowStatus } from '@/modules/common/types/flow'

// Sólo decide presentación. Los estados desconocidos se conservan como trabajo
// posible; nunca se cancela, borra ni reordena la cola para ocultar un control.
export function flowGenerationState(status: FlowStatus | null) {
  const connections =
    status?.connections.filter(
      (connection) => connection.connected && !connection.revoked,
    ) ?? []
  const manualPaused =
    !!status?.manualPaused ||
    connections.some(
      (connection) =>
        connection.paused &&
        connection.profileAvailability?.reason === 'MANUAL_PAUSE',
    )
  const hasProviderHold =
    (!!status?.paused && !status.manualPaused) ||
    connections.some((connection) => {
      const availability = connection.profileAvailability
      if (availability?.state === 'cooldown') return true

      if (
        availability?.state === 'manual' &&
        availability.reason !== 'MANUAL_PAUSE'
      )
        return true

      return (
        connection.paused &&
        !status?.manualPaused &&
        availability?.reason !== 'MANUAL_PAUSE'
      )
    })
  const checkingStates = connections.map(
    (connection) => flowConnectionReadiness(connection, status).availabilityKey,
  )
  const hasLimitedProfiles =
    checkingStates.includes('extension.availability_checkingLimited') ||
    (status?.configuredProfiles !== undefined &&
      status.readyProfiles < status.configuredProfiles)
  const hasRunningChecks = checkingStates.includes(
    'extension.availability_checking',
  )
  const hasUnconfirmedChecks = checkingStates.includes(
    'extension.availability_checkingUnconfirmed',
  )
  const hasPendingWork =
    (status?.batches.some((batch) => batch.remainingCount > 0) ?? false) ||
    (status?.jobs.some((job) => {
      if (job.generationRetry?.status === 'pending') return true

      switch (job.state) {
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

  return {
    manualPaused,
    hasProviderHold,
    hasPendingWork,
    hasLimitedProfiles,
    hasRunningChecks,
    hasUnconfirmedChecks,
  }
}
