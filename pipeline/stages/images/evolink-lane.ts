import { sceneImageFile } from '../../project/paths.ts'
import {
  RETRYABLE_TASK_ERRORS,
  RetryableOrderError,
  createEvolinkImageTask,
  evolinkQualityFromOption,
  inspectTask,
  isContentPolicy,
  pollTask,
  startOrderDeadline,
} from '../../providers/image/evolink.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import {
  isInsufficientCreditsFailure,
  isInsufficientTaskError,
} from '../../utils/insufficient-credits.ts'
import { sleep } from '../../utils/sleep.ts'
import type { Scene } from '../../types/scenes.ts'
import type { VideoFormat } from '../../types/video-format.ts'
import {
  cachedImagePath,
  hashImageRequest,
  saveImageToFile,
  sceneHasUsablePrompt,
  type ImageLane,
  type ImageLaneOptions,
  type LaneResult,
} from './lane.ts'

// Carril Evolink por escena (port de generarImagenConRetry de
// evolink_provider.ts) con el GUARD DE CRÉDITOS E26/E27 del origen: una tarea
// creada es PLATA del usuario (Evolink cobra al completarla, se descargue o
// no). Reglas:
//   1. El taskId viaja en la escena (`imageTask`) y se PERSISTE: todo
//      reintento consulta la tarea existente ANTES de crear otra.
//   2. Un fallo de DESCARGA jamás crea tarea: la imagen ya existe.
//   3. Solo se crea tarea nueva si la anterior FALLÓ del lado del servidor,
//      expiró (404), o si el pedido cambió (hash distinto).
//   4. Sin timeouts propios: el ÚNICO corte es el plazo largo por encargo y,
//      al vencer, una VERIFICACIÓN FINAL antes de re-encargar.

const MAX_ORDERS = 3
const IMAGE_MODEL = 'gpt-image-2'

export interface EvolinkLaneInputs {
  qualityOption: string | undefined
  apiKey: string
  // Forma en que Evolink genera (el endpoint la recibe como `size`).
  format: VideoFormat
  // URLs públicas de referencia (carril de personaje); vacío en el normal.
  referenceUrls?: string[]
  // Prefijo del prompt (línea de identidad del carril de personaje).
  promptPrefix?: string
}

function reusableTaskId(scene: Scene, currentHash: string): string | null {
  const task = scene.imageTask
  if (!task || task.provider !== 'evolink') return null
  if (task.hash !== currentHash) return null
  return task.taskId || null
}

export async function generateSceneWithEvolink(
  scene: Scene,
  inputs: EvolinkLaneInputs,
  options: ImageLaneOptions,
): Promise<LaneResult> {
  const imagePath = sceneImageFile(options.paths, scene.id)

  const cached = await cachedImagePath(scene, options)
  if (cached) {
    options.events.onReady(scene.id, cached)
    return { scene, imageReady: true }
  }
  if (options.signal.aborted) return { scene, imageReady: false }
  if (!sceneHasUsablePrompt(scene)) {
    options.events.onFailed(scene.id, 'image_missing_prompt')
    return { scene, imageReady: false }
  }

  const quality = evolinkQualityFromOption(inputs.qualityOption)
  const prompt = `${inputs.promptPrefix ?? ''}${scene.imagePrompt!}`
  // El formato NO entra al hash de la tarea (doctrina E26/E27 del origen):
  // agregarlo invalidaría tareas ya pagadas, y una tarea vive en SU escena de
  // SU proyecto, cuyo formato jamás cambia.
  const body: Record<string, unknown> = {
    model: IMAGE_MODEL,
    prompt,
    size: inputs.format,
    resolution: '1K',
    quality,
    n: 1,
  }
  if (inputs.referenceUrls?.length) body.image_urls = inputs.referenceUrls

  const hash = hashImageRequest({
    model: IMAGE_MODEL,
    prompt,
    quality,
    refs: inputs.referenceUrls,
  })

  // Máquina de reuso: `activeTask` sobrevive a los reintentos y solo se anula
  // cuando la tarea murió del lado del servidor. `lastLiveTask` recuerda la
  // última tarea VIVA aunque el plazo la haya abandonado: se persiste igual y
  // la próxima pasada la cosecha gratis si terminó.
  let activeTask: string | null = options.explicitNewImage.has(scene.id)
    ? null
    : reusableTaskId(scene, hash)
  let lastLiveTask: string | null = activeTask

  const withPendingTask = (): Scene => {
    const taskId = activeTask ?? lastLiveTask
    return taskId
      ? { ...scene, imageTask: { provider: 'evolink', taskId, hash } }
      : scene
  }
  const harvested = (): Scene => ({ ...scene, imageTask: undefined })

  for (let attempt = 1; attempt <= MAX_ORDERS; attempt++) {
    const order = startOrderDeadline(options.signal)
    try {
      options.events.onStarted(scene.id, attempt)

      if (!activeTask) {
        activeTask = await createEvolinkImageTask(
          body,
          inputs.apiKey,
          order.signal,
        )
        lastLiveTask = activeTask
      }

      const url = await pollTask(activeTask, inputs.apiKey, order, {
        apiKey: inputs.apiKey,
        signal: order.signal,
        onProgress: (progress) =>
          options.events.onProgress(
            scene.id,
            progress.percent,
            progress.status,
          ),
      })

      try {
        await saveImageToFile(url, imagePath, options.signal)
      } catch {
        if (options.signal.aborted)
          return { scene: withPendingTask(), imageReady: false }
        // La tarea se completó (COBRADA) pero la descarga no: se persiste la
        // tarea y se sale — crear otra sería pagar dos veces.
        options.events.onFailed(
          scene.id,
          'image_download_failed',
          'task completed but the image download failed',
        )
        return { scene: withPendingTask(), imageReady: false }
      }

      options.events.onReady(scene.id, imagePath)
      return { scene: harvested(), imageReady: true }
    } catch (error) {
      // Cancelar del usuario: salir en silencio; la tarea en curso queda
      // persistida (cancelar no la des-factura: al retomar se cosecha).
      if (options.signal.aborted)
        return { scene: withPendingTask(), imageReady: false }
      // Saldo agotado: no es de esta escena sino de la cuenta — corta la
      // fase entera; el proyecto queda pausado y retomable (ADR-0029).
      if (isInsufficientCreditsFailure(error)) throw error

      // Plazo del encargo vencido: verificación FINAL antes de re-encargar.
      if (order.expired()) {
        if (activeTask) {
          const final = await inspectTask(activeTask, inputs.apiKey)
          if (final?.url) {
            try {
              await saveImageToFile(final.url, imagePath, options.signal)
              options.events.onReady(scene.id, imagePath)
              return { scene: harvested(), imageReady: true }
            } catch {
              options.events.onFailed(
                scene.id,
                'image_download_failed',
                'final check succeeded but the image download failed',
              )
              return { scene: withPendingTask(), imageReady: false }
            }
          }
          if (final?.error) {
            // Error VERDADERO del proveedor visto en la verificación final.
            activeTask = null
            lastLiveTask = null
            const code = final.error.code ?? 'unknown_error'
            const message = final.error.message ?? ''
            if (isContentPolicy(code, message)) {
              options.events.onFailed(
                scene.id,
                'image_content_policy',
                `${code}: ${message}`,
              )
              return {
                scene: {
                  ...scene,
                  contentRejected: true,
                  imageTask: undefined,
                },
                imageReady: false,
              }
            }
            if (isInsufficientTaskError(code, message))
              throw new PipelineFailure(
                'image_insufficient_credits',
                `Evolink task for scene ${scene.id} rejected for insufficient credits: [${code}] ${message}`,
              )
            if (RETRYABLE_TASK_ERRORS.has(code) && attempt < MAX_ORDERS) {
              await sleep(2000 * attempt, options.signal)
              continue
            }
            options.events.onFailed(
              scene.id,
              'image_provider_error',
              `final check reported ${code}: ${message}`,
            )
            return { scene: harvested(), imageReady: false }
          }
        }
        // Sigue en cola (o el create nunca respondió): se corta y se
        // re-encarga, acotado por MAX_ORDERS.
        activeTask = null
        continue
      }

      if (
        error instanceof PipelineFailure &&
        error.code === 'image_rate_limited'
      ) {
        const retryAfterSeconds = parseInt(error.message, 10) || 3
        await sleep(retryAfterSeconds * 1000 + attempt * 1000, options.signal)
        continue
      }

      if (
        error instanceof PipelineFailure &&
        error.code === 'image_content_policy'
      ) {
        options.events.onFailed(scene.id, 'image_content_policy', error.message)
        return {
          scene: { ...scene, contentRejected: true, imageTask: undefined },
          imageReady: false,
        }
      }

      // La tarea murió del lado del servidor (failed reintentable / 404):
      // recién acá se habilita crear otra.
      const taskIsDead =
        error instanceof RetryableOrderError ||
        (error instanceof PipelineFailure &&
          error.code === 'image_task_not_found')
      if (taskIsDead) {
        activeTask = null
        lastLiveTask = null
        if (attempt < MAX_ORDERS) {
          await sleep(2000 * attempt, options.signal)
          continue
        }
        options.events.onFailed(
          scene.id,
          'image_provider_error',
          `task died on the provider side: ${describeError(error)}`,
        )
        return { scene: harvested(), imageReady: false }
      }

      if (
        error instanceof PipelineFailure &&
        error.code === 'image_invalid_api_key'
      ) {
        options.events.onFailed(
          scene.id,
          'image_invalid_api_key',
          error.message,
        )
        return { scene: withPendingTask(), imageReady: false }
      }

      if (
        error instanceof PipelineFailure &&
        error.code === 'image_provider_error' &&
        !activeTask
      ) {
        // Fallo genuino al crear (sin tarea viva): reintentar acotado.
        if (attempt < MAX_ORDERS) {
          await sleep(2000 * attempt, options.signal)
          continue
        }
        options.events.onFailed(
          scene.id,
          'image_provider_error',
          `create failed: ${error.message}`,
        )
        return { scene, imageReady: false }
      }

      // Transporte (red del poll, 5xx): la tarea puede seguir viva y
      // completarse — se CONSERVA para re-consultarla, no se crea otra.
      if (attempt === MAX_ORDERS) {
        options.events.onFailed(
          scene.id,
          error instanceof PipelineFailure ? error.code : 'image_network',
          describeError(error),
        )
        return { scene: withPendingTask(), imageReady: false }
      }
      await sleep(2000, options.signal)
    } finally {
      order.close()
    }
  }

  options.events.onFailed(
    scene.id,
    'image_attempts_exhausted',
    `${MAX_ORDERS} orders without a result`,
  )
  return { scene: withPendingTask(), imageReady: false }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const evolinkImageLane: ImageLane = {
  id: 'evolink',
  // Evolink sostiene 50 tareas simultáneas (dato del proveedor).
  concurrency: 50,
  apiKeyOf(apiKeys) {
    return apiKeys.evolink
  },
  generateScene(scene, inputs, options) {
    return generateSceneWithEvolink(
      scene,
      {
        qualityOption: inputs.qualityOption,
        apiKey: inputs.apiKey,
        format: inputs.format,
      },
      options,
    )
  },
}
