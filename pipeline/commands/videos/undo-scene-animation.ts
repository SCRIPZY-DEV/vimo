import { sceneAnimationBlocks } from '../../animation/scene-blocks.ts'
import {
  markVideoOutdated,
  readProjectMetadata,
} from '../../project/metadata.ts'
import {
  isValidFile,
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
  sceneImageFile,
} from '../../project/paths.ts'
import {
  readScenes,
  resolveSceneImageSourceId,
  writeScenes,
} from '../../project/scenes-file.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  SceneAnimation,
  UndoSceneAnimationPayload,
  UndoSceneAnimationResult,
} from '../../types/animation.ts'
import type { Scene } from '../../types/scenes.ts'

// El mapa de subcomandos toma la exclusión de escritura del proyecto. No se
// eliminan clips ni recibos: el único commit visual es el rename de scenes.json.
export async function undoSceneAnimation(
  context: PipelineContext,
): Promise<UndoSceneAnimationResult> {
  const payload = context.job.payload as UndoSceneAnimationPayload | undefined
  if (
    !payload?.projectId ||
    !Number.isSafeInteger(payload.sceneId) ||
    payload.sceneId < 0
  )
    throw new PipelineFailure(
      'invalid_payload',
      'projectId and a valid sceneId are required',
    )

  const projectDir = resolveProjectDir(
    projectsRootOf(context),
    payload.projectId,
  )
  const paths = resolveProjectPaths(projectDir, payload.projectId)
  const metadata = await readProjectMetadata(paths)
  const scenes = await readScenes(paths)
  if (!scenes)
    throw new PipelineFailure('scenes_missing', 'The project has no scenes')
  if (!scenes.some((scene) => scene.id === payload.sceneId))
    throw new PipelineFailure(
      'invalid_payload',
      'The selected scene does not exist',
    )

  const removed = scenes
    .flatMap((scene) => sceneAnimationBlocks(scene))
    .filter((animation) => animation.sceneIds.includes(payload.sceneId))
  if (removed.length === 0) return { restored: [] }

  const restored = new Set(removed.flatMap((animation) => animation.sceneIds))
  const overlaps = (animation: SceneAnimation) =>
    animation.sceneIds.some((id) => restored.has(id))
  const pending = scenes
    .flatMap((scene) => scene.animationPending ?? [])
    .filter(overlaps)
  if (
    [
      ...removed.filter((animation) => animation.status !== 'ready'),
      ...pending,
    ].some(hasUnresolvedTask)
  )
    throw new PipelineFailure(
      'animation_undo_pending',
      'Recover the outstanding provider task before undoing its interval',
    )

  for (const id of restored) {
    const scene = scenes.find((item) => item.id === id)
    if (!scene)
      throw new PipelineFailure(
        'animation_source_missing',
        'A source scene is missing',
      )
    const sourceId = await resolveSceneImageSourceId(paths, scene)
    if (!(await isValidFile(sceneImageFile(paths, sourceId))))
      throw new PipelineFailure(
        'animation_source_missing',
        'A source image is missing; preserve the paid clip',
      )
  }
  const next = scenes.map((scene): Scene => {
    const original = sceneAnimationBlocks(scene)
    const archived = original.filter((animation) => removed.includes(animation))
    const abandoned = (scene.animationPending ?? []).filter(overlaps)
    if (!archived.length && !abandoned.length && !restored.has(scene.id))
      return scene
    const result = {
      ...scene,
      animations: original.filter((animation) => !removed.includes(animation)),
      animationPending: (scene.animationPending ?? []).filter(
        (animation) => !overlaps(animation),
      ),
      animationHistory: [
        ...(scene.animationHistory ?? []),
        ...archived,
        ...abandoned,
      ],
    }
    // Normalización del alias histórico: el render actual deriva la cobertura
    // de cada bloque. Mantener absorbedBy podría ocultar la imagen restaurada.
    delete result.animation
    delete result.absorbedBy
    // El encargo automático de6s ya fue deshecho. Las fuentes vuelven a las
    // reglas normales del editor; los segundos pagados siguen en el historial.
    if (restored.has(scene.id)) delete result.animationRequestedSeconds
    return result
  })
  context.signal.throwIfAborted()
  // Primero invalidar el MP4. Si el proceso cae entre escrituras, como máximo
  // queda un aviso conservador, nunca un render viejo marcado como vigente.
  await markVideoOutdated(paths, metadata)
  await writeScenes(paths, next)
  return { restored: [...restored].sort((a, b) => a - b) }
}

function hasUnresolvedTask(animation: SceneAnimation): boolean {
  if (animation.attempts?.length)
    return animation.attempts.some((attempt) => attempt.state !== 'failed')
  return animation.task !== undefined || animation.status === 'pending'
}
