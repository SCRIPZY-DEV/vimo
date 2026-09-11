import { useQuery } from '@tanstack/react-query'
import { voicesApi } from '@/modules/voices/api'
import { voicesQueryKeys } from '../constants'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'

interface UseVoiceCreditsOptions {
  vendor: VoiceVendorId
  // Con false no se consulta (cada consulta levanta un proceso del sidecar).
  enabled?: boolean
}

// Saldo del vendor activo: créditos DubVoice o cuota de caracteres ElevenLabs.
export function useVoiceCredits({
  vendor,
  enabled = true,
}: UseVoiceCreditsOptions) {
  const native = voicesApi.isNative() && enabled

  const {
    data: credits,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: voicesQueryKeys.credits(vendor),
    queryFn: () => voicesApi.getCredits(vendor),
    enabled: native,
    retry: false,
    staleTime: 60_000,
  })

  return {
    isNative: native,
    credits: credits ?? null,
    isLoading: native && isLoading,
    isRefreshing: native && isFetching && !isLoading,
    refresh: () => {
      void refetch()
    },
  }
}
