import {
  buildCustomStyleReferencePromptMulti,
  buildReferenceIdentityLineMulti,
} from '../../prompts/character-reference.ts'
import { sceneImageFile } from '../../project/paths.ts'
import {
  FAL_BASE_URL,
  FAL_CONTENT_POLICY_PATTERN,
  FAL_EDIT_ENDPOINT,
  FAL_EXPECTED_MS,
  falErrorText,
  readFalErrorBody,
} from '../../providers/image/fal.ts'
import { uploadEvolinkReference } from '../../providers/image/evolink.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { FalImageResponse } from '../../types/images.ts'
import type { Scene } from '../../types/scenes.ts'
import { frameSizeFor, type VideoFormat } from '../../types/video-format.ts'
import { limitConcurrency } from '../../utils/concurrency.ts'
import {
  isInsufficientCreditsFailure,
  isInsufficientCreditsResponse,
} from '../../utils/insufficient-credits.ts'
import {
  reportFromFailure,
  type ProviderFailureReport,
} from '../../utils/provider-failure.ts'
import { startSimulatedProgress } from '../../utils/simulated-progress.ts'
import { sleep } from '../../utils/sleep.ts'
import { isImageAccountFailure, resolveAuthRejection } from './account-probe.ts'
import { generateSceneWithEvolink } from './evolink-lane.ts'
import {
  cachedImagePath,
  saveImageToFile,
  sceneHasUsablePrompt,
  type ImageLaneOptions,
  type LaneResult,
} from './lane.ts'

// Carril CON referencia de personaje (port de personaje_fal.ts y
// personaje_evolink.ts): la referencia fija la identidad, el prompt de la
// escena fija pose/ropa/fondo. A prueba de fallos: una escena que no sale
// con referencia vuelve SIN imagen para que el dispatcher la mande al carril
// normal — nunca queda en blanco. Calidad fija "low": la consistencia de la
// cara la da la referencia, no la resolución (decisión del origen).

export interface CharacterReference {
  name: string
  imageDataUri: string
}

// El texto que acompaña a las referencias. Catálogo: la línea de identidad
// (una o dos personas, con el formato) DELANTE del prompt de la escena.
// Estilo propio: REFERENCE + escena + APPEARANCE LOCK, con todas las
// referencias nombradas y protegidas.
function referencePromptFor(
  references: CharacterReference[],
  format: VideoFormat,
  customStyle: boolean,
): (scenePrompt: string) => string {
  const names = references.map((reference) => reference.name)
  if (customStyle)
    return (scenePrompt) =>
      buildCustomStyleReferencePromptMulti(names, scenePrompt)

  const identityLine = buildReferenceIdentityLineMulti(names, format)
  return (scenePrompt) => identityLine + scenePrompt
}

const FAL_EDIT_URL = `${FAL_BASE_URL}/${FAL_EDIT_ENDPOINT}`
const FAL_MAX_ATTEMPTS = 3
const FAL_REQUEST_TIMEOUT_MS = 180_000
const CHARACTER_QUALITY = 'low'
// Mismo cupo que el carril normal; los 429 los absorbe el backoff.
const FAL_CHARACTER_CONCURRENCY = 10
const EVOLINK_CHARACTER_CONCURRENCY = 50
// Id del proveedor en los fallos del carril Fal/edit (ADR-0038); el carril
// Evolink delega en evolink-lane, que pone el suyo.
const FAL_FAILURE_PROVIDER = 'fal'

// Un intento del carril Fal/edit al log de diagnóstico. Salvo los fallos de
// cuenta, este carril siempre se recupera: la escena cae al carril normal.
function reportFalAttempt(
  options: ImageLaneOptions,
  sceneId: number,
  attempt: number,
  failure: Pick<ProviderFailureReport, 'code' | 'httpStatus' | 'detail'>,
): void {
  options.events.onProviderFailure({
    provider: FAL_FAILURE_PROVIDER,
    ...failure,
    sceneId,
    attempt,
    maxAttempts: FAL_MAX_ATTEMPTS,
    recovered: true,
  })
}

async function generateSceneWithFalEdit(
  scene: Scene,
  references: CharacterReference[],
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
  // Sin prompt válido lo resuelve el carril normal (sin marcar error).
  if (!sceneHasUsablePrompt(scene)) return { scene, imageReady: false }
  if (options.signal.aborted) return { scene, imageReady: false }

  const prompt = referencePromptFor(
    references,
    format,
    options.customStyle,
  )(scene.imagePrompt!)

  // El reloj de la estimación arranca UNA vez por escena: un reintento sigue
  // subiendo desde donde iba en vez de volver a 0 (avance monótono).
  const startedAt = Date.now()
  for (let attempt = 1; attempt <= FAL_MAX_ATTEMPTS; attempt++) {
    // Fal no expone progreso: mismo ramp simulado que el carril normal.
    const stopProgress = startSimulatedProgress(
      startedAt,
      FAL_EXPECTED_MS,
      (percent) => options.events.onProgress(scene.id, percent, 'processing'),
    )

    try {
      options.events.onStarted(scene.id, attempt)
      const response = await fetch(FAL_EDIT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          image_urls: references.map((reference) => reference.imageDataUri),
          // El frame del proyecto, mismo aspect que las imágenes normales.
          image_size: frameSizeFor(format),
          quality: CHARACTER_QUALITY,
          num_images: 1,
          output_format: 'jpeg',
        }),
        signal: AbortSignal.any([
          options.signal,
          AbortSignal.timeout(FAL_REQUEST_TIMEOUT_MS),
        ]),
      })

      if (response.ok) {
        const data = (await response.json()) as FalImageResponse
        const url = data.images?.[0]?.url
        if (!url) {
          reportFalAttempt(options, scene.id, attempt, {
            code: 'image_provider_error',
            httpStatus: response.status,
            detail: '200 without an image URL',
          })
          if (attempt === FAL_MAX_ATTEMPTS) return { scene, imageReady: false }
          await sleep(2000 * attempt, options.signal)
          continue
        }
        await saveImageToFile(url, imagePath, options.signal)
        options.events.onProgress(scene.id, 100, 'completed')
        options.events.onReady(scene.id, imagePath)
        return {
          scene: { ...scene, imageModel: 'gpt-image-2-edit' },
          imageReady: true,
        }
      }

      const body = await readFalErrorBody(response)
      const errorType = typeof body?.type === 'string' ? body.type : ''
      const signalText = `${errorType} ${falErrorText(body)}`.toLowerCase()

      // Saldo agotado: corta la fase entera (ADR-0031), no cae al carril
      // normal — ahí fallaría igual y gastaría intentos.
      if (isInsufficientCreditsResponse(response.status, signalText))
        throw new PipelineFailure(
          'image_insufficient_credits',
          `Fal rejected scene ${scene.id} (references) for insufficient balance (status=${response.status}) ${signalText}`,
          { provider: FAL_FAILURE_PROVIDER, httpStatus: response.status },
        )

      // 401/403: la cuenta, no la escena. Sin esto se gastaban los intentos
      // y la escena «caía» al carril normal, donde el rechazo se repetía.
      if (response.status === 401 || response.status === 403)
        throw await resolveAuthRejection({
          probe: options.accountProbe,
          provider: 'fal',
          apiKey,
          status: response.status,
          detail: signalText,
        })

      if (
        response.status === 429 ||
        errorType === 'concurrent_requests_limit'
      ) {
        reportFalAttempt(options, scene.id, attempt, {
          code: 'image_rate_limited',
          httpStatus: response.status,
          detail: `status=${response.status} ${signalText}`,
        })
        await sleep(Math.min(2000 * 2 ** (attempt - 1), 20_000), options.signal)
        continue
      }

      // Content policy (400 o 422): el mismo prompt falla igual → cae al
      // carril normal con prompt sanitizado en la pasada de recuperación.
      const isSafety =
        (response.status === 400 || response.status === 422) &&
        FAL_CONTENT_POLICY_PATTERN.test(signalText)
      reportFalAttempt(options, scene.id, attempt, {
        code: isSafety ? 'image_content_policy' : 'image_provider_error',
        httpStatus: response.status,
        detail: `status=${response.status} ${signalText}`,
      })
      if (isSafety)
        return { scene: { ...scene, contentRejected: true }, imageReady: false }

      if (attempt === FAL_MAX_ATTEMPTS) return { scene, imageReady: false }
      await sleep(2000 * attempt, options.signal)
    } catch (error) {
      if (options.signal.aborted) return { scene, imageReady: false }
      const abortsPhase =
        isInsufficientCreditsFailure(error) || isImageAccountFailure(error)
      if (error instanceof PipelineFailure)
        options.events.onProviderFailure(
          reportFromFailure(error, {
            sceneId: scene.id,
            attempt,
            maxAttempts: FAL_MAX_ATTEMPTS,
            recovered: !abortsPhase,
          }),
        )
      if (abortsPhase) throw error
      if (attempt === FAL_MAX_ATTEMPTS) return { scene, imageReady: false }
      await sleep(2000 * attempt, options.signal)
    } finally {
      stopProgress()
    }
  }
  return { scene, imageReady: false }
}

// Carril de personaje por Fal: gpt-image-2/edit con las fotos en base64.
export async function generateScenesWithFalReferences(
  scenes: Scene[],
  references: CharacterReference[],
  apiKey: string,
  format: VideoFormat,
  options: ImageLaneOptions,
): Promise<LaneResult[]> {
  if (scenes.length === 0) return []
  const limit = limitConcurrency(FAL_CHARACTER_CONCURRENCY)
  return Promise.all(
    scenes.map((scene) =>
      limit(() =>
        generateSceneWithFalEdit(scene, references, apiKey, format, options),
      ),
    ),
  )
}

// Carril de personaje por Evolink: sube cada referencia UNA vez a la
// file-API y reusa la misma máquina (con guard de créditos) del carril
// normal pasando las URLs en `image_urls`. Si alguna subida falla, todo el
// grupo cae al carril normal.
export async function generateScenesWithEvolinkReferences(
  scenes: Scene[],
  references: CharacterReference[],
  apiKey: string,
  format: VideoFormat,
  options: ImageLaneOptions,
): Promise<LaneResult[]> {
  if (scenes.length === 0) return []

  const referenceUrls: string[] = []
  for (const reference of references) {
    const url = await uploadEvolinkReference(reference.imageDataUri, apiKey)
    if (!url) return scenes.map((scene) => ({ scene, imageReady: false }))
    referenceUrls.push(url)
  }

  const referencePrompt = referencePromptFor(
    references,
    format,
    options.customStyle,
  )
  const limit = limitConcurrency(EVOLINK_CHARACTER_CONCURRENCY)
  return Promise.all(
    scenes.map((scene) =>
      limit(() =>
        generateSceneWithEvolink(
          scene,
          {
            qualityOption: CHARACTER_QUALITY,
            apiKey,
            format,
            referenceUrls,
            referencePrompt,
          },
          options,
        ),
      ),
    ),
  )
}
