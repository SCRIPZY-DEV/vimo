import type { AvatarRenderConfirmationState } from '@/modules/videos/types/library'
import type {
  AvatarResizeLimits,
  AvatarResizeScene,
} from '@pipeline/types/avatar.ts'

// La duración de una aparición del avatar desde el editor (entrega 2g, diseño
// §23.3). Los tipos del pedido y de la confirmación del avatar viven en
// `library.ts` (el pedido ya lleva la `durations` del payload de
// `avatar-render-scenes`: AvatarRenderRequestOptions); lo que suma la duración
// está acá y se compone con ellos.

// El borrador de la duración que eligió la persona y la duración real de la
// escena cuando lo eligió: si la escena cambia de duración (un render nuevo o
// un recorte), el borrador ya no vale y el selector vuelve a arrancar en la
// duración nueva. Mismo patrón que `AvatarMotionEdit`.
export interface AvatarDurationEdit {
  currentSeconds: number
  seconds: number
}

// Por qué la duración de una escena de avatar no se puede cambiar (diseño
// §23.3 y R-2g-18): `neighbor`, la escena que la sigue está animada y sus
// tiempos no se mueven; `videoEnd`, no hay ninguna escena después, así que
// achicarla dejaría narración sin imagen y alargarla pasaría el fin del audio.
export type AvatarDurationLock = 'neighbor' | 'videoEnd'

// Lo que se sabe del lugar de una escena de avatar para elegir su duración:
// las escenas del proyecto en la forma del cálculo de límites, los límites
// (con una duración quieta, el mínimo y el máximo son lo que dura hoy
// redondeado), de dónde arranca el selector y por qué no se puede cambiar, si
// es el caso.
export interface AvatarDurationContext {
  resizeScenes: AvatarResizeScene[]
  limits: AvatarResizeLimits
  initialSeconds: number
  lock: AvatarDurationLock | null
}

// El cambio de duración que dice la confirmación: la duración nueva, la que
// tiene hoy y cuántas escenas de imagen tapa.
export interface AvatarDurationChange {
  seconds: number
  currentSeconds: number
  coveredScenes: number
}

// La confirmación abierta del avatar con el cambio de duración, si el pedido
// lo trae.
export interface AvatarDurationConfirmationState extends AvatarRenderConfirmationState {
  duration: AvatarDurationChange | null
}

// El selector «Duración» tal como lo dibuja `EditorAvatarDuration`: lo que
// elige la persona (ya acotado a los límites), de dónde arrancó, por qué está
// quieto (`lock`) y a qué altura del audio terminaría la aparición.
export interface AvatarDurationControl {
  limits: AvatarResizeLimits
  seconds: number
  initialSeconds: number
  lock: AvatarDurationLock | null
  endSeconds: number
  onChange(seconds: number): void
}

// Lo que decide la acción principal (`avatarDurationAction`).
export interface AvatarDurationActionInput {
  // La duración elegida y la duración en la que arrancó el selector.
  seconds: number
  initialSeconds: number
  // La escena tiene un clip listo y al día (la acción `retake`).
  ready: boolean
  // La persona cambió algo del movimiento (lo que viajaría con el pedido).
  motionChanged: boolean
}

// Qué hace la acción principal con la duración elegida: nada distinto (la de
// siempre), recortar el clip que ya está listo (gratis) o un render nuevo con
// `durations` en el pedido.
export type AvatarDurationAction = 'keep' | 'trim' | 'render'
