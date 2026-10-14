import { clamp } from '@/modules/common/utilities/clamp'
import { animationTimingLocked } from '@/modules/videos/utilities/animationTimingLocked'
import {
  avatarResizeCoveredScenes,
  avatarResizeLimits,
  scenesAfter,
} from '@pipeline/avatar/resize-limits.ts'
import type {
  AvatarDurationAction,
  AvatarDurationActionInput,
  AvatarDurationChange,
  AvatarDurationContext,
  AvatarDurationLock,
} from '@/modules/videos/types/avatarDuration'
import type {
  AvatarResizeScene,
  AvatarSceneDurationInput,
} from '@pipeline/types/avatar.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// La duración de una aparición del avatar desde el editor (entrega 2g, diseño
// §23.3). El cálculo de hasta dónde puede crecer una escena y cuántas
// escenas de imagen taparía es del pipeline (`resize-limits.ts`, puro y
// browser-safe, el mismo que valida el sidecar antes de pagar); acá se lo
// alimenta con las escenas del proyecto.

// Las escenas con tiempos, en la forma que pide el cálculo de límites: si son
// de avatar y si sus tiempos están bloqueados por una animación o un recibo de
// animación (el candado de `update-scenes`: `animationTimingLocked`).
function avatarResizeScenes(scenes: SceneDetail[]): AvatarResizeScene[] {
  return scenes.flatMap((scene) => {
    const { startSeconds, endSeconds } = scene
    if (startSeconds === undefined || endSeconds === undefined) return []

    return [
      {
        id: scene.id,
        startSeconds,
        endSeconds,
        isAvatar: scene.avatar !== undefined,
        timingLocked: animationTimingLocked(scenes, [scene.id]),
      },
    ]
  })
}

// El lugar de la escena de avatar `sceneId` en el proyecto: sus límites, la
// duración en la que arranca el selector y por qué no se puede cambiar, si es
// el caso. El fin del audio es el fin de la última escena. null si no es una
// escena de avatar con tiempos.
//
// La duración queda quieta (mínimo y máximo iguales a lo que dura hoy,
// redondeado) en dos casos: la escena que la sigue está animada, y no hay
// ninguna escena después (R-2g-18: la última del video no se achica porque lo
// que soltaría no tendría una escena de imagen que lo tome, ni se alarga
// porque termina en el fin del audio). Esos límites los da tal cual
// `avatarResizeLimits`, el mismo código que valida el sidecar (la UI lo
// empaqueta); `durationLock` solo elige el texto que explica por qué.
export function avatarDurationContext(
  scenes: SceneDetail[],
  sceneId: number,
): AvatarDurationContext | null {
  const resizeScenes = avatarResizeScenes(scenes)
  const audioEndSeconds = resizeScenes.reduce(
    (end, scene) => Math.max(end, scene.endSeconds),
    0,
  )
  const limits = avatarResizeLimits(resizeScenes, sceneId, audioEndSeconds)
  if (!limits) return null

  return {
    resizeScenes,
    limits,
    // La duración de hoy redondeada, acotada a lo que entra en ese lugar.
    initialSeconds: clamp(
      Math.round(limits.currentSeconds),
      limits.minSeconds,
      limits.maxSeconds,
    ),
    lock: durationLock(resizeScenes, sceneId),
  }
}

// Por qué la duración de la escena `sceneId` no se mueve, para el texto del
// selector: si no hay ninguna escena después, es el final del video; si la
// primera que la sigue tiene los tiempos bloqueados, está animada. Si no, null.
// Las escenas que la siguen son las mismas, con la misma tolerancia, que las
// del cálculo de límites (`scenesAfter`).
function durationLock(
  resizeScenes: AvatarResizeScene[],
  sceneId: number,
): AvatarDurationLock | null {
  const scene = resizeScenes.find((candidate) => candidate.id === sceneId)
  if (!scene) return null

  const [next] = scenesAfter(resizeScenes, scene)
  if (!next) return 'videoEnd'

  if (next.timingLocked) return 'neighbor'

  return null
}

// Qué hace la acción principal con la duración elegida (§23.3): la misma
// duración, las acciones de siempre; una más corta con el clip listo, al día
// y sin cambios en el movimiento, recortar el clip que ya está (gratis, sin
// hablar con el proveedor); y todo lo demás —una más larga, o una escena sin
// clip listo, o con el movimiento cambiado— es un render nuevo del trozo.
export function avatarDurationAction({
  seconds,
  initialSeconds,
  ready,
  motionChanged,
}: AvatarDurationActionInput): AvatarDurationAction {
  if (seconds === initialSeconds) return 'keep'

  if (seconds < initialSeconds && ready && !motionChanged) return 'trim'

  return 'render'
}

// Lo que dice la confirmación de una duración nueva: la duración que se pide,
// la que tiene hoy y cuántas escenas de imagen taparía (aproximado, por los
// segundos elegidos). null si la escena ya no es de avatar con tiempos.
export function avatarDurationChange(
  scenes: SceneDetail[],
  input: AvatarSceneDurationInput,
): AvatarDurationChange | null {
  const context = avatarDurationContext(scenes, input.sceneId)
  if (!context) return null

  return {
    seconds: input.seconds,
    currentSeconds: context.limits.currentSeconds,
    coveredScenes: avatarResizeCoveredScenes(
      context.resizeScenes,
      input.sceneId,
      input.seconds,
    ),
  }
}
