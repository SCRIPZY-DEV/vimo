import { avatarCoveredIntervals } from '../../animation/avatar-coverage.ts'
import type { AnimationInterval } from '../../animation/planner.ts'
import { sceneAnimationBlocks } from '../../animation/scene-blocks.ts'
import { sceneAnimationClipFile } from '../../animation/clip-path.ts'
import { slotDurationSeconds } from '../../animation/timing.ts'
import {
  avatarLookPreviewFile,
  findAvatarLookPreview,
} from '../../avatar/clip-path.ts'
import {
  isValidFile,
  sceneImageFile,
  type ProjectPaths,
} from '../../project/paths.ts'
import {
  resolveSceneImageSourceId,
  toSceneAvatarView,
  type SceneViewProject,
} from '../../project/scenes-file.ts'
import type { Scene } from '../../types/scenes.ts'
import { measureDurationSeconds } from '../../utils/media-duration.ts'
import type { RenderScene } from './chunk-renderer.ts'
import { ANIMATION_CLIP_PAD_SECONDS } from './constants.ts'

export interface RenderSceneCollection {
  renderScenes: RenderScene[]
  // Escenas con tramo sin una imagen válida: el render falla con
  // `render_missing_images`. Nunca incluye a una escena de avatar.
  missingImages: number[]
  // Escenas de avatar sin clip que sirva y sin la vista previa del look
  // (`avatar/look.<ext>`), la única imagen que pueden tener: el render y el
  // export fallan con `avatar_render_look_unavailable`. Ninguna escena de
  // avatar tiene `scenes/scene_<id>.jpg`, así que no cuentan como imagen
  // faltante.
  missingAvatarLooks: number[]
}

const TIME_TOLERANCE_SECONDS = 0.001

function overlapsInterval(
  left: AnimationInterval,
  right: AnimationInterval,
): boolean {
  return (
    left.startSeconds < right.endSeconds - TIME_TOLERANCE_SECONDS &&
    right.startSeconds < left.endSeconds - TIME_TOLERANCE_SECONDS
  )
}

// La candidata de una escena de avatar (ADR-0057, diseño §10.1): su clip
// listo, en disco y vigente según la MISMA vista que usan el timeline y el
// visor (`toSceneAvatarView`: un `ready` sin archivo sale fallido; otra
// narración u otro tramo, desactualizado), legible, sin quedar corto para su
// tramo y a velocidad 1 sobre el tramo exacto. Si no, la escena sale estática
// con la vista previa del look y un aviso (ADR-0057, enmienda del
// 2026-10-10): el video nunca queda con un hueco.
async function avatarCandidate(
  paths: ProjectPaths,
  ffmpegPath: string,
  scene: Scene,
  cameraIndex: number,
  project: SceneViewProject,
  warn: (message: string) => void,
): Promise<RenderScene | null> {
  const view = await toSceneAvatarView(paths, scene, project)
  if (!view) return null

  const fallback = `scene ${scene.id}: rendering the avatar look static`
  if (view.status === 'planned') {
    warn(`${fallback} (avatar clip is not ready)`)
    return null
  }

  if (view.status === 'failed' || !view.clipPath) {
    warn(`${fallback} (avatar clip failed: ${view.errorCode ?? 'unknown'})`)
    return null
  }

  if (view.stale) {
    warn(`${fallback} (avatar clip is outdated)`)
    return null
  }

  const measuredSeconds = await measureDurationSeconds(
    ffmpegPath,
    view.clipPath,
  )
  if (measuredSeconds <= 0) {
    warn(`${fallback} (avatar clip is unreadable)`)
    return null
  }

  const startSeconds = scene.startSeconds!
  const endSeconds = scene.endSeconds!
  // El hueco cuantizado al cuadro (las fronteras pueden quedar al milisegundo
  // tras reemplazar la narración).
  const slotSeconds = slotDurationSeconds(startSeconds, endSeconds)
  // El chunk rellena un clip corto con su último cuadro durante
  // ANIMATION_CLIP_PAD_SECONDS y nada más: uno más corto que eso dejaría el
  // chunk corto y correría todo lo que sigue. El carril escribe el clip con
  // los cuadros exactos del tramo, así que solo un archivo truncado llega acá.
  if (measuredSeconds < slotSeconds - ANIMATION_CLIP_PAD_SECONDS) {
    warn(`${fallback} (avatar clip is too short)`)
    return null
  }

  return {
    id: scene.id,
    // Con clip, el chunk dibuja el clip: `imagePath` es solo la imagen fija
    // de la escena, nunca el video. La vista previa del look o, si falta, el
    // lugar donde iría (como la imagen de la escena en un clip de Kie, que
    // tampoco se exige).
    imagePath:
      (await findAvatarLookPreview(paths)) ??
      avatarLookPreviewFile(paths, 'jpg'),
    startSeconds,
    endSeconds,
    clipPath: view.clipPath,
    // El carril ya dejó el clip con el largo exacto del tramo, a 25 fps y sin
    // audio. Declararlo con el hueco fija `rate = 1` en el chunk
    // (chunk-renderer.ts): el clip nunca se retima, solo se rellena con su
    // último cuadro o se recorta al tramo. La narración manda.
    clipSeconds: slotSeconds,
    cameraIndex,
  }
}

// La imagen fija de una escena, o undefined si no tiene una válida. Una
// escena de avatar no genera imagen: la suya es la vista previa del look.
async function staticImagePath(
  paths: ProjectPaths,
  scene: Scene,
): Promise<string | undefined> {
  if (scene.avatar) return findAvatarLookPreview(paths)

  const imagePath = sceneImageFile(
    paths,
    await resolveSceneImageSourceId(paths, scene),
  )
  if (!(await isValidFile(imagePath))) return undefined

  return imagePath
}

// Materializa todos los intervalos listos, incluidas varias partes de una
// misma escena. Las partes no animadas conservan imagen y reloj propios. El
// tramo de una escena de avatar es suyo (ADR-0057): su clip o la vista previa
// del look, nunca un clip de Kie encima.
export async function collectRenderScenes(
  paths: ProjectPaths,
  ffmpegPath: string,
  timedScenes: Scene[],
  project: SceneViewProject,
  warn: (message: string) => void,
): Promise<RenderSceneCollection> {
  const positions = new Map(
    timedScenes.map((scene, index) => [scene.id, index]),
  )
  const byId = new Map(timedScenes.map((scene) => [scene.id, scene]))

  // El tramo de TODA escena de avatar, sin importar su estado: la misma regla
  // de cobertura del planificador de Kie y del visor.
  const avatarSpans = avatarCoveredIntervals(timedScenes)
  const avatarClips: RenderScene[] = []
  for (const [index, scene] of timedScenes.entries()) {
    if (!scene.avatar) continue

    const candidate = await avatarCandidate(
      paths,
      ffmpegPath,
      scene,
      index,
      project,
      warn,
    )
    if (candidate) avatarClips.push(candidate)
  }

  const candidates: RenderScene[] = []
  for (const scene of timedScenes) {
    for (const animation of sceneAnimationBlocks(scene)) {
      if (animation.status !== 'ready' || animation.sceneIds[0] !== scene.id)
        continue
      const first = positions.get(scene.id)
      const group = animation.sceneIds.map((id) => byId.get(id))
      const contiguous =
        first !== undefined &&
        group.every(
          (member, index) =>
            member !== undefined &&
            positions.get(member.id) === first + index &&
            (index === 0 ||
              Math.abs(
                (group[index - 1]?.endSeconds ?? 0) -
                  (member.startSeconds ?? 0),
              ) < TIME_TOLERANCE_SECONDS),
        )
      if (!contiguous) {
        warn(
          `scene ${scene.id}: animation coverage no longer matches the timeline`,
        )
        continue
      }
      const startSeconds = animation.startSeconds ?? scene.startSeconds!
      const endSeconds =
        animation.endSeconds ?? group[group.length - 1]!.endSeconds!
      if (
        !Number.isFinite(startSeconds) ||
        !Number.isFinite(endSeconds) ||
        endSeconds <= startSeconds ||
        startSeconds < scene.startSeconds! - TIME_TOLERANCE_SECONDS ||
        endSeconds >
          group[group.length - 1]!.endSeconds! + TIME_TOLERANCE_SECONDS
      ) {
        warn(`scene ${scene.id}: invalid animation interval`)
        continue
      }
      let clipPath: string
      try {
        clipPath = sceneAnimationClipFile(paths, scene.id, animation)
      } catch {
        warn(`scene ${scene.id}: invalid animation filename`)
        continue
      }
      if (!(await isValidFile(clipPath))) {
        warn(
          `scene ${scene.id}: animation clip is missing, rendering it static`,
        )
        continue
      }
      const clipSeconds = await measureDurationSeconds(ffmpegPath, clipPath)
      if (clipSeconds <= 0) {
        warn(
          `scene ${scene.id}: animation clip is unreadable, rendering it static`,
        )
        continue
      }
      candidates.push({
        id: scene.id,
        imagePath: sceneImageFile(
          paths,
          await resolveSceneImageSourceId(paths, scene),
        ),
        startSeconds,
        endSeconds,
        clipPath,
        clipSeconds,
        cameraIndex: first,
      })
    }
  }

  const clips: RenderScene[] = []
  for (const candidate of candidates.sort(
    (left, right) => left.startSeconds - right.startSeconds,
  )) {
    // Un clip de Kie heredado que pisa una escena de avatar se descarta en
    // CUALQUIER estado del avatar (planeado, fallido, desactualizado o listo):
    // el tramo es del avatar —su clip o la vista previa del look— y nunca de
    // Kie, igual que en el planificador y el visor (Kie ya no marca ninguna
    // escena de avatar, ADR-0057).
    if (avatarSpans.some((span) => overlapsInterval(candidate, span))) {
      warn(`scene ${candidate.id}: animation overlaps an avatar scene, ignored`)
      continue
    }
    const previous = clips[clips.length - 1]
    if (
      previous &&
      candidate.startSeconds < previous.endSeconds - TIME_TOLERANCE_SECONDS
    ) {
      warn(`scene ${candidate.id}: overlapping animation ignored`)
      continue
    }
    clips.push(candidate)
  }
  // El cursor de las partes estáticas recorre los clips en orden de tiempo.
  if (avatarClips.length > 0) {
    clips.push(...avatarClips)
    clips.sort((left, right) => left.startSeconds - right.startSeconds)
  }

  const renderScenes = [...clips]
  const missingImages: number[] = []
  const missingAvatarLooks: number[] = []
  for (const [index, scene] of timedScenes.entries()) {
    let cursor = scene.startSeconds!
    const endSeconds = scene.endSeconds!
    const staticParts: { startSeconds: number; endSeconds: number }[] = []
    for (const clip of clips) {
      if (clip.endSeconds <= cursor || clip.startSeconds >= endSeconds) continue
      if (clip.startSeconds > cursor)
        staticParts.push({
          startSeconds: cursor,
          endSeconds: clip.startSeconds,
        })
      cursor = Math.max(cursor, Math.min(endSeconds, clip.endSeconds))
    }
    if (cursor < endSeconds)
      staticParts.push({ startSeconds: cursor, endSeconds })
    if (staticParts.length === 0) continue

    // Una escena de avatar sin clip que sirva sale estática con la vista
    // previa del look (ADR-0057, enmienda del 2026-10-10), con el movimiento
    // de cámara de siempre.
    const imagePath = await staticImagePath(paths, scene)
    if (!imagePath) {
      if (scene.avatar) missingAvatarLooks.push(scene.id)
      else missingImages.push(scene.id)
      continue
    }

    for (const part of staticParts)
      renderScenes.push({
        id: scene.id,
        imagePath,
        ...part,
        cameraIndex: index,
        staticTransitionIn: scene.staticTransitionIn,
      })
  }
  renderScenes.sort((left, right) => left.startSeconds - right.startSeconds)
  return { renderScenes, missingImages, missingAvatarLooks }
}
