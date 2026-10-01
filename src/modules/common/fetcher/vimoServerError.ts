import type {
  VimoServerErrorDetails,
  VimoServerErrorKind,
} from '@/modules/common/types/vimoServer'

// Fallos del cliente de vimo.click (ADR-0006, enmienda 2026-09-30). Puro, solo
// con `import type`: lo corre scripts/test/check-app-vimo-server.mjs con Node.

/** Fallo de un pedido a vimo.click: `kind` dice si fue la red, el tiempo o el servidor. */
export class VimoServerError extends Error {
  readonly kind: VimoServerErrorKind
  // Solo con `http`: el status y lo que dijo el cuerpo `{ code, retryAfterSeconds }`.
  readonly status: number | null
  readonly code: string | null
  readonly retryAfterSeconds: number | null
  // Cuándo llegó la respuesta: `retryAfterSeconds` cuenta desde acá.
  readonly receivedAt: number | null

  constructor(kind: VimoServerErrorKind, details: VimoServerErrorDetails = {}) {
    super(`vimo.click ${kind}`)
    this.name = 'VimoServerError'
    this.kind = kind
    this.status = details.status ?? null
    this.code = details.code ?? null
    this.retryAfterSeconds = details.retryAfterSeconds ?? null
    this.receivedAt = details.receivedAt ?? null
  }
}

// Node y Chromium (WebView2) cortan el fetch, y también la lectura del cuerpo,
// con la razón de la señal: un DOMException llamado TimeoutError. WebKit
// (WKWebView, WebKitGTK) no: rechaza con un AbortError fijo. Por eso el tiempo
// agotado lo decide `vimoServerFetch` mirando su señal; el nombre es respaldo.
function isTimeoutError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return Reflect.get(error, 'name') === 'TimeoutError'
}

/** Una respuesta que no es 2xx, con el cuerpo `{ code, retryAfterSeconds? }` del contrato. */
export function vimoServerErrorFromResponse(
  status: number,
  body: unknown,
  receivedAt: number,
): VimoServerError {
  if (typeof body !== 'object' || body === null)
    return new VimoServerError('http', { status, receivedAt })

  const code: unknown = Reflect.get(body, 'code')
  const retryAfterSeconds: unknown = Reflect.get(body, 'retryAfterSeconds')
  const validRetry =
    typeof retryAfterSeconds === 'number' &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds >= 0

  return new VimoServerError('http', {
    status,
    receivedAt,
    ...(typeof code === 'string' && code.length > 0 ? { code } : {}),
    ...(validRetry ? { retryAfterSeconds } : {}),
  })
}

/**
 * Lo que tiró el pedido como VimoServerError: un TimeoutError es `timeout`; el
 * resto, `network`. Solo ve el nombre del error: el tiempo agotado que WebKit
 * reporta como AbortError lo decide antes `vimoServerFetch` con su señal.
 */
export function toVimoServerError(error: unknown): VimoServerError {
  if (error instanceof VimoServerError) return error
  if (isTimeoutError(error)) return new VimoServerError('timeout')
  return new VimoServerError('network')
}

/**
 * El cuerpo como JSON, o undefined si no lo es. Un TimeoutError al leerlo se
 * relanza; en WebKit el mismo corte llega como AbortError y queda en
 * `undefined`: quien tiene la señal la mira después de leer.
 */
export async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    if (isTimeoutError(error)) throw error
    return undefined
  }
}

/** Encabezados del pedido: JSON y, con sesión, el Bearer de Supabase. */
export function vimoServerHeaders(
  accessToken: string | null,
): Record<string, string> {
  if (!accessToken) return { 'Content-Type': 'application/json' }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
}

/**
 * Código estable para i18n: los del cliente (`network`, `timeout`) o el `code`
 * del servidor. null = sin código (otro error, o un cuerpo que no se reconoce):
 * quien traduce usa su mensaje genérico.
 */
export function vimoServerErrorCode(error: unknown): string | null {
  if (!(error instanceof VimoServerError)) return null
  if (error.kind !== 'http') return error.kind
  return error.code
}

/**
 * Cuándo vuelve a haber cupo (ISO 8601), si el servidor lo dijo; si no, null.
 * Total: una espera desmedida (un número finito que se sale del rango de Date)
 * no es una fecha, y toISOString lanzaría RangeError al renderizar el error.
 */
export function vimoServerRetryAt(error: unknown): string | null {
  if (!(error instanceof VimoServerError)) return null
  if (error.retryAfterSeconds === null || error.receivedAt === null) return null

  const retryAt = new Date(error.receivedAt + error.retryAfterSeconds * 1000)
  if (Number.isNaN(retryAt.getTime())) return null

  return retryAt.toISOString()
}
