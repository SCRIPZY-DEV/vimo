import { slotDurationSeconds } from '@pipeline/animation/timing.ts'
import {
  AVATAR_DEFAULT_ENGINE,
  avatarUsdPerMinute,
  estimateAvatarUsd,
} from '@pipeline/types/avatar.ts'
import type { CostEstimateLine } from '@/modules/common/types/credits'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { AvatarSpanWindow } from '@pipeline/runner/events.ts'
import type { AvatarLookType } from '@pipeline/types/avatar.ts'

// Decimales del estimado en la UI: solo sacan el ruido de la coma flotante.
const AVATAR_USD_DECIMALS = 6

// Tarifa de HeyGen en USD por minuto para un tipo de look con el motor de
// Vimo. La tabla y la fórmula viven en pipeline/types/avatar.ts: acá solo se
// fija el motor. null = el motor no aplica a ese tipo de look.
export function avatarRatePerMinute(lookType: AvatarLookType): number | null {
  return avatarUsdPerMinute(AVATAR_DEFAULT_ENGINE, lookType)
}

// Dólares por `seconds` de avatar, exactos (spec §9: segundos / 60 × tarifa),
// con el estimador de pipeline/types/avatar.ts (el mismo que usa la fase).
// Sin factor de seguridad (spec §8, saldo antes de cada escena): el tramo
// real queda a unos segundos por frases enteras y la fase vuelve a comparar
// con el saldo antes de pagar. El redondeo a 6 decimales solo saca el ruido
// de la coma flotante: 10 s a 0,99 US$/min son 0,165, no 0,16499999…
export function avatarUsd(
  lookType: AvatarLookType,
  seconds: number,
): number | null {
  const usd = estimateAvatarUsd(seconds, AVATAR_DEFAULT_ENGINE, lookType)
  if (usd === null) return null

  return Number(usd.toFixed(AVATAR_USD_DECIMALS))
}

// Segundos de avatar que pide el formulario; 0 con el avatar apagado.
export function createAvatarSeconds(form: CreateFormValue): number {
  if (!form.useAvatar) return 0

  return form.avatarAppearances * form.avatarSecondsPerAppearance
}

// La línea de HeyGen del pre-check (ADR-0031, spec §9): dólares contra el
// saldo de su billetera.
export function avatarCostEstimate(
  lookType: AvatarLookType,
  seconds: number,
): CostEstimateLine | null {
  if (seconds <= 0) return null

  const usd = avatarUsd(lookType, seconds)
  if (usd === null) return null

  return { domain: 'avatar', providerId: 'heygen', unit: 'usd', estimated: usd }
}

// Segundos de unos tramos de avatar (los `avatarSpans` de la pausa de
// confirmación, con la cola ya absorbida, o las escenas de avatar de un
// proyecto), contados en cuadros como los cuenta la fase `avatar` al
// compararse con el saldo (slotDurationSeconds): así la cifra que ve la
// persona es la que la fase va a pagar. Los tramos de Crear no pasan por acá:
// su cuenta es apariciones × segundos (createAvatarSeconds).
export function avatarSpansSeconds(spans: readonly AvatarSpanWindow[]): number {
  return spans.reduce(
    (total, span) =>
      total + slotDurationSeconds(span.startSeconds, span.endSeconds),
    0,
  )
}

// La línea de HeyGen de unos tramos concretos (entrega 2, pantalla de
// confirmación): lo que cuestan de verdad, con la misma tarifa y el mismo
// redondeo que la estimación de Crear.
export function avatarSpansCostEstimate(
  lookType: AvatarLookType,
  spans: readonly AvatarSpanWindow[],
): CostEstimateLine | null {
  return avatarCostEstimate(lookType, avatarSpansSeconds(spans))
}
