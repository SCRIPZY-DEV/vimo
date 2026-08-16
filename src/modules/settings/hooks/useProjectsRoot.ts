import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { queryClient } from '@/modules/common/queryClient'
import { useToast } from '@/modules/common/hooks/useToast'
import { settingsApi } from '@/modules/settings/api'
import { settingsQueryKeys } from '../constants'

/**
 * Carpeta raíz de proyectos: lectura cacheada + acciones de cambio.
 * En web (no Tauri) la query queda deshabilitada y la vista se atenúa.
 */
export function useProjectsRoot() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const native = settingsApi.isNative()

  const { data: projectsRoot, isLoading } = useQuery({
    queryKey: settingsQueryKeys.projectsRoot,
    queryFn: () => settingsApi.getProjectsRoot(),
    enabled: native,
    staleTime: Infinity,
  })

  const setCached = (path: string) => {
    queryClient.setQueryData(settingsQueryKeys.projectsRoot, path)
  }

  const chooseMutation = useMutation({
    mutationFn: () => settingsApi.chooseProjectsRoot(),
    onSuccess: (path) => {
      if (path === null) {
        return
      }
      setCached(path)
      toast({ description: t('settings.cambiada') })
    },
    onError: () => {
      toast({
        description: t('settings.errorNoEscribible'),
        variant: 'destructive',
      })
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => settingsApi.resetProjectsRoot(),
    onSuccess: (path) => {
      setCached(path)
      toast({ description: t('settings.restablecida') })
    },
    onError: () => {
      toast({
        description: t('settings.errorNoEscribible'),
        variant: 'destructive',
      })
    },
  })

  function openFolder() {
    settingsApi.openProjectsRoot().catch(() => {
      toast({ description: t('settings.errorAbrir'), variant: 'destructive' })
    })
  }

  return {
    isNative: native,
    projectsRoot,
    isLoading,
    changeFolder: () => chooseMutation.mutate(),
    resetFolder: () => resetMutation.mutate(),
    openFolder,
    changing: chooseMutation.isPending || resetMutation.isPending,
  }
}
