import { sceneAnimationBlocks } from '@pipeline/animation/scene-blocks.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// Reanudar una tarea ya cobrada no exige presupuesto para otra generación.
// La descarga y normalización pendientes permanecen disponibles con saldo cero.
export function resumableAnimationIntervals(scenes: SceneDetail[]) {
  return scenes.flatMap((scene) => {
    const animations = [
      ...sceneAnimationBlocks(scene).filter(
        (animation) => animation.status !== 'ready' || !animation.clipPath,
      ),
      ...(scene.animationPending ?? []),
    ]
    return animations
      .filter((animation) => animation.canResumeTask)
      .flatMap((animation) => {
        const startSeconds =
          animation.startSeconds ??
          scenes.find((item) => item.id === animation.sceneIds[0])?.startSeconds
        const endSeconds =
          animation.endSeconds ??
          scenes.find((item) => item.id === animation.sceneIds.at(-1))
            ?.endSeconds
        if (startSeconds === undefined || endSeconds === undefined) return []
        if (
          !Number.isFinite(startSeconds) ||
          !Number.isFinite(endSeconds) ||
          endSeconds <= startSeconds
        )
          return []
        return [
          {
            startSeconds,
            endSeconds,
            canRecoverLocally: animation.canRecoverLocally === true,
          },
        ]
      })
  })
}
