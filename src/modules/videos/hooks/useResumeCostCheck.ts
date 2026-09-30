import { useCostCheck } from '@/modules/videos/hooks/useCostCheck'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { estimateResumeCost } from '@/modules/videos/utilities/estimateResumeCost'
import { resumableAnimationIntervals } from '@/modules/videos/utilities/resumableAnimationIntervals'
import { vendorOfProvider } from '@/modules/voices/utilities/vendorOfProvider'
import type { VideoProjectStatusResult } from '@pipeline/types/video-project.ts'

interface UseResumeCostCheckOptions {
  status: VideoProjectStatusResult | null
}

// Pre-check de saldo al reanudar (ADR-0031): solo lo que falta por generar
// según el estado en disco.
export function useResumeCostCheck({ status }: UseResumeCostCheckOptions) {
  const voiceProvider = status?.metadata.options.voiceProvider
  const { configuredProviders } = useRequiredApiKeys()
  const resumable = resumableAnimationIntervals(status?.scenes ?? [])
  const check = useCostCheck({
    estimates: estimateResumeCost(status),
    voiceVendor: voiceProvider ? vendorOfProvider(voiceProvider) : null,
  })
  return {
    ...check,
    canResumePaidAnimation:
      resumable.some((interval) => interval.canRecoverLocally) ||
      (configuredProviders.has('kie') && resumable.length > 0),
  }
}
