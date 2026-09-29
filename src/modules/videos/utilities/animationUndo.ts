import { sceneAnimationBlocks } from '@pipeline/animation/scene-blocks.ts'
import type { SceneAnimationView } from '@pipeline/types/animation.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// El detalle marca como error un MP4 ausente o inválido, aunque su recibo en
// disco siga listo. Deshacer debe seguir disponible para recuperar las fuentes.
export function undoableAnimationClips(
  scenes: SceneDetail[],
): SceneAnimationView[] {
  return scenes
    .flatMap((scene) => sceneAnimationBlocks(scene))
    .filter(
      (animation) =>
        animation.status === 'ready' ||
        animation.errorCode === 'animation_clip_missing' ||
        animation.errorCode === 'animation_media_invalid',
    )
}

export function animationUndoPending(
  scenes: SceneDetail[],
  sceneId: number,
): boolean {
  const removed = undoableAnimationClips(scenes).filter((animation) =>
    animation.sceneIds.includes(sceneId),
  )
  const restored = new Set(removed.flatMap((animation) => animation.sceneIds))
  return scenes
    .flatMap((scene) => scene.animationPending ?? [])
    .some((animation) => {
      if (!animation.sceneIds.some((id) => restored.has(id))) return false
      // submissionUnknown carece de taskId: no autoriza comprar ni descartar el
      // encargo que quizá recibió Kie. El backend confirma esta misma reserva.
      return (
        animation.submissionUnknown === true ||
        animation.canResumeTask === true ||
        animation.status === 'pending'
      )
    })
}
