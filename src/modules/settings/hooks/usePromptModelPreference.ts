import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { queryClient } from '@/modules/common/queryClient'
import { useToast } from '@/modules/common/hooks/useToast'
import { settingsApi } from '@/modules/settings/api'
import { settingsQueryKeys } from '../constants'

/**
 * Modelo con el que se escriben los prompts de imagen en los videos de estilo
 * propio. null = el de la casa. Siembra el selector de Crear, donde se puede
 * pisar para ese video sin tocar la preferencia.
 */
export function usePromptModelPreference() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const native = settingsApi.isNative()

  const { data: promptModel, isLoading } = useQuery({
    queryKey: settingsQueryKeys.promptModel,
    queryFn: () => settingsApi.getPromptModel(),
    enabled: native,
    staleTime: Infinity,
  })

  const saveMutation = useMutation({
    mutationFn: (modelId: string | null) => settingsApi.setPromptModel(modelId),
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
    promptModel: promptModel ?? null,
    isLoading,
    savePromptModel: (modelId: string | null) => saveMutation.mutate(modelId),
    saving: saveMutation.isPending,
  }
}
