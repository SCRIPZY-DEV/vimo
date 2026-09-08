import { useQuery } from '@tanstack/react-query'
import { voicesApi } from '@/modules/voices/api'
import { voicesQueryKeys } from '../constants'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'

interface UseVoiceCreditsOptions {
  vendor: VoiceVendorId
}

// Saldo del vendor activo: créditos DubVoice o cuota de caracteres ElevenLabs.
export function useVoiceCredits({ vendor }: UseVoiceCreditsOptions) {
  const native = voicesApi.isNative()

  const { data: credits } = useQuery({
    queryKey: voicesQueryKeys.credits(vendor),
    queryFn: () => voicesApi.getCredits(vendor),
    enabled: native,
    retry: false,
    staleTime: 60_000,
  })

  return { isNative: native, credits: credits ?? null }
}
