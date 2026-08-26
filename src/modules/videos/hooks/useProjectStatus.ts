import { useQuery } from '@tanstack/react-query'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'

// Estado persistido de un proyecto (metadata + escenas resumidas). Es la
// rehidratación de la pantalla de progreso cuando no hay tarea viva: el
// disco cuenta la verdad de un job que murió con la app.
export function useProjectStatus(projectId: string, enabled: boolean) {
  const native = videosApi.isNative()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: videosQueryKeys.projectStatus(projectId),
    queryFn: () => videosApi.projectStatus(projectId),
    enabled: native && enabled && projectId.length > 0,
    retry: false,
  })

  return {
    status: data ?? null,
    isLoading: native && enabled && isLoading,
    errorKey: isError ? videosApi.errorMessageKey(error) : null,
    refresh: () => {
      void refetch()
    },
  }
}
