import { setTimeout as delay } from 'node:timers/promises'

import { PipelineFailure } from '../../runner/failure.ts'
import { isInsufficientCreditsResponse } from '../../utils/insufficient-credits.ts'
import {
  DEFAULT_VIDEO_FORMAT,
  type VideoFormat,
} from '../../types/video-format.ts'
import type {
  DecodedImage,
  FalErrorResponse,
  FalImageResponse,
  GenerateImageOptions,
} from '../../types/images.ts'
import { startSimulatedProgress } from '../../utils/simulated-progress.ts'
import { downloadImage } from './download.ts'

// Provider Fal (síncrono: el POST devuelve la imagen ya generada). Port
// acotado de fal_provider.ts a UNA imagen — la generación por escenas, con
// caché por archivo y semáforos, llega con la stage `images` de Create.
export const FAL_BASE_URL = 'https://fal.run'

// Cuánto tarda una imagen de Fal en el caso típico. Fal no informa avance: el
// porcentaje que ve la persona es un ramp simulado que llega al techo en este
// tiempo y ahí espera a la imagen real. Lo comparten las lanes del pipeline,
// las muestras de estilo y el preview de personaje (pedido del 2026-09-10:
// 40 s — con 18-22 s subía demasiado rápido y después se clavaba).
export const FAL_EXPECTED_MS = 40_000

// El billing vive en otro host que la generación.
const FAL_BILLING_URL = 'https://api.fal.ai/v1/account/billing?expand=credits'
const BILLING_TIMEOUT_MS = 30_000

export interface FalCredits {
  remaining: number | null
  currency: string
}

// Saldo de la cuenta Fal (editor de Library). Requiere una key tipo ADMIN:
// una key normal genera imágenes pero el billing devuelve 401/403 — código
// propio para que la UI lo explique (port de /credito-fal del origen).
export async function getFalCredits(
  apiKey: string,
  signal?: AbortSignal,
): Promise<FalCredits> {
  const timeout = AbortSignal.timeout(BILLING_TIMEOUT_MS)
  const response = await fetch(FAL_BILLING_URL, {
    headers: { Authorization: `Key ${apiKey}` },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch((error: unknown) => {
    if (signal?.aborted) throw error
    throw new PipelineFailure('image_network', 'Fal billing request failed')
  })

  if (response.status === 401 || response.status === 403)
    throw new PipelineFailure(
      'fal_admin_key_required',
      `Fal billing rejected the key (status=${response.status})`,
    )
  if (!response.ok)
    throw new PipelineFailure(
      'image_provider_error',
      `Fal billing HTTP ${response.status}`,
    )

  const data = (await response.json()) as {
    credits?: { current_balance?: number; currency?: string }
  }
  const balance = data.credits?.current_balance
  return {
    remaining: typeof balance === 'number' ? balance : null,
    currency: data.credits?.currency ?? 'USD',
  }
}

// Único modelo de Fal que se usa (ADR-0015).
export const FAL_IMAGE_ENDPOINT = 'fal-ai/gpt-image-2'

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

function requestBody(prompt: string): string {
  // Siempre la opción más barata: un preview no necesita resolución de render.
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
  options: GenerateImageOptions,
): Promise<DecodedImage> {
  const deadline = AbortSignal.timeout(ORDER_DEADLINE_MS)
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadline])
    : deadline
  let lastError = 'unknown'
  // Mientras el encargo está en vuelo se estima el avance con el mismo ramp
  // que las lanes del pipeline. El reloj arranca UNA vez por encargo: un
  // reintento sigue subiendo en vez de volver a 0.
  const startedAt = Date.now()
  const stopProgress = startSimulatedProgress(
    startedAt,
    FAL_EXPECTED_MS,
    (percent) => reportProgress(options, startedAt, percent, 'processing'),
  )

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let response: Response
      try {
        response = await fetch(`${FAL_BASE_URL}/${FAL_IMAGE_ENDPOINT}`, {
          method: 'POST',
          headers: {
            Authorization: `Key ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: requestBody(prompt),
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

        const image = await downloadImage(url, options.signal)
        reportProgress(options, startedAt, 100, 'completed')
        return image
      }

      const body = await readFalErrorBody(response)
      const detail = falErrorText(body)

      // Saldo agotado antes que la clave: Fal puede responder 403 con detalle
      // de balance, y reintentar solo repetiría el rechazo (ADR-0031).
      if (isInsufficientCreditsResponse(response.status, detail))
        throw new PipelineFailure(
          'image_insufficient_credits',
          `Fal rejected the request for insufficient balance (status=${response.status}) ${detail.slice(0, 200)}`,
        )

      if (response.status === 401 || response.status === 403)
        throw new PipelineFailure(
          'image_invalid_api_key',
          `Fal rejected the API key (status=${response.status})`,
        )

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

      if (
        response.status === 429 ||
        body?.type === 'concurrent_requests_limit'
      ) {
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
  } finally {
    stopProgress()
  }
}

function reportProgress(
  options: GenerateImageOptions,
  startedAt: number,
  percent: number,
  status: string,
): void {
  options.onProgress?.({
    percent,
    status,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  })
}

// Convención de opción de calidad del catálogo: "<W>x<H>_<quality>".
export const DEFAULT_GPT_IMAGE_OPTION = '1920x1080_low'
export const DEFAULT_GPT_IMAGE_VERTICAL_OPTION = '1080x1920_low'
const QUALITY_OPTION_PATTERN = /^(\d+)x(\d+)_(\w+)$/

export function defaultOptionForFormat(format: VideoFormat): string {
  if (format === '9:16') return DEFAULT_GPT_IMAGE_VERTICAL_OPTION
  return DEFAULT_GPT_IMAGE_OPTION
}

// Corrección conservadora (port de opcionParaFormato del origen): identidad
// total con 16:9; con 9:16, una opción horizontal colada (escena persistida
// antes del selector, o elegida a mano) pasa a la familia vertical
// CONSERVANDO el tier _low/_medium/_high. Una opción fuera de convención se
// devuelve tal cual: el fallback de falSceneRequestBody la resuelve.
export function qualityOptionForFormat(
  option: string,
  format: VideoFormat,
): string {
  if (format !== '9:16') return option
  const match = option.match(QUALITY_OPTION_PATTERN)
  if (!match) return option
  const isVertical = parseInt(match[2], 10) > parseInt(match[1], 10)
  if (isVertical) return option
  return `1080x1920_${match[3]}`
}

// Una opción que no siga la convención (p. ej. el preset "landscape_16_9" de
// escenas generadas con el modelo retirado, ADR-0015) cae a la default del
// formato.
export function falSceneRequestBody(
  prompt: string,
  qualityOption: string | undefined,
  format: VideoFormat = DEFAULT_VIDEO_FORMAT,
): Record<string, unknown> {
  const chosen = qualityOption?.trim() || defaultOptionForFormat(format)
  const option = qualityOptionForFormat(chosen, format)
  const match =
    option.match(QUALITY_OPTION_PATTERN) ??
    defaultOptionForFormat(format).match(QUALITY_OPTION_PATTERN)!
  return {
    prompt,
    image_size: {
      width: parseInt(match[1], 10),
      height: parseInt(match[2], 10),
    },
    quality: match[3],
    num_images: 1,
    output_format: 'jpeg',
  }
}
