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
import { supabase } from '@/modules/common/supabase/client'
import type { VimoServerRequestOptions } from '@/modules/common/types/vimoServer'

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
