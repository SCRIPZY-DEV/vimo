import { stat } from 'node:fs/promises'

import { sceneAnimationBlocks } from '../../animation/scene-blocks.ts'

import { markVideoOutdated } from '../../project/metadata.ts'
import { sceneImageFile, type ProjectPaths } from '../../project/paths.ts'
import { mergeScenesById, readScenes } from '../../project/scenes-file.ts'
import { hasPendingUserPrompt } from '../../project/user-prompt.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { runStages } from '../../runner/run-stages.ts'
import {
  buildCreateVideoContext,
  type CreateVideoContext,
} from '../../stages/context.ts'
import { imagesStage } from '../../stages/images/images.ts'
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
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )
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

  const videoContext = await buildCreateVideoContext(context, payload.projectId)

  // Modo demo (ADR-0029): las imágenes vienen del pack; no hay proveedor que
  // regenere y nada se gasta. La UI ya deshabilita el botón; esto es la
  // cerradura del sidecar.
  if (videoContext.options.demo === true)
    throw new PipelineFailure(
      'demo_project',
      'demo projects cannot regenerate images',
    )

  // Override transitorio del proveedor: SOLO este job; el clon de options no
  // toca metadata (scenes.json está congelado — nada nuevo se persiste ahí).
  if (payload.imageProvider)
    videoContext.options = {
      ...videoContext.options,
      imageProvider: payload.imageProvider,
    }

  const scenes = await readScenes(videoContext.paths)
  if (!scenes)
    throw new PipelineFailure('scenes_missing', 'the project has no scenes')

  // Una escena de avatar no tiene imagen que regenerar: su video lo hace HeyGen
  // con el look tal cual (ADR-0057, enmienda del 2026-10-10). En un pedido con
  // escenas de imagen se saltea con un aviso y las demás siguen; si todas las
  // pedidas son de avatar, el pedido se rechaza antes de tocar el disco.
  const avatarIds = new Set(
    scenes.filter((scene) => scene.avatar).map((scene) => scene.id),
  )
  const imageRequests = requests.filter((request) => !avatarIds.has(request.id))
  if (imageRequests.length === 0)
    throw new PipelineFailure(
      'avatar_scene_without_image',
      'Avatar scenes have no image to regenerate: HeyGen renders the look as it is',
    )

  const selectedIds = new Set(imageRequests.map((request) => request.id))
  const protectedSource = scenes.some((scene) =>
    [...sceneAnimationBlocks(scene), ...(scene.animationPending ?? [])].some(
      (animation) =>
        animation.sceneIds.some((id) => selectedIds.has(id)) &&
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

  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]))
  const targetIds = new Set<number>()
  const rewrites: Scene[] = []
  for (const request of imageRequests) {
    const scene = scenesById.get(request.id)
    if (!scene)
      throw new PipelineFailure(
        'invalid_payload',
        `scene ${request.id} does not exist`,
      )
    targetIds.add(request.id)
    if (!request.rewritePrompt && !hasPendingUserPrompt(scene)) continue

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

  // El aviso de las escenas de avatar salteadas sale recién con el pedido
  // validado: si una escena no existe o una animación bloquea la imagen, el
  // pedido entero se rechaza y el log no dice nada que no pasó.
  warnSkippedAvatarScenes(videoContext, requests, avatarIds)
  videoContext.regenerateSceneIds = targetIds
  await runStages([scenePromptsStage, imagesStage], videoContext)

  if (rewrites.length > 0)
    await markAppliedUserPrompts(
      videoContext.paths,
      new Set(rewrites.map((scene) => scene.id)),
    )

  // El archivo viejo se conserva hasta que el nuevo sale OK (contrato del
  // lane): un mtime que no cambió = esa escena no se regeneró.
  const after = await imageMtimes(videoContext.paths, targetIds)
  const regenerated: number[] = []
  const failed: number[] = []
  for (const id of targetIds) {
    if (after.get(id) !== undefined && after.get(id) !== before.get(id))
      regenerated.push(id)
    else failed.push(id)
  }
  regenerated.sort((a, b) => a - b)
  failed.sort((a, b) => a - b)

  if (regenerated.length > 0)
    await markVideoOutdated(videoContext.paths, videoContext.metadata)

  return { regenerated, failed }
}

// Un aviso con las escenas de avatar del pedido que no se regeneran, sin
// repetir y en orden.
function warnSkippedAvatarScenes(
  context: CreateVideoContext,
  requests: RegenerateSceneImagesPayload['scenes'],
  avatarIds: Set<number>,
): void {
  const skippedIds = [
    ...new Set(
      requests
        .filter((request) => avatarIds.has(request.id))
        .map((request) => request.id),
    ),
  ].sort((a, b) => a - b)
  if (skippedIds.length === 0) return

  context.emitter.emit({
    type: 'log',
    level: 'warn',
    message: `avatar scene(s) ${skippedIds.join(', ')} skipped: avatar_scene_without_image — HeyGen renders the look as it is`,
  })
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
