import { clamp } from '@/modules/common/utilities/clamp'
import { MIN_SCENE_SECONDS } from '@/modules/videos/constants'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// Frontera compartida entre dos escenas contiguas, acotada para que ninguna
// de las dos baje del piso de MIN_SCENE_SECONDS y redondeada a milésimas.
// La usan el drag de la línea de tiempo y el tipeo de In/Out del panel, para
// que las dos formas de mover una frontera den exactamente lo mismo.
export function clampBoundarySeconds(
  left: SceneDetail,
  right: SceneDetail,
  seconds: number,
): number {
  const min = (left.startSeconds ?? 0) + MIN_SCENE_SECONDS
  const max = (right.endSeconds ?? 0) - MIN_SCENE_SECONDS
  return Math.round(clamp(seconds, min, max) * 1000) / 1000
}
