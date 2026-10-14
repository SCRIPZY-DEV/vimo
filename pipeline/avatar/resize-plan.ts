import { sceneAnimationBlocks } from '../animation/scene-blocks.ts'
import { frameBoundary, TIME_EPSILON } from '../animation/timing.ts'
import {
  cutScenesAtBoundaries,
  MIN_SECONDS_PER_SCENE,
} from '../stages/scene-cuts/by-seconds.ts'
import {
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MAX_PAUSE_SECONDS,
  AVATAR_MIN_APPEARANCE_SECONDS,
  AVATAR_OPENING_MAX_PAUSE_SECONDS,
  AVATAR_SHORTEST_APPEARANCE_SECONDS,
} from '../types/avatar.ts'
import type {
  AvatarResizeLimits,
  AvatarResizeScene,
  SceneAvatar,
} from '../types/avatar.ts'
import type { Scene, TranscriptWord } from '../types/scenes.ts'
import { avatarCutEnd, avatarCutLimit } from './appearance-cut.ts'
import { avatarResizeLimits, scenesAfter } from './resize-limits.ts'

// La duración nueva de una aparición elegida en el editor (entrega 2g, diseño
// §23.3): el tramo nuevo de la escena de avatar y lo que les pasa a las
// escenas de imagen que la siguen. Puro y browser-safe (sin `node:*`): lo usan
// `avatar-render-scenes` (con `durations`, antes de pagar y otra vez al
// aplicar el clip nuevo) y `avatar-trim-scene`.
//
// El inicio no se mueve. El fin lo pone `avatarCutEnd` (appearance-cut.ts)
// con los segundos elegidos como objetivo, la regla de §23.2, con el límite de
// `avatarCutLimit` sobre el máximo de `avatarResizeLimits` (resize-limits.ts):
// una pausa de más de AVATAR_MAX_PAUSE_SECONDS corta la aparición ahí, y no
// carga más que eso después de la última palabra (R-2g-11), como en el
// planificador. Como en el planificador también, la aparición nunca queda por
// debajo del piso (AVATAR_SHORTEST_APPEARANCE_SECONDS, 4,5 s; R-2g-21): si el
// plan la deja más corta, la apertura (la escena de avatar que arranca en 0)
// prueba otra vez cargando las pausas de hasta AVATAR_OPENING_MAX_PAUSE_SECONDS
// —una más larga la corta igual, con la misma cola—, el segundo intento de
// `openingSpan` (R-2g-17); y si así tampoco, o si es otra escena, el plan se
// rechaza con `avatar_resize_out_of_range` antes de recortar o pagar nada. Así
// la apertura que el planificador armó cargando una pausa de 2 a 6 s se recorta
// cerca de lo pedido (con la regla de 2 s quedaba de menos de 3 s, y ninguna
// duración la recuperaba: I-1 de la revisión final). Después, las escenas que
// siguen:
// - al crecer, las de imagen que tapa enteras salen del video (sus imágenes
//   quedan en disco; los ids quedan con huecos, R-2g-3) y la que tiene el fin
//   empieza ahí. Si le quedarían menos de MIN_SECONDS_PER_SCENE, también sale y
//   la de imagen que sigue empieza en el fin. Si no hay una que pueda empezar
//   antes (era la última, o la que sigue está bloqueada), el avatar se queda
//   con el resto de esa escena, como el corte con los tramos libres cortos
//   (`pinnedTimeline`: mejor que el avatar hable unos segundos más a que haya
//   una imagen de dos), siempre que así no pase AVATAR_MAX_APPEARANCE_SECONDS
//   ni quede a menos de MIN_SECONDS_PER_SCENE de la próxima escena de avatar;
//   si no, el corte se busca de nuevo dejándole a esa escena
//   MIN_SECONDS_PER_SCENE;
// - al achicar, la que sigue empieza en el fin nuevo y suma las palabras que el
//   avatar ya no dice. Si la escena de avatar es la última del video no se
//   puede achicar: lo que deja no tendría imagen.
// Una escena bloqueada (una animación o un recibo de animación dependen de sus
// tiempos, el candado de update-scenes) o de avatar nunca se mueve ni sale:
// el plan lo rechaza con `avatar_resize_locked`. Los segundos fuera de los
// límites, con `avatar_resize_out_of_range`.
// El texto de cada escena tocada se rehace con la regla de
// `cutScenesAtBoundaries` (cada palabra va donde cae su punto medio). Los
// segundos que redondean a la duración de hoy no cambian nada: es la misma
// duración (§23.3, «las acciones de siempre»). Las comparaciones usan
// TIME_EPSILON, como el planificador.

export const AVATAR_RESIZE_ERROR_CODES = {
  outOfRange: 'avatar_resize_out_of_range',
  locked: 'avatar_resize_locked',
} as const
export type AvatarResizeErrorCode =
  (typeof AVATAR_RESIZE_ERROR_CODES)[keyof typeof AVATAR_RESIZE_ERROR_CODES]

// Una escena que cambia con la duración nueva: su tramo y su texto nuevos.
export interface AvatarResizeSceneChange {
  sceneId: number
  startSeconds: number
  endSeconds: number
  text: string
}

// El tramo con que queda la escena de avatar y lo que cambia alrededor:
// `changes` trae la escena de avatar (si su fin se mueve) y la de imagen que
// empieza en el fin nuevo; `removedIds`, las de imagen que salen del video.
export interface AvatarResizePlan {
  startSeconds: number
  endSeconds: number
  changes: AvatarResizeSceneChange[]
  removedIds: number[]
}

export type AvatarResizeOutcome =
  { plan: AvatarResizePlan } | { errorCode: AvatarResizeErrorCode }

// Dónde termina la aparición con un corte y qué les pasa a las escenas que
// siguen: `moved` es la de imagen que empieza en el fin nuevo. `cutBefore`
// pide buscar el corte otra vez, a lo sumo en ese segundo.
type EndPlacement =
  | { endSeconds: number; removedIds: number[]; moved?: AvatarResizeScene }
  | { errorCode: AvatarResizeErrorCode }
  | { cutBefore: number }

// ¿Son segundos que se pueden elegir para una aparición? Un entero de
// AVATAR_MIN_APPEARANCE_SECONDS a AVATAR_MAX_APPEARANCE_SECONDS: el selector
// del editor va de a un segundo.
export function isAvatarAppearanceSeconds(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= AVATAR_MIN_APPEARANCE_SECONDS &&
    value <= AVATAR_MAX_APPEARANCE_SECONDS
  )
}

// Lo que el plan necesita de cada escena de scenes.json. `timingLocked` es el
// candado de update-scenes: alguna animación, ya hecha o pendiente, la incluye
// en sus `sceneIds`. Una escena sin tiempos queda con NaN y los límites no la
// cuentan.
export function avatarResizeScenesOf(
  scenes: readonly Scene[],
): AvatarResizeScene[] {
  const locked = new Set<number>()
  for (const scene of scenes)
    for (const animation of [
      ...sceneAnimationBlocks(scene),
      ...(scene.animationPending ?? []),
    ])
      for (const sceneId of animation.sceneIds) locked.add(sceneId)

  return scenes.map((scene) => ({
    id: scene.id,
    startSeconds: scene.startSeconds ?? Number.NaN,
    endSeconds: scene.endSeconds ?? Number.NaN,
    isAvatar: scene.avatar !== undefined,
    timingLocked: locked.has(scene.id),
  }))
}

// El fin del audio para los límites: el fin de la última escena (el corte
// cubre la narración entera), el mismo que usa el editor. NaN sin ninguna
// escena con tiempos.
export function avatarResizeAudioEnd(
  scenes: readonly AvatarResizeScene[],
): number {
  const ends = scenes
    .map((scene) => scene.endSeconds)
    .filter((seconds) => Number.isFinite(seconds))
  if (ends.length === 0) return Number.NaN

  return Math.max(...ends)
}

// El plan para que la escena de avatar `sceneId` dure `targetSeconds` en su
// lugar (ver la cabecera), o el código por el que no se puede.
export function avatarResizePlan(
  scenes: readonly AvatarResizeScene[],
  words: readonly TranscriptWord[],
  sceneId: number,
  targetSeconds: number,
  audioEndSeconds: number,
): AvatarResizeOutcome {
  const limits = avatarResizeLimits(scenes, sceneId, audioEndSeconds)
  const avatar = scenes.find((scene) => scene.id === sceneId)
  if (!limits || !avatar) return refused(AVATAR_RESIZE_ERROR_CODES.outOfRange)

  if (targetSeconds === Math.round(limits.currentSeconds))
    return { plan: unchangedPlan(avatar) }

  // Con la escena que sigue bloqueada, el fin no se puede mover (los límites
  // fijan la duración de hoy): el motivo es el candado, no el rango.
  const following = scenesAfter(scenes, avatar)
  if (following[0]?.timingLocked)
    return refused(AVATAR_RESIZE_ERROR_CODES.locked)

  if (!withinLimits(targetSeconds, limits))
    return refused(AVATAR_RESIZE_ERROR_CODES.outOfRange)

  const nextAvatarStart =
    following.find((scene) => scene.isAvatar)?.startSeconds ??
    Number.POSITIVE_INFINITY
  const placeWithin = (limitSeconds: number): EndPlacement => {
    const cut = avatarCutEnd(words, {
      startSeconds: avatar.startSeconds,
      targetSeconds,
      limitSeconds,
    })
    if (cut === undefined) return refused(AVATAR_RESIZE_ERROR_CODES.outOfRange)

    return placeEnd(avatar, following, cut, nextAvatarStart)
  }
  const planWithin = (limitSeconds: number): AvatarResizeOutcome => {
    const first = placeWithin(limitSeconds)
    if (!('cutBefore' in first)) return outcomeOf(scenes, words, avatar, first)

    // El corte de nuevo, dejándole a esa escena de imagen
    // MIN_SECONDS_PER_SCENE: si cae en ella, se queda con eso; si cae antes,
    // todas las escenas hasta ella ya resultaron de imagen y sin candado, así
    // que la que sigue al corte puede empezar en el fin. No pide otra vuelta.
    const second = placeWithin(Math.min(limitSeconds, first.cutBefore))
    if ('cutBefore' in second)
      return refused(AVATAR_RESIZE_ERROR_CODES.outOfRange)

    return outcomeOf(scenes, words, avatar, second)
  }

  // Cada intento corta en las pausas de más de lo que carga, con la misma cola
  // de AVATAR_MAX_PAUSE_SECONDS; el primero que no deja la aparición por
  // debajo del piso es el plan (ver la cabecera).
  const maximumEnd = maximumEndOf(limits, avatar, following, audioEndSeconds)
  for (const maximumPauseSeconds of loadedPausesOf(avatar)) {
    const outcome = planWithin(
      avatarCutLimit(
        words,
        avatar.startSeconds,
        maximumEnd,
        maximumPauseSeconds,
        AVATAR_MAX_PAUSE_SECONDS,
      ),
    )
    if (!belowFloor(outcome)) return outcome
  }

  return refused(AVATAR_RESIZE_ERROR_CODES.outOfRange)
}

// La lista de escenas con el plan aplicado: sin las que salen, con el tramo y
// el texto nuevos de las que cambian y con `avatar` en la escena de avatar.
// No toca nada más de ninguna escena (ni sus imágenes, que siguen en disco).
export function applyAvatarResizePlan(
  scenes: readonly Scene[],
  sceneId: number,
  plan: AvatarResizePlan,
  avatar: SceneAvatar,
): Scene[] {
  const removed = new Set(plan.removedIds)
  const changes = new Map(
    plan.changes.map((change) => [change.sceneId, change]),
  )
  return scenes.flatMap((scene) => {
    if (removed.has(scene.id)) return []

    const change = changes.get(scene.id)
    const next = change
      ? {
          ...scene,
          startSeconds: change.startSeconds,
          endSeconds: change.endSeconds,
          text: change.text,
        }
      : scene
    if (scene.id !== sceneId) return [next]

    return [{ ...next, avatar }]
  })
}

// La escena de avatar con el tramo y el texto del plan, sin tocar su avatar:
// la copia con la que trabaja el carril mientras la escena real conserva lo
// suyo.
export function withAvatarResizeSpan(
  scene: Scene,
  plan: AvatarResizePlan,
): Scene {
  const change = plan.changes.find((item) => item.sceneId === scene.id)
  if (!change) return scene

  return {
    ...scene,
    startSeconds: change.startSeconds,
    endSeconds: change.endSeconds,
    text: change.text,
  }
}

// ¿Los dos tramos ocupan los mismos cuadros de 25 fps? Es lo que mira la
// huella del clip (`avatarRenderHash`): un fin que cae en el mismo cuadro deja
// el mismo clip.
export function sameSpanFrames(
  first: Pick<Scene, 'startSeconds' | 'endSeconds'>,
  second: Pick<Scene, 'startSeconds' | 'endSeconds'>,
): boolean {
  return (
    frameBoundary(first.startSeconds ?? Number.NaN) ===
      frameBoundary(second.startSeconds ?? Number.NaN) &&
    frameBoundary(first.endSeconds ?? Number.NaN) ===
      frameBoundary(second.endSeconds ?? Number.NaN)
  )
}

function refused(errorCode: AvatarResizeErrorCode): {
  errorCode: AvatarResizeErrorCode
} {
  return { errorCode }
}

// Nada cambia: la escena conserva su tramo y su texto.
function unchangedPlan(avatar: AvatarResizeScene): AvatarResizePlan {
  return {
    startSeconds: avatar.startSeconds,
    endSeconds: avatar.endSeconds,
    changes: [],
    removedIds: [],
  }
}

function withinLimits(
  targetSeconds: number,
  limits: AvatarResizeLimits,
): boolean {
  if (!Number.isInteger(targetSeconds)) return false

  return (
    targetSeconds >= limits.minSeconds && targetSeconds <= limits.maxSeconds
  )
}

// El silencio que la aparición carga antes de que una pausa la corte, en el
// orden en que se prueba: AVATAR_MAX_PAUSE_SECONDS y, para la apertura (la
// escena de avatar que arranca en 0), después AVATAR_OPENING_MAX_PAUSE_SECONDS,
// el segundo intento de `openingSpan` en el planificador (R-2g-17 y R-2g-21).
function loadedPausesOf(avatar: AvatarResizeScene): number[] {
  if (avatar.startSeconds > TIME_EPSILON) return [AVATAR_MAX_PAUSE_SECONDS]

  return [AVATAR_MAX_PAUSE_SECONDS, AVATAR_OPENING_MAX_PAUSE_SECONDS]
}

// El plan deja la aparición por debajo del piso
// (AVATAR_SHORTEST_APPEARANCE_SECONDS, con TIME_EPSILON como el planificador).
// Un código de error no es un plan corto: se devuelve tal cual.
function belowFloor(outcome: AvatarResizeOutcome): boolean {
  if (!('plan' in outcome)) return false

  const { startSeconds, endSeconds } = outcome.plan
  return (
    endSeconds - startSeconds <
    AVATAR_SHORTEST_APPEARANCE_SECONDS - TIME_EPSILON
  )
}

// El último segundo donde puede terminar la aparición, el máximo que se le pasa
// a `avatarCutLimit`: el inicio más `maxSeconds`. Si lo que limita es el fin
// del audio —su distancia al inicio cae en el mismo segundo entero que el
// máximo—, el fin del audio: con un máximo entero el límite quedaría antes y el
// fin del audio nunca sería un corte (nota de WP-A). Nunca más de
// AVATAR_MAX_APPEARANCE_SECONDS desde el inicio, ni después del inicio de la
// primera escena bloqueada que la sigue (m3 de la revisión: una bloqueada a
// menos de un segundo del fin del audio, que el corte no arma).
function maximumEndOf(
  limits: AvatarResizeLimits,
  avatar: AvatarResizeScene,
  following: readonly AvatarResizeScene[],
  audioEndSeconds: number,
): number {
  const maximumEnd = avatar.startSeconds + limits.maxSeconds
  if (!(audioEndSeconds < maximumEnd + 1 - TIME_EPSILON)) return maximumEnd

  const firstLockedStart =
    following.find((scene) => scene.timingLocked)?.startSeconds ??
    Number.POSITIVE_INFINITY
  return Math.min(
    audioEndSeconds,
    avatar.startSeconds + AVATAR_MAX_APPEARANCE_SECONDS,
    firstLockedStart,
  )
}

// Una escena que el plan puede mover o sacar: de imagen y sin candado.
function isMovable(scene: AvatarResizeScene): boolean {
  return !scene.isAvatar && !scene.timingLocked
}

// Dónde queda el fin con el corte `cut` y qué pasa con las escenas que siguen
// (ver la cabecera).
function placeEnd(
  avatar: AvatarResizeScene,
  following: readonly AvatarResizeScene[],
  cut: number,
  nextAvatarStart: number,
): EndPlacement {
  // En el mismo cuadro que hoy: es el mismo clip, nada se mueve.
  if (frameBoundary(cut) === frameBoundary(avatar.endSeconds))
    return { endSeconds: avatar.endSeconds, removedIds: [] }

  if (cut < avatar.endSeconds) return shrunkEnd(following, cut)

  return grownEnd(avatar, following, cut, nextAvatarStart)
}

// Más corta: la escena que sigue empieza en el fin nuevo. Sin ninguna, lo que
// deja el avatar no tendría imagen.
function shrunkEnd(
  following: readonly AvatarResizeScene[],
  cut: number,
): EndPlacement {
  const next = following[0]
  if (!next) return refused(AVATAR_RESIZE_ERROR_CODES.outOfRange)

  if (!isMovable(next)) return refused(AVATAR_RESIZE_ERROR_CODES.locked)

  return { endSeconds: cut, removedIds: [], moved: next }
}

// Más larga: salen las que tapa enteras y la que tiene el fin empieza ahí, o
// sale si le quedarían menos de MIN_SECONDS_PER_SCENE (ver la cabecera).
function grownEnd(
  avatar: AvatarResizeScene,
  following: readonly AvatarResizeScene[],
  cut: number,
  nextAvatarStart: number,
): EndPlacement {
  const removedIds: number[] = []
  for (const [index, scene] of following.entries()) {
    if (scene.startSeconds >= cut - TIME_EPSILON) break

    if (!isMovable(scene)) return refused(AVATAR_RESIZE_ERROR_CODES.locked)

    if (scene.endSeconds <= cut + TIME_EPSILON) {
      removedIds.push(scene.id)
      continue
    }

    if (scene.endSeconds - cut >= MIN_SECONDS_PER_SCENE - TIME_EPSILON)
      return { endSeconds: cut, removedIds, moved: scene }

    removedIds.push(scene.id)
    const next = following[index + 1]
    if (next && isMovable(next))
      return { endSeconds: cut, removedIds, moved: next }

    if (canReach(avatar, scene.endSeconds, nextAvatarStart))
      return { endSeconds: scene.endSeconds, removedIds }

    return { cutBefore: scene.endSeconds - MIN_SECONDS_PER_SCENE }
  }

  return { endSeconds: cut, removedIds }
}

// ¿La aparición puede terminar en `endSeconds`? Sin pasar
// AVATAR_MAX_APPEARANCE_SECONDS y dejando MIN_SECONDS_PER_SCENE antes de la
// próxima escena de avatar.
function canReach(
  avatar: AvatarResizeScene,
  endSeconds: number,
  nextAvatarStart: number,
): boolean {
  if (
    endSeconds - avatar.startSeconds >
    AVATAR_MAX_APPEARANCE_SECONDS + TIME_EPSILON
  )
    return false

  return endSeconds <= nextAvatarStart - MIN_SECONDS_PER_SCENE + TIME_EPSILON
}

// El plan de un fin ya ubicado, con los textos nuevos, o el código si no hay.
function outcomeOf(
  scenes: readonly AvatarResizeScene[],
  words: readonly TranscriptWord[],
  avatar: AvatarResizeScene,
  placement: Exclude<EndPlacement, { cutBefore: number }>,
): AvatarResizeOutcome {
  if ('errorCode' in placement) return placement

  const { endSeconds, removedIds, moved } = placement
  if (!moved && removedIds.length === 0 && endSeconds === avatar.endSeconds)
    return { plan: unchangedPlan(avatar) }

  const removed = new Set(removedIds)
  const remaining = scenes.filter((scene) => !removed.has(scene.id))
  const changes: AvatarResizeSceneChange[] = [
    {
      sceneId: avatar.id,
      startSeconds: avatar.startSeconds,
      endSeconds,
      text: spanText(
        words,
        remaining,
        avatar.id,
        avatar.startSeconds,
        endSeconds,
      ),
    },
  ]
  if (moved)
    changes.push({
      sceneId: moved.id,
      startSeconds: endSeconds,
      endSeconds: moved.endSeconds,
      text: spanText(words, remaining, moved.id, endSeconds, moved.endSeconds),
    })

  return {
    plan: {
      startSeconds: avatar.startSeconds,
      endSeconds,
      changes,
      removedIds,
    },
  }
}

// El texto de la escena `sceneId` con su tramo nuevo, con la regla del corte
// (`cutScenesAtBoundaries`: cada palabra va a la escena donde cae su punto
// medio). Como en el corte entero, la primera escena del video se queda además
// con lo de antes de su inicio y la última con lo de después de su fin: las
// fronteras de las escenas vecinas se repiten para que esos lados no corten.
function spanText(
  words: readonly TranscriptWord[],
  remaining: readonly AvatarResizeScene[],
  sceneId: number,
  startSeconds: number,
  endSeconds: number,
): string {
  const others = remaining.filter((scene) => scene.id !== sceneId)
  const first = !others.some(
    (scene) => scene.startSeconds < startSeconds - TIME_EPSILON,
  )
  const last = !others.some(
    (scene) => scene.startSeconds > startSeconds + TIME_EPSILON,
  )
  const boundaries = [startSeconds, endSeconds]
  if (!first) boundaries.unshift(startSeconds)
  if (!last) boundaries.push(endSeconds)

  const buckets = cutScenesAtBoundaries(words, boundaries)
  return buckets[first ? 0 : 1]?.text ?? ''
}
