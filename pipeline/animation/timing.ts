// Reloj visual único; redondear bordes absolutos evita acumular un cuadro
// extra por escena. A25FPS el error de representación es como máximo20ms.
export const ANIMATION_FPS = 25
export const ZOOM_MAX = 1.11
export const ZOOM_PAN = 1.1
export const ANIMATION_TRANSITION_FRAMES = 8
export const ANIMATION_TRANSITION_SECONDS =
  ANIMATION_TRANSITION_FRAMES / ANIMATION_FPS

export function frameBoundary(seconds: number): number {
  return Math.round(seconds * ANIMATION_FPS)
}

export function slotFrames(startSeconds: number, endSeconds: number): number {
  return Math.max(0, frameBoundary(endSeconds) - frameBoundary(startSeconds))
}

export function slotDurationSeconds(
  startSeconds: number,
  endSeconds: number,
): number {
  return slotFrames(startSeconds, endSeconds) / ANIMATION_FPS
}
