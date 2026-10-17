import { useQuery } from '@tanstack/react-query'
import { extensionApi } from '@/modules/extension/api'
import {
  extensionQueryKeys,
  FLOW_PREVIEW_CACHE_MS,
} from '@/modules/extension/constants'

export function useFlowPreview(imageJobId: string, enabled: boolean) {
  return useQuery({
    queryKey: extensionQueryKeys.preview(imageJobId),
    queryFn: () => extensionApi.preview(imageJobId),
    enabled,
    staleTime: Infinity,
    gcTime: FLOW_PREVIEW_CACHE_MS,
    retry: false,
  })
}
