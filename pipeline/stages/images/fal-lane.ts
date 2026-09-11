import { sceneImageFile } from '../../project/paths.ts'
import {
  FAL_BASE_URL,
  FAL_CONTENT_POLICY_PATTERN,
  FAL_IMAGE_ENDPOINT,
  falErrorText,
  falSceneRequestBody,
  readFalErrorBody,
} from '../../providers/image/fal.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import {
  isInsufficientCreditsFailure,
  isInsufficientCreditsResponse,
} from '../../utils/insufficient-credits.ts'
import { sleep } from '../../utils/sleep.ts'
import { IMAGE_MODEL } from '../../types/image-provider.ts'
import type { FalImageResponse } from '../../types/images.ts'
import type { Scene } from '../../types/scenes.ts'
import type { VideoFormat } from '../../types/video-format.ts'
import {
  cachedImagePath,
  saveImageToFile,
  sceneHasUsablePrompt,
  type ImageLane,
  type ImageLaneOptions,
  type LaneResult,
} from './lane.ts'

// Carril normal Fal (port de fal_provider.ts): síncrono — el POST devuelve la
// imagen generada. Sin timeouts cortos propios (Fal cobra al generar): solo
// el plazo largo del encargo y la cancelación. Un rechazo por safety NO se
// reintenta (el mismo prompt falla igual): la escena sale marcada
// contentRejected y la pasada de recuperación reescribe el prompt.

const MAX_ATTEMPTS = 5
const ORDER_DEADLINE_MS = 210_000
const RATE_LIMIT_MAX_BACKOFF_MS = 30_000
const PROGRESS_TICK_MS = 500
// Fal no expone progreso: estimación honesta elapsed/expected (cap 95%).
const EXPECTED_MS = 18_000

export async function generateSceneWithFal(
  scene: Scene,
  qualityOption: string | undefined,
  apiKey: string,
  format: VideoFormat,
  options: ImageLaneOptions,
): Promise<LaneResult> {
  const imagePath = sceneImageFile(options.paths, scene.id)

  const cached = await cachedImagePath(scene, options)
  if (cached) {
    options.events.onReady(scene.id, cached)
    return { scene, imageReady: true }
  }

  // Cancelación cooperativa: las escenas pendientes no gastan créditos.
  if (options.signal.aborted) return { scene, imageReady: false }

  if (!sceneHasUsablePrompt(scene)) {
    options.events.onFailed(scene.id, 'image_missing_prompt')
    return { scene, imageReady: false }
  }

  // El reloj de la estimación arranca UNA vez por escena: un reintento sigue
  // subiendo desde donde iba en vez de volver a 0 (avance monótono).
  const startedAt = Date.now()
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const progressTimer = setInterval(() => {
      const percent = Math.min(
        95,
        Math.floor(((Date.now() - startedAt) / EXPECTED_MS) * 100),
      )
      options.events.onProgress(scene.id, percent, 'processing')
    }, PROGRESS_TICK_MS)

    const deadline = AbortSignal.timeout(ORDER_DEADLINE_MS)
    try {
      options.events.onStarted(scene.id, attempt)

      let response: Response
      try {
        response = await fetch(`${FAL_BASE_URL}/${FAL_IMAGE_ENDPOINT}`, {
          method: 'POST',
          headers: {
            Authorization: `Key ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            falSceneRequestBody(scene.imagePrompt!, qualityOption, format),
          ),
          signal: AbortSignal.any([options.signal, deadline]),
        })
      } catch (error) {
        if (options.signal.aborted) return { scene, imageReady: false }
        if (deadline.aborted)
          throw new PipelineFailure('image_timeout', 'order deadline')
        throw new PipelineFailure('image_network', String(error))
      }

      if (response.ok) {
        const data = (await response.json()) as FalImageResponse
        const url = data.images?.[0]?.url
        // 200 sin URL: transitorio (cuota momentánea) → reintentar, sin
        // tocar el % (nunca se informa un retroceso).
        if (!url) {
          if (attempt === MAX_ATTEMPTS) {
            options.events.onFailed(
              scene.id,
              'image_provider_error',
              '200 without an image URL',
            )
            return { scene, imageReady: false }
          }
          await sleep(2000 * attempt, options.signal)
          continue
        }

        await saveImageToFile(url, imagePath, options.signal)
        options.events.onProgress(scene.id, 100, 'completed')
        options.events.onReady(scene.id, imagePath)
        // Modelo y opción quedan en la escena para que una regeneración
        // futura recuerde la elección.
        return {
          scene: {
            ...scene,
            imageModel: IMAGE_MODEL,
            imageQuality: qualityOption,
          },
          imageReady: true,
        }
      }

      const body = await readFalErrorBody(response)
      const detail = falErrorText(body)
      const errorType = typeof body?.type === 'string' ? body.type : ''

      // Saldo agotado: no es un fallo de ESTA escena sino de la cuenta. Se
      // lanza (no se marca y sigue) para que la fase entera corte y el
      // proyecto quede pausado y retomable (ADR-0029).
      if (isInsufficientCreditsResponse(response.status, detail))
        throw new PipelineFailure(
          'image_insufficient_credits',
          `Fal rejected scene ${scene.id} for insufficient balance (status=${response.status}) ${detail}`,
        )

      if (response.status === 401 || response.status === 403) {
        options.events.onFailed(
          scene.id,
          'image_invalid_api_key',
          `status=${response.status}`,
        )
        return { scene, imageReady: false }
      }

      if (
        response.status === 429 ||
        errorType === 'concurrent_requests_limit'
      ) {
        await sleep(
          Math.min(2000 * 2 ** (attempt - 1), RATE_LIMIT_MAX_BACKOFF_MS),
          options.signal,
        )
        continue
      }

      const isSafetyViolation =
        (response.status === 400 || response.status === 422) &&
        (errorType === 'content_policy_violation' ||
          FAL_CONTENT_POLICY_PATTERN.test(detail))
      if (isSafetyViolation) {
        options.events.onFailed(
          scene.id,
          'image_content_policy',
          `status=${response.status} ${detail}`,
        )
        return { scene: { ...scene, contentRejected: true }, imageReady: false }
      }

      if (response.status >= 500) {
        await sleep(2000 * attempt, options.signal)
        continue
      }

      if (attempt === MAX_ATTEMPTS) {
        options.events.onFailed(
          scene.id,
          'image_provider_error',
          `status=${response.status} ${detail}`,
        )
        return { scene, imageReady: false }
      }
      await sleep(2000, options.signal)
    } catch (error) {
      if (options.signal.aborted) return { scene, imageReady: false }
      if (isInsufficientCreditsFailure(error)) throw error
      // Descarga fallida u otro transitorio: reintentar; agotado → error.
      if (attempt === MAX_ATTEMPTS) {
        const code =
          error instanceof PipelineFailure ? error.code : 'image_provider_error'
        options.events.onFailed(
          scene.id,
          code,
          error instanceof Error ? error.message : String(error),
        )
        return { scene, imageReady: false }
      }
      await sleep(2000, options.signal)
    } finally {
      clearInterval(progressTimer)
    }
  }

  options.events.onFailed(
    scene.id,
    'image_attempts_exhausted',
    `${MAX_ATTEMPTS} attempts without a result`,
  )
  return { scene, imageReady: false }
}

export const falImageLane: ImageLane = {
  id: 'fal',
  concurrency: 10,
  apiKeyOf(apiKeys) {
    return apiKeys.fal
  },
  generateScene(scene, inputs, options) {
    return generateSceneWithFal(
      scene,
      inputs.qualityOption,
      inputs.apiKey,
      inputs.format,
      options,
    )
  },
}
