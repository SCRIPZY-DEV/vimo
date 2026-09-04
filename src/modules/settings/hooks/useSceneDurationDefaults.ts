import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { queryClient } from '@/modules/common/queryClient'
import { useToast } from '@/modules/common/hooks/useToast'
import { settingsApi } from '@/modules/settings/api'
import { settingsQueryKeys } from '../constants'
import type { SceneDurationDefaults } from '../types/settings'

/**
 * Ritmo con el que arrancan los videos de estilo propio: duración de escena y
 * si el pipeline se detiene a preguntarla. Se guardan juntos porque el usuario
 * los ve como una sola sección. En web (no Tauri) la query queda deshabilitada.
 *
 * Dos formas de guardar: `saveSceneDuration` avisa con un toast (la sección de
 * Ajustes), `rememberSecondsPerScene` guarda en silencio el valor elegido en el
 * diálogo de confirmación — ahí el toast sería ruido en medio de la generación.
 */
export function useSceneDurationDefaults() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const native = settingsApi.isNative()

  const { data: sceneDuration, isLoading } = useQuery({
    queryKey: settingsQueryKeys.sceneDuration,
    queryFn: () => settingsApi.getSceneDurationDefaults(),
    enabled: native,
    staleTime: Infinity,
  })

  const cache = (saved: SceneDurationDefaults) => {
    queryClient.setQueryData(settingsQueryKeys.sceneDuration, saved)
  }

  const saveMutation = useMutation({
    mutationFn: (next: SceneDurationDefaults) =>
      settingsApi.setSceneDurationDefaults(next),
    onSuccess: (saved) => {
      cache(saved)
      toast({ description: t('settings.sceneDurationSaved') })
    },
    onError: () => {
      toast({
        description: t('settings.sceneDurationError'),
        variant: 'destructive',
      })
    },
  })

  const rememberMutation = useMutation({
    mutationFn: (secondsPerScene: number) =>
      settingsApi.setSceneDurationDefaults({
        secondsPerScene,
        confirmScenes: sceneDuration?.confirmScenes ?? true,
      }),
    onSuccess: cache,
  })

  return {
    isNative: native,
    sceneDuration,
    isLoading,
    saveSceneDuration: (next: SceneDurationDefaults) =>
      saveMutation.mutate(next),
    rememberSecondsPerScene: (seconds: number) =>
      rememberMutation.mutate(seconds),
    saving: saveMutation.isPending,
  }
}
