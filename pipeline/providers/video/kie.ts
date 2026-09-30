import { setTimeout as delay } from 'node:timers/promises'

import { PipelineFailure } from '../../runner/failure.ts'
import {
  GROK_VIDEO_MODEL,
  SEEDANCE_VIDEO_MODEL,
} from '../../types/video-provider.ts'
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

// Kie conserva el mismo transporte y saldo para ambos modelos. La estrategia
// Grok → Seedance vive en el carril; este adaptador hace UN solo POST.
//
// Tres particularidades verificadas en su documentación (2026-09-14):
//  · el cuerpo puede traer el error en `code` CON HTTP 200, así que se mira el
//    código del JSON y no solo el status;
//  · Vimo admite hasta tres referencias para Grok y dos para Seedance;
//    el plan actual usa una escena o una pareja ordenada;
//  · la API de subida de archivos vive en OTRO host (`kieai.redpandaai.co`,
//    según el quickstart de «File Upload API»): en `api.kie.ai` la misma ruta
//    responde 404 — fue el primer fallo real desde la app.
const KIE_BASE_URL = 'https://api.kie.ai/api/v1'
const KIE_UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-base64-upload'
const KIE_UPLOAD_PATH = 'images/vimo'

export const KIE_GROK_MODEL = GROK_VIDEO_MODEL
export const KIE_SEEDANCE_MODEL = SEEDANCE_VIDEO_MODEL
export const KIE_ANIMATION_MODELS = [
  KIE_GROK_MODEL,
  KIE_SEEDANCE_MODEL,
] as const
export type KieAnimationModel = (typeof KIE_ANIMATION_MODELS)[number]

export function isKieAnimationModel(model: string): model is KieAnimationModel {
  return KIE_ANIMATION_MODELS.some((candidate) => candidate === model)
}

const POLL_INTERVAL_MS = 3000
const POLL_REQUEST_TIMEOUT_MS = 20_000
const POLL_RATE_LIMIT_WAIT_MS = 5000
const CREDITS_REQUEST_TIMEOUT_MS = 15_000

interface KieCreateResponse {
  code?: number
  msg?: string
  data?: { taskId?: string }
}

interface KieRecordResponse {
  code?: number
  msg?: string
  data?: {
    state?: string
    resultJson?: string
    failCode?: string | number
    failMsg?: string
    creditsConsumed?: number
  }
}

interface KieUploadResponse {
  code?: number
  msg?: string
  data?: { downloadUrl?: string; fileUrl?: string }
}

// Kie responde 200 con el error adentro: se normaliza a un fallo real.
function assertBodyOk(provider: string, code: number | undefined, msg: string) {
  if (code === undefined || code === 200) return
  if (code === 402)
    throw new PipelineFailure(
      'animation_insufficient_credits',
      `${provider} has no credits left: ${msg}`,
    )
  if (code === 401 || code === 403)
    throw new PipelineFailure(
      'animation_invalid_api_key',
      `${provider} rejected the API key: ${msg}`,
    )
  if (code === 429) throw new PipelineFailure('animation_rate_limited', '3')
  if (code === 422 || code === 400)
    throw new PipelineFailure(
      'animation_invalid_request',
      `${provider}: ${msg}`,
    )
  if (code === 455 || code === 505)
    throw new PipelineFailure(
      'animation_provider_down',
      `${provider} is unavailable: [${code}] ${msg}`,
    )
  throw new PipelineFailure(
    'animation_provider_error',
    `${provider} failed: [${code}] ${msg}`,
  )
}

function resultFrom(
  data: NonNullable<KieRecordResponse['data']>,
): VideoClipResult | null {
  if (!data.resultJson) return null

  try {
    const parsed = JSON.parse(data.resultJson) as { resultUrls?: string[] }
    const url = parsed.resultUrls?.[0]
    if (typeof url !== 'string' || !url.trim()) return null
    return {
      videoUrl: url.trim(),
      creditsConsumed:
        typeof data.creditsConsumed === 'number' &&
        Number.isFinite(data.creditsConsumed) &&
        data.creditsConsumed >= 0
          ? data.creditsConsumed
          : undefined,
    }
  } catch {
    return null
  }
}

async function readRecord(
  taskId: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<KieRecordResponse['data'] | null> {
  const response = await fetch(
    `${KIE_BASE_URL}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { headers: authHeaders(apiKey), signal },
  )
  if (response.status === 404)
    throw new PipelineFailure(
      'animation_task_not_found',
      `Kie task ${taskId} is gone`,
    )
  if (response.status === 429 || response.status >= 500) return null
  if (!response.ok)
    throw requestFailure('Kie', response, await errorBodyText(response))

  const body = (await response.json()) as KieRecordResponse
  if (body.code === 429 || body.code === 408 || (body.code ?? 0) >= 500)
    return null
  assertBodyOk('Kie', body.code, body.msg ?? '')
  return body.data ?? null
}

export function createKieVideoProvider(
  model: KieAnimationModel,
): VideoProvider {
  const isGrok = model === KIE_GROK_MODEL
  return {
    id: 'kie',
    // Política de Vimo; el esquema de Grok admite más referencias.
    maxImages: isGrok ? 3 : 2,
    maxPromptChars: 4000,

    apiKeyOf(apiKeys) {
      return apiKeys.kie
    },

    async uploadImage(localPath, apiKey, signal) {
      const response = await fetch(KIE_UPLOAD_URL, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({
          base64Data: await readImageAsDataUrl(localPath),
          uploadPath: KIE_UPLOAD_PATH,
          fileName: uploadFileName('scene'),
        }),
        signal,
      }).catch((error: unknown) => {
        if (signal.aborted) throw error
        throw new PipelineFailure(
          'animation_network',
          'Kie upload request failed',
        )
      })

      if (!response.ok)
        throw requestFailure('Kie', response, await errorBodyText(response))

      const body = (await response.json()) as KieUploadResponse
      assertBodyOk('Kie', body.code, body.msg ?? '')
      const url = body.data?.downloadUrl ?? body.data?.fileUrl
      if (!url)
        throw new PipelineFailure(
          'animation_upload_failed',
          'Kie upload returned no file url',
        )

      return url
    },

    async createTask(request: VideoClipRequest, apiKey, signal) {
      if (
        !Number.isInteger(request.durationSeconds) ||
        request.durationSeconds < 4 ||
        request.durationSeconds > 12 ||
        !['16:9', '9:16'].includes(request.aspectRatio) ||
        request.imageUrls.length < 1 ||
        request.imageUrls.length > (isGrok ? 3 : 2) ||
        !request.prompt.trim() ||
        request.prompt.length > 4000
      )
        throw new PipelineFailure(
          'animation_invalid_request',
          'Invalid image-to-video parameters',
        )

      const response = await fetch(`${KIE_BASE_URL}/jobs/createTask`, {
        method: 'POST',
        headers: authHeaders(apiKey),
        body: JSON.stringify({
          model,
          input: {
            prompt: request.prompt,
            ...(isGrok
              ? { image_urls: request.imageUrls }
              : { input_urls: request.imageUrls }),
            aspect_ratio: request.aspectRatio,
            resolution: '480p',
            duration: request.durationSeconds,
            // Grok no documenta interruptor de audio. Ambos se limpian en local.
            ...(!isGrok ? { generate_audio: false, fixed_lens: false } : {}),
          },
        }),
        // Sin timeout propio corto: bajo ráfaga el gateway tarda, y cortar un
        // create convierte una tarea en dos tareas cobradas (regla E26/E27).
        signal,
      }).catch((error: unknown) => {
        if (signal.aborted) throw error
        throw new PipelineFailure(
          'animation_submission_unknown',
          'Kie create response was lost; the request may have been accepted',
        )
      })

      if (!response.ok)
        throw requestFailure('Kie', response, await errorBodyText(response))

      const body = (await response.json().catch(() => {
        throw new PipelineFailure(
          'animation_submission_unknown',
          'Kie create returned unreadable JSON',
        )
      })) as KieCreateResponse
      assertBodyOk('Kie', body.code, body.msg ?? '')
      const taskId = body.data?.taskId
      if (!taskId)
        throw new PipelineFailure(
          'animation_submission_unknown',
          'Kie create returned no task id',
        )

      return taskId
    },

    async pollTask(taskId, apiKey, signal, onProgress) {
      const startedAt = Date.now()

      for (;;) {
        await delay(POLL_INTERVAL_MS, undefined, { signal })

        let data: KieRecordResponse['data'] | null
        try {
          data = await readRecord(
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

        if (data.state === 'success') {
          const result = resultFrom(data)
          if (!result)
            throw new PipelineFailure(
              'animation_provider_error',
              'Kie completed without a video url',
            )

          return result
        }
        if (data.state === 'fail')
          taskFailure('Kie', {
            code:
              data.failCode === undefined ? undefined : String(data.failCode),
            message: data.failMsg,
            creditsConsumed: data.creditsConsumed,
          })

        // Seedance no informa porcentaje: solo el estado y el tiempo que lleva.
        onProgress?.({
          status: data.state ?? 'generating',
          elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
        })
      }
    },

    async inspectTask(taskId, apiKey) {
      let data: KieRecordResponse['data'] | null
      try {
        data = await readRecord(
          taskId,
          apiKey,
          AbortSignal.timeout(POLL_REQUEST_TIMEOUT_MS),
        )
      } catch {
        return null
      }
      if (!data) return null

      if (data.state === 'success') {
        const result = resultFrom(data)
        return result ? { result } : null
      }
      if (data.state === 'fail')
        return {
          error: {
            code:
              data.failCode === undefined ? undefined : String(data.failCode),
            message: data.failMsg,
            creditsConsumed: data.creditsConsumed,
          },
        }

      return null
    },

    async credits(apiKey, signal) {
      const response = await fetch(`${KIE_BASE_URL}/chat/credit`, {
        headers: authHeaders(apiKey),
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(CREDITS_REQUEST_TIMEOUT_MS),
        ]),
      }).catch((error: unknown) => {
        if (signal.aborted) throw error
        throw new PipelineFailure(
          'animation_network',
          'Kie credits request failed',
        )
      })
      if (!response.ok)
        throw requestFailure('Kie', response, await errorBodyText(response))

      const body = (await response.json()) as {
        code?: number
        msg?: string
        data?: unknown
      }
      assertBodyOk('Kie', body.code, body.msg ?? '')
      if (typeof body.data !== 'number')
        throw new PipelineFailure(
          'animation_provider_error',
          'Kie credits returned no number',
        )

      return body.data
    },
  }
}

export const kieVideoProvider = createKieVideoProvider(KIE_GROK_MODEL)
