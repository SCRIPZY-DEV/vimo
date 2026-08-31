import {
  EVOLINK_QUALITY_OPTIONS,
  FAL_QUALITY_OPTIONS,
} from '@/modules/videos/constants'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

export function qualityOptionsFor(
  provider: ImageProviderId,
): { id: string; labelKey: string; noteKey: string; priceUsd: number }[] {
  if (provider === 'evolink') return EVOLINK_QUALITY_OPTIONS
  return FAL_QUALITY_OPTIONS
}

// Precio USD por imagen de la opción elegida; undefined si la opción ya no
// existe en el catálogo del proveedor.
export function priceForQuality(
  provider: ImageProviderId,
  quality: string,
): number | undefined {
  const option = qualityOptionsFor(provider).find(
    (candidate) => candidate.id === quality,
  )
  return option?.priceUsd
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
