import {
  ANIMATION_TRANSITION_FRAMES,
  frameBoundary,
  slotFrames,
} from './timing.ts'

export const TRANSITION_POLICY_VERSION = 1

export interface VisualTransitionBlock {
  startSeconds: number
  endSeconds: number
  animated: boolean
  staticTransitionIn?: boolean
}

// Un único criterio para preview, marcadores y exportación. La preferencia
// solo añade fundidos estática/estática; un clip real a cualquiera de los
// dos lados siempre conserva la transición. No se funden huecos del reloj.
export function transitionFramesFor(
  previous: VisualTransitionBlock | undefined,
  current: VisualTransitionBlock,
): number {
  if (!previous) return 0

  if (
    frameBoundary(previous.endSeconds) !== frameBoundary(current.startSeconds)
  )
    return 0

  if (
    !previous.animated &&
    !current.animated &&
    current.staticTransitionIn !== true
  )
    return 0

  return Math.min(
    ANIMATION_TRANSITION_FRAMES,
    slotFrames(current.startSeconds, current.endSeconds),
  )
}
