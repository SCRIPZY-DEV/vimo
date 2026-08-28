import {
  EVOLINK_QUALITY_OPTIONS,
  FAL_QUALITY_OPTIONS,
} from '@/modules/videos/constants'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

export function qualityOptionsFor(
  provider: ImageProviderId,
): { id: string; labelKey: string }[] {
  if (provider === 'evolink') return EVOLINK_QUALITY_OPTIONS
  return FAL_QUALITY_OPTIONS
}

export function defaultQualityFor(provider: ImageProviderId): string {
  return qualityOptionsFor(provider)[0].id
}

// Una calidad guardada que el proveedor ya no ofrece (p. ej. el preset
// "landscape_16_9" del modelo retirado, ADR-0015) cae a la default.
export function normalizeQuality(
  provider: ImageProviderId,
  quality: string,
): string {
  const known = qualityOptionsFor(provider).some(
    (option) => option.id === quality,
  )
  if (known) return quality
  return defaultQualityFor(provider)
}
