import type { FlowStatus } from '@/modules/common/types/flow'
import type {
  FlowPauseCommandState,
  FlowPauseConfirmation,
  FlowPauseResult,
} from '@/modules/common/types/flowPause'

// Un ACK del coordinador no confirma al worker. Comparamos el estado deseado
// con una observación posterior del mismo perfil; nunca inferimos ready.
export function flowPauseConfirmation(
  request: FlowPauseResult,
  status: FlowStatus | null | undefined,
): FlowPauseConfirmation {
  if (!status)
    return {
      confirmed: false,
      pendingCount: Math.max(1, request.targets.length),
    }

  const pendingCount = request.targets.filter((target) => {
    const connection = status.connections.find(
      (item) => item.connectionId === target.connectionId,
    )
    return (
      !connection ||
      connection.revoked ||
      !connection.connected ||
      (connection.sessionObservedAt ?? 0) <= target.observedAt ||
      connection.paused !== request.paused
    )
  }).length
  if (status.manualPaused !== request.paused)
    return { confirmed: false, pendingCount: Math.max(1, pendingCount) }

  return { confirmed: pendingCount === 0, pendingCount }
}

// La confirmación es un resultado de esta petición, no una medida permanente
// de conexión. Desvincular o perder un perfil después no deshace ese resultado.
export function confirmFlowPauseCommand(
  command: FlowPauseCommandState,
  status: FlowStatus | null | undefined,
): FlowPauseCommandState {
  if (command.confirmed || command.pending || command.error) return command
  if (!flowPauseConfirmation(command, status).confirmed) return command
  return { ...command, confirmed: true }
}
