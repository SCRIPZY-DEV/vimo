import { avatarSceneSpan } from '../types/avatar.ts'
import type { AnimationInterval } from './planner.ts'

// Las escenas de avatar frente al planificador de Kie (ADR-0057, §7.4 del
// diseño). Puro y browser-safe: lo usan el sidecar (`generate.ts`, la fase de
// animación, el render y el estado del proyecto) y las cuatro utilidades de la
// UI que planifican clips.
//
// REGLA DE COBERTURA: TODA escena de avatar cuenta, sin importar su estado
// (planeada, con el pedido en curso, fallida, desactualizada o lista). Kie
// nunca cubre un avatar, ni siquiera mientras su clip no existe: el
// planificador, el render (diseño §10.1) y el visor descartan un clip de Kie
// heredado bajo cualquier avatar, así que el tramo de un avatar sin clip no se
// rellena con uno de Kie.

// Lo mínimo que se lee de una escena: sirve igual para `Scene` (sidecar) y
// para `SceneDetail` y `SceneView` (UI).
export interface AvatarCoverageScene {
  id: number
  startSeconds?: number
  endSeconds?: number
  avatar?: unknown
}

// Las marcas sin las escenas de avatar. Pasar su tramo en `coveredIntervals`
// no alcanza: el planificador rechaza por larga (más de 12 s) una escena
// marcada ANTES de mirar si está cubierta (`planner.ts`, `slot_out_of_range`),
// y una aparición dura de 7 a 60 s. Las dos defensas son independientes: sin
// la cobertura, una marcada de 12 s o menos se compraría como clip.
export function withoutAvatarSceneIds(
  sceneIds: Iterable<number>,
  scenes: readonly AvatarCoverageScene[],
): number[] {
  const avatarIds = new Set(
    scenes.filter((scene) => Boolean(scene.avatar)).map((scene) => scene.id),
  )
  return [...sceneIds].filter((id) => !avatarIds.has(id))
}

// Los tramos de las escenas de avatar como «cubiertos por otro proveedor»:
// ninguna escena vecina se agrupa ni se estira sobre ellos, y dos imágenes del
// prefijo separadas por un avatar no forman pareja. Un tramo que no llega a un
// cuadro de 25 fps no cubre nada: la regla única de «avatar de largo cero»
// (`avatarSceneSpan`), la misma del carril, la pista y el visor.
export function avatarCoveredIntervals(
  scenes: readonly AvatarCoverageScene[],
): AnimationInterval[] {
  return scenes.flatMap((scene) => {
    const span = avatarSceneSpan(scene)
    if (!span) return []

    return [span]
  })
}
