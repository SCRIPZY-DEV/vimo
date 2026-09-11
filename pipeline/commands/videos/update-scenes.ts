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
// `videoOutdated` se marca SOLO si algún cambio altera en valor un campo que
// afecta el render (startSeconds/endSeconds): tocar el selector de calidad o
// los personajes sin regenerar no deja el mp4 atrás de nada.

// Cap del prompt manual (espejado en la UI, port de MAX_CHARS_PROMPT_USUARIO:
// 2500 como en la web de origen). Mismo valor en prompts/visual-styles.ts y
// en src/modules/videos/constants.ts.
export const MAX_USER_PROMPT_CHARS = 2500

// Campos de una escena que cambian el mp4 renderizado (el manifest de chunks
// se deriva de imagen + duración). Prompt/modelo/calidad/personajes solo
// afectan a la PRÓXIMA regeneración, que marca el flag por su cuenta.
const RENDER_AFFECTING_FIELDS = ['startSeconds', 'endSeconds'] as const

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
  let renderAffected = false
  for (const change of changes) {
    const scene = scenesById.get(change.id)
    if (!scene)
      throw new PipelineFailure(
        'invalid_payload',
        `scene ${change.id} does not exist`,
      )
    if (hasRenderAffectingChange(scene, change)) renderAffected = true
    patched.push(applyChange(scene, change))
  }

  await mergeScenesById(
    paths,
    new Set(patched.map((scene) => scene.id)),
    patched,
  )
  if (renderAffected) await markVideoOutdated(paths, metadata)

  return { applied: patched.length }
}

// ¿El cambio altera en valor algún campo del que depende el render?
function hasRenderAffectingChange(scene: Scene, change: SceneChange): boolean {
  for (const field of RENDER_AFFECTING_FIELDS) {
    const next = change[field]
    if (next === undefined) continue
    if (!secondsEqual(scene[field], next)) return true
  }
  return false
}

// Igualdad a milisegundos: es la precisión con que la UI acota las fronteras
// y con que el manifest de chunks fija la duración — una diferencia menor no
// puede cambiar el render, y el ruido de coma flotante del drag no marca.
function secondsEqual(stored: number | undefined, next: number): boolean {
  if (stored === undefined) return false
  return Math.round(stored * 1000) === Math.round(next * 1000)
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
