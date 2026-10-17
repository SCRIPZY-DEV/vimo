import { flowMinimumProfiles } from '@/modules/common/utilities/flowMinimumProfiles'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { commonApi } from '@/modules/common/api'
import {
  commonQueryKeys,
  FLOW_STATUS_INTERVAL_MS,
} from '@/modules/common/constants'
import { useFlowStatus } from '@/modules/common/hooks/useFlowStatus'
import { flowErrorKey } from '@/modules/common/utilities/flowErrorKey'
import { flowCapacityReady } from '@/modules/common/utilities/flowCapacityReady'
import { supportsFlowToolsCoordinator } from '@/modules/common/utilities/flowExecutionPlan'
import type { FlowCapacityOptions } from '@/modules/common/types/flow'

export function useFlowCapacity(
  requestedCount: number,
  enabled: boolean,
  { executionPlan }: FlowCapacityOptions = {},
) {
  const flow = useFlowStatus(enabled)
  const client = useQueryClient()
  const count = Math.max(1, Math.ceil(requestedCount))
  const executionSupported =
    executionPlan === undefined ||
    supportsFlowToolsCoordinator(flow.status?.capabilities?.flowTools)
  const capacityEnabled =
    flow.native &&
    enabled &&
    executionSupported &&
    (executionPlan === undefined || !flow.isError)
  const query = useQuery({
    queryKey: commonQueryKeys.flowCapacity(count, executionPlan),
    queryFn: () => commonApi.flowCapacity(count, executionPlan),
    enabled: capacityEnabled,
    retry: false,
    staleTime: FLOW_STATUS_INTERVAL_MS,
    refetchInterval: capacityEnabled ? FLOW_STATUS_INTERVAL_MS : false,
  })
  const verify = async (requestedImages = count) => {
    if (!enabled) return true
    const verificationCount = Math.max(1, Math.ceil(requestedImages))
    if (!Number.isSafeInteger(verificationCount)) return false
    try {
      const statusPromise = client.fetchQuery({
        queryKey: commonQueryKeys.flowStatus,
        queryFn: () => commonApi.flowStatus(),
        staleTime: 0,
        retry: false,
      })
      const capacity = async () => {
        if (executionPlan !== undefined) {
          const status = await statusPromise
          if (!supportsFlowToolsCoordinator(status.capabilities?.flowTools))
            throw new Error('flow_tools_coordinator_upgrade_required')
        }
        return client.fetchQuery({
          queryKey: commonQueryKeys.flowCapacity(
            verificationCount,
            executionPlan,
          ),
          queryFn: () =>
            commonApi.flowCapacity(verificationCount, executionPlan),
          staleTime: 0,
          retry: false,
        })
      }
      const [status, result] = await Promise.all([statusPromise, capacity()])
      return flowCapacityReady(status, result, executionPlan)
    } catch {
      return false
    }
  }
  const unsupported =
    enabled && flow.native && !!flow.status && !executionSupported
  const isError = flow.isError || query.isError || unsupported
  const getErrorKey = () => {
    if (flow.isError) return flow.errorKey
    if (unsupported)
      return flowErrorKey('flow_tools_coordinator_upgrade_required')
    if (query.isError) return flowErrorKey(query.error)
    return null
  }
  const minimumProfiles = flowMinimumProfiles(
    flow.minimumProfiles,
    query.data?.minimumProfiles,
  )
  return {
    ready:
      enabled &&
      flow.native &&
      !flow.isError &&
      query.isSuccess &&
      flowCapacityReady(flow.status, query.data, executionPlan),
    // Un fallo invalida la autorización, no desmonta la última información.
    capacity: query.data ?? null,
    minimumProfiles,
    isRefreshing: flow.isRefreshing || query.isFetching,
    status: flow.status,
    native: flow.native,
    isLoading:
      enabled &&
      flow.native &&
      !isError &&
      (!flow.status || flow.isLoading || query.isPending),
    isError,
    errorKey: getErrorKey(),
    verify,
  }
}
