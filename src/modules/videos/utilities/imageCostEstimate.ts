import { COST_ESTIMATE_SAFETY_FACTOR } from '@/modules/videos/constants'
import {
  creditsForQuality,
  priceForQuality,
} from '@/modules/videos/utilities/imageQuality'
import type { CostEstimateLine } from '@/modules/common/types/credits'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

// Cuánto cuestan N imágenes de esa calidad en ese proveedor, con el margen
// de seguridad: Fal en dólares, Evolink en sus créditos. null si la opción
// ya no existe en el catálogo (no hay precio con qué estimar).
export function imageCostEstimate(
  provider: ImageProviderId,
  quality: string,
  count: number,
): CostEstimateLine | null {
  if (count <= 0) return null

  if (provider === 'evolink') {
    const credits = creditsForQuality(quality)
    if (credits === undefined) return null
    return {
      domain: 'image',
      providerId: 'evolink',
      unit: 'credits',
      estimated: count * credits * COST_ESTIMATE_SAFETY_FACTOR,
    }
  }

  const priceUsd = priceForQuality(provider, quality)
  if (priceUsd === undefined) return null
  return {
    domain: 'image',
    providerId: provider,
    unit: 'usd',
    estimated: count * priceUsd * COST_ESTIMATE_SAFETY_FACTOR,
  }
}
