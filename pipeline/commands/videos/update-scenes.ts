import {
  markVideoOutdated,
  readProjectMetadata,
} from '../../project/metadata.ts'
import {
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
} from '../../project/paths.ts'
import { mergeScenesById, readScenes } from '../../project/scenes-file.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { Scene } from '../../types/scenes.ts'
import type {
  SceneChange,
  UpdateScenesPayload,
  UpdateScenesResult,
} from '../../types/video-project.ts'

// Edición de escenas del editor (single y batch unificados: single = array
// de 1). Un solo read-modify-write para todo el lote — el drag de fronteras
// del timeline manda las dos escenas afectadas juntas y jamás se pisan.

// Cap del prompt manual (espejado en la UI, port de MAX_CHARS_PROMPT_USUARIO).
export const MAX_USER_PROMPT_CHARS = 1000

export async function updateScenes(
  context: PipelineContext,
): Promise<UpdateScenesResult> {
  const payload = context.job.payload as UpdateScenesPayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )
  const changes = payload.changes
  if (!Array.isArray(changes) || changes.length === 0)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.changes must be a non-empty array',
    )
  for (const change of changes) assertValidChange(change)

  const projectDir = resolveProjectDir(
    projectsRootOf(context),
    payload.projectId,
  )
  const paths = resolveProjectPaths(projectDir, payload.projectId)
  const metadata = await readProjectMetadata(paths)

  const scenes = await readScenes(paths)
  if (!scenes)
    throw new PipelineFailure('scenes_missing', 'the project has no scenes')

  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]))
  const patched: Scene[] = []
  for (const change of changes) {
    const scene = scenesById.get(change.id)
    if (!scene)
      throw new PipelineFailure(
        'invalid_payload',
        `scene ${change.id} does not exist`,
      )
    patched.push(applyChange(scene, change))
  }

  await mergeScenesById(
    paths,
    new Set(patched.map((scene) => scene.id)),
    patched,
  )
  await markVideoOutdated(paths, metadata)

  return { applied: patched.length }
}

function assertValidChange(change: SceneChange): void {
  if (typeof change?.id !== 'number')
    throw new PipelineFailure('invalid_payload', 'every change needs an id')
  if (
    change.userPrompt !== undefined &&
    change.userPrompt.length > MAX_USER_PROMPT_CHARS
  )
    throw new PipelineFailure(
      'invalid_payload',
      `userPrompt exceeds ${MAX_USER_PROMPT_CHARS} characters`,
    )
  for (const field of ['startSeconds', 'endSeconds'] as const) {
    const value = change[field]
    if (value === undefined) continue
    if (!Number.isFinite(value) || value < 0)
      throw new PipelineFailure(
        'invalid_payload',
        `${field} must be a non-negative number`,
      )
  }
}

// Aplica SOLO los campos presentes; `userPrompt: ''` borra el prompt manual.
function applyChange(scene: Scene, change: SceneChange): Scene {
  const next = { ...scene }
  if (change.startSeconds !== undefined) next.startSeconds = change.startSeconds
  if (change.endSeconds !== undefined) next.endSeconds = change.endSeconds
  if (change.imagePrompt !== undefined) next.imagePrompt = change.imagePrompt
  if (change.imageModel !== undefined) next.imageModel = change.imageModel
  if (change.imageQuality !== undefined) next.imageQuality = change.imageQuality
  if (change.charactersPresent !== undefined)
    next.charactersPresent = change.charactersPresent
  if (change.userPrompt !== undefined) {
    if (change.userPrompt.trim().length === 0) delete next.userPrompt
    else next.userPrompt = change.userPrompt
  }
  return next
}
