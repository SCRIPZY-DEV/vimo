import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import { queryClient } from '@/modules/common/queryClient'
import { compareCostLines } from '@/modules/common/utilities/compareCostLines'
import { commonApi } from '@/modules/common/api'
import { commonQueryKeys } from '@/modules/common/constants'
import { videosApi } from '@/modules/videos/api'
import { useImageCredits } from '@/modules/common/hooks/useImageCredits'
import { voicesApi } from '@/modules/voices/api'
import { voicesQueryKeys } from '@/modules/voices/constants'
import { useVoiceCredits } from '@/modules/voices/hooks/useVoiceCredits'
import type {
  CostCheckResult,
  CostEstimateLine,
} from '@/modules/common/types/credits'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'

interface UseCostCheckOptions {
  estimates: CostEstimateLine[]
  voiceVendor: VoiceVendorId | null
}

// Cruza una estimación de gasto con los saldos (ADR-0031): `result` usa la
// caché (aviso en vivo); `verify` re-lee justo antes de arrancar, porque un
// saldo de hace un minuto pudo gastarse en otro lado. Solo consulta las
// cuentas que la estimación toca: cada consulta levanta un proceso.
export function useCostCheck({ estimates, voiceVendor }: UseCostCheckOptions) {
  const needsImage = estimates.some(
    (line) => line.domain === 'image' || line.domain === 'music',
  )
  const needsVoice =
    voiceVendor !== null && estimates.some((line) => line.domain === 'voice')

  const image = useImageCredits({ enabled: needsImage })
  const voice = useVoiceCredits({
    vendor: voiceVendor ?? 'dubvoice',
    enabled: needsVoice,
  })

  const result = compareCostLines(
    estimates,
    { image: image.credits, voice: voice.credits },
    providerLabel,
  )

  const refresh = () => {
    if (needsImage) image.refresh()
    if (needsVoice) voice.refresh()
  }

  const verify = async (): Promise<CostCheckResult> => {
    if (!videosApi.isNative() || estimates.length === 0) return result

    const [freshImage, freshVoice] = await Promise.all([
      needsImage
        ? queryClient
            .fetchQuery({
              queryKey: commonQueryKeys.imageCredits,
              queryFn: () => commonApi.getImageCredits(),
              staleTime: 0,
            })
            .catch(() => null)
        : null,
      needsVoice && voiceVendor
        ? queryClient
            .fetchQuery({
              queryKey: voicesQueryKeys.credits(voiceVendor),
              queryFn: () => voicesApi.getCredits(voiceVendor),
              staleTime: 0,
            })
            .catch(() => null)
        : null,
    ])
    return compareCostLines(
      estimates,
      { image: freshImage, voice: freshVoice },
      providerLabel,
    )
  }

  return {
    result,
    refresh,
    refreshing:
      image.isLoading ||
      image.isRefreshing ||
      voice.isLoading ||
      voice.isRefreshing,
    verify,
  }
}
