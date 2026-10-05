import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

import {
  isValidFile,
  sceneImageFile,
  type ProjectPaths,
} from '../project/paths.ts'
import {
  createKieVideoProvider,
  isKieAnimationModel,
  KIE_GROK_MODEL,
  KIE_SEEDANCE_MODEL,
} from '../providers/video/kie.ts'
import {
  DeadTaskFailure,
  RetryableTaskError,
  taskFailure,
} from '../providers/video/shared.ts'
import type {
  VideoAspectRatio,
  VideoClipResult,
  VideoProvider,
  VideoTaskProgress,
} from '../providers/video/types.ts'
import { PipelineFailure } from '../runner/failure.ts'
import type {
  AnimationAttempt,
  SceneAnimation,
  SceneAnimationTask,
} from '../types/animation.ts'
import type { FrameSize } from '../types/video-format.ts'
import { isInsufficientCreditsFailure } from '../utils/insufficient-credits.ts'
import { startOrderDeadline } from '../utils/order-deadline.ts'
import { sleep } from '../utils/sleep.ts'
import type { ProviderCircuitBreaker } from './circuit-breaker.ts'
import { sceneAnimationClipFile } from './clip-path.ts'
import { saveClipToFile } from './download.ts'
import {
  normalizeAnimationFile,
  normalizeAnimationReference,
} from './normalize-file.ts'
import type { AnimationUnit } from './planner.ts'

// Cada intento conserva su recibo incluso tras éxito. Un fallo de generación
// confirmado en Grok pasa directo a Seedance (enmienda del 2026-10-05 de la
// ADR-0042): el segundo Grok tardaba más y era más caro que Seedance. Red,
// cola, CDN y FFmpeg nunca cuentan.
const ORDER_DEADLINE_MS = 15 * 60_000
const RETRY_BACKOFF_MS = 3000
const UPLOAD_ATTEMPTS = 3
const MAX_RATE_LIMIT_RETRIES = 8
// Grok y Seedance: el avance muestra «intento N de 2».
export const MAX_GENERATION_ATTEMPTS = 2

export interface AnimationLaneEvents {
  onStarted(sceneId: number, sceneIds: number[], attempt: number): void
  onProgress(sceneId: number, progress: VideoTaskProgress): void
  onReady(
    sceneId: number,
    sceneIds: number[],
    clipPath: string,
    creditsConsumed?: number,
  ): void
  onFailed(sceneId: number, code: string, detail?: string): void
}

export interface AnimationLaneInputs {
  provider: VideoProvider
  apiKey: string
  model: string
  aspectRatio: VideoAspectRatio
  requestedSeconds: number
}

export interface AnimationLaneOptions {
  paths: ProjectPaths
  signal: AbortSignal
  events: AnimationLaneEvents
  breaker: ProviderCircuitBreaker
  ffmpegPath: string
  frame: FrameSize
  imagePaths?: string[]
  beforeCreate?(): Promise<void>
  onCheckpoint(animation: SceneAnimation): Promise<void>
  onTaskCreated?(task: SceneAnimationTask): Promise<void>
  onProviderTrouble(code: string): void
}

export interface AnimationLaneResult {
  animation: SceneAnimation
  clipReady: boolean
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function failureCode(error: unknown): string {
  return error instanceof PipelineFailure
    ? error.code
    : 'animation_provider_error'
}

function retryAfterSeconds(error: PipelineFailure): number {
  const value = Number(error.message)
  if (Number.isFinite(value) && value > 0) return value
  const deadline = Date.parse(error.message)
  if (Number.isFinite(deadline))
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
  return 5
}

export function nextModel(
  attempts: AnimationAttempt[],
  inputs: AnimationLaneInputs,
): string | null {
  if (inputs.provider.id !== 'kie') return null
  const failures = attempts.filter(
    (attempt) =>
      attempt.state === 'failed' &&
      attempt.errorCode !== 'animation_insufficient_credits',
  )
  if (
    failures.some((attempt) => attempt.errorCode !== 'animation_provider_error')
  )
    return null
  if (failures.some((attempt) => attempt.model === KIE_SEEDANCE_MODEL))
    return null
  if (failures.some((attempt) => attempt.model === KIE_GROK_MODEL))
    return KIE_SEEDANCE_MODEL
  return KIE_GROK_MODEL
}

export async function animateUnit(
  unit: AnimationUnit,
  original: SceneAnimation,
  inputs: AnimationLaneInputs,
  options: AnimationLaneOptions,
): Promise<AnimationLaneResult> {
  const { signal, events } = options
  const leadId = unit.leadSceneId
  const clipPath = sceneAnimationClipFile(options.paths, leadId, original)
  const rawPath = clipPath + '.source.mp4'
  let animation: SceneAnimation = {
    ...original,
    attempts: (original.attempts ?? []).map((attempt) => ({ ...attempt })),
  }
  let attempts = animation.attempts!
  let activeVideoAttempt = 1
  const reportVideoProgress = (progress: VideoTaskProgress) => {
    events.onProgress(leadId, {
      ...progress,
      ...(activeVideoAttempt > 1 && progress.status !== 'rate-limited'
        ? { status: 'retrying' }
        : {}),
      attempt: activeVideoAttempt,
      maxAttempts: MAX_GENERATION_ATTEMPTS,
      retryPhase: 'video',
    })
  }
  // Un recibo viejo se cosecha aunque haya cambiado la configuración global.
  if (!attempts.length && original.task?.taskId) {
    attempts.push({
      model: original.model,
      hash: original.task.hash,
      state: 'pending',
      taskId: original.task.taskId,
      requestedSeconds: original.requestedSeconds,
      aspectRatio: inputs.aspectRatio,
    })
  }

  const checkpoint = async () => {
    animation = {
      ...animation,
      attempts: attempts.map((attempt) => ({ ...attempt })),
    }
    attempts = animation.attempts!
    await options.onCheckpoint({
      ...animation,
      attempts: attempts.map((attempt) => ({ ...attempt })),
    })
  }
  const failed = async (
    code: string,
    detail: string,
  ): Promise<AnimationLaneResult> => {
    animation = { ...animation, status: 'error', errorCode: code }
    await checkpoint()
    events.onFailed(leadId, code, detail)
    return { animation, clipReady: false }
  }

  // Una intención persistida sin respuesta puede ser trabajo cobrado en curso.
  // Ni reiniciar, ni cancelar, ni cambiar de modelo autorizan otro POST.
  if (
    attempts.some(
      (attempt) =>
        attempt.state === 'creating' || attempt.state === 'ambiguous',
    )
  )
    return failed(
      'animation_submission_unknown',
      'The generation submission has no confirmed receipt',
    )

  const download = async (
    index: number,
    result: VideoClipResult,
  ): Promise<AnimationLaneResult> => {
    attempts[index] = {
      ...attempts[index],
      state: 'succeeded',
      videoUrl: result.videoUrl,
      ...(result.creditsConsumed !== undefined
        ? { creditsConsumed: result.creditsConsumed }
        : {}),
    }
    animation = { ...animation, model: attempts[index].model }
    await checkpoint()
    try {
      // Reusar el archivo recibido evita otra descarga al reanudar FFmpeg. Un
      // archivo inválido se vuelve a descargar de la MISMA URL, nunca se recrea.
      if (
        !(await isValidFile(rawPath)) ||
        original.errorCode === 'animation_media_invalid'
      )
        await saveClipToFile(result.videoUrl, rawPath, signal)
      const normalized = await normalizeAnimationFile(
        options.ffmpegPath,
        rawPath,
        clipPath,
        {
          startSeconds: animation.startSeconds ?? unit.startSeconds,
          endSeconds: animation.endSeconds ?? unit.endSeconds,
          frame: options.frame,
          signal,
        },
      )
      const knownCredits = attempts
        .filter((attempt) => attempt.creditsConsumed !== undefined)
        .reduce((sum, attempt) => sum + (attempt.creditsConsumed ?? 0), 0)
      animation = {
        ...animation,
        status: 'ready',
        clipFile: basename(clipPath),
        normalizedSeconds: normalized.normalizedSeconds,
      }
      if (attempts.every((attempt) => attempt.creditsConsumed !== undefined))
        animation.creditsConsumed = knownCredits
      else delete animation.creditsConsumed
      delete animation.errorCode
      await checkpoint()
      events.onReady(leadId, unit.sceneIds, clipPath, animation.creditsConsumed)
      return { animation, clipReady: true }
    } catch (error) {
      if (signal.aborted)
        return failed('cancelled', 'Local clip preparation cancelled')
      return failed(
        failureCode(error) === 'animation_download_failed'
          ? 'animation_download_failed'
          : 'animation_media_invalid',
        describe(error),
      )
    }
  }

  let imageUrls: string[] | undefined
  let referenceHash: string | undefined
  const prepareReferences = async (provider: VideoProvider): Promise<void> => {
    if (imageUrls) return
    const ids =
      unit.sceneIds.length > 1
        ? [unit.sceneIds[0], unit.sceneIds[unit.sceneIds.length - 1]]
        : [leadId]
    const paths =
      options.imagePaths ?? ids.map((id) => sceneImageFile(options.paths, id))
    if (paths.length !== ids.length || paths.length > provider.maxImages)
      throw new PipelineFailure(
        'animation_image_missing',
        'Every planned reference must be present',
      )
    const hashes: string[] = []
    imageUrls = []
    try {
      for (let index = 0; index < paths.length; index++) {
        const path = paths[index]
        if (!(await isValidFile(path)))
          throw new PipelineFailure(
            'animation_image_missing',
            'A required scene image is missing',
          )
        hashes.push(
          createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
        )
        const referencePath = clipPath + '.reference-' + index + '.jpg'
        // Grok ignora aspect_ratio con una imagen: el archivo enviado ya debe
        // tener el formato del proyecto, también para imágenes importadas.
        await normalizeAnimationReference(
          options.ffmpegPath,
          path,
          referencePath,
          {
            frame: options.frame,
            signal,
          },
        )
        let uploaded = false
        for (let retry = 0; retry < UPLOAD_ATTEMPTS; retry++) {
          try {
            imageUrls.push(
              await provider.uploadImage(referencePath, inputs.apiKey, signal),
            )
            uploaded = true
            break
          } catch (error) {
            signal.throwIfAborted()
            if (isInsufficientCreditsFailure(error)) throw error
            if (
              error instanceof PipelineFailure &&
              [
                'animation_invalid_api_key',
                'animation_invalid_request',
              ].includes(error.code)
            )
              throw error
            if (retry === UPLOAD_ATTEMPTS - 1) throw error
            events.onProgress(leadId, {
              status: 'retrying',
              elapsedSeconds: 0,
              attempt: retry + 2,
              maxAttempts: UPLOAD_ATTEMPTS,
              retryPhase: 'upload',
            })
            await sleep(RETRY_BACKOFF_MS * (retry + 1), signal)
          }
        }
        if (!uploaded)
          throw new PipelineFailure(
            'animation_upload_failed',
            'Reference upload did not complete',
          )
      }
      referenceHash = hashes.join('|')
    } catch (error) {
      imageUrls = undefined
      throw error
    }
  }

  let rateLimitRetries = 0
  for (;;) {
    if (signal.aborted) return failed('cancelled', 'Animation cancelled')
    let index = attempts.findIndex(
      (attempt) => attempt.state === 'pending' || attempt.state === 'succeeded',
    )
    const stored = index >= 0 ? attempts[index] : undefined
    const model = stored?.model ?? nextModel(attempts, inputs)
    if (!model)
      return failed(
        'animation_attempts_exhausted',
        'Animation generation attempts exhausted',
      )
    if (inputs.provider.id === 'kie' && !isKieAnimationModel(model))
      return failed(
        'animation_invalid_request',
        'Unknown stored animation model',
      )
    const provider =
      inputs.provider.id === 'kie' && isKieAnimationModel(model)
        ? createKieVideoProvider(model)
        : inputs.provider
    // Los intentos que ya terminaron se descargan incluso si faltan imágenes.
    if (stored?.state === 'succeeded' && stored.videoUrl)
      return download(index, {
        videoUrl: stored.videoUrl,
        creditsConsumed: stored.creditsConsumed,
      })
    const order = startOrderDeadline(signal, ORDER_DEADLINE_MS)
    try {
      activeVideoAttempt =
        attempts.filter(
          (attempt) =>
            attempt.state === 'failed' &&
            attempt.errorCode === 'animation_provider_error',
        ).length + 1
      events.onStarted(leadId, unit.sceneIds, activeVideoAttempt)
      reportVideoProgress({ status: 'generating', elapsedSeconds: 0 })
      if (!stored) {
        await prepareReferences(provider)
        await options.beforeCreate?.()
        signal.throwIfAborted()
        const hash = createHash('sha256')
          .update(
            JSON.stringify({
              model,
              resolution: '480p',
              audio: false,
              references: referenceHash,
              prompt: animation.prompt,
              requestedSeconds: inputs.requestedSeconds,
              aspectRatio: inputs.aspectRatio,
              sceneIds: unit.sceneIds,
              startSeconds: unit.startSeconds,
              endSeconds: unit.endSeconds,
            }),
          )
          .digest('hex')
        index = attempts.length
        attempts.push({
          model,
          hash,
          state: 'creating',
          requestedSeconds: inputs.requestedSeconds,
          aspectRatio: inputs.aspectRatio,
          resolution: '480p',
        })
        animation = { ...animation, status: 'pending', model }
        delete animation.errorCode
        // Si falla la persistencia, sale sin enviar. Si se cierra el proceso
        // después de aquí, queda una intención incierta que exige reconciliar.
        await checkpoint()
        let taskId: string
        try {
          taskId = await provider.createTask(
            {
              prompt: animation.prompt,
              imageUrls: imageUrls!,
              durationSeconds: inputs.requestedSeconds,
              aspectRatio: inputs.aspectRatio,
            },
            inputs.apiKey,
            order.signal,
          )
        } catch (error) {
          const code = failureCode(error)
          if (
            code === 'animation_rate_limited' &&
            error instanceof PipelineFailure
          ) {
            attempts.splice(index, 1)
            await checkpoint()
            if (++rateLimitRetries > MAX_RATE_LIMIT_RETRIES)
              return failed(code, describe(error))
            events.onProgress(leadId, {
              status: 'rate-limited',
              elapsedSeconds: 0,
            })
            // Un 429 confirmado no es un fallo de generación ni activa respaldo.
            // Respetar Retry-After y al menos una ventana; backoff acotado ante
            // cuentas compartidas con otras aplicaciones.
            await sleep(
              Math.max(
                retryAfterSeconds(error) * 1000,
                Math.min(60000, 10000 * rateLimitRetries),
              ),
              signal,
            )
            continue
          }
          if (
            [
              'animation_invalid_request',
              'animation_invalid_api_key',
              'animation_insufficient_credits',
            ].includes(code)
          ) {
            attempts.splice(index, 1)
            await checkpoint()
            if (isInsufficientCreditsFailure(error)) throw error
            return failed(code, describe(error))
          }
          attempts[index] = {
            ...attempts[index],
            state: 'ambiguous',
            errorCode: 'animation_submission_unknown',
          }
          return failed('animation_submission_unknown', describe(error))
        }
        attempts[index] = { ...attempts[index], state: 'pending', taskId }
        animation = {
          ...animation,
          task: { provider: inputs.provider.id, taskId, hash },
        }
        await checkpoint()
        await options.onTaskCreated?.(animation.task!)
        reportVideoProgress({ status: 'generating', elapsedSeconds: 0 })
      }
      const active = attempts[index]
      if (!active.taskId)
        return failed(
          'animation_submission_unknown',
          'Stored attempt has no task id',
        )
      const result = await provider.pollTask(
        active.taskId,
        inputs.apiKey,
        order.signal,
        reportVideoProgress,
      )
      return await download(index, result)
    } catch (error) {
      if (signal.aborted) return failed('cancelled', 'Animation cancelled')
      if (
        isInsufficientCreditsFailure(error) &&
        !(error instanceof DeadTaskFailure)
      )
        throw error
      let reason = error
      if (order.expired() && attempts[index]?.taskId) {
        const result = await provider.inspectTask(
          attempts[index].taskId!,
          inputs.apiKey,
        )
        if (result?.result) return await download(index, result.result)
        if (result?.error) {
          try {
            taskFailure(provider.id, result.error)
          } catch (terminal) {
            reason = terminal
          }
        } else
          return failed('animation_timeout', 'The generation is still pending')
      }
      if (
        reason instanceof RetryableTaskError &&
        index >= 0 &&
        attempts[index]?.taskId
      ) {
        attempts[index] = {
          ...attempts[index],
          state: 'failed',
          errorCode: 'animation_provider_error',
          ...(reason.creditsConsumed !== undefined
            ? { creditsConsumed: reason.creditsConsumed }
            : {}),
        }
        delete animation.task
        await checkpoint()
        if (nextModel(attempts, inputs)) {
          activeVideoAttempt += 1
          reportVideoProgress({ status: 'retrying', elapsedSeconds: 0 })
          await sleep(RETRY_BACKOFF_MS, signal)
        }
        continue
      }
      if (reason instanceof DeadTaskFailure && index >= 0) {
        attempts[index] = {
          ...attempts[index],
          state: 'failed',
          errorCode: reason.code,
          ...(reason.creditsConsumed !== undefined
            ? { creditsConsumed: reason.creditsConsumed }
            : {}),
        }
        delete animation.task
      }
      if (isInsufficientCreditsFailure(reason)) {
        // La consulta confirmó una tarea muerta: persistir antes de pausar
        // permite continuar tras la recarga sin volver a consultar ese fallo.
        await failed(reason.code, describe(reason))
        throw reason
      }
      return failed(failureCode(reason), describe(reason))
    } finally {
      order.close()
    }
  }
}
