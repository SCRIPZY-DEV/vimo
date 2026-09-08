import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { queryClient } from '@/modules/common/queryClient'
import { useToast } from '@/modules/common/hooks/useToast'
import { settingsApi } from '@/modules/settings/api'
import { settingsQueryKeys } from '../constants'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'

/**
 * Proveedor de voces elegido (ADR-0024): DubVoice o ElevenLabs directo.
 * null = todavía no eligió; el vendor EFECTIVO (que además mira qué claves
 * hay) lo resuelve el módulo voices con resolveVoiceVendor. Solo Ajustes la
 * escribe: Voces y Crear la leen como proveedor por defecto.
 */
export function useVoiceVendorPreference() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const native = settingsApi.isNative()

  const { data: preference, isLoading } = useQuery({
    queryKey: settingsQueryKeys.voiceVendor,
    queryFn: () => settingsApi.getVoiceVendor(),
    enabled: native,
    staleTime: Infinity,
  })

  const saveMutation = useMutation({
    mutationFn: (next: VoiceVendorId | null) =>
      settingsApi.setVoiceVendor(next),
    onSuccess: (saved) => {
      queryClient.setQueryData(settingsQueryKeys.voiceVendor, saved)
      toast({ description: t('settings.voiceVendorSaved') })
    },
    onError: () => {
      toast({
        description: t('settings.voiceVendorError'),
        variant: 'destructive',
      })
    },
  })

  return {
    isNative: native,
    preference: preference ?? null,
    isLoading: native && isLoading,
    saveVoiceVendor: (next: VoiceVendorId | null) => saveMutation.mutate(next),
    saving: saveMutation.isPending,
  }
}
