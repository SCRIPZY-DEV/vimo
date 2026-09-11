import { PipelineFailure } from '../runner/failure.ts'

// Detección uniforme de «saldo agotado» en los proveedores pagos (ADR-0031).
// Cada dominio tiene su código estable (la UI lo traduce y lo trata distinto
// de un fallo transitorio: no se reintenta, el proyecto queda pausado y
// retomable). `voice_quota_exceeded` es el histórico de ElevenLabs directo
// (cuota mensual de caracteres) y forma parte de la misma familia.
export const INSUFFICIENT_CREDITS_CODES: ReadonlySet<string> = new Set([
  'voice_insufficient_credits',
  'voice_quota_exceeded',
  'image_insufficient_credits',
  'llm_insufficient_credits',
  'transcription_insufficient_credits',
  'music_insufficient_credits',
])

export function isInsufficientCreditsCode(code: string): boolean {
  return INSUFFICIENT_CREDITS_CODES.has(code)
}

export function isInsufficientCreditsFailure(
  error: unknown,
): error is PipelineFailure {
  return (
    error instanceof PipelineFailure && isInsufficientCreditsCode(error.code)
  )
}

// Lo que dicen los proveedores cuando la cuenta no tiene con qué pagar. Un
// 402 es inequívoco; con otros status (Fal devuelve 403 con detalle de
// balance, DubVoice 403/400) manda el cuerpo. Un 429 nunca es saldo: es
// «esperá», y se trata aparte.
export const INSUFFICIENT_CREDITS_BODY_PATTERN =
  /insufficient[ _-]?(credits?|balance|funds|quota)|not enough (credits?|balance|funds)|balance (is )?(too low|exhausted|insufficient|depleted)|out of credits|credits? (exhausted|depleted)|payment required|exhausted your (credits?|balance)|top[ -]?up|recharge your/i

export function isInsufficientCreditsResponse(
  status: number,
  bodyText: string,
): boolean {
  if (status === 402) return true
  if (status === 429) return false
  return INSUFFICIENT_CREDITS_BODY_PATTERN.test(bodyText)
}

// Códigos de tarea asíncrona (Evolink) que significan saldo, no un fallo
// transitorio: re-encargar la tarea solo repite el rechazo.
export const INSUFFICIENT_TASK_ERROR_CODES: ReadonlySet<string> = new Set([
  'quota_exceeded',
  'resource_exhausted',
  'insufficient_credits',
  'insufficient_balance',
])

export function isInsufficientTaskError(
  code: string,
  message: string,
): boolean {
  if (INSUFFICIENT_TASK_ERROR_CODES.has(code)) return true
  return INSUFFICIENT_CREDITS_BODY_PATTERN.test(message)
}
