import {
  EVOLINK_QUALITY_OPTIONS,
  FAL_GPT_IMAGE_QUALITY_OPTIONS,
  FLUX_SIZE_OPTION,
} from '@/modules/videos/constants'
import type {
  FalImageModelId,
  ImageProviderId,
} from '@pipeline/types/image-provider.ts'

export function qualityOptionsFor(
  provider: ImageProviderId,
  falModel: FalImageModelId,
): { id: string; labelKey: string }[] {
  if (provider === 'evolink') return EVOLINK_QUALITY_OPTIONS
  // flux-schnell no tiene niveles de calidad: su opción es el preset de tamaño.
  if (falModel === 'flux-schnell') return []
  return FAL_GPT_IMAGE_QUALITY_OPTIONS
}

export function defaultQualityFor(
  provider: ImageProviderId,
  falModel: FalImageModelId,
): string {
  const options = qualityOptionsFor(provider, falModel)
  return options[0]?.id ?? FLUX_SIZE_OPTION
}
