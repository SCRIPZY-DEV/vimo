// Espera antes de reintentar un 429, en orden de confianza: `retry_after` /
// `retryIn` del body (segundos) → headers `Retry-After` / `x-ratelimit-reset`
// (segundos) → backoff exponencial. Siempre +1s de buffer y cap de 120s
// (criterio del origen, fijado por DubVoice y reusado por el resto).
const RATE_LIMIT_BASE_DELAY_MS = 2000
const RATE_LIMIT_BUFFER_MS = 1000
const RATE_LIMIT_MAX_DELAY_MS = 120_000

// Los segundos de un campo del body: un número finito y no negativo, o un
// texto que lo sea («30»). Cualquier otra cosa («soon», -1, null, un objeto) no
// dice nada y la espera sale de los encabezados o del backoff: una respuesta
// rara nunca da una espera NaN o negativa, que dejaba sin efecto la paciencia
// del 429 de HeyGen (revisión de WP-A de la entrega 2h, M-1) y repetía casi
// sin esperar con cualquier proveedor.
function validSeconds(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  if (typeof value === 'string' && !value.trim()) return undefined

  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) return undefined

  return seconds
}

function secondsFromBody(bodyText: string): number | undefined {
  try {
    const parsed = JSON.parse(bodyText) as {
      retry_after?: unknown
      retryIn?: unknown
    } | null
    return validSeconds(parsed?.retry_after) ?? validSeconds(parsed?.retryIn)
  } catch {
    return undefined
  }
}

function secondsFromHeaders(response: Response): number | undefined {
  for (const header of ['retry-after', 'x-ratelimit-reset']) {
    const seconds = Number(response.headers.get(header))
    if (Number.isFinite(seconds) && seconds > 0) return seconds
  }

  return undefined
}

export function rateLimitDelayMs(
  response: Response,
  bodyText: string,
  attempt: number,
): number {
  const seconds = secondsFromBody(bodyText) ?? secondsFromHeaders(response)
  const base =
    seconds !== undefined
      ? seconds * 1000
      : RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt

  return Math.min(base + RATE_LIMIT_BUFFER_MS, RATE_LIMIT_MAX_DELAY_MS)
}
