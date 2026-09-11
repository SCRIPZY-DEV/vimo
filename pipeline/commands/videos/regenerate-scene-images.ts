import { stat } from 'node:fs/promises'

import { markVideoOutdated } from '../../project/metadata.ts'
import { sceneImageFile, type ProjectPaths } from '../../project/paths.ts'
import { mergeScenesById, readScenes } from '../../project/scenes-file.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { runStages } from '../../runner/run-stages.ts'
import { buildCreateVideoContext } from '../../stages/context.ts'
import { imagesStage } from '../../stages/images/images.ts'
import { scenePromptsStage } from '../../stages/scene-prompts/scene-prompts.ts'
import type { Scene } from '../../types/scenes.ts'
import type {
  RegenerateSceneImagesPayload,
  RegenerateSceneImagesResult,
} from '../../types/video-project.ts'

// Regeneración selectiva de imágenes (ADR-0014): el runner recorre la
// rebanada [scene-prompts, images] con `regenerateSceneIds` en el contexto.
// Con `rewritePrompt` el imagePrompt se borra ANTES para que scene-prompts
// lo reescriba (priorizando el userPrompt persistido); sin él es un re-roll
// del mismo prompt. No toca `metadata.state` — es cirugía de editor, un job
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

  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]))
  const targetIds = new Set<number>()
  const rewrites: Scene[] = []
  for (const request of requests) {
    const scene = scenesById.get(request.id)
    if (!scene)
      throw new PipelineFailure(
        'invalid_payload',
        `scene ${request.id} does not exist`,
      )
    targetIds.add(request.id)
    if (!request.rewritePrompt) continue

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
  await runStages([scenePromptsStage, imagesStage], videoContext)

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
