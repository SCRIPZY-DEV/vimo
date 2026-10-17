import { setTimeout as delay } from 'node:timers/promises'

import { PipelineFailure } from '../../runner/failure.ts'
import { VIDEO_MODELS } from '../../types/video-provider.ts'
import type {
  VideoClipRequest,
  VideoClipResult,
  VideoProvider,
} from './types.ts'
import {
  authHeaders,
  errorBodyText,
  readImageAsDataUrl,
  requestFailure,
  taskFailure,
  uploadFileName,
} from './shared.ts'

// Proveedor PoYo con Veo 3.1 Lite (variante «official», la única de esa
// familia que acepta imágenes). Asíncrono, con la misma forma que Kie.
//
// Cuatro particularidades verificadas en su documentación (2026-09-12):
//  · `sound` viene en true por defecto: hay que apagarlo explícitamente o
//    llega un clip con audio que pisaría la narración, y cuesta 67 % más;
//  · con DOS imágenes la duración se fuerza a 8 s, así que acá viaja UNA sola
//    y la segunda escena se describe dentro del prompt;
//  · el modo se infiere de `image_urls` (una imagen = imagen a video); el
//    `generation_type` es opcional y `frame` EXIGE exactamente dos imágenes —
//    mandarlo con una sola fue el primer fallo real desde la app («Frame mode
//    requires exactly 2 images»), así que no viaja;
//  · la subida de imágenes tiene su propio límite, 10 por minuto, más
//    estricto que el de generación.
const POYO_BASE_URL = 'https://api.poyo.ai'

const POLL_INTERVAL_MS = 3000
const POLL_REQUEST_TIMEOUT_MS = 20_000
const POLL_RATE_LIMIT_WAIT_MS = 5000
const CREDITS_REQUEST_TIMEOUT_MS = 15_000

interface PoyoCreateResponse {
  code?: number
  data?: { task_id?: string }
  error?: { message?: string; type?: string }
}

interface PoyoStatusResponse {
  code?: number
  data?: {
    status?: string
    progress?: number
    credits_amount?: number
    files?: { file_url?: string; file_type?: string }[]
    error_message?: string | null
  }
  error?: { message?: string; type?: string }
}

interface PoyoUploadResponse {
  code?: number
  data?: { file_url?: string }
  error?: { message?: string; type?: string }
}

function resultFrom(
  data: NonNullable<PoyoStatusResponse['data']>,
): VideoClipResult | null {
  const video = data.files?.find((file) => file.file_type === 'video')
  const url = video?.file_url ?? data.files?.[0]?.file_url
  if (typeof url !== 'string' || !url.trim()) return null
  return { videoUrl: url.trim(), creditsConsumed: data.credits_amount }
}

async function readStatus(
  taskId: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<PoyoStatusResponse['data'] | null> {
  const response = await fetch(
    `${POYO_BASE_URL}/api/generate/status/${encodeURIComponent(taskId)}`,
    { headers: authHeaders(apiKey), signal },
  )
  if (response.status === 404)
    throw new PipelineFailure(
      'animation_task_not_found',
      `PoYo task ${taskId} is gone`,
    )
  if (response.status === 429 || response.status >= 500) return null
  if (!response.ok)
    throw requestFailure('PoYo', response, await errorBodyText(response))

  const body = (await response.json()) as PoyoStatusResponse
  return body.data ?? null
}

export const poyoVideoProvider: VideoProvider = {
  id: 'poyo',
  // Veo Lite acepta dos, pero con dos la duración salta a 8 s y acá los clips
  // miden 6: viaja solo la primera escena.
  maxImages: 1,
  // PoYo mata la tarea ya aceptada si el prompt pasa de 1.000 caracteres
  // («The prompt is too long. Please shorten it to 1,000 characters or
  // fewer», visto el 2026-09-12); 900 deja margen para no rozar el tope.
  maxPromptChars: 900,

  apiKeyOf(apiKeys) {
    return apiKeys.poyo
  },

  async uploadImage(localPath, apiKey, signal) {
    const response = await fetch(`${POYO_BASE_URL}/api/common/upload/base64`, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        base64_data: await readImageAsDataUrl(localPath),
        file_name: uploadFileName('scene'),
      }),
      signal,
    }).catch((error: unknown) => {
      if (signal.aborted) throw error
      throw new PipelineFailure(
        'animation_network',
        'PoYo upload request failed',
      )
    })

    if (!response.ok)
      throw requestFailure('PoYo', response, await errorBodyText(response))

    const body = (await response.json()) as PoyoUploadResponse
    const url = body.data?.file_url
    if (!url)
      throw new PipelineFailure(
        'animation_upload_failed',
        `PoYo upload returned no file url: ${body.error?.message ?? ''}`,
      )

    return url
  },

  async createTask(request: VideoClipRequest, apiKey, signal) {
    const response = await fetch(`${POYO_BASE_URL}/api/generate/submit`, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        model: VIDEO_MODELS.poyo,
        input: {
          prompt: request.prompt,
          // Sin `generation_type`: con una imagen PoYo hace imagen a video.
          image_urls: request.imageUrls,
          duration: request.durationSeconds,
          aspect_ratio: request.aspectRatio,
          // PoYo solo sirve para leer proyectos históricos: ignora
          // `request.resolution` y mantiene el 720p con el que siempre se pidió.
          resolution: '720p',
          // Sin esto Veo genera su propio audio: más caro y pisaría la voz.
          sound: false,
        },
      }),
      signal,
    }).catch((error: unknown) => {
      if (signal.aborted) throw error
      throw new PipelineFailure(
        'animation_network',
        'PoYo create request failed',
      )
    })

    if (!response.ok)
      throw requestFailure('PoYo', response, await errorBodyText(response))

    const body = (await response.json()) as PoyoCreateResponse
    const taskId = body.data?.task_id
    if (!taskId)
      throw new PipelineFailure(
        'animation_provider_error',
        `PoYo create returned no task id: ${body.error?.message ?? ''}`,
      )

    return taskId
  },

  async pollTask(taskId, apiKey, signal, onProgress) {
    const startedAt = Date.now()

    for (;;) {
      await delay(POLL_INTERVAL_MS, undefined, { signal })

      let data: PoyoStatusResponse['data'] | null
      try {
        data = await readStatus(
          taskId,
          apiKey,
          AbortSignal.any([
            signal,
            AbortSignal.timeout(POLL_REQUEST_TIMEOUT_MS),
          ]),
        )
      } catch (error) {
        if (signal.aborted) throw error
        if (error instanceof PipelineFailure) throw error
        await delay(POLL_RATE_LIMIT_WAIT_MS, undefined, { signal })
        continue
      }
      if (!data) continue

      if (data.status === 'finished') {
        const result = resultFrom(data)
        if (!result)
          throw new PipelineFailure(
            'animation_provider_error',
            'PoYo finished without a video url',
          )

        return result
      }
      if (data.status === 'failed')
        taskFailure('PoYo', { message: data.error_message ?? undefined })

      onProgress?.({
        percent: data.progress,
        status: data.status ?? 'running',
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
      })
    }
  },

  async inspectTask(taskId, apiKey) {
    let data: PoyoStatusResponse['data'] | null
    try {
      data = await readStatus(
        taskId,
        apiKey,
        AbortSignal.timeout(POLL_REQUEST_TIMEOUT_MS),
      )
    } catch {
      return null
    }
    if (!data) return null

    if (data.status === 'finished') {
      const result = resultFrom(data)
      return result ? { result } : null
    }
    if (data.status === 'failed')
      return { error: { message: data.error_message ?? undefined } }

    return null
  },

  async credits(apiKey, signal) {
    const response = await fetch(`${POYO_BASE_URL}/api/user/balance`, {
      headers: authHeaders(apiKey),
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(CREDITS_REQUEST_TIMEOUT_MS),
      ]),
    }).catch((error: unknown) => {
      if (signal.aborted) throw error
      throw new PipelineFailure(
        'animation_network',
        'PoYo credits request failed',
      )
    })
    if (!response.ok)
      throw requestFailure('PoYo', response, await errorBodyText(response))

    const body = (await response.json()) as {
      data?: { credits_amount?: number }
      error?: { message?: string }
    }
    const amount = body.data?.credits_amount
    if (typeof amount !== 'number')
      throw new PipelineFailure(
        'animation_provider_error',
        `PoYo balance returned no number: ${body.error?.message ?? ''}`,
      )

    return amount
  },
}
