import { flowMinimumProfiles } from '@/modules/common/utilities/flowMinimumProfiles'
import { flowErrorKey } from '@/modules/common/utilities/flowErrorKey'
import { useQuery } from '@tanstack/react-query'
import { commonApi } from '@/modules/common/api'
import {
  commonQueryKeys,
  FLOW_STATUS_INTERVAL_MS,
} from '@/modules/common/constants'

export function useFlowStatus(enabled = true) {
  const native = commonApi.isNative()
  const query = useQuery({
    queryKey: commonQueryKeys.flowStatus,
    queryFn: () => commonApi.flowStatus(),
    enabled: native && enabled,
    refetchInterval: enabled ? FLOW_STATUS_INTERVAL_MS : false,
    retry: false,
    staleTime: FLOW_STATUS_INTERVAL_MS,
  })
  const status = query.data ?? null
  const minimumProfiles = flowMinimumProfiles(status?.minimumProfiles)
  const ready =
    enabled &&
    query.isSuccess &&
    !status?.paused &&
    !status?.manualPaused &&
    !!status &&
    (status.configuredProfiles === undefined
      ? status.readyProfiles >= minimumProfiles
      : Number.isSafeInteger(status.configuredProfiles) &&
        status.configuredProfiles >= minimumProfiles &&
        status.readyProfiles > 0)
  const hasPausedProfiles =
    status?.connections.some(
      (connection) =>
        !connection.revoked && connection.connected && connection.paused,
    ) ?? false
  return {
    minimumProfiles,
    hasPausedProfiles,
    status,
    ready,
    native,
    isLoading: native && query.isLoading,
    isError: query.isError,
    errorKey: query.isError ? flowErrorKey(query.error) : null,
    isRefreshing: native && query.isFetching,
    refresh: () => query.refetch({ throwOnError: true }),
  }
}
