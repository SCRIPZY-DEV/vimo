import { randomUUID } from 'node:crypto'

import {
  markVideoOutdated,
  readProjectMetadata,
  writeProjectMetadata,
} from '../project/metadata.ts'
import {
  isValidFile,
  sceneImageFile,
  type ProjectPaths,
} from '../project/paths.ts'
import {
  animationView,
  readScenes,
  resolveSceneImageSourceId,
  writeScenes,
} from '../project/scenes-file.ts'
import { isValidPrompt } from '../prompts/prompt-limits.ts'
import { createKieVideoProvider } from '../providers/video/kie.ts'
import { PipelineFailure, toPipelineFailure } from '../runner/failure.ts'
import type { CreateVideoContext } from '../stages/context.ts'
import type { SceneLlm } from '../stages/shared/llm.ts'
import { resolveProjectStyle } from '../stages/shared/project-style.ts'
import type { AnimateScenesResult, SceneAnimation } from '../types/animation.ts'
import type { Scene } from '../types/scenes.ts'
import { videoFormatOf } from '../types/video-format.ts'
import {
  ANIMATION_CONCURRENCY,
  GROK_VIDEO_MODEL,
  VIDEO_CREDITS_PER_SECOND,
} from '../types/video-provider.ts'
import { readTextWithRetry } from '../utils/atomic-fs.ts'
import { limitConcurrency } from '../utils/concurrency.ts'
import { requireFfmpegPath } from '../utils/ffmpeg.ts'
import { isInsufficientCreditsFailure } from '../utils/insufficient-credits.ts'
import { createProviderFailureReporter } from '../utils/provider-failure.ts'
import { createCircuitBreaker } from './circuit-breaker.ts'
import { sceneAnimationClipFile } from './clip-path.ts'
import {
  reserveAnimationCreate,
  withAnimationCheckpointLease,
  withAnimationSceneLease,
} from './coordination.ts'
import { animateUnit, type AnimationLaneEvents } from './lane.ts'
import { createAnimationLlm } from './llm.ts'
import { normalizeClipToSlot } from './normalization.ts'
import {
  animationNarrationWithin,
  parseAnimationNarrationWords,
} from './narration.ts'
import {
  needsLegacyAnimationNormalization,
  normalizeLegacyAnimationBlocks,
} from './migrate-legacy.ts'
import {
  planAnimationUnits,
  overlapsShortFinalAnimationScene,
  animationUnitFromBlock as blockUnit,
  type AnimationInterval,
  type AnimationUnit,
} from './planner.ts'
import { buildAnimationPrompt } from './prompt.ts'
import { sceneAnimationBlocks } from './scene-blocks.ts'
import {
  animationRangeEnd,
  animatesWholeVideo,
  hasAutomaticAnimation,
} from './scope.ts'

export interface AnimationSelection {
  sceneIds?: number[]
  minutes?: number
  force?: boolean
  retryFailed?: boolean
  // Interno del pipeline completo; el comando del editor no lo propaga.
  pairPrefixScenes?: boolean
}

interface StoredBlock {
  leadSceneId: number
  animation: SceneAnimation
  unit: AnimationUnit
}

const EPSILON_SECONDS = 0.001

function overlaps(a: AnimationInterval, b: AnimationInterval): boolean {
  return (
    a.startSeconds < b.endSeconds - EPSILON_SECONDS &&
    b.startSeconds < a.endSeconds - EPSILON_SECONDS
  )
}

function sameInterval(a: AnimationInterval, b: AnimationInterval): boolean {
  return (
    Math.abs(a.startSeconds - b.startSeconds) < EPSILON_SECONDS &&
    Math.abs(a.endSeconds - b.endSeconds) < EPSILON_SECONDS
  )
}

export async function readyAnimationBlocks(
  paths: ProjectPaths,
  scenes: Scene[],
): Promise<StoredBlock[]> {
  const records: StoredBlock[] = []
  for (const scene of scenes) {
    for (const animation of sceneAnimationBlocks(scene)) {
      if (animation.status !== 'ready') continue
      if (
        !(await isValidFile(sceneAnimationClipFile(paths, scene.id, animation)))
      )
        continue
      records.push({
        leadSceneId: scene.id,
        animation,
        unit: blockUnit(scene.id, animation, scenes),
      })
    }
  }
  return records
}

export async function hasAnimationWork(
  context: CreateVideoContext,
): Promise<boolean> {
  const minutes = animatesWholeVideo(context.options)
    ? undefined
    : context.options.animationMinutes
  const endSeconds = animationRangeEnd(
    minutes,
    context.metadata.audioDurationSeconds,
  )
  if (
    !hasAutomaticAnimation(context.options) ||
    context.options.demo ||
    context.regenerateSceneIds
  )
    return false
  const scenes = await readScenes(context.paths)
  if (!scenes) return true
  const ready = await readyAnimationBlocks(context.paths, scenes)
  if (
    scenes.some((scene) =>
      scene.animationPending?.some((animation) => {
        const unit = blockUnit(scene.id, animation, scenes)
        return (
          unit.startSeconds < endSeconds &&
          !overlapsShortFinalAnimationScene(scenes, unit)
        )
      }),
    )
  )
    return true
  const plan = planAnimationUnits(
    scenes,
    scenes.map((scene) => scene.id),
    [],
    {
      endSeconds,
      mergeShortScenes: true,
      pairPrefixScenes: true,
      replacementUnits: scenes.flatMap((scene) =>
        [...sceneAnimationBlocks(scene), ...(scene.animationPending ?? [])]
          .map((animation) => blockUnit(scene.id, animation, scenes))
          .filter((unit) => overlapsShortFinalAnimationScene(scenes, unit)),
      ),
      coveredIntervals: ready.map((record) => record.unit),
    },
  )
  return plan.units.length > 0 || plan.rejected.length > 0
}

// Operación compartida por la fase animation y el comando del editor. La entrada
// del sidecar excluye otros mutadores; los jobs de animación comparten el
// proyecto y serializan únicamente sus checkpoints, con grupos exclusivos.
export async function generateSceneAnimations(
  context: CreateVideoContext,
  selection: AnimationSelection,
): Promise<AnimateScenesResult> {
  const { paths, signal } = context
  signal.throwIfAborted()
  if (selection.force && selection.minutes !== undefined)
    throw new PipelineFailure(
      'invalid_payload',
      'Regenerate explicit scene groups, not a partial prefix',
    )
  if (context.options.demo)
    throw new PipelineFailure('demo_project', 'Demo projects cannot animate')
  const markOutdated = async () => {
    const latest = await readProjectMetadata(paths)
    await markVideoOutdated(paths, latest)
    // El pipeline completo todavía guarda su contexto al cerrar cada fase.
    // Mantener su copia al día evita revertir la invalidación del render.
    context.metadata.videoOutdated = latest.videoOutdated
  }
  const scenes = await withAnimationCheckpointLease(
    paths.root,
    signal,
    async () => {
      let stored = await readScenes(paths)
      if (!stored)
        throw new PipelineFailure('scenes_missing', 'The project has no scenes')
      if (needsLegacyAnimationNormalization(stored)) {
        await normalizeLegacyAnimationBlocks(
          paths,
          requireFfmpegPath(context.job.binaryPaths.ffmpeg),
          videoFormatOf(context.options) === '9:16'
            ? { width: 480, height: 854 }
            : { width: 854, height: 480 },
          signal,
        )
        stored = await readScenes(paths)
        if (!stored)
          throw new PipelineFailure(
            'scenes_missing',
            'The project has no scenes',
          )
        await markOutdated()
      }
      return stored
    },
  )
  const byId = new Map(scenes.map((scene) => [scene.id, scene]))
  const rangeEnd = animationRangeEnd(
    selection.minutes,
    context.metadata.audioDurationSeconds,
  )
  const marks =
    selection.sceneIds ??
    scenes
      .filter((scene) => (scene.startSeconds ?? Infinity) < rangeEnd)
      .map((scene) => scene.id)
  for (const id of marks)
    if (!byId.has(id))
      throw new PipelineFailure('invalid_payload', 'Unknown scene id')

  const selected = new Set(marks)
  const ready = await readyAnimationBlocks(paths, scenes)
  // Rehacer un grupo histórico conserva sus límites hasta poder reemplazar
  // todos sus intervalos en una sola escritura; nunca deja media pareja suelta.
  let atomicReplacement = selection.force === true
  let expanding = true
  while (expanding) {
    const previousSize = selected.size
    for (const scene of scenes)
      for (const candidate of scene.animationPending ?? []) {
        if (!candidate.replacementSceneIds?.some((id) => selected.has(id)))
          continue
        atomicReplacement = true
        for (const id of candidate.replacementSceneIds) selected.add(id)
      }
    if (atomicReplacement)
      for (const record of ready)
        if (record.animation.sceneIds.some((id) => selected.has(id)))
          for (const id of record.animation.sceneIds) selected.add(id)
    expanding = selected.size !== previousSize
  }
  if (
    atomicReplacement &&
    scenes.some(
      (scene) =>
        selected.has(scene.id) &&
        selection.minutes !== undefined &&
        (scene.endSeconds ?? 0) > rangeEnd + EPSILON_SECONDS,
    )
  )
    throw new PipelineFailure(
      'animation_request_changed',
      'Resume the entire replacement group before shortening its interval',
    )
  const targetIntervals = scenes
    .filter((scene) => selected.has(scene.id))
    .map((scene) => ({
      startSeconds: scene.startSeconds ?? 0,
      endSeconds: Math.min(scene.endSeconds ?? 0, rangeEnd),
    }))
  const activeCoverage = ready.filter(
    (record) =>
      !atomicReplacement ||
      !targetIntervals.some((interval) => overlaps(interval, record.unit)),
  )
  const pending: StoredBlock[] = []
  const preservedPending: StoredBlock[] = []
  for (const scene of scenes) {
    const historical = sceneAnimationBlocks(scene).filter(
      (animation) =>
        animation.status !== 'ready' ||
        !ready.some((record) => record.animation === animation),
    )
    for (const animation of [
      ...(scene.animationPending ?? []),
      ...historical,
    ]) {
      const unit = blockUnit(scene.id, animation, scenes)
      if (!targetIntervals.some((interval) => overlaps(interval, unit)))
        continue
      // Conservar todo el grupo pendiente evita otra compra de su primera
      // imagen cuando la segunda es una cola ahora excluida.
      if (overlapsShortFinalAnimationScene(scenes, unit)) {
        preservedPending.push({ leadSceneId: scene.id, animation, unit })
        continue
      }
      if (unit.endSeconds > rangeEnd + EPSILON_SECONDS)
        throw new PipelineFailure(
          'animation_request_changed',
          'Resume the existing task before shortening its interval',
        )
      if (pending.some((record) => sameInterval(record.unit, unit))) continue
      pending.push({ leadSceneId: scene.id, animation, unit })
    }
  }
  const plan = planAnimationUnits(scenes, [...selected], [], {
    endSeconds: rangeEnd,
    mergeShortScenes:
      selection.pairPrefixScenes === true ||
      context.options.videoFormat !== '9:16',
    pairPrefixScenes: selection.pairPrefixScenes,
    replacementUnits: [
      ...preservedPending.map((record) => record.unit),
      ...(atomicReplacement
        ? ready
            .filter((record) =>
              record.animation.sceneIds.some((id) => selected.has(id)),
            )
            .map((record) => record.unit)
        : []),
    ],
    coveredIntervals: [
      ...activeCoverage.map((record) => record.unit),
      ...pending.map((record) => record.unit),
    ],
  })
  const animated: number[] = []
  const failed: number[] = []
  for (const rejection of plan.rejected) {
    failed.push(rejection.sceneId)
    context.emitter.emit({
      type: 'scene-animation-failed',
      sceneId: rejection.sceneId,
      code: 'animation_' + rejection.reason,
    })
  }
  const units = [...pending.map((record) => record.unit), ...plan.units].sort(
    (a, b) => a.startSeconds - b.startSeconds,
  )
  if (!units.length)
    return { animated, failed, rejected: plan.rejected, creditsConsumed: 0 }

  return withAnimationSceneLease(
    paths.root,
    [...selected, ...units.flatMap((unit) => unit.sceneIds)],
    signal,
    async () => {
      const provider = createKieVideoProvider(GROK_VIDEO_MODEL)
      const apiKey = provider.apiKeyOf(context.job.apiKeys)
      const ffmpegPath = requireFfmpegPath(context.job.binaryPaths.ffmpeg)
      const format = videoFormatOf(context.options)
      const frame =
        format === '9:16'
          ? { width: 480, height: 854 }
          : { width: 854, height: 480 }
      context.options.videoProvider = 'kie'
      await withAnimationCheckpointLease(paths.root, signal, async () => {
        const latest = await readProjectMetadata(paths)
        latest.options.videoProvider = 'kie'
        await writeProjectMetadata(paths, latest)
      })

      const script = await readTextWithRetry(paths.scriptFile).catch(
        (error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return scenes.map((scene) => scene.text).join('\n')
          throw error
        },
      )
      const wordsSource = await readTextWithRetry(paths.wordsFile).catch(
        (error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return undefined
          throw error
        },
      )
      const narrationWords = parseAnimationNarrationWords(wordsSource)
      if (wordsSource && !narrationWords)
        context.emitter.emit({
          type: 'log',
          level: 'warn',
          message:
            'Animation narration timestamps are invalid; using scene text without fine timing.',
        })
      const style = resolveProjectStyle(context.options)
      const characters = (context.options.characters ?? []).map(
        (character) => ({
          name: character.name,
          description: character.description ?? '',
        }),
      )
      let llm: SceneLlm | undefined
      // Guardar el recibo ya recibido es obligatorio incluso si el usuario cancela.
      // Solo la espera de trabajo nuevo usa el AbortSignal del job.
      const checkpointSignal = new AbortController().signal
      let writeQueue: Promise<unknown> = Promise.resolve()
      const persist = (
        transform: (stored: Scene[]) => Scene[],
        beforeWrite?: () => Promise<void>,
      ): Promise<void> => {
        const operation = writeQueue.then(() =>
          withAnimationCheckpointLease(
            paths.root,
            checkpointSignal,
            async () => {
              const current = await readScenes(paths)
              if (!current)
                throw new PipelineFailure(
                  'scenes_missing',
                  'Scenes disappeared while saving an animation',
                )
              await beforeWrite?.()
              await writeScenes(paths, transform(current))
            },
          ),
        )
        writeQueue = operation.catch(() => undefined)
        return operation
      }
      const checkpoint = (leadSceneId: number, animation: SceneAnimation) =>
        persist((stored) =>
          stored.map((scene) => {
            if (scene.id !== leadSceneId) return scene
            const candidates = (scene.animationPending ?? []).filter(
              (item) =>
                item.id !== animation.id &&
                !sameInterval(
                  blockUnit(scene.id, item, stored),
                  blockUnit(scene.id, animation, stored),
                ),
            )
            const replaced = (scene.animationPending ?? []).filter(
              (item) => item.id !== animation.id && !candidates.includes(item),
            )
            return {
              ...scene,
              animationPending: [...candidates, animation],
              animationHistory: [
                ...(scene.animationHistory ?? []),
                ...replaced,
              ],
            }
          }),
        )
      const completed: StoredBlock[] = []
      const publishedIds = new Set<string>()
      const publish = async (records: StoredBlock[]) => {
        await persist(
          (stored) =>
            stored.map((scene) => {
              const originals = sceneAnimationBlocks(scene)
              const removed = originals.filter((animation) =>
                records.some((record) =>
                  overlaps(blockUnit(scene.id, animation, stored), record.unit),
                ),
              )
              const additions = records
                .filter((record) => record.leadSceneId === scene.id)
                .map((record) => record.animation)
              const next: Scene = {
                ...scene,
                animations: [
                  ...originals.filter(
                    (animation) => !removed.includes(animation),
                  ),
                  ...additions,
                ].sort(
                  (a, b) =>
                    blockUnit(scene.id, a, stored).startSeconds -
                    blockUnit(scene.id, b, stored).startSeconds,
                ),
                animationPending: (scene.animationPending ?? []).filter(
                  (animation) =>
                    !records.some(
                      (record) => record.animation.id === animation.id,
                    ),
                ),
                animationHistory: [
                  ...(scene.animationHistory ?? []),
                  ...removed,
                ],
              }
              delete next.animation
              delete next.absorbedBy
              return next
            }),
          markOutdated,
        )
        for (const record of records) {
          if (record.animation.id) publishedIds.add(record.animation.id)
          animated.push(record.leadSceneId)
          const view = await animationView(
            paths,
            record.leadSceneId,
            record.animation,
          )
          context.emitter.emit({
            type: 'scene-animation-ready',
            sceneId: record.leadSceneId,
            sceneIds: record.animation.sceneIds,
            clipPath: sceneAnimationClipFile(
              paths,
              record.leadSceneId,
              record.animation,
            ),
            creditsConsumed: record.animation.creditsConsumed,
            animation: view,
          })
        }
      }
      const runUnit = async (unit: AnimationUnit) => {
        signal.throwIfAborted()
        const previous = pending.find((record) =>
          sameInterval(record.unit, unit),
        )?.animation
        // Solo una acción explícita abre otro presupuesto tras intentos confirmados
        // como fallidos. Nunca descarta un task pendiente, ambiguo o ya cobrado.
        const resetFailed =
          (selection.force || selection.retryFailed) &&
          previous?.attempts?.length &&
          previous.attempts.every((attempt) => attempt.state === 'failed') &&
          previous.attempts.at(-1)?.errorCode !==
            'animation_insufficient_credits'
        const reusable = resetFailed ? undefined : previous
        const id = reusable?.id ?? randomUUID()
        let animation: SceneAnimation = reusable
          ? {
              ...reusable,
              id,
              startSeconds: unit.startSeconds,
              endSeconds: unit.endSeconds,
              clipFile: reusable.clipFile ?? id + '.mp4',
            }
          : {
              id,
              clipFile: id + '.mp4',
              provider: 'kie',
              model: GROK_VIDEO_MODEL,
              sceneIds: unit.sceneIds,
              startSeconds: unit.startSeconds,
              endSeconds: unit.endSeconds,
              slotSeconds: unit.slotSeconds,
              requestedSeconds: unit.requestedSeconds,
              strategy: unit.strategy,
              prompt: '',
              status: 'pending',
            }
        if (atomicReplacement) animation.replacementSceneIds = [...selected]
        let started = false
        const events: AnimationLaneEvents = {
          onStarted(sceneId, sceneIds, attempt) {
            // La fase automática ya anunció el clip antes de redactar. Los
            // reintentos del proveedor no reinician su porcentaje visible.
            if (selection.pairPrefixScenes && started) return
            started = true
            context.emitter.emit({
              type: 'scene-animation-started',
              sceneId,
              sceneIds,
              attempt,
              animationId: id,
              startSeconds: unit.startSeconds,
              endSeconds: unit.endSeconds,
            })
          },
          onProgress(sceneId, progress) {
            context.emitter.emit({
              type: 'scene-animation-progress',
              sceneId,
              ...progress,
            })
          },
          onReady() {
            /* Solo publish anuncia listo DESPUÉS de guardar el manifiesto. */
          },
          onFailed(sceneId, code, detail) {
            context.emitter.emit({
              type: 'scene-animation-failed',
              sceneId,
              code,
            })
            context.emitter.emit({
              type: 'log',
              level: 'warn',
              message:
                'Animation scene ' +
                sceneId +
                ': ' +
                code +
                ' ' +
                (detail ?? ''),
            })
          },
        }
        if (selection.pairPrefixScenes)
          events.onStarted(unit.leadSceneId, unit.sceneIds, 1)
        try {
          const canDownload = animation.attempts?.some(
            (attempt) =>
              attempt.state === 'succeeded' && attempt.videoUrl !== undefined,
          )
          if (!apiKey && !canDownload)
            throw new PipelineFailure(
              'missing_api_key',
              'Kie API key is missing',
            )
          const sourceScenes = await Promise.all(
            unit.sceneIds.map(async (sceneId) => {
              const scene = byId.get(sceneId)!
              const sourceId = await resolveSceneImageSourceId(paths, scene)
              return byId.get(sourceId) ?? scene
            }),
          )
          const references =
            sourceScenes.length > 1
              ? [sourceScenes[0], sourceScenes[sourceScenes.length - 1]]
              : sourceScenes
          const hasReceipt =
            animation.task !== undefined ||
            (animation.attempts?.length ?? 0) > 0
          if (!hasReceipt) {
            for (const source of references)
              if (!(await isValidFile(sceneImageFile(paths, source.id))))
                throw new PipelineFailure(
                  'animation_image_missing',
                  'An image-to-video reference is missing',
                )
            llm ??= createAnimationLlm(context)
            const fit = normalizeClipToSlot(
              unit.requestedSeconds,
              unit.slotSeconds,
            )
            const scale = fit.rate
            const firstIndex = scenes.findIndex(
              (scene) => scene.id === unit.sceneIds[0],
            )
            const lastIndex = scenes.findIndex(
              (scene) => scene.id === unit.sceneIds.at(-1),
            )
            const written = await buildAnimationPrompt({
              llm,
              onFailure(report) {
                createProviderFailureReporter(context.emitter)(report)
                if (!report.recovered) return
                events.onProgress(unit.leadSceneId, {
                  status: 'retrying',
                  elapsedSeconds: 0,
                  attempt: (report.attempt ?? 1) + 1,
                  maxAttempts: report.maxAttempts,
                  retryPhase: 'prompt',
                })
              },
              script,
              previousPrompt: atomicReplacement
                ? ready.find((record) => sameInterval(record.unit, unit))
                    ?.animation.prompt
                : undefined,
              characters,
              signal,
              styleName: style.name,
              strategy: unit.strategy,
              format,
              referenceImages: references.length,
              maxChars: 4000,
              clipSeconds: unit.requestedSeconds,
              usedSeconds: fit.usedSeconds,
              previousText: scenes[firstIndex - 1]?.text ?? '',
              nextText: scenes[lastIndex + 1]?.text ?? '',
              segments: unit.sceneIds.map((sceneId, index) => {
                const scene = byId.get(sceneId)!
                const startSeconds = Math.max(
                  scene.startSeconds ?? unit.startSeconds,
                  unit.startSeconds,
                )
                const endSeconds = Math.min(
                  scene.endSeconds ?? unit.endSeconds,
                  unit.endSeconds,
                )
                const narration = animationNarrationWithin(
                  narrationWords,
                  scene.text,
                  {
                    startSeconds,
                    endSeconds,
                    clipStartSeconds: unit.startSeconds,
                    rate: scale,
                  },
                )
                return {
                  scene: {
                    ...scene,
                    text: narration.text,
                    imagePrompt:
                      scene.imagePrompt ?? sourceScenes[index].imagePrompt,
                  },
                  narrationCues: narration.cues,
                  fromSeconds: (startSeconds - unit.startSeconds) * scale,
                  toSeconds: (endSeconds - unit.startSeconds) * scale,
                }
              }),
            })
            animation = { ...animation, prompt: written.prompt }
          }
          signal.throwIfAborted()
          await checkpoint(unit.leadSceneId, animation)
          const result = await animateUnit(
            unit,
            animation,
            {
              provider,
              apiKey: apiKey ?? '',
              model: animation.model,
              aspectRatio: format,
              requestedSeconds: animation.requestedSeconds,
            },
            {
              paths,
              signal,
              events,
              breaker: createCircuitBreaker(),
              ffmpegPath,
              frame,
              imagePaths: references.map((scene) =>
                sceneImageFile(paths, scene.id),
              ),
              beforeCreate: () => {
                if (!apiKey)
                  throw new PipelineFailure(
                    'missing_api_key',
                    'Kie API key is missing',
                  )
                return reserveAnimationCreate(apiKey, signal, () => {
                  events.onProgress(unit.leadSceneId, {
                    status: 'rate-limited',
                    elapsedSeconds: 0,
                  })
                })
              },
              onCheckpoint: (value) => checkpoint(unit.leadSceneId, value),
              onProviderTrouble(code) {
                context.emitter.emit({
                  type: 'animation-provider-trouble',
                  provider: 'kie',
                  code,
                })
              },
            },
          )
          if (!result.clipReady) {
            failed.push(unit.leadSceneId)
            return
          }
          const record = {
            leadSceneId: unit.leadSceneId,
            animation: result.animation,
            unit,
          }
          completed.push(record)
          if (!atomicReplacement) await publish([record])
        } catch (error) {
          signal.throwIfAborted()
          if (publishedIds.has(id)) return
          if (isInsufficientCreditsFailure(error)) throw error
          failed.push(unit.leadSceneId)
          const code = toPipelineFailure(error).code
          // El carril ya guarda sus checkpoints; no pisar sus recibos con el
          // borrador anterior si falló una persistencia o una consulta.
          if (
            !animation.attempts?.length &&
            !animation.task &&
            !isValidPrompt(animation.prompt)
          )
            await checkpoint(unit.leadSceneId, {
              ...animation,
              status: 'error',
              errorCode: code,
            })
          context.emitter.emit({
            type: 'scene-animation-failed',
            sceneId: unit.leadSceneId,
            code,
          })
          context.emitter.emit({
            type: 'log',
            level: 'warn',
            message: 'Animation failed: ' + String(error),
          })
        }
      }
      const limiter = limitConcurrency(ANIMATION_CONCURRENCY)
      const runBatch = async (batch: AnimationUnit[]) => {
        const leadQueues = new Map<number, Promise<void>>()
        const outcomes = await Promise.allSettled(
          batch.map((unit) => {
            const previous =
              leadQueues.get(unit.leadSceneId) ?? Promise.resolve()
            const next = previous
              .catch(() => undefined)
              .then(() => limiter(() => runUnit(unit)))
            leadQueues.set(unit.leadSceneId, next)
            return next
          }),
        )
        await writeQueue
        signal.throwIfAborted()
        const rejected = outcomes.find(
          (outcome) => outcome.status === 'rejected',
        )
        if (rejected?.status === 'rejected') throw rejected.reason
      }
      // Se cosechan primero los recibos. Tener saldo cero para trabajo nuevo no
      // bloquea descargar y publicar un resultado ya pagado.
      await runBatch(pending.map((record) => record.unit))
      if (plan.units.length) {
        if (!apiKey)
          throw new PipelineFailure('missing_api_key', 'Kie API key is missing')
        const expected = plan.units.reduce(
          (sum, unit) =>
            sum + unit.requestedSeconds * VIDEO_CREDITS_PER_SECOND.kie,
          0,
        )
        const balance = await provider.credits(apiKey, signal)
        if (balance + Number.EPSILON < expected)
          throw new PipelineFailure(
            'animation_insufficient_credits',
            'Insufficient balance for the planned animation seconds',
          )
        await runBatch(plan.units)
      }
      if (atomicReplacement && failed.length === 0 && completed.length)
        await publish(completed)
      const allCreditsKnown =
        failed.length === 0 &&
        completed.every(
          (record) => record.animation.creditsConsumed !== undefined,
        )
      return {
        animated:
          atomicReplacement && failed.length > 0
            ? []
            : [...new Set(animated)].sort((a, b) => a - b),
        failed: [...new Set(failed)].sort((a, b) => a - b),
        rejected: plan.rejected,
        ...(allCreditsKnown
          ? {
              creditsConsumed: completed.reduce(
                (sum, record) => sum + record.animation.creditsConsumed!,
                0,
              ),
            }
          : {}),
      }
    },
  )
}
