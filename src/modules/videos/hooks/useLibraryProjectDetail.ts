import { useFlowImportRefresh } from '@/modules/videos/hooks/useFlowImportRefresh'
import { useQuery } from '@tanstack/react-query'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'

// Detalle completo de un proyecto (metadata + escenas editables + media con
// mtimes). El disco es la verdad: tras cada job se invalida esta query.
export function useLibraryProjectDetail(projectId: string) {
  const native = videosApi.isNative()
  useFlowImportRefresh()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: videosQueryKeys.projectDetail(projectId),
    queryFn: () => videosApi.projectDetail(projectId),
    enabled: native && projectId.length > 0,
    retry: false,
  })

  return {
    isNative: native,
    detail: data ?? null,
    isLoading: native && isLoading,
    errorKey: isError ? videosApi.errorMessageKey(error) : null,
    refresh: () => {
      void refetch()
    },
  }
}
