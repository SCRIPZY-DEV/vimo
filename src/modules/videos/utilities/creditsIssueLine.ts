import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import {
  balanceFor,
  sufficiencyOf,
  type CreditsBalances,
} from '@/modules/common/utilities/creditsBalance'
import type { CreditsShortfallLine } from '@/modules/common/types/credits'
import type { CreditsIssueContext } from '@/modules/videos/types/credits'

// Proveedores fijos por dominio: LLM y transcripción no exponen saldo, la
// música de fondo siempre es Evolink y el avatar presentador, HeyGen.
const FIXED_PROVIDERS = {
  llm: 'deepinfra',
  transcription: 'deepgram',
  music: 'evolink',
  avatar: 'heygen',
} as const

// A qué cuenta le falta saldo, según el dominio del rechazo y el proveedor
// elegido en el proyecto.
export function creditsIssueProviderId(context: CreditsIssueContext): string {
  if (context.domain === 'image') return context.imageProvider ?? 'fal'
  if (context.domain === 'voice') return context.voiceVendor ?? 'dubvoice'
  if (context.domain === 'animation') return context.videoProvider ?? 'kie'
  return FIXED_PROVIDERS[context.domain]
}

// La fila del aviso para un rechazo por saldo. Sin estimación (la trae quien
// sabe qué falta por generar): solo el saldo actual.
export function creditsIssueLine(
  context: CreditsIssueContext,
  balances: CreditsBalances,
  estimated: number | null = null,
): CreditsShortfallLine {
  const providerId = creditsIssueProviderId(context)
  const { unit, available } = balanceFor(context.domain, providerId, balances)
  return {
    providerId,
    providerLabel: providerLabel(providerId),
    unit,
    estimated,
    available,
    sufficient: sufficiencyOf(estimated, available),
  }
}
