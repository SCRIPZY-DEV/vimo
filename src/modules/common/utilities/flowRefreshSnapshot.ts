import type {
  FlowCapacitySnapshot,
  FlowDiscoveryResult,
  FlowStatus,
} from '@/modules/common/types/flow'

// Compara lo que puede cambiar la disponibilidad de la conexión. Los trabajos,
// prompts y vencimientos de anuncios no convierten cada poll en un cambio.
export function flowRefreshSnapshot(
  status: FlowStatus | undefined,
  discovery: FlowDiscoveryResult | undefined,
  capacities: FlowCapacitySnapshot[],
): string {
  return JSON.stringify({
    status: status
      ? {
          capabilities: status.capabilities?.flowTools ?? null,
          paused: status.paused,
          manualPaused: status.manualPaused,
          minimumProfiles: status.minimumProfiles,
          readyProfiles: status.readyProfiles,
          linkedCount: status.linkedCount,
          maxConnections: status.maxConnections,
          connections: status.connections
            .map((connection) => ({
              connectionId: connection.connectionId,
              flowTools: connection.flowTools ?? null,
              alias: connection.alias,
              connected: connection.connected,
              revoked: connection.revoked,
              paused: connection.paused,
              binding: connection.binding,
              identity: connection.identity,
              lastVerifiedIdentity: connection.lastVerifiedIdentity ?? null,
              identityConflict: connection.identityConflict,
              profileAvailability: connection.profileAvailability,
              accountPolicy: connection.accountPolicy,
              scheduling: connection.scheduling,
            }))
            .sort((left, right) =>
              left.connectionId.localeCompare(right.connectionId),
            ),
        }
      : null,
    discovery: discovery
      ? {
          maxConnections: discovery.maxConnections,
          linkedCount: discovery.linkedCount,
          profiles: discovery.profiles
            .map((profile) => ({
              discoveryId: profile.discoveryId,
              alias: profile.alias,
              identity: profile.identity,
              hasFlowTab: profile.hasFlowTab,
              linked: profile.linked,
              trusted: profile.trusted,
              duplicateAccount: profile.duplicateAccount,
              canLink: profile.canLink,
            }))
            .sort((left, right) =>
              left.discoveryId.localeCompare(right.discoveryId),
            ),
        }
      : null,
    capacities: [...capacities].sort(
      (left, right) => left.requestedCount - right.requestedCount,
    ),
  })
}
