import { FLOW_TOOLS_EXECUTION_PLAN } from '@/modules/common/constants'
import { FLOW_PREPARATION_UNCONFIRMED_REASONS } from '@/modules/extension/constants'
import type { FlowCapacity, FlowStatus } from '@/modules/common/types/flow'
import type {
  FlowPreparationState,
  FlowSetupCapacityProfile,
  FlowSetupConnection,
} from '@/modules/extension/types/flowSetup'

// Preparación visible, nunca autorización de envío. El servidor aporta frescura
// mediante status_stale; no inventamos un reloj ni otra consulta de proveedor.
export function flowSetupPreparation(
  connection: FlowSetupConnection,
  status: FlowStatus | null,
  capacity: FlowCapacity | null,
  confirmed: boolean,
): FlowPreparationState {
  if (!confirmed || !status || !capacity) return 'unconfirmed'

  const profiles: FlowSetupCapacityProfile[] = capacity.profiles ?? []
  const matches = profiles.filter(
    (profile) => profile.connectionId === connection.connectionId,
  )
  const connections: FlowSetupConnection[] = status.connections.filter(
    (candidate) => !candidate.revoked,
  )
  const profile = matches[0]
  const accountKey = connection.identity?.accountKey
  const installationId = connection.installationId
  const projectId = connection.binding?.projectId
  if (
    matches.length !== 1 ||
    typeof connection.connectionId !== 'string' ||
    !connection.connectionId ||
    typeof installationId !== 'string' ||
    !installationId ||
    typeof accountKey !== 'string' ||
    !accountKey ||
    typeof projectId !== 'string' ||
    !projectId ||
    profile.installationId !== installationId ||
    profile.projectId !== projectId ||
    profile.identity?.verified !== true ||
    profile.identity.accountKey !== accountKey ||
    connections.filter(
      (candidate) =>
        candidate.connectionId === connection.connectionId ||
        candidate.installationId === installationId ||
        candidate.identity?.accountKey === accountKey,
    ).length !== 1 ||
    !connection.connected ||
    connection.revoked ||
    connection.identityConflict ||
    connection.identity?.verified !== true ||
    connection.binding?.ready !== true ||
    !Array.isArray(profile.reasons) ||
    profile.reasons.some((reason) =>
      FLOW_PREPARATION_UNCONFIRMED_REASONS.includes(reason),
    )
  )
    return 'unconfirmed'

  const capabilities = [connection.flowTools, profile.flowTools]
  if (
    capabilities.some(
      (capability) =>
        !capability ||
        capability.version !== 1 ||
        capability.toolId !== FLOW_TOOLS_EXECUTION_PLAN.toolId ||
        capability.seedSupported !== false ||
        typeof capability.ready !== 'boolean',
    ) ||
    connection.flowTools?.ready !== profile.flowTools?.ready
  )
    return 'unconfirmed'

  if (
    profile.reasons.includes('execution_plan_incompatible') ||
    profile.reasons.includes('extension_update_required')
  )
    return connection.flowTools?.ready ? 'unconfirmed' : 'pending'

  return connection.flowTools?.ready ? 'prepared' : 'pending'
}
