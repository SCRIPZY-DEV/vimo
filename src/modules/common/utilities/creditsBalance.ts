import type {
  CreditsDomain,
  CreditsShortfallLine,
} from '@/modules/common/types/credits'
import type {
  ProviderVideoCredits,
  VideoCreditsResult,
} from '@pipeline/types/animation.ts'
import type { AvatarBalanceResult } from '@pipeline/types/avatar.ts'
import type { ImageCreditsResult } from '@pipeline/types/video-project.ts'
import type { VoiceCreditsResult } from '@pipeline/types/voices.ts'

// Saldos tal como los devuelve el sidecar; null = no consultado o caído.
// `video` es el de los proveedores de animación (ADR-0047) y `avatar` el de la
// billetera de HeyGen (ADR-0057); quien no los usa puede omitirlos y esos
// dominios salen como saldo ilegible.
export interface CreditsBalances {
  image: ImageCreditsResult | null
  voice: VoiceCreditsResult | null
  video?: VideoCreditsResult | null
  avatar?: AvatarBalanceResult | null
}

// El saldo de animación de ESE proveedor. Uno sin rama propia queda ilegible
// en vez de leer el de Kie (antes todo lo que no era PoYo caía en Kie: un bug
// latente para cualquier proveedor nuevo, spec §9).
function videoStatusOf(
  providerId: string,
  video: VideoCreditsResult | null | undefined,
): ProviderVideoCredits | undefined {
  if (providerId === 'kie') return video?.kie
  if (providerId === 'poyo') return video?.poyo

  return undefined
}

// HeyGen cobra los renders en dólares: el saldo se compara solo con una
// billetera en `usd`, o sin moneda (la verificada el 2026-10-09). Con otra
// moneda (la OpenAPI admite `credits`) no se afirma nada y no bloquea; la
// tarjeta del avatar en Crear muestra ese saldo tal cual (spec §9).
function avatarBalanceOf(
  providerId: string,
  status: AvatarBalanceResult | null | undefined,
): Pick<CreditsShortfallLine, 'unit' | 'available'> {
  if (providerId !== 'heygen') return { unit: 'usd', available: null }

  if (!status?.available || status.remaining === undefined)
    return { unit: 'usd', available: null }

  if (status.currency !== undefined && status.currency !== 'usd')
    return { unit: 'usd', available: null }

  return { unit: 'usd', available: status.remaining }
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
  if (domain === 'animation') {
    // Los dos cobran en créditos propios, del mismo valor (ADR-0047).
    const status = videoStatusOf(providerId, balances.video)
    if (!status?.available) return { unit: 'credits', available: null }
    return { unit: 'credits', available: status.remaining ?? null }
  }
  if (domain === 'avatar') return avatarBalanceOf(providerId, balances.avatar)

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
