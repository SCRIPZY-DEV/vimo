import type { SceneDetail } from '@pipeline/types/video-project.ts'

// En la entrega 2 las fronteras de una escena de avatar no se mueven (spec
// §10.3 y §16): su tramo se planeó sobre frases enteras y el clip pagado se
// ajustó a él. La UI no ve los recibos (no viajan en la vista, §3.3), así que
// se bloquea toda escena de avatar, con o sin clip; la entrega 3 las abre con
// asas que ajustan a frases.
export function avatarTimingLocked(
  scenes: SceneDetail[],
  sceneIds: number[],
): boolean {
  return scenes.some(
    (scene) => scene.avatar !== undefined && sceneIds.includes(scene.id),
  )
}
