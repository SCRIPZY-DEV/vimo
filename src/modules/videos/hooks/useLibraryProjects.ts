import { useFlowImportRefresh } from '@/modules/videos/hooks/useFlowImportRefresh'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'

// Proyectos de la biblioteca. Sin polling: el disco solo cambia por jobs de
// esta app, que invalidan la query al cerrar.
export function useLibraryProjects() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const native = videosApi.isNative()
  useFlowImportRefresh()

  const {
    data: projects,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: videosQueryKeys.projects,
    queryFn: () => videosApi.listProjects(),
    enabled: native,
    retry: false,
  })

  const deleteMutation = useMutation({
    mutationFn: (projectIds: string[]) => videosApi.deleteProjects(projectIds),
    onSuccess: (deleted: number) => {
      toast({ description: t('library.list.deleted', { total: deleted }) })
      void queryClient.invalidateQueries({ queryKey: videosQueryKeys.projects })
    },
    onError: (error) => {
      toast({
        description: t(videosApi.errorMessageKey(error)),
        variant: 'destructive',
      })
    },
  })

  return {
    isNative: native,
    projects: projects ?? [],
    isLoading: native && isLoading,
    isFetching,
    errorKey: isError ? videosApi.errorMessageKey(error) : null,
    refresh: () => {
      void refetch()
    },
    deleteProjects: deleteMutation.mutate,
    deleting: deleteMutation.isPending,
  }
}
