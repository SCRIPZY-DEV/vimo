/**
 * Único punto de acceso HTTP al sidecar (ADR-0002). Este es el único archivo
 * de `src/` que conoce la URL del servidor local: el puerto llega desde la
 * configuración al arrancar (lo informa Rust tras lanzar el sidecar) y no se
 * escribe a mano en ningún otro lado. Ningún componente ni hook llama a
 * `fetch` directo — la cadena es componente → hook → api/ → fetcher.
 */

export class ErrorHttp extends Error {
  readonly status: number

  constructor(status: number, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorHttp'
    this.status = status
  }
}

let baseUrl: string | null = null

/** Se llama una sola vez al arrancar, cuando el sidecar informa su puerto. */
export function configurarFetcher(opciones: { baseUrl: string }) {
  baseUrl = opciones.baseUrl.replace(/\/+$/, '')
}

/**
 * URL absoluta hacia el sidecar, para los `src` de <img>/<video>/<audio> que
 * no pasan por fetch. El resto del código usa `fetcher`.
 */
export function urlSidecar(ruta: string): string {
  if (!baseUrl)
    throw new Error(
      'El fetcher no está configurado: el sidecar todavía no informó su puerto',
    )
  return `${baseUrl}${ruta}`
}

export async function fetcher<Respuesta>(
  ruta: string,
  init?: RequestInit,
): Promise<Respuesta> {
  const headers = new Headers(init?.headers)
  const cuerpoEsJson = typeof init?.body === 'string'
  if (cuerpoEsJson && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')

  const respuesta = await fetch(urlSidecar(ruta), { ...init, headers })
  if (!respuesta.ok)
    throw new ErrorHttp(respuesta.status, await leerMensajeDeError(respuesta))

  return respuesta.json() as Promise<Respuesta>
}

async function leerMensajeDeError(respuesta: Response): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as { error?: string }
    if (cuerpo.error) return cuerpo.error
  } catch {
    // Cuerpo no-JSON o vacío — caemos al mensaje genérico.
  }
  return `HTTP ${respuesta.status}`
}
