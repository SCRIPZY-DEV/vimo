import { useQuery } from '@tanstack/react-query'
import { commonApi } from '@/modules/common/api'
import { commonQueryKeys } from '@/modules/common/constants'

// Catálogo de modelos del carril verbatim. Es data estática del sidecar:
// una lectura por sesión alcanza.
export function usePromptModels() {
  const native = commonApi.isNative()

  const { data, isLoading } = useQuery({
    queryKey: commonQueryKeys.promptModels,
    queryFn: () => commonApi.listPromptModels(),
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
