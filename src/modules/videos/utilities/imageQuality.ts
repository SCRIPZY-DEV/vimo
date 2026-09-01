import {
  DEFAULT_VIDEO_FORMAT,
  EVOLINK_QUALITY_OPTIONS,
  FAL_QUALITY_OPTIONS,
  FAL_QUALITY_OPTIONS_VERTICAL,
} from '@/modules/videos/constants'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

export function qualityOptionsFor(
  provider: ImageProviderId,
  format: VideoFormat = DEFAULT_VIDEO_FORMAT,
): { id: string; labelKey: string; noteKey: string; priceUsd: number }[] {
  // Evolink es agnóstico al formato: una sola lista (el `size` lo pone el
  // pipeline); en Fal el id lleva el tamaño exacto, así que hay lista 9:16.
  if (provider === 'evolink') return EVOLINK_QUALITY_OPTIONS
  if (format === '9:16') return FAL_QUALITY_OPTIONS_VERTICAL
  return FAL_QUALITY_OPTIONS
}

export function defaultQualityFor(
  provider: ImageProviderId,
  format: VideoFormat = DEFAULT_VIDEO_FORMAT,
): string {
  return qualityOptionsFor(provider, format)[0].id
}

// Una calidad guardada que el proveedor ya no ofrece (p. ej. el preset
// "landscape_16_9" del modelo retirado, ADR-0015) o de otro formato cae a la
// default del formato.
export function normalizeQuality(
  provider: ImageProviderId,
  quality: string,
  format: VideoFormat = DEFAULT_VIDEO_FORMAT,
): string {
  const known = qualityOptionsFor(provider, format).some(
    (option) => option.id === quality,
  )
  if (known) return quality
  return defaultQualityFor(provider, format)
}

// Precio USD por imagen de la opción elegida (buscando en ambas familias de
// Fal); undefined si la opción ya no existe en el catálogo del proveedor.
export function priceForQuality(
  provider: ImageProviderId,
  quality: string,
): number | undefined {
  const pools =
    provider === 'evolink'
      ? [EVOLINK_QUALITY_OPTIONS]
      : [FAL_QUALITY_OPTIONS, FAL_QUALITY_OPTIONS_VERTICAL]
  for (const pool of pools) {
    const option = pool.find((candidate) => candidate.id === quality)
    if (option) return option.priceUsd
  }
  return undefined
}
