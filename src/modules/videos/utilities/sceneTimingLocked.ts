import { animationTimingLocked } from '@/modules/videos/utilities/animationTimingLocked'
import { avatarTimingLocked } from '@/modules/videos/utilities/avatarTimingLocked'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// ¿Se puede mover la frontera entre estas escenas? No si un clip de Kie (o su
// recibo) depende de ellas, ni si alguna es una escena de avatar.
export function sceneTimingLocked(
  scenes: SceneDetail[],
  sceneIds: number[],
): boolean {
  return (
    animationTimingLocked(scenes, sceneIds) ||
    avatarTimingLocked(scenes, sceneIds)
  )
}
