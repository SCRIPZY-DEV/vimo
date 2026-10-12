import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import {
  balanceFor,
  sufficiencyOf,
} from '@/modules/common/utilities/creditsBalance'
import type { CreditsShortfallLine } from '@/modules/common/types/credits'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { ImageCreditsResult } from '@pipeline/types/video-project.ts'

// La fila del aviso de saldo del preview: una imagen en calidad base cuesta
// centavos, así que no se estima — solo un saldo leído en cero frena
// (ADR-0029); el precio por imagen vive en el catálogo de videos.
export function previewShortfallLine(
  provider: ImageProviderId,
  credits: ImageCreditsResult | null,
): CreditsShortfallLine {
  if (provider === 'flow')
    return {
      providerId: provider,
      providerLabel: 'Flow',
      unit: 'credits',
      estimated: null,
      available: null,
      sufficient: null,
    }
  const balance = balanceFor('image', provider, { image: credits, voice: null })
  return {
    providerId: provider,
    providerLabel: providerLabel(provider),
    unit: balance.unit,
    estimated: null,
    available: balance.available,
    sufficient: sufficiencyOf(null, balance.available),
  }
}
