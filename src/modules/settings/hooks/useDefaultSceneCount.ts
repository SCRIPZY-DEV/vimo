import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { queryClient } from '@/modules/common/queryClient'
import { useToast } from '@/modules/common/hooks/useToast'
import { settingsApi } from '@/modules/settings/api'
import { settingsQueryKeys } from '../constants'

/**
 * Cantidad de escenas por defecto para videos nuevos: lectura cacheada +
 * guardado. 0 = automática (el pipeline decide, ~1 escena cada 3 segundos).
 * En web (no Tauri) la query queda deshabilitada y la sección se atenúa.
 */
export function useDefaultSceneCount() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const native = settingsApi.isNative()

  const { data: defaultSceneCount, isLoading } = useQuery({
    queryKey: settingsQueryKeys.defaultSceneCount,
    queryFn: () => settingsApi.getDefaultSceneCount(),
    enabled: native,
    staleTime: Infinity,
  })

  const saveMutation = useMutation({
    mutationFn: (count: number) => settingsApi.setDefaultSceneCount(count),
    onSuccess: (count) => {
      queryClient.setQueryData(settingsQueryKeys.defaultSceneCount, count)
      toast({ description: t('settings.escenasGuardada') })
    },
    onError: () => {
      toast({
        description: t('settings.escenasError'),
        variant: 'destructive',
      })
    },
  })

  return {
    isNative: native,
    defaultSceneCount,
    isLoading,
    saveDefaultSceneCount: (count: number) => saveMutation.mutate(count),
    saving: saveMutation.isPending,
  }
}
