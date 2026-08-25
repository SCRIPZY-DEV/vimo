import { setTimeout as delay } from 'node:timers/promises'

import { PipelineFailure } from '../../runner/failure.ts'
import type { FalImageModelId } from '../../types/image-provider.ts'
import type {
  DecodedImage,
  FalErrorResponse,
  FalImageResponse,
  GenerateImageOptions,
} from '../../types/images.ts'
import { downloadImage } from './download.ts'

// Provider Fal (síncrono: el POST devuelve la imagen ya generada). Port
// acotado de fal_provider.ts a UNA imagen — la generación por escenas, con
// caché por archivo y semáforos, llega con la stage `images` de Create.
export const FAL_BASE_URL = 'https://fal.run'

export const FAL_MODEL_ENDPOINTS: Record<FalImageModelId, string> = {
  'flux-schnell': 'fal-ai/flux/schnell',
  'gpt-image-2': 'fal-ai/gpt-image-2',
}

// Plazo largo ÚNICO (regla de oro): Fal es síncrono y cobra al generar, así
// que nada de timeouts cortos propios — bajo carga el pedido tarda.
const ORDER_DEADLINE_MS = 210_000
const MAX_ATTEMPTS = 5
const RATE_LIMIT_MAX_BACKOFF_MS = 30_000

export const FAL_CONTENT_POLICY_PATTERN =
  /violat|safety|content[_ ]policy|content checker|flagged|nsfw|inappropriate|moderat|could not be processed/i

// El `detail` de Fal llega como string, como array de {msg} o como error/message:
// sin normalizarlo, el regex de safety veía "[object Object]" y no matcheaba.
export function falErrorText(body: FalErrorResponse | null): string {
  if (!body) return ''

  const parts: string[] = []
  if (typeof body.type === 'string') parts.push(body.type)
  if (typeof body.detail === 'string') parts.push(body.detail)
  if (Array.isArray(body.detail))
    for (const item of body.detail) {
      if (typeof item === 'string') parts.push(item)
      else if (item && typeof item === 'object' && 'msg' in item) {
        const message = (item as { msg?: unknown }).msg
        if (typeof message === 'string') parts.push(message)
      }
    }
  if (typeof body.error === 'string') parts.push(body.error)
  if (typeof body.message === 'string') parts.push(body.message)

  return parts.join(' ')
}

function requestBody(prompt: string, model: FalImageModelId): string {
  // Siempre la opción más barata: un preview no necesita resolución de render.
  if (model === 'flux-schnell')
    return JSON.stringify({
      prompt,
      image_size: 'landscape_16_9',
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: false,
      output_format: 'jpeg',
    })

  return JSON.stringify({
    prompt,
    image_size: { width: 1024, height: 768 },
    quality: 'low',
    num_images: 1,
    output_format: 'jpeg',
  })
}

export async function readFalErrorBody(
  response: Response,
): Promise<FalErrorResponse | null> {
  try {
    return (await response.json()) as FalErrorResponse
  } catch {
    return null
  }
}

export async function generateFalImage(
  prompt: string,
  model: FalImageModelId,
  options: GenerateImageOptions,
): Promise<DecodedImage> {
  const deadline = AbortSignal.timeout(ORDER_DEADLINE_MS)
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadline])
    : deadline
  let lastError = 'unknown'

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response
    try {
      response = await fetch(`${FAL_BASE_URL}/${FAL_MODEL_ENDPOINTS[model]}`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: requestBody(prompt, model),
        signal,
      })
    } catch (error) {
      // Cancelación pedida por el usuario: sale como tal.
      if (options.signal?.aborted) throw error
      if (deadline.aborted)
        throw new PipelineFailure(
          'image_timeout',
          `Fal did not answer within ${ORDER_DEADLINE_MS / 1000}s`,
        )
      lastError = 'network'
      continue
    }

    if (response.ok) {
      const data = (await response.json()) as FalImageResponse
      const url = data.images?.[0]?.url
      // 200 sin URL no es terminal: el origen lo vio y reintenta.
      if (!url) {
        lastError = 'Fal returned 200 without an image url'
        continue
      }

      return downloadImage(url, options.signal)
    }

    if (response.status === 401 || response.status === 403)
      throw new PipelineFailure(
        'image_invalid_api_key',
        `Fal rejected the API key (status=${response.status})`,
      )

    const body = await readFalErrorBody(response)
    const detail = falErrorText(body)

    if (
      (response.status === 400 || response.status === 422) &&
      (body?.type === 'content_policy_violation' ||
        FAL_CONTENT_POLICY_PATTERN.test(detail))
    )
      // Reintentar el mismo prompt rechazado solo quema créditos.
      throw new PipelineFailure(
        'image_content_policy',
        `Fal rejected the prompt by content policy: ${detail.slice(0, 200)}`,
      )

    if (response.status === 429 || body?.type === 'concurrent_requests_limit') {
      lastError = 'rate limited'
      await delay(
        Math.min(2000 * 2 ** (attempt - 1), RATE_LIMIT_MAX_BACKOFF_MS),
        undefined,
        { signal: options.signal },
      )
      continue
    }

    if (response.status >= 500) {
      lastError = `status=${response.status}`
      await delay(2000 * attempt, undefined, { signal: options.signal })
      continue
    }

    lastError = `status=${response.status} ${detail.slice(0, 200)}`
  }

  throw new PipelineFailure(
    'image_provider_error',
    `Fal failed after ${MAX_ATTEMPTS} attempts (${lastError})`,
  )
}

// Convención de opción de calidad del catálogo: flux-schnell usa un preset
// de tamaño ("landscape_16_9"); gpt-image-* usa "<W>x<H>_<quality>".
export const DEFAULT_FLUX_SIZE = 'landscape_16_9'
export const DEFAULT_GPT_IMAGE_OPTION = '1920x1080_low'

export function falSceneRequestBody(
  prompt: string,
  model: FalImageModelId,
  qualityOption: string | undefined,
): Record<string, unknown> {
  if (model === 'flux-schnell')
    return {
      prompt,
      image_size: qualityOption?.trim() || DEFAULT_FLUX_SIZE,
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: false,
      output_format: 'jpeg',
    }

  const option = qualityOption?.trim() || DEFAULT_GPT_IMAGE_OPTION
  const [sizePart, qualityPart] = option.split('_')
  const sizeMatch = sizePart.match(/^(\d+)x(\d+)$/)
  const imageSize = sizeMatch
    ? { width: parseInt(sizeMatch[1], 10), height: parseInt(sizeMatch[2], 10) }
    : sizePart
  return {
    prompt,
    image_size: imageSize,
    quality: qualityPart || 'low',
    num_images: 1,
    output_format: 'jpeg',
  }
}
