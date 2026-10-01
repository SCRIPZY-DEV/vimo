// Cliente de vimo.click (ADR-0006, enmienda 2026-09-30).

/** Por qué falló un pedido: sin red, sin respuesta a tiempo o un status que no es 2xx. */
export type VimoServerErrorKind = 'network' | 'timeout' | 'http'

export interface VimoServerErrorDetails {
  status?: number
  // `code` y `retryAfterSeconds` del cuerpo de error del servidor.
  code?: string
  retryAfterSeconds?: number
  // Cuándo llegó la respuesta (ms desde epoch).
  receivedAt?: number
}

export interface VimoServerRequestOptions {
  // POST por defecto: los endpoints de vimo.click que usa la app son pedidos.
  method?: 'GET' | 'POST'
  // Viaja como JSON.
  body?: unknown
  // Tope del pedido entero, sesión incluida. Ausente = VIMO_SERVER_TIMEOUT_MS.
  timeoutMs?: number
}
