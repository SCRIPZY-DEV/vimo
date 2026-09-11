import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import {
  balanceFor,
  sufficiencyOf,
} from '@/modules/common/utilities/creditsBalance'
import { vendorOfProvider } from '@/modules/voices/utilities/vendorOfProvider'
import type { CreditsShortfallLine } from '@/modules/common/types/credits'
import type {
  VoiceCreditsResult,
  VoiceProviderId,
} from '@pipeline/types/voices.ts'

// La fila del aviso de saldo del probador: lo que cuesta el texto contra el
// saldo del vendor de esa voz (ADR-0029).
export function voiceShortfallLine(
  provider: VoiceProviderId,
  estimated: number,
  credits: VoiceCreditsResult | null,
): CreditsShortfallLine {
  const vendor = vendorOfProvider(provider)
  const balance = balanceFor('voice', vendor, { image: null, voice: credits })
  return {
    providerId: vendor,
    providerLabel: providerLabel(vendor),
    unit: balance.unit,
    estimated,
    available: balance.available,
    sufficient: sufficiencyOf(estimated, balance.available),
  }
}
