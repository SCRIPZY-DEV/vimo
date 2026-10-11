import { PipelineFailure } from '../../runner/failure.ts'
import type { PipelineFailureDetails } from '../../runner/failure.ts'
import {
  INSUFFICIENT_CREDITS_BODY_PATTERN,
  isInsufficientCreditsResponse,
} from '../../utils/insufficient-credits.ts'

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

// Un rechazo de HeyGen con el campo del pedido que lo causó (`error.param` del
// sobre, o null si no vino o el cuerpo no era el sobre). Sigue siendo un
// PipelineFailure —código, proveedor y status viajan igual—; el `param` dice,
// por ejemplo, si un `avatar_look_unsupported` fue por el look (`avatar_id`)
// o por el motor (`engine`). `sawRequestInProgress` dice que, antes de este
// rechazo, HeyGen respondió `409 request_in_progress` al MISMO pedido (la
// misma Idempotency-Key): el original estaba en vuelo, así que este «no» no
// dice nada de él (lo marca `createVideo`).
export class HeyGenFailure extends PipelineFailure {
  readonly param: string | null
  readonly sawRequestInProgress: boolean

  constructor(
    code: string,
    message: string,
    details: PipelineFailureDetails,
    param: string | null,
    sawRequestInProgress = false,
  ) {
    super(code, message, details)
    this.param = param
    this.sawRequestInProgress = sawRequestInProgress
  }
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
// Códigos que son moderación aunque el mensaje no lo diga (página de errores
// de HeyGen, copia del 2026-10-07): llegan como `failure_code` de un render y
// también como `error.code` del sobre de un rechazo.
const MODERATION_FAILURE_CODES = new Set([
  'content_policy_violation',
  'avatar_not_usable',
  'avatar_consent_required',
])

function isModerationCode(code: string | undefined): boolean {
  return code !== undefined && MODERATION_FAILURE_CODES.has(code)
}

// Clasificación de una respuesta rechazada (diseño §14). El saldo se mira
// ANTES del status porque no siempre viene como 402.
export function heygenFailure(status: number, bodyText: string): HeyGenFailure {
  const details = { provider: HEYGEN_PROVIDER, httpStatus: status }
  const excerpt = bodyText.slice(0, 300)
  const error = parseHeyGenError(bodyText)
  if (isInsufficientCreditsResponse(status, bodyText))
    return new HeyGenFailure(
      'avatar_insufficient_credits',
      `HeyGen rejected the request for insufficient balance (HTTP ${status}): ${excerpt}`,
      details,
      error.param,
    )

  if (status === 401 || status === 403)
    return new HeyGenFailure(
      'avatar_invalid_key',
      `HeyGen rejected the API key (HTTP ${status})`,
      details,
      error.param,
    )
  if (status === 429)
    return new HeyGenFailure(
      'avatar_rate_limited',
      `HeyGen rate limit (HTTP 429): ${error.message}`,
      details,
      error.param,
    )
  // Un reintento con la misma Idempotency-Key mientras el pedido original sigue
  // en vuelo (por ejemplo, después de un timeout): HeyGen todavía lo procesa.
  // Es «esperá y reintentá sin cambiar nada», no un pedido rechazado: cambiar
  // el pedido pagaría otro.
  if (status === 409 && error.code === 'request_in_progress')
    return new HeyGenFailure(
      'avatar_rate_limited',
      `HeyGen is still processing the original request (HTTP 409): ${error.message}`,
      details,
      error.param,
    )
  // El `param` de look o motor se mira ANTES que la moderación: «not allowed»
  // en el mensaje de un `avatar_id` rechazado quiere decir «este tipo de avatar
  // no sirve para esto», no que HeyGen haya moderado el contenido.
  if (status === 400 && error.param && LOOK_PARAMS.has(error.param))
    return new HeyGenFailure(
      'avatar_look_unsupported',
      `HeyGen rejected the look or engine (${error.param}): ${error.message}`,
      details,
      error.param,
    )
  // La moderación se lee solo del sobre JSON de un rechazo del cliente (status
  // < 500): el texto crudo de un proxy o de una página de error puede decir
  // «policy», «consent» o «Not Allowed» sin que HeyGen haya moderado nada. En
  // el sobre cuenta su código (`avatar_not_usable` aunque el mensaje no hable
  // de moderación) o sus palabras.
  if (
    error.isEnvelope &&
    status < 500 &&
    (isModerationCode(error.code) ||
      MODERATION_PATTERN.test(`${error.code ?? ''} ${error.message}`))
  )
    return new HeyGenFailure(
      'avatar_moderation_rejected',
      `HeyGen moderation rejected the request: ${error.message}`,
      details,
      error.param,
    )
  // Cualquier otro rechazo del cliente (400, 404, 405, 409, 413, 415, 422…) es
  // un pedido que HeyGen no aceptó: no se dice «revisá tu conexión».
  if (status < 500)
    return new HeyGenFailure(
      'avatar_invalid_request',
      `HeyGen rejected the request (HTTP ${status}, ${error.code ?? 'no code'}): ${error.message}`,
      details,
      error.param,
    )

  return new HeyGenFailure(
    'avatar_network',
    `HeyGen is unavailable (HTTP ${status}): ${excerpt}`,
    details,
    error.param,
  )
}

// Un render que HeyGen terminó `failed` (diseño §14): primero el saldo
// (recargar y reanudar lo resuelve), después la moderación —por su código o
// por las palabras del mensaje— y todo lo demás es `avatar_render_failed`.
// HeyGen no cobra un render fallido. Sin status HTTP: el pedido fue aceptado.
// Límite conocido: un render no trae un `param` que separe «el look no sirve»
// de «contenido moderado», así que un fallo técnico cuyo texto diga «not
// allowed» o «policy» (por ejemplo «Retry policy exhausted») sale como
// moderación. Cambia el texto que ve la persona y, como la moderación es un
// rechazo que la fase no vuelve a pedir sola (pipeline/avatar/lane.ts), ese
// render se repite recién cuando la persona lo pide desde el editor. Se
// revisa cuando haya `failure_code` reales de HeyGen.
export function heygenVideoFailure(
  failureCode: string | undefined,
  failureMessage: string | undefined,
): PipelineFailure {
  const details = { provider: HEYGEN_PROVIDER }
  const text = `${failureCode ?? ''} ${failureMessage ?? ''}`.trim()
  if (INSUFFICIENT_CREDITS_BODY_PATTERN.test(text))
    return new PipelineFailure(
      'avatar_insufficient_credits',
      `HeyGen failed the render for insufficient balance: ${text}`,
      details,
    )
  if (isModerationCode(failureCode) || MODERATION_PATTERN.test(text))
    return new PipelineFailure(
      'avatar_moderation_rejected',
      `HeyGen moderation rejected the render: ${text}`,
      details,
    )
  return new PipelineFailure(
    'avatar_render_failed',
    `HeyGen failed the render: ${text || 'no failure code'}`,
    details,
  )
}
