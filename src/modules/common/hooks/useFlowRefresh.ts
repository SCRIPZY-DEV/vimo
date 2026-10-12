import { useQuery, useQueryClient } from '@tanstack/react-query'
import { commonApi } from '@/modules/common/api'
import { commonQueryKeys } from '@/modules/common/constants'
import { flowRefreshSnapshot } from '@/modules/common/utilities/flowRefreshSnapshot'
import { flowErrorKey } from '@/modules/common/utilities/flowErrorKey'
import { flowCapacityRequestFromKey } from '@/modules/common/utilities/flowCapacityRequest'
import { supportsFlowToolsCoordinator } from '@/modules/common/utilities/flowExecutionPlan'
import type {
  FlowCapacity,
  FlowDiscoveryResult,
  FlowRefreshResult,
  FlowStatus,
} from '@/modules/common/types/flow'

export function useFlowRefresh() {
  const client = useQueryClient()
  const native = commonApi.isNative()
  const query = useQuery({
    queryKey: commonQueryKeys.flowRefresh,
    enabled: false,
    gcTime: Infinity,
    retry: false,
    // Son lecturas locales de Tauri: no deben quedar en cola por estar offline.
    networkMode: 'always',
    queryFn: async (): Promise<FlowRefreshResult> => {
      if (!native) throw new Error('flow_unavailable')
      const activeRequests = client
        .getQueryCache()
        .findAll({ queryKey: commonQueryKeys.flowCapacityRoot, type: 'active' })
        .map((query) => flowCapacityRequestFromKey(query.queryKey))
        .filter((request) => request !== null)
      const requests =
        activeRequests.length > 0 ? activeRequests : [{ requestedCount: 1 }]
      const before = flowRefreshSnapshot(
        client.getQueryData<FlowStatus>(commonQueryKeys.flowStatus),
        client.getQueryData<FlowDiscoveryResult>(commonQueryKeys.flowDiscovery),
        requests.map((request) => ({
          ...request,
          capacity: client.getQueryData<FlowCapacity>(
            commonQueryKeys.flowCapacity(
              request.requestedCount,
              request.executionPlan,
            ),
          ),
        })),
      )
      // fetchQuery rechaza de verdad: refetch() por defecto devuelve un resultado
      // con error sin lanzar. Esperamos todos antes de afirmar éxito o fallo.
      const statusPromise = client.fetchQuery({
        queryKey: commonQueryKeys.flowStatus,
        queryFn: () => commonApi.flowStatus(),
        staleTime: 0,
        retry: false,
        networkMode: 'always',
      })
      const [status, discovery, capacities] = await Promise.allSettled([
        statusPromise,
        client.fetchQuery({
          queryKey: commonQueryKeys.flowDiscovery,
          queryFn: () => commonApi.discoverFlow(),
          staleTime: 0,
          retry: false,
          networkMode: 'always',
        }),
        Promise.allSettled(
          requests.map(async (request) => {
            if (request.executionPlan !== undefined) {
              const status = await statusPromise
              if (!supportsFlowToolsCoordinator(status.capabilities?.flowTools))
                throw new Error('flow_tools_coordinator_upgrade_required')
            }
            return {
              ...request,
              capacity: await client.fetchQuery({
                queryKey: commonQueryKeys.flowCapacity(
                  request.requestedCount,
                  request.executionPlan,
                ),
                queryFn: () =>
                  commonApi.flowCapacity(
                    request.requestedCount,
                    request.executionPlan,
                  ),
                staleTime: 0,
                retry: false,
                networkMode: 'always',
              }),
            }
          }),
        ),
      ])
      if (status.status === 'rejected') throw status.reason
      if (discovery.status === 'rejected') throw discovery.reason
      if (capacities.status === 'rejected') throw capacities.reason
      const capacitySnapshots = capacities.value.map((capacity) => {
        if (capacity.status === 'rejected') throw capacity.reason
        return capacity.value
      })
      const after = flowRefreshSnapshot(
        status.value,
        discovery.value,
        capacitySnapshots,
      )
      return { changed: before !== after, checkedAt: Date.now() }
    },
  })
  const refresh = () => {
    if (!native) return

    // La misma consulta deduplica incluso antes del próximo render y conserva
    // el resultado para todos los botones, también si se desmonta el iniciador.
    // refetch registra el error en QueryCache; no deja rechazos sin observar.
    void query.refetch({ cancelRefetch: false })
  }
  return {
    native,
    refresh,
    refreshing: query.isFetching,
    // Un fallo posterior nunca presenta el éxito cacheado como resultado actual.
    result: query.isError ? null : (query.data ?? null),
    errorKey: query.isError ? flowErrorKey(query.error) : null,
  }
}
