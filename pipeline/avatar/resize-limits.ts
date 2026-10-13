import { TIME_EPSILON } from '../animation/timing.ts'
import { MIN_SECONDS_PER_SCENE } from '../stages/scene-cuts/by-seconds.ts'
import {
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MIN_APPEARANCE_SECONDS,
} from '../types/avatar.ts'
import type { AvatarResizeLimits, AvatarResizeScene } from '../types/avatar.ts'

// La duración de una aparición desde el editor (entrega 2g, diseño §23.3):
// hasta dónde puede crecer o achicarse una escena de avatar en su lugar (el
// inicio no se mueve) y cuántas escenas de imagen taparía. Puro y browser-safe
// (sin `node:*`): la UI lo usa con las escenas del proyecto para el selector y
// la confirmación, y el sidecar, para validar el pedido antes de pagar. Lo que
// necesita de cada escena es `AvatarResizeScene` (`timingLocked`: una animación
// o un recibo de animación dependen de sus tiempos, el candado de
// update-scenes). Las comparaciones usan TIME_EPSILON, como el planificador.

// Los límites de la escena de avatar `sceneId`, o null si no es una escena de
// avatar (o sus tiempos no son números). `currentSeconds` es lo que dura hoy.
// `maxSeconds` es lo primero que llegue entre AVATAR_MAX_APPEARANCE_SECONDS, el
// inicio de la próxima escena de avatar menos MIN_SECONDS_PER_SCENE (queda al
// menos una escena de imagen entre las dos), el inicio de la primera escena
// bloqueada que la sigue y el fin del audio, contado desde su inicio y en
// segundos enteros hacia abajo; nunca menos que `minSeconds`. `minSeconds` es
// AVATAR_MIN_APPEARANCE_SECONDS o, si la escena que la sigue está bloqueada,
// lo que dura hoy redondeado: su fin no se puede mover, así que tampoco se
// achica. La última escena del video tampoco cambia (R-2g-18): mínimo y
// máximo son lo que dura hoy redondeado, porque lo que soltara no tendría
// imagen y alargarla pasaría el fin del audio.
export function avatarResizeLimits(
  scenes: readonly AvatarResizeScene[],
  sceneId: number,
  audioEndSeconds: number,
): AvatarResizeLimits | null {
  const scene = avatarSceneOf(scenes, sceneId)
  if (!scene) return null

  const currentSeconds = scene.endSeconds - scene.startSeconds
  const following = scenesAfter(scenes, scene)
  if (following.length === 0) {
    const seconds = Math.round(currentSeconds)
    return { currentSeconds, minSeconds: seconds, maxSeconds: seconds }
  }

  const minSeconds =
    following[0]?.timingLocked === true
      ? Math.round(currentSeconds)
      : AVATAR_MIN_APPEARANCE_SECONDS
  const nextAvatar = following.find((candidate) => candidate.isAvatar)
  const firstLocked = following.find((candidate) => candidate.timingLocked)
  const bounds = [
    AVATAR_MAX_APPEARANCE_SECONDS,
    audioEndSeconds - scene.startSeconds,
  ]
  if (nextAvatar)
    bounds.push(
      nextAvatar.startSeconds - MIN_SECONDS_PER_SCENE - scene.startSeconds,
    )
  if (firstLocked) bounds.push(firstLocked.startSeconds - scene.startSeconds)
  const reachable = Math.floor(
    Math.min(...bounds.filter((bound) => Number.isFinite(bound))) +
      TIME_EPSILON,
  )

  return {
    currentSeconds,
    minSeconds,
    maxSeconds: Math.max(minSeconds, reachable),
  }
}

// Cuántas escenas de imagen taparía la escena de avatar `sceneId` si durara
// `targetSeconds` desde su inicio, para la confirmación: las que siguen y
// terminan antes del fin nuevo, más la que quedaría con menos de
// MIN_SECONDS_PER_SCENE (sale del video). Es aproximado: cuenta con los
// segundos elegidos, no con el corte entre dos palabras. 0 si no es una escena
// de avatar, si no crece o si `targetSeconds` no es un número (un campo vacío
// no tapa nada).
export function avatarResizeCoveredScenes(
  scenes: readonly AvatarResizeScene[],
  sceneId: number,
  targetSeconds: number,
): number {
  const scene = avatarSceneOf(scenes, sceneId)
  if (!scene) return 0

  if (!Number.isFinite(targetSeconds)) return 0

  const newEnd = scene.startSeconds + targetSeconds
  let covered = 0
  for (const following of scenesAfter(scenes, scene)) {
    if (following.isAvatar) break

    if (following.startSeconds >= newEnd - TIME_EPSILON) break

    // La que contiene el fin nuevo se queda con lo que sobra, si le alcanza
    // para una escena.
    const remaining = following.endSeconds - newEnd
    if (remaining > TIME_EPSILON) {
      if (remaining < MIN_SECONDS_PER_SCENE - TIME_EPSILON) covered++
      break
    }

    covered++
  }

  return covered
}

// La escena de avatar `sceneId` con tiempos que son números, o undefined.
function avatarSceneOf(
  scenes: readonly AvatarResizeScene[],
  sceneId: number,
): AvatarResizeScene | undefined {
  const scene = scenes.find((candidate) => candidate.id === sceneId)
  if (!scene?.isAvatar) return undefined

  if (!Number.isFinite(scene.startSeconds)) return undefined

  if (!Number.isFinite(scene.endSeconds)) return undefined

  return scene
}

// Las escenas que vienen después de `scene` (arrancan después de su inicio,
// con TIME_EPSILON), en orden de tiempo. Exportada para que el cambio de
// duración (`resize-plan.ts`) mire las mismas escenas, con la misma
// tolerancia, que los límites.
export function scenesAfter(
  scenes: readonly AvatarResizeScene[],
  scene: AvatarResizeScene,
): AvatarResizeScene[] {
  return scenes
    .filter((candidate) => {
      if (candidate.id === scene.id) return false

      return candidate.startSeconds > scene.startSeconds + TIME_EPSILON
    })
    .sort((first, second) => first.startSeconds - second.startSeconds)
}
