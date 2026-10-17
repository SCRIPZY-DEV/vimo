import { flowAccountRecoveryGuide } from '@/modules/common/utilities/flowAccountRecoveryGuide'
import type { FlowConnection, FlowStatus } from '@/modules/common/types/flow'

// Estado visual: una conexión de socket o disponibilidad antigua no acredita
// identidad/proyecto actuales. No decide admisión ni recalcula capacidad.
export function flowConnectionReadiness(
  connection: FlowConnection,
  status?: Pick<FlowStatus, 'manualPaused' | 'paused'> | null,
) {
  if (!connection.connected || connection.revoked) {
    return {
      availabilityKey: 'extension.availability_disconnected',
      helpKey: 'extension.helpDisconnected',
    }
  }

  const recovery = flowAccountRecoveryGuide(connection.profileAvailability)
  if (recovery?.identityReview) {
    return { availabilityKey: recovery.titleKey, helpKey: recovery.helpKey }
  }

  if (connection.identityConflict) {
    return {
      availabilityKey: 'extension.identityConflict',
      helpKey: 'extension.helpConflict',
    }
  }

  if (connection.identity?.verified !== true) {
    return {
      availabilityKey: 'extension.availability_identityPending',
      helpKey: 'extension.helpIdentity',
    }
  }

  const availability = connection.profileAvailability
  const reason = availability?.reason
  if (
    connection.binding?.ready !== true ||
    reason === 'PROJECT_REQUIRED' ||
    reason === 'PROJECT_STALE' ||
    reason === 'PROJECT_CHANGED'
  ) {
    return {
      availabilityKey: 'extension.availability_projectPending',
      helpKey: 'extension.helpProject',
    }
  }

  if (recovery) {
    return {
      availabilityKey: recovery.titleKey,
      helpKey: recovery.helpKey,
    }
  }

  // Una pausa voluntaria no convierte una revisión real en algo que se
  // resuelve con Reanudar. Las causas ajenas se conservan aunque haya pausa global.
  if (
    (availability?.state === 'manual' && reason !== 'MANUAL_PAUSE') ||
    (reason && reason !== 'MANUAL_PAUSE')
  ) {
    return {
      availabilityKey: 'extension.availability_manual',
      helpKey: 'extension.helpReview',
    }
  }

  if (status?.manualPaused || reason === 'MANUAL_PAUSE') {
    return {
      availabilityKey: 'extension.availability_manualPause',
      helpKey: status?.manualPaused
        ? 'extension.helpManualPause'
        : 'extension.helpManual',
    }
  }

  if (connection.paused || status?.paused) {
    return {
      availabilityKey: 'extension.availability_paused',
      helpKey: 'extension.helpProviderHold',
    }
  }

  if (
    availability?.state !== 'ready' ||
    (connection.accountPolicy?.remaining == null &&
      connection.accountPolicy?.unlimited !== true)
  ) {
    return {
      availabilityKey: 'extension.availability_unconfirmed',
      helpKey: 'extension.helpReview',
    }
  }

  if (
    connection.accountPolicy?.remaining !== null &&
    connection.accountPolicy?.remaining !== undefined &&
    connection.accountPolicy.remaining <= 0
  ) {
    return {
      availabilityKey: 'extension.availability_capacity',
      helpKey: 'extension.helpCapacity',
    }
  }

  return {
    availabilityKey: 'extension.availability_ready',
    helpKey: 'extension.helpReady',
  }
}
