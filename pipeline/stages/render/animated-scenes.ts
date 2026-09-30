import { sceneAnimationBlocks } from '../../animation/scene-blocks.ts'
import { sceneAnimationClipFile } from '../../animation/clip-path.ts'
import {
  isValidFile,
  sceneImageFile,
  type ProjectPaths,
} from '../../project/paths.ts'
import { resolveSceneImageSourceId } from '../../project/scenes-file.ts'
import type { Scene } from '../../types/scenes.ts'
import { measureDurationSeconds } from '../../utils/media-duration.ts'
import type { RenderScene } from './chunk-renderer.ts'

export interface RenderSceneCollection {
  renderScenes: RenderScene[]
  missingImages: number[]
}

const TIME_TOLERANCE_SECONDS = 0.001

// Materializa todos los intervalos listos, incluidas varias partes de una
// misma escena. Las partes no animadas conservan imagen y reloj propios.
export async function collectRenderScenes(
  paths: ProjectPaths,
  ffmpegPath: string,
  timedScenes: Scene[],
  warn: (message: string) => void,
): Promise<RenderSceneCollection> {
  const positions = new Map(
    timedScenes.map((scene, index) => [scene.id, index]),
  )
  const byId = new Map(timedScenes.map((scene) => [scene.id, scene]))
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

  const renderScenes = [...clips]
  const missingImages: number[] = []
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
    const imagePath = sceneImageFile(
      paths,
      await resolveSceneImageSourceId(paths, scene),
    )
    if (!(await isValidFile(imagePath))) {
      missingImages.push(scene.id)
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
  return { renderScenes, missingImages }
}
