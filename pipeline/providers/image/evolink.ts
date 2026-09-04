import { setTimeout as delay } from 'node:timers/promises'

import { PipelineFailure } from '../../runner/failure.ts'
import type {
  DecodedImage,
  EvolinkImageCreateResponse,
  EvolinkImageTaskResponse,
  GenerateImageOptions,
} from '../../types/images.ts'
import { downloadImage } from './download.ts'

// Provider Evolink (asíncrono: se crea una tarea y se consulta hasta que
// termina). Port acotado de evolink_provider.ts a UNA imagen, conservando
// intacta la REGLA DE ORO de los proveedores pagos del origen (E26/E27):
//
//   (a) el pedido de creación NO lleva timeout propio corto — bajo ráfaga el
//       gateway tarda 30-90 s, y cortarlo convirtió 18 imágenes en 48 tareas
//       cobradas;
//   (b) el ÚNICO corte es el plazo largo por encargo (210 s);
//   (c) al vencer ese plazo se hace una VERIFICACIÓN FINAL de la tarea antes
//       de darla por perdida: si terminó se cosecha (costo cero extra), si el
//       proveedor la marcó fallida ese es el error real.
//
// El reuso de tareas ya pagadas entre corridas (hash del pedido persistido en
// la escena) llega con la stage `images` de Create: un preview no persiste
// tarea, así que acá no aplica.
export const EVOLINK_BASE_URL = 'https://api.evolink.ai'
const IMAGE_MODEL = 'gpt-image-2'

export const ORDER_DEADLINE_MS = 210_000
// Polling cada 2 s (el origen consultaba cada 1 s): con 5 s la imagen llegaba
// a la grilla hasta 5 s después de que Evolink la terminara, y el porcentaje
// real que devuelve avanzaba a saltos. Un 429 durante el polling es
// transitorio: la tarea sigue viva y pagada, se espera lo que pida el
// proveedor (acotado) y se vuelve a consultar la MISMA tarea.
const POLL_INTERVAL_MS = 2000
const POLL_REQUEST_TIMEOUT_MS = 15_000
const POLL_RATE_LIMIT_WAIT_MS = 5000
const POLL_RATE_LIMIT_MAX_WAIT_MS = 15_000
const MAX_ORDERS = 3

// Fallos de tarea que sí conviene re-encargar: la tarea fallida no se cobró.
export const RETRYABLE_TASK_ERRORS = new Set([
  'generation_failed_no_content',
  'service_error',
  'generation_timeout',
  'quota_exceeded',
  'resource_exhausted',
  'request_cancelled',
  'service_unavailable',
  'unknown_error',
])

const CONTENT_POLICY_PATTERN =
  /content[_ ]?policy|safety|moderat|nsfw|inappropriate|sensitive/

// Fallo de un encargo que amerita crear otro (nunca se re-encarga a ciegas:
// solo cuando el proveedor dijo explícitamente que esta tarea falló).
export class RetryableOrderError extends Error {
  readonly reason: string

  constructor(reason: string) {
    super(reason)
    this.name = 'RetryableOrderError'
    this.reason = reason
  }
}

export function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

export interface OrderDeadline {
  signal: AbortSignal
  expired(): boolean
  close(): void
}

/**
 * Combina la cancelación del usuario con el plazo del encargo, distinguiendo
 * cuál de los dos disparó: un plazo vencido va a verificación final, una
 * cancelación pedida sale como `cancelled`.
 */
export function startOrderDeadline(parent?: AbortSignal): OrderDeadline {
  const controller = new AbortController()
  let deadlineExpired = false

  const timer = setTimeout(() => {
    deadlineExpired = true
    controller.abort()
  }, ORDER_DEADLINE_MS)
  const abortFromParent = () => controller.abort()

  if (parent?.aborted) controller.abort()
  else parent?.addEventListener('abort', abortFromParent)

  return {
    signal: controller.signal,
    expired: () => deadlineExpired,
    close() {
      clearTimeout(timer)
      parent?.removeEventListener('abort', abortFromParent)
    },
  }
}

export function isContentPolicy(code: string, message: string): boolean {
  return CONTENT_POLICY_PATTERN.test(`${code} ${message}`.toLowerCase())
}

function taskFailure(error: { code?: string; message?: string }): never {
  const code = error.code ?? 'unknown_error'
  const message = error.message ?? 'Evolink task failed'
  if (isContentPolicy(code, message))
    throw new PipelineFailure(
      'image_content_policy',
      `Evolink rejected the prompt by content policy: ${message.slice(0, 200)}`,
    )
  if (RETRYABLE_TASK_ERRORS.has(code)) throw new RetryableOrderError(code)

  throw new PipelineFailure(
    'image_provider_error',
    `Evolink task failed: [${code}] ${message.slice(0, 200)}`,
  )
}

// Creación de tarea con cuerpo A MEDIDA (calidad del proyecto, referencias
// de personaje): la usa el carril de escenas de Create. Sin timeout propio —
// solo el plazo del encargo y la cancelación (regla de oro de proveedores
// pagos). Un 429 sale como `image_rate_limited` con el retry-after en el
// mensaje para que el caller espere lo que el proveedor pide.
export async function createEvolinkImageTask(
  body: Record<string, unknown>,
  apiKey: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(`${EVOLINK_BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
    signal,
  }).catch((error: unknown) => {
    if (signal.aborted) throw error
    throw new PipelineFailure('image_network', 'Evolink create request failed')
  })

  if (response.status === 401 || response.status === 403)
    throw new PipelineFailure(
      'image_invalid_api_key',
      `Evolink rejected the API key (status=${response.status})`,
    )
  if (response.status === 429)
    throw new PipelineFailure(
      'image_rate_limited',
      response.headers.get('retry-after') ?? '3',
    )
  if (!response.ok)
    throw new PipelineFailure(
      'image_provider_error',
      `Evolink create failed (status=${response.status})`,
    )

  const data = (await response.json()) as EvolinkImageCreateResponse
  if (!data.id)
    throw new PipelineFailure(
      'image_provider_error',
      'Evolink create returned no task id',
    )

  return data.id
}

// Sube la referencia de un personaje a la file-API de Evolink UNA vez y
// devuelve su URL pública (vive 72h; sobra para una corrida). null si falla:
// el caller cae al carril normal.
export async function uploadEvolinkReference(
  imageDataUri: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const response = await fetch(
      'https://files-api.evolink.ai/api/v1/files/upload/base64',
      {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({
          base64_data: imageDataUri,
          file_name: 'character_reference.jpg',
        }),
        signal: AbortSignal.timeout(60_000),
      },
    )
    if (!response.ok) return null
    const data = (await response.json()) as { data?: { file_url?: string } }
    const url = data.data?.file_url
    return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null
  } catch {
    return null
  }
}

async function createTask(
  prompt: string,
  apiKey: string,
  order: OrderDeadline,
): Promise<string> {
  const response = await fetch(`${EVOLINK_BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size: '16:9',
      resolution: '1K',
      // Un preview no necesita resolución de render.
      quality: 'low',
      n: 1,
    }),
    // Sin timeout propio: solo el plazo del encargo y la cancelación (regla a).
    signal: order.signal,
  }).catch((error: unknown) => {
    if (order.signal.aborted) throw error
    throw new PipelineFailure('image_network', 'Evolink create request failed')
  })

  if (response.status === 401 || response.status === 403)
    throw new PipelineFailure(
      'image_invalid_api_key',
      `Evolink rejected the API key (status=${response.status})`,
    )
  if (!response.ok)
    throw new PipelineFailure(
      'image_provider_error',
      `Evolink create failed (status=${response.status})`,
    )

  const data = (await response.json()) as EvolinkImageCreateResponse
  if (!data.id)
    throw new PipelineFailure(
      'image_provider_error',
      'Evolink create returned no task id',
    )

  return data.id
}

export async function pollTask(
  taskId: string,
  apiKey: string,
  order: OrderDeadline,
  options: GenerateImageOptions,
): Promise<string> {
  const startedAt = Date.now()

  for (;;) {
    await delay(POLL_INTERVAL_MS, undefined, { signal: order.signal })

    let response: Response
    try {
      response = await fetch(`${EVOLINK_BASE_URL}/v1/tasks/${taskId}`, {
        headers: authHeaders(apiKey),
        signal: AbortSignal.any([
          order.signal,
          AbortSignal.timeout(POLL_REQUEST_TIMEOUT_MS),
        ]),
      })
    } catch (error) {
      // El plazo o la cancelación mandan; lo demás es transitorio.
      if (order.signal.aborted) throw error
      continue
    }

    if (response.status === 401 || response.status === 403)
      throw new PipelineFailure(
        'image_invalid_api_key',
        `Evolink rejected the API key (status=${response.status})`,
      )
    if (response.status === 404)
      throw new PipelineFailure(
        'image_task_not_found',
        `Evolink task ${taskId} is gone`,
      )
    // Rate limit del polling: transitorio, no un fallo de la tarea. Antes
    // caía en el `!response.ok` de abajo y daba la escena por perdida.
    if (response.status === 429) {
      await delay(rateLimitWaitMs(response), undefined, {
        signal: order.signal,
      })
      continue
    }
    // 5xx es transitorio del lado de Evolink: se sigue esperando.
    if (response.status >= 500) continue
    if (!response.ok)
      throw new PipelineFailure(
        'image_provider_error',
        `Evolink poll failed (status=${response.status})`,
      )

    const data = (await response.json()) as EvolinkImageTaskResponse

    if (data.status === 'completed') {
      const url = firstResultUrl(data)
      if (!url)
        throw new PipelineFailure(
          'image_provider_error',
          'Evolink completed without an image url',
        )

      return url
    }
    if (data.status === 'failed') taskFailure(data.error ?? {})

    options.onProgress?.({
      percent: data.progress ?? 0,
      status: data.status ?? 'processing',
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    })
  }
}

// Cuánto esperar tras un 429 del polling: lo que pide `retry-after` (en
// segundos), acotado, o un valor fijo si el header falta o no es numérico.
function rateLimitWaitMs(response: Response): number {
  const retryAfterSeconds = Number(response.headers.get('retry-after'))
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0)
    return POLL_RATE_LIMIT_WAIT_MS
  return Math.min(POLL_RATE_LIMIT_MAX_WAIT_MS, retryAfterSeconds * 1000)
}

function firstResultUrl(data: EvolinkImageTaskResponse): string | null {
  const first = data.results?.[0]
  if (typeof first === 'string' && first.trim()) return first.trim()
  if (first && typeof first === 'object') {
    const url = (first as { url?: unknown }).url
    if (typeof url === 'string' && url.trim()) return url.trim()
  }

  return null
}

export interface FinalCheck {
  url?: string
  error?: { code?: string; message?: string }
}

/**
 * Verificación FINAL (regla c): una única consulta a la tarea en curso antes de
 * darla por perdida. Devuelve null si sigue viva o si no se pudo consultar.
 */
export async function inspectTask(
  taskId: string,
  apiKey: string,
): Promise<FinalCheck | null> {
  let response: Response
  try {
    response = await fetch(`${EVOLINK_BASE_URL}/v1/tasks/${taskId}`, {
      headers: authHeaders(apiKey),
      signal: AbortSignal.timeout(POLL_REQUEST_TIMEOUT_MS),
    })
  } catch {
    return null
  }
  if (!response.ok) return null

  let data: EvolinkImageTaskResponse
  try {
    data = (await response.json()) as EvolinkImageTaskResponse
  } catch {
    return null
  }

  if (data.status === 'completed') {
    const url = firstResultUrl(data)
    return url ? { url } : null
  }
  if (data.status === 'failed') return { error: data.error ?? {} }

  return null
}

export async function generateEvolinkImage(
  prompt: string,
  options: GenerateImageOptions,
): Promise<DecodedImage> {
  let lastReason = 'unknown'

  for (let attempt = 1; attempt <= MAX_ORDERS; attempt++) {
    const order = startOrderDeadline(options.signal)
    let taskId: string | null = null

    try {
      taskId = await createTask(prompt, options.apiKey, order)
      const url = await pollTask(taskId, options.apiKey, order, options)
      return await downloadImage(url, options.signal)
    } catch (error) {
      // Cancelación pedida por el usuario: sale como tal.
      if (options.signal?.aborted) throw error

      if (order.expired() && taskId) {
        const check = await inspectTask(taskId, options.apiKey)
        // Terminó mientras esperábamos: se cosecha, costo cero extra.
        if (check?.url) return await downloadImage(check.url, options.signal)
        if (check?.error) {
          try {
            taskFailure(check.error)
          } catch (finalError) {
            if (!(finalError instanceof RetryableOrderError)) throw finalError
            lastReason = finalError.reason
            continue
          }
        }

        // Sigue viva: NO se re-encarga (ya está pagada) — el taskId queda en
        // el mensaje para poder rastrearla.
        throw new PipelineFailure(
          'image_timeout',
          `Evolink task still running after ${ORDER_DEADLINE_MS / 1000}s (taskId=${taskId})`,
        )
      }

      if (!(error instanceof RetryableOrderError)) throw error
      lastReason = error.reason
    } finally {
      order.close()
    }
  }

  throw new PipelineFailure(
    'image_provider_error',
    `Evolink failed after ${MAX_ORDERS} orders (${lastReason})`,
  )
}

export type EvolinkQuality = 'low' | 'medium' | 'high'

// Evolink solo expone gpt-image-2 a 16:9 1K: de la opción solo importa la
// calidad (sufijo); sin sufijo reconocible cae a "low".
export function evolinkQualityFromOption(
  qualityOption: string | undefined,
): EvolinkQuality {
  const parts = (qualityOption ?? '').split('_')
  const suffix = parts[parts.length - 1]
  if (suffix === 'low' || suffix === 'medium' || suffix === 'high')
    return suffix
  return 'low'
}
