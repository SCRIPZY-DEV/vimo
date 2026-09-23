import {
  ANIMATION_MINUTES_MIN,
  SECONDS_PER_MINUTE,
} from '@/modules/videos/constants'

// El contrato del sidecar usa minutos enteros. Para un video menor de un
// minuto se envía 1, pero el planificador termina en el final real del video.
export function animationMinutesLimit(
  durationSeconds?: number,
): number | undefined {
  if (durationSeconds === undefined || !Number.isFinite(durationSeconds))
    return undefined
  return Math.max(
    ANIMATION_MINUTES_MIN,
    Math.floor(durationSeconds / SECONDS_PER_MINUTE),
  )
}

export function clampAnimationMinutes(
  minutes: number,
  durationSeconds?: number,
): number {
  const value = Number.isFinite(minutes)
    ? Math.floor(minutes)
    : ANIMATION_MINUTES_MIN
  return Math.min(
    animationMinutesLimit(durationSeconds) ?? Infinity,
    Math.max(ANIMATION_MINUTES_MIN, value),
  )
}
