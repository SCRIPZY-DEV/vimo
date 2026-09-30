import { sceneAnimationBlocks } from '@pipeline/animation/scene-blocks.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// Los cortes son parte del recibo pagado: también se protegen los candidatos
// fallidos, porque aún pueden contener una tarea remota recuperable.
export function animationTimingLocked(
  scenes: SceneDetail[],
  sceneIds: number[],
): boolean {
  return scenes.some((scene) =>
    [...sceneAnimationBlocks(scene), ...(scene.animationPending ?? [])].some(
      (animation) => animation.sceneIds.some((id) => sceneIds.includes(id)),
    ),
  )
}
