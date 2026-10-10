import { PipelineFailure } from '../../runner/failure.ts'
import { isInsufficientCreditsResponse } from '../../utils/insufficient-credits.ts'

// Id del proveedor en los fallos y en el log de diagnóstico (ADR-0038).
export const HEYGEN_PROVIDER = 'heygen'

interface HeyGenErrorBody {
  error?: { code?: string; message?: string; param?: string | null }
}

export interface HeyGenError {
  code?: string
  message: string
  param: string | null
  // true si el cuerpo fue el sobre `{ error: {...} }` de HeyGen; false si fue
  // texto crudo (la página de un proxy, un 502 con HTML).
  isEnvelope: boolean
}

// El sobre de error de HeyGen es `{ error: { code, message, param } }`; un
// cuerpo que no es JSON (un 502 del proxy) se conserva recortado.
export function parseHeyGenError(bodyText: string): HeyGenError {
  try {
    const body = JSON.parse(bodyText) as HeyGenErrorBody
    return {
      code: body.error?.code,
      message: body.error?.message ?? '',
      param: body.error?.param ?? null,
      isEnvelope: typeof body.error === 'object' && body.error !== null,
    }
  } catch {
    return { message: bodyText.slice(0, 300), param: null, isEnvelope: false }
  }
}

// Palabras con las que HeyGen explica un rechazo por moderación o por
// consentimiento (personas reales, contenido prohibido).
const MODERATION_PATTERN =
  /moderation|policy|prohibited|not allowed|consent|celebrit|public figure/i
// Parámetros cuyo rechazo significa «este look o motor no sirve».
const LOOK_PARAMS = new Set(['avatar_id', 'engine', 'avatar_group_id'])

// Clasificación de una respuesta rechazada (diseño §14). El saldo se mira
// ANTES del status porque no siempre viene como 402.
export function heygenFailure(
  status: number,
  bodyText: string,
): PipelineFailure {
  const details = { provider: HEYGEN_PROVIDER, httpStatus: status }
  const excerpt = bodyText.slice(0, 300)
  if (isInsufficientCreditsResponse(status, bodyText))
    return new PipelineFailure(
      'avatar_insufficient_credits',
      `HeyGen rejected the request for insufficient balance (HTTP ${status}): ${excerpt}`,
      details,
    )

  const error = parseHeyGenError(bodyText)
  if (status === 401 || status === 403)
    return new PipelineFailure(
      'avatar_invalid_key',
      `HeyGen rejected the API key (HTTP ${status})`,
      details,
    )
  if (status === 429)
    return new PipelineFailure(
      'avatar_rate_limited',
      `HeyGen rate limit (HTTP 429): ${error.message}`,
      details,
    )
  // Un reintento con la misma Idempotency-Key mientras el pedido original sigue
  // en vuelo (por ejemplo, después de un timeout): HeyGen todavía lo procesa.
  // Es «esperá y reintentá sin cambiar nada», no un pedido rechazado: cambiar
  // el prompt pagaría otro look.
  if (status === 409 && error.code === 'request_in_progress')
    return new PipelineFailure(
      'avatar_rate_limited',
      `HeyGen is still processing the original request (HTTP 409): ${error.message}`,
      details,
    )
  // El `param` de look o motor se mira ANTES que la moderación: «not allowed»
  // en el mensaje de un `avatar_id` rechazado quiere decir «este tipo de avatar
  // no sirve para esto», no que HeyGen haya moderado el contenido.
  if (status === 400 && error.param && LOOK_PARAMS.has(error.param))
    return new PipelineFailure(
      'avatar_look_unsupported',
      `HeyGen rejected the look or engine (${error.param}): ${error.message}`,
      details,
    )
  // La moderación se lee solo del sobre JSON de un rechazo del cliente (status
  // < 500): el texto crudo de un proxy o de una página de error puede decir
  // «policy», «consent» o «Not Allowed» sin que HeyGen haya moderado nada.
  if (
    error.isEnvelope &&
    status < 500 &&
    MODERATION_PATTERN.test(`${error.code ?? ''} ${error.message}`)
  )
    return new PipelineFailure(
      'avatar_moderation_rejected',
      `HeyGen moderation rejected the request: ${error.message}`,
      details,
    )
  // Cualquier otro rechazo del cliente (400, 404, 405, 409, 413, 415, 422…) es
  // un pedido que HeyGen no aceptó: no se dice «revisá tu conexión».
  if (status < 500)
    return new PipelineFailure(
      'avatar_invalid_request',
      `HeyGen rejected the request (HTTP ${status}, ${error.code ?? 'no code'}): ${error.message}`,
      details,
    )

  return new PipelineFailure(
    'avatar_network',
    `HeyGen is unavailable (HTTP ${status}): ${excerpt}`,
    details,
  )
}
