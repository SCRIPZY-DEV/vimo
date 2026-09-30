import type { CostEstimateLine } from '@/modules/common/types/credits'
import {
  VIDEO_CREDITS_PER_SECOND,
  type VideoProviderId,
} from '@pipeline/types/video-provider.ts'

// Estimación por segundos solicitados. La producción usa Kie; PoYo permanece
// en el tipo para leer proyectos históricos. Un cargo confirmado solo existe
// si el proveedor lo devuelve en su recibo.
export function animationCostEstimate(
  provider: VideoProviderId,
  requestedSeconds: number,
): CostEstimateLine {
  return {
    domain: 'animation',
    providerId: provider,
    unit: 'credits',
    estimated: VIDEO_CREDITS_PER_SECOND[provider] * requestedSeconds,
  }
}
