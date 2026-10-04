import {
  VIMO_SERVER_BASE_URL,
  VIMO_SERVER_TIMEOUT_MS,
} from '@/modules/common/constants'
import {
  VimoServerError,
  readJsonBody,
  toVimoServerError,
  vimoServerErrorFromResponse,
  vimoServerHeaders,
} from '@/modules/common/fetcher/vimoServerError'
import { readNdjson } from '@/modules/common/fetcher/ndjson'
import { supabase } from '@/modules/common/supabase/client'
import type {
  VimoServerRequestOptions,
  VimoServerStreamOptions,
} from '@/modules/common/types/vimoServer'

// El token de la sesión, con el mismo tope que el pedido: getSession puede
// colgarse (navigator.locks, ver SESSION_TIMEOUT_MS de auth). Sin sesión el
// pedido viaja sin encabezado y el servidor responde 401 `sin-token`.
async function sessionAccessToken(signal: AbortSignal): Promise<string | null> {
  const timedOut = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    })
  })
  const { data } = await Promise.race([supabase.auth.getSession(), timedOut])
  return data.session?.access_token ?? null
}

/**
 * Único cliente de los endpoints de vimo.click que usan la sesión (ADR-0006,
 * enmienda 2026-09-30): el tercer transporte del borde con el exterior, junto
 * a `fetcher.ts` (HTTP del sidecar, legado) y `pipeline.ts` (jobs). Adjunta el
 * Bearer de Supabase y falla siempre con VimoServerError. Solo lo llama el
 * `api/` de un módulo; `verificar-acceso` sigue en `auth/api` porque es
 * fail-open y recuerda flags.
 */
export async function vimoServerFetch<TResponse>(
  path: string,
  options: VimoServerRequestOptions = {},
): Promise<TResponse> {
  const signal = AbortSignal.timeout(
    options.timeoutMs ?? VIMO_SERVER_TIMEOUT_MS,
  )
  try {
    const accessToken = await sessionAccessToken(signal)
    const response = await fetch(`${VIMO_SERVER_BASE_URL}${path}`, {
      method: options.method ?? 'POST',
      headers: vimoServerHeaders(accessToken),
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    })
    const body = await readJsonBody(response)
    // El tiempo agotado se decide mirando la señal, no el error: WebKit
    // (WKWebView, WebKitGTK) rechaza un fetch abortado con un AbortError y no
    // con el TimeoutError de la señal, y un cuerpo cortado por el tope llega
    // acá como `undefined`, igual que uno que no es JSON.
    if (signal.aborted) throw new VimoServerError('timeout')
    if (!response.ok)
      throw vimoServerErrorFromResponse(response.status, body, Date.now())
    // Un 2xx sin JSON no cumple el contrato: cuenta como error del servidor.
    if (body === undefined)
      throw new VimoServerError('http', { status: response.status })

    return body as TResponse
  } catch (error) {
    // Por lo mismo: el tope de este pedido es la única señal que hay (no se
    // recibe otra de afuera), así que abortada = sin tiempo, venga el error
    // con el nombre que venga. Si algún día el pedido acepta cancelación, acá
    // habrá que distinguirla mirando `signal.reason`.
    if (signal.aborted && !(error instanceof VimoServerError))
      throw new VimoServerError('timeout')
    throw toVimoServerError(error)
  }
}

/**
 * Como `vimoServerFetch`, para un endpoint que responde por partes (NDJSON, un
 * objeto por línea) mientras trabaja: el creador de estilo con IA tarda de
 * medio minuto a más de dos y manda un latido cada 10 s para que la conexión
 * no se corte (ADR-0050). Entrega cada línea por `onLine` apenas llega y
 * resuelve con todas.
 *
 * Dos topes: el del pedido entero y el del SILENCIO, que corre desde que la
 * respuesta empezó (antes de eso la app todavía está subiendo las imágenes).
 * Un error anterior a la primera línea llega como JSON con su status, igual
 * que en `vimoServerFetch`. Una respuesta cortada sin su última línea no es un
 * error acá: quien conoce el contrato lo decide con las líneas que llegaron.
 */
export async function vimoServerStream(
  path: string,
  options: VimoServerStreamOptions,
  onLine: (line: unknown) => void = () => {},
): Promise<unknown[]> {
  const controller = new AbortController()
  const total = setTimeout(() => controller.abort(), options.timeoutMs)
  let idle: ReturnType<typeof setTimeout> | undefined
  const restartIdle = () => {
    clearTimeout(idle)
    idle = setTimeout(() => controller.abort(), options.idleTimeoutMs)
  }

  try {
    const accessToken = await sessionAccessToken(controller.signal)
    const response = await fetch(`${VIMO_SERVER_BASE_URL}${path}`, {
      method: 'POST',
      headers: vimoServerHeaders(accessToken),
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const body = await readJsonBody(response)
      if (controller.signal.aborted) throw new VimoServerError('timeout')
      throw vimoServerErrorFromResponse(response.status, body, Date.now())
    }

    const lines: unknown[] = []
    restartIdle()
    await readNdjson(
      response,
      (line) => {
        lines.push(line)
        onLine(line)
      },
      restartIdle,
    )
    // Como en `vimoServerFetch`: en WebKit un cuerpo cortado por el tope puede
    // terminar sin error, así que manda la señal.
    if (controller.signal.aborted) throw new VimoServerError('timeout')

    return lines
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof VimoServerError))
      throw new VimoServerError('timeout')
    throw toVimoServerError(error)
  } finally {
    clearTimeout(total)
    clearTimeout(idle)
  }
}
