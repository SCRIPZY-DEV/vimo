import {
  markVideoOutdated,
  readProjectMetadata,
} from '../../project/metadata.ts'
import { sceneAnimationBlocks } from '../../animation/scene-blocks.ts'
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
// afecta el render (tiempos o fundido): tocar el selector de calidad o
// los personajes sin regenerar no deja el mp4 atrás de nada.

// Cap del prompt manual (espejado en la UI, port de MAX_CHARS_PROMPT_USUARIO:
// 2500 como en la web de origen). Mismo valor en prompts/visual-styles.ts y
// en src/modules/videos/constants.ts.
export const MAX_USER_PROMPT_CHARS = 2500

// Campos de una escena que cambian el mp4 renderizado (el manifest de chunks
// se deriva de imagen + duración). Prompt/modelo/calidad/personajes solo
// afectan a la PRÓXIMA regeneración, que marca el flag por su cuenta.
const TIMING_FIELDS = ['startSeconds', 'endSeconds'] as const

// Campos que solo tienen sentido con una imagen que generar: el prompt, la
// descripción del editor, los personajes presentes, y el modelo y la calidad
// con que se genera. Una escena de avatar no tiene imagen (ADR-0057): su video
// lo hace el proveedor del avatar con el look elegido, y no hay nada de esto
// que editar. Lo único que una escena de avatar acepta son sus tiempos (con su
// propio candado) y la transición estática, que el interruptor global manda a
// todas las escenas.
const IMAGE_ONLY_FIELDS = [
  'imagePrompt',
  'userPrompt',
  'charactersPresent',
  'imageModel',
  'imageQuality',
] as const

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
    if (scene.avatar && editsSceneImage(change))
      throw new PipelineFailure(
        'avatar_scene_without_image',
        `scene ${scene.id} is an avatar scene: it has no image prompt, description, characters, model or quality to edit`,
      )
    if (hasTimingChange(scene, change)) {
      const protectedTiming = scenes.some((item) =>
        [...sceneAnimationBlocks(item), ...(item.animationPending ?? [])].some(
          (animation) => animation.sceneIds.includes(scene.id),
        ),
      )
      if (protectedTiming)
        throw new PipelineFailure(
          'animation_timing_locked',
          'Animation intervals cannot move while clips or generation receipts depend on them',
        )
      // Las fronteras de una escena de avatar con clip o recibos de HeyGen
      // quedan bloqueadas en la entrega 2 (ADR-0057, diseño §10.3): la suya y
      // la de la vecina que la comparte. Moverlas dejaría el clip pagado fuera
      // de tramo. La entrega 3 las desbloquea con ajuste a frases.
      if (movesLockedAvatarBoundary(scenes, scene, change))
        throw new PipelineFailure(
          'avatar_timing_locked',
          'Avatar scene boundaries cannot move while its clip or HeyGen receipts depend on them',
        )
      renderAffected = true
    }
    if (
      change.staticTransitionIn !== undefined &&
      (scene.staticTransitionIn === true) !== change.staticTransitionIn
    )
      renderAffected = true
    const next = applyChange(scene, change)
    // La presencia forma parte del prompt de Mi estilo, no solo de las fotos.
    // Invalidar el texto obliga a reescribirlo en la PRÓXIMA regeneración;
    // no borra la imagen pagada ni cambia el estado del video al tocar la casilla.
    if (
      metadata.options.customStyle &&
      change.charactersPresent !== undefined
    ) {
      const previous = new Set(scene.charactersPresent ?? [])
      const current = new Set(change.charactersPresent)
      const changed =
        previous.size !== current.size ||
        [...previous].some((index) => !current.has(index))
      if (changed) {
        delete next.imagePrompt
        delete next.promptIsFallback
      }
    }
    patched.push(next)
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
function hasTimingChange(scene: Scene, change: SceneChange): boolean {
  for (const field of TIMING_FIELDS) {
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

// ¿El cambio toca algo que solo vive en la imagen de la escena?
function editsSceneImage(change: SceneChange): boolean {
  return IMAGE_ONLY_FIELDS.some((field) => change[field] !== undefined)
}

// Una escena de avatar con clip o con recibos de HeyGen (ADR-0057).
function isLockedAvatarScene(scene: Scene): boolean {
  if (scene.avatar?.clipFile) return true
  return (scene.avatar?.attempts?.length ?? 0) > 0
}

// ¿El cambio mueve una frontera de una escena de avatar bloqueada? La suya, o
// la que comparte con su vecina: `update-scenes` no exige que lleguen las dos
// mitades de una frontera, y mover solo la vecina invadiría el tramo del clip.
function movesLockedAvatarBoundary(
  scenes: Scene[],
  scene: Scene,
  change: SceneChange,
): boolean {
  if (isLockedAvatarScene(scene)) return true

  const movesStart =
    change.startSeconds !== undefined &&
    !secondsEqual(scene.startSeconds, change.startSeconds)
  const movesEnd =
    change.endSeconds !== undefined &&
    !secondsEqual(scene.endSeconds, change.endSeconds)
  return scenes.some((other) => {
    if (!isLockedAvatarScene(other)) return false
    if (
      movesEnd &&
      other.startSeconds !== undefined &&
      secondsEqual(scene.endSeconds, other.startSeconds)
    )
      return true
    return (
      movesStart &&
      other.endSeconds !== undefined &&
      secondsEqual(scene.startSeconds, other.endSeconds)
    )
  })
}

function assertValidChange(change: SceneChange): void {
  if (
    change?.staticTransitionIn !== undefined &&
    typeof change.staticTransitionIn !== 'boolean'
  )
    throw new PipelineFailure(
      'invalid_payload',
      'staticTransitionIn must be a boolean',
    )
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
  if (change.staticTransitionIn !== undefined)
    next.staticTransitionIn = change.staticTransitionIn
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
