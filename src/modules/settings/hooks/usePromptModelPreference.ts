import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { queryClient } from '@/modules/common/queryClient'
import { useToast } from '@/modules/common/hooks/useToast'
import { settingsApi } from '@/modules/settings/api'
import { settingsQueryKeys } from '../constants'
import type { PromptModelDefaults } from '../types/settings'

/**
 * Modelo con el que se escriben los prompts de imagen en los videos de estilo
 * propio (null = el de la casa) y si en Crear el selector se muestra compacto.
 * Siembra el selector de Crear, donde el modelo se puede pisar para ese video
 * sin tocar la preferencia.
 */
export function usePromptModelPreference() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const native = settingsApi.isNative()

  const { data: promptModelDefaults, isLoading } = useQuery({
    queryKey: settingsQueryKeys.promptModel,
    queryFn: () => settingsApi.getPromptModelDefaults(),
    enabled: native,
    staleTime: Infinity,
  })

  const saveMutation = useMutation({
    mutationFn: (next: PromptModelDefaults) =>
      settingsApi.setPromptModelDefaults(next),
    onSuccess: (saved) => {
      queryClient.setQueryData(settingsQueryKeys.promptModel, saved)
      toast({ description: t('settings.promptModelSaved') })
    },
    onError: () => {
      toast({
        description: t('settings.promptModelError'),
        variant: 'destructive',
      })
    },
  })

  return {
    isNative: native,
    promptModelDefaults: promptModelDefaults ?? null,
    isLoading,
    savePromptModelDefaults: (next: PromptModelDefaults) =>
      saveMutation.mutate(next),
    saving: saveMutation.isPending,
  }
}
