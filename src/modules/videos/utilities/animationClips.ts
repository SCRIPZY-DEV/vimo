import { sceneAnimationBlocks } from '@pipeline/animation/scene-blocks.ts'
import type { SceneAnimationView } from '@pipeline/types/animation.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

export interface ReadyAnimationClip {
  id: string
  lead: SceneDetail
  scenes: SceneDetail[]
  animation: SceneAnimationView
  startSeconds: number
  endSeconds: number
}

// Proyecta clips válidos, incluidos fragmentos de una escena y clips heredados.
// El reloj lo fija el intervalo persistido; no la duración nominal de la imagen.
export function readyAnimationClips(
  scenes: SceneDetail[],
): ReadyAnimationClip[] {
  const clips: ReadyAnimationClip[] = []
  for (const [index, lead] of scenes.entries()) {
    for (const animation of sceneAnimationBlocks(lead)) {
      if (animation.status !== 'ready' || !animation.clipPath) continue
      if (animation.sceneIds[0] !== lead.id) continue
      const covered = scenes.slice(index, index + animation.sceneIds.length)
      if (covered.length !== animation.sceneIds.length) continue
      if (
        !covered.every(
          (scene, offset) => scene.id === animation.sceneIds[offset],
        )
      )
        continue

      const sceneStart = covered[0]?.startSeconds
      const sceneEnd = covered[covered.length - 1]?.endSeconds
      if (sceneStart === undefined || sceneEnd === undefined) continue
      const startSeconds = animation.startSeconds ?? sceneStart
      const endSeconds = animation.endSeconds ?? sceneEnd
      if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds))
        continue
      if (
        startSeconds < sceneStart ||
        endSeconds > sceneEnd ||
        endSeconds <= startSeconds
      )
        continue

      clips.push({
        id: animation.id ?? `legacy-${lead.id}`,
        lead,
        scenes: covered,
        animation,
        startSeconds,
        endSeconds,
      })
    }
  }
  return clips.sort((left, right) => left.startSeconds - right.startSeconds)
}
