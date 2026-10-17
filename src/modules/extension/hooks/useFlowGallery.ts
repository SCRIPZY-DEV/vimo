import { useQuery } from '@tanstack/react-query'
import { extensionApi } from '@/modules/extension/api'
import {
  extensionQueryKeys,
  FLOW_GALLERY_STALE_MS,
} from '@/modules/extension/constants'

export function useFlowGallery(batchIds: string[]) {
  return useQuery({
    queryKey: extensionQueryKeys.gallery([...batchIds].sort()),
    queryFn: () => extensionApi.gallery(),
    enabled: batchIds.length > 0,
    staleTime: FLOW_GALLERY_STALE_MS,
    retry: false,
  })
}
