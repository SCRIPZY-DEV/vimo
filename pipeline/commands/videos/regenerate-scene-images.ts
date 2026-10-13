import { stat } from 'node:fs/promises'
import { readTextWithRetry } from '../../utils/atomic-fs.ts'
import {
  withAnimationSceneLease,
  withImagePreparationLease,
  withProjectMetadataLease,
} from '../../animation/coordination.ts'
import { flowRegenerationScope } from '../../providers/flow/regeneration-scope.ts'
import { updateScenes, MAX_USER_PROMPT_CHARS } from './update-scenes.ts'
import {
  projectsRootOf,
  resolveProjectDir,
  isValidFile,
} from '../../project/paths.ts'

import { sceneAnimationBlocks } from '../../animation/scene-blocks.ts'
import { loadPipelineCharacters } from '../../project/characters.ts'

import {
  markVideoOutdated,
  readProjectMetadata,
  writeProjectMetadata,
} from '../../project/metadata.ts'
import { sceneImageFile, type ProjectPaths } from '../../project/paths.ts'
import {
  mergeScenesById,
  readScenes,
  resolveSceneImageSourceId,
} from '../../project/scenes-file.ts'
import { hasPendingUserPrompt } from '../../project/user-prompt.ts'
import {
  recoverPendingFlowRegeneration,
  verifyFlowExecutionPlan,
} from '../../providers/flow/client.ts'
import {
  assertFlowPlanProvider,
  flowExecutionPlansEqual,
  normalizeFlowExecutionPlan,
} from '../../providers/flow/execution-plan.ts'
import {
  flowSceneRequestRevision,
  flowTargetSceneId,
} from '../../stages/images/flow-lane.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { runStages } from '../../runner/run-stages.ts'
import { buildCreateVideoContext } from '../../stages/context.ts'
import { imagesStage } from '../../stages/images/images.ts'
import { loadOrGenerateVisualBible } from '../../stages/shared/visual-bible.ts'
import { scenePromptsStage } from '../../stages/scene-prompts/scene-prompts.ts'
import type { Scene } from '../../types/scenes.ts'
import type {
  RegenerateSceneImagesPayload,
  RegenerateSceneImagesResult,
} from '../../types/video-project.ts'

// Regeneración selectiva de imágenes (ADR-0014): el runner recorre la
// rebanada [scene-prompts, images] con `regenerateSceneIds` en el contexto.
// Con `rewritePrompt`, o con una descripción del usuario pendiente de aplicar
// (`hasPendingUserPrompt`: lo decide el disco, no la UI), el imagePrompt se
// borra ANTES para que scene-prompts lo reescriba priorizando el userPrompt
// persistido; si no, es un re-roll del mismo prompt. No toca `metadata.state` — es cirugía de editor, un job
// muerto no deja un `generating` huérfano.
export async function regenerateSceneImages(
  context: PipelineContext,
): Promise<RegenerateSceneImagesResult> {
  const payload = context.job.payload as
    RegenerateSceneImagesPayload | undefined
  if (
    !payload?.projectId ||
    !Array.isArray(payload.scenes) ||
    payload.scenes.length === 0 ||
    payload.scenes.some(
      (scene) => !Number.isSafeInteger(scene?.id) || scene.id < 1,
    )
  )
    throw new PipelineFailure(
      'invalid_payload',
      'Regeneration requires valid scene IDs',
    )
  const root = resolveProjectDir(projectsRootOf(context), payload.projectId)
  return withAnimationSceneLease(
    root,
    payload.scenes.map((scene) => scene.id),
    context.signal,
    () => regenerateReservedScenes(context),
  )
}

async function regenerateReservedScenes(
  context: PipelineContext,
): Promise<RegenerateSceneImagesResult> {
  const payload = context.job.payload as
    RegenerateSceneImagesPayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )
  if (
    payload.flowRegenerationRequestId !== undefined &&
    (typeof payload.flowRegenerationRequestId !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        payload.flowRegenerationRequestId,
      ) ||
      payload.flowRestartRequestId !== undefined ||
      payload.flowAcknowledgeDuplicateRisk !== undefined)
  )
    throw new PipelineFailure(
      'invalid_payload',
      'Flow regeneration needs one valid request UUID',
    )

  if (
    (payload.flowRecoverOnly !== undefined &&
      typeof payload.flowRecoverOnly !== 'boolean') ||
    (payload.flowRecoverOnly === true && !payload.flowRegenerationRequestId)
  )
    throw new PipelineFailure(
      'invalid_payload',
      'Flow recovery needs an existing intent lookup',
    )

  // null nunca equivale a RPC; rechazar el plan antes de cualquier redacción.
  const requestedPlan = normalizeFlowExecutionPlan(payload.executionPlan)
  const requests = payload.scenes
  if (!Array.isArray(requests) || requests.length === 0)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.scenes must be a non-empty array',
    )
  for (const request of requests) {
    if (typeof request?.id !== 'number')
      throw new PipelineFailure('invalid_payload', 'every scene needs an id')
  }

  for (const request of requests) {
    if (
      (request.userPrompt !== undefined &&
        (typeof request.userPrompt !== 'string' ||
          request.userPrompt.length > MAX_USER_PROMPT_CHARS)) ||
      (request.imageQuality !== undefined &&
        typeof request.imageQuality !== 'string') ||
      (request.charactersPresent !== undefined &&
        (!Array.isArray(request.charactersPresent) ||
          request.charactersPresent.some(
            (index) => !Number.isSafeInteger(index) || index < 0,
          )))
    )
      throw new PipelineFailure(
        'invalid_payload',
        'Invalid regeneration scene snapshot',
      )
  }

  const videoContext = await buildCreateVideoContext(context, payload.projectId)
  // Las stages de regeneración sólo guardan estos diagnósticos compartidos.
  // Nunca vuelcan un snapshot viejo de las opciones o el estado del proyecto.
  videoContext.saveMetadata = async () => {
    await withProjectMetadataLease(
      videoContext.paths.root,
      context.signal,
      async () => {
        const latest = await readProjectMetadata(videoContext.paths)
        if (videoContext.metadata.promptModelUsed)
          latest.promptModelUsed = videoContext.metadata.promptModelUsed
        if (videoContext.metadata.styleProtagonist)
          latest.styleProtagonist = videoContext.metadata.styleProtagonist
        await writeProjectMetadata(videoContext.paths, latest)
      },
    )
  }

  // Modo demo (ADR-0029): las imágenes vienen del pack; no hay proveedor que
  // regenere y nada se gasta. La UI ya deshabilita el botón; esto es la
  // cerradura del sidecar.
  if (videoContext.options.demo === true)
    throw new PipelineFailure(
      'demo_project',
      'demo projects cannot regenerate images',
    )

  // Una elección explícita Flow sin plan pide RPC. Sin override, se conserva
  // el plan del proyecto; el clon sólo afecta esta intención, nunca metadata.
  const imageProvider =
    payload.imageProvider ?? videoContext.options.imageProvider
  const executionPlan = assertFlowPlanProvider(
    payload.executionPlan !== undefined || payload.imageProvider !== undefined
      ? requestedPlan
      : videoContext.options.executionPlan,
    imageProvider,
  )
  videoContext.options = { ...videoContext.options, imageProvider }
  if (executionPlan) videoContext.options.executionPlan = executionPlan
  else delete videoContext.options.executionPlan

  if (payload.flowRegenerationRequestId !== undefined) {
    if (videoContext.options.imageProvider !== 'flow')
      throw new PipelineFailure(
        'invalid_payload',
        'Flow regeneration consent requires the Flow provider',
      )
    videoContext.flowRegenerationRequestId = payload.flowRegenerationRequestId
  }

  const selectedScope =
    videoContext.options.imageProvider === 'flow'
      ? await flowRegenerationScope(
          context,
          videoContext.paths.root,
          requests.map((request) => request.id),
          payload.flowRegenerationRequestId,
        )
      : undefined
  videoContext.flowRegenerationScope = selectedScope

  const changes = requests.flatMap(
    ({ id, userPrompt, imageQuality, charactersPresent }) =>
      userPrompt !== undefined ||
      imageQuality !== undefined ||
      charactersPresent !== undefined
        ? [
            {
              id,
              ...(userPrompt !== undefined ? { userPrompt } : {}),
              ...(imageQuality !== undefined ? { imageQuality } : {}),
              ...(charactersPresent !== undefined ? { charactersPresent } : {}),
            },
          ]
        : [],
  )
  let scenes = await readScenes(videoContext.paths)
  if (!scenes)
    throw new PipelineFailure('scenes_missing', 'the project has no scenes')

  const selectedIds = new Set(requests.map((request) => request.id))
  // Un clip heredado puede usar la imagen de otra escena por alias. También
  // se protege esa fuente efectiva; una imagen propia prevalece sobre el alias.
  const imageSources = new Map(
    await Promise.all(
      scenes.map(
        async (scene) =>
          [
            scene.id,
            await resolveSceneImageSourceId(videoContext.paths, scene),
          ] as const,
      ),
    ),
  )
  const protectedSource = scenes.some((scene) =>
    [...sceneAnimationBlocks(scene), ...(scene.animationPending ?? [])].some(
      (animation) =>
        animation.sceneIds.some(
          (id) =>
            selectedIds.has(id) || selectedIds.has(imageSources.get(id) ?? id),
        ) &&
        (animation.status === 'ready' ||
          animation.status === 'pending' ||
          animation.attempts?.some((attempt) => attempt.state !== 'failed') ||
          (!animation.attempts?.length && animation.task !== undefined)),
    ),
  )
  if (protectedSource)
    throw new PipelineFailure(
      'animation_image_locked',
      'Undo the animation or recover its pending task before regenerating source images',
    )

  if (changes.length > 0 && !payload.flowRecoverOnly)
    await updateScenes({
      ...context,
      job: {
        ...context.job,
        payload: { projectId: payload.projectId, changes },
      },
    })

  if (changes.length > 0 && !payload.flowRecoverOnly) {
    scenes = await readScenes(videoContext.paths)
    if (!scenes)
      throw new PipelineFailure(
        'scenes_missing',
        'The saved scenes disappeared',
      )
  }

  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]))
  const recoveringFlowRequest = payload.flowRegenerationRequestId
    ? await recoverPendingFlowRegeneration(
        context,
        selectedScope ?? `scenes:${videoContext.paths.root}`,
        payload.flowRegenerationRequestId,
        async (batch) => {
          const recoveryPlan = payload.flowRecoverOnly
            ? normalizeFlowExecutionPlan(batch.executionPlan)
            : executionPlan
          // Un plan explícito nunca cambia por recuperar; sin preferencia,
          // el recibo manda aunque el proyecto sea RPC y este override Tools.
          if (
            !flowExecutionPlansEqual(batch.executionPlan, recoveryPlan) ||
            (payload.flowRecoverOnly &&
              payload.executionPlan !== undefined &&
              !flowExecutionPlansEqual(requestedPlan, recoveryPlan))
          )
            return false
          const recoveryOptions = { ...videoContext.options }
          if (recoveryPlan) recoveryOptions.executionPlan = recoveryPlan
          else delete recoveryOptions.executionPlan
          const targets = new Set<number>()
          for (const request of requests) {
            const scene = scenesById.get(request.id)
            if (!scene) return false
            targets.add(flowTargetSceneId(scene))
          }
          if (targets.size !== batch.requests.length) return false
          const characters = await loadPipelineCharacters(
            videoContext.paths,
            videoContext.options.characters,
          )
          const matches = batch.requests.every((request) => {
            const target = Number(request.key)
            const scene = scenesById.get(target)
            return (
              targets.has(target) &&
              scene !== undefined &&
              request.destination ===
                sceneImageFile(videoContext.paths, target) &&
              request.revision ===
                flowSceneRequestRevision(scene, recoveryOptions, characters)
            )
          })
          if (matches && payload.flowRecoverOnly)
            videoContext.options = recoveryOptions
          return matches
        },
      )
    : false
  if (payload.flowRecoverOnly && !recoveringFlowRequest)
    throw new PipelineFailure(
      'flow_intent_conflict',
      'There is no matching pending Flow intent to recover',
    )
  if (!recoveringFlowRequest)
    await verifyFlowExecutionPlan(context, executionPlan)
  const targetIds = new Set<number>()
  const rewrites: Scene[] = []
  const appliedPromptIds = new Set<number>()
  for (const request of requests) {
    const scene = scenesById.get(request.id)
    if (!scene)
      throw new PipelineFailure(
        'invalid_payload',
        `scene ${request.id} does not exist`,
      )
    targetIds.add(request.id)
    if (!request.rewritePrompt && !hasPendingUserPrompt(scene)) continue

    appliedPromptIds.add(request.id)
    // Un replay conserva el prompt que ya fijó la intención. El cliente Flow
    // aún comprueba su revisión antes de importar, sin volver a gastar en LLM.
    if (recoveringFlowRequest) continue

    // Borrar el prompt fuerza a scene-prompts a redactarlo de nuevo.
    const stripped = { ...scene }
    delete stripped.imagePrompt
    delete stripped.promptIsFallback
    rewrites.push(stripped)
  }
  if (rewrites.length > 0)
    await mergeScenesById(
      videoContext.paths,
      new Set(rewrites.map((scene) => scene.id)),
      rewrites,
    )

  const before = await imageMtimes(videoContext.paths, targetIds)

  videoContext.regenerateSceneIds = targetIds
  await withImagePreparationLease(
    videoContext.paths.root,
    context.signal,
    async () => {
      Object.assign(
        videoContext.metadata,
        await readProjectMetadata(videoContext.paths),
      )
      if (!videoContext.options.customStyle)
        videoContext.visualBible = Promise.resolve(
          await loadOrGenerateVisualBible(
            videoContext,
            (await isValidFile(videoContext.paths.scriptFile))
              ? await readTextWithRetry(videoContext.paths.scriptFile)
              : ((await readScenes(videoContext.paths)) ?? [])
                  .map((scene) => scene.text)
                  .join(' '),
          ),
        )
      await runStages([scenePromptsStage], videoContext)
    },
  )
  await runStages([imagesStage], videoContext)

  if (appliedPromptIds.size > 0)
    await markAppliedUserPrompts(videoContext.paths, appliedPromptIds)

  // El archivo viejo se conserva hasta que el nuevo sale OK (contrato del
  // lane): un mtime que no cambió = esa escena no se regeneró.
  const after = await imageMtimes(videoContext.paths, targetIds)
  const regenerated: number[] = []
  const failed: number[] = []
  for (const id of targetIds) {
    if (
      videoContext.flowReadySceneIds?.has(id) ||
      (after.get(id) !== undefined && after.get(id) !== before.get(id))
    )
      regenerated.push(id)
    else failed.push(id)
  }
  regenerated.sort((a, b) => a - b)
  failed.sort((a, b) => a - b)

  if (regenerated.length > 0)
    await markVideoOutdated(videoContext.paths, videoContext.metadata)

  return { regenerated, failed }
}

// Deja constancia de qué descripción quedó aplicada. Una escena que terminó
// sin prompt no se marca: la próxima regeneración lo vuelve a intentar.
async function markAppliedUserPrompts(
  paths: ProjectPaths,
  rewrittenIds: Set<number>,
): Promise<void> {
  const scenes = (await readScenes(paths)) ?? []
  const applied: Scene[] = []
  for (const scene of scenes) {
    if (!rewrittenIds.has(scene.id) || !scene.imagePrompt?.trim()) continue

    const next = { ...scene }
    const userPrompt = scene.userPrompt?.trim()
    if (userPrompt) next.appliedUserPrompt = userPrompt
    else delete next.appliedUserPrompt
    applied.push(next)
  }
  if (applied.length === 0) return

  await mergeScenesById(
    paths,
    new Set(applied.map((scene) => scene.id)),
    applied,
  )
}

async function imageMtimes(
  paths: ProjectPaths,
  ids: Set<number>,
): Promise<Map<number, number>> {
  const mtimes = new Map<number, number>()
  for (const id of ids) {
    try {
      const info = await stat(sceneImageFile(paths, id))
      if (info.isFile() && info.size > 0) mtimes.set(id, info.mtimeMs)
    } catch {
      // Sin imagen todavía: queda fuera del mapa.
    }
  }
  return mtimes
}
