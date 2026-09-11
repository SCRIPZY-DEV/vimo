import type {
  CreditsDomain,
  CreditsShortfallLine,
} from '@/modules/common/types/credits'
import type { ImageCreditsResult } from '@pipeline/types/video-project.ts'
import type { VoiceCreditsResult } from '@pipeline/types/voices.ts'

// Saldos tal como los devuelve el sidecar; null = no consultado o caído.
export interface CreditsBalances {
  image: ImageCreditsResult | null
  voice: VoiceCreditsResult | null
}

// Saldo leído para un dominio/proveedor, en la unidad en que cobra. Un plan
// ilimitado cuenta como infinito (nunca bloquea). LLM y transcripción no
// exponen saldo: siempre ilegible.
export function balanceFor(
  domain: CreditsDomain,
  providerId: string,
  balances: CreditsBalances,
): Pick<CreditsShortfallLine, 'unit' | 'available'> {
  if (domain === 'image' || domain === 'music') {
    const unit = providerId === 'evolink' ? 'credits' : 'usd'
    const status =
      providerId === 'evolink' ? balances.image?.evolink : balances.image?.fal
    if (!status?.available) return { unit, available: null }
    return {
      unit,
      available: status.unlimited
        ? Number.POSITIVE_INFINITY
        : (status.remaining ?? null),
    }
  }
  if (domain === 'voice') {
    const credits = balances.voice
    return {
      unit: credits?.unit === 'characters' ? 'characters' : 'credits',
      available: credits ? credits.credits : null,
    }
  }
  return { unit: 'credits', available: null }
}

// Sin saldo legible no se afirma nada; sin estimación, solo un saldo en cero
// se da por insuficiente.
export function sufficiencyOf(
  estimated: number | null,
  available: number | null,
): boolean | null {
  if (available === null) return null
  if (estimated === null) return available > 0 ? null : false
  return available >= estimated
}
