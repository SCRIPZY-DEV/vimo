import { flowErrorKey } from '@/modules/common/utilities/flowErrorKey'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { commonApi } from '@/modules/common/api'
import {
  commonQueryKeys,
  FLOW_STATUS_INTERVAL_MS,
} from '@/modules/common/constants'
import { useFlowStatus } from '@/modules/common/hooks/useFlowStatus'
import { useFlowPause } from '@/modules/common/hooks/useFlowPause'

export function useFlowAccounts() {
  const flow = useFlowStatus()
  const client = useQueryClient()
  const discovery = useQuery({
    queryKey: commonQueryKeys.flowDiscovery,
    queryFn: () => commonApi.discoverFlow(),
    enabled: flow.native,
    retry: false,
    refetchInterval: FLOW_STATUS_INTERVAL_MS,
  })
  const refreshAfterAccountChange = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: commonQueryKeys.flowStatus }),
      client.invalidateQueries({ queryKey: commonQueryKeys.flowDiscovery }),
      client.invalidateQueries({ queryKey: commonQueryKeys.flowCapacityRoot }),
    ])
  }
  const link = useMutation({
    mutationFn: commonApi.linkFlow,
    onSettled: refreshAfterAccountChange,
  })
  const revoke = useMutation({
    mutationFn: commonApi.revokeFlow,
    onSettled: refreshAfterAccountChange,
  })
  const pause = useFlowPause()
  return {
    ...flow,
    profiles: discovery.data?.profiles ?? [],
    link,
    revoke,
    pause,
    discoveryError: discovery.isError,
    discoveryLoading: flow.native && discovery.isPending,
    errorKey:
      link.error || revoke.error || pause.error || discovery.error
        ? flowErrorKey(
            link.error ?? revoke.error ?? pause.error ?? discovery.error,
          )
        : (flow.errorKey ?? 'extension.actionFailed'),
  }
}
