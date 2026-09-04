import { useQuery } from '@tanstack/react-query'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'

// Catálogo de modelos del carril verbatim. Es data estática del sidecar:
// una lectura por sesión alcanza.
export function usePromptModels() {
  const native = videosApi.isNative()

  const { data, isLoading } = useQuery({
    queryKey: videosQueryKeys.promptModels,
    queryFn: () => videosApi.listPromptModels(),
    enabled: native,
    staleTime: Infinity,
  })

  return {
    models: data?.models ?? [],
    defaultId: data?.defaultId ?? null,
    batchSize: data?.batchSize,
    isLoading: native && isLoading,
  }
}
