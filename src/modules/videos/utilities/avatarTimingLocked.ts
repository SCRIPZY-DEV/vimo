import type { SceneDetail } from '@pipeline/types/video-project.ts'

// Las fronteras de una escena de avatar no se arrastran en la pista (spec
// §10.3 y §16, diseño §23.3): su tramo se planeó para terminar en una pausa de
// la narración y el clip pagado se ajustó a él. La UI no ve los recibos (no
// viajan en la vista, §3.3), así que se bloquea toda escena de avatar, con o
// sin clip. Desde la entrega 2g la forma de cambiarlas es el selector
// «Duración» del panel y de la tarjeta de la vista ampliada
// (utilities/avatarDuration.ts), que recorta el clip o pide uno nuevo.
export function avatarTimingLocked(
  scenes: SceneDetail[],
  sceneIds: number[],
): boolean {
  return scenes.some(
    (scene) => scene.avatar !== undefined && sceneIds.includes(scene.id),
  )
}
