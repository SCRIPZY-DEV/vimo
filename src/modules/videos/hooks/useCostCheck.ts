import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import { queryClient } from '@/modules/common/queryClient'
import { compareCostLines } from '@/modules/common/utilities/compareCostLines'
import { commonApi } from '@/modules/common/api'
import { commonQueryKeys } from '@/modules/common/constants'
import { videosApi } from '@/modules/videos/api'
import { useImageCredits } from '@/modules/common/hooks/useImageCredits'
import { useVideoCredits } from '@/modules/common/hooks/useVideoCredits'
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
  const needsVideo = estimates.some((line) => line.domain === 'animation')

  const image = useImageCredits({ enabled: needsImage })
  const voice = useVoiceCredits({
    vendor: voiceVendor ?? 'dubvoice',
    enabled: needsVoice,
  })
  const video = useVideoCredits({ enabled: needsVideo })

  const result = compareCostLines(
    estimates,
    { image: image.credits, voice: voice.credits, video: video.credits },
    providerLabel,
  )

  const refresh = () => {
    if (needsImage) image.refresh()
    if (needsVoice) voice.refresh()
    if (needsVideo) video.refresh()
  }

  const verify = async (): Promise<CostCheckResult> => {
    if (!videosApi.isNative() || estimates.length === 0) return result

    const [freshImage, freshVoice, freshVideo] = await Promise.all([
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
      needsVideo
        ? queryClient
            .fetchQuery({
              queryKey: commonQueryKeys.videoCredits,
              queryFn: () => commonApi.getVideoCredits(),
              staleTime: 0,
            })
            .catch(() => null)
        : null,
    ])
    return compareCostLines(
      estimates,
      { image: freshImage, voice: freshVoice, video: freshVideo },
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
      voice.isRefreshing ||
      video.isLoading ||
      video.isRefreshing,
    verify,
  }
}
