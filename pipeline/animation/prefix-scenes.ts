import {
  DEFAULT_SECONDS_PER_SCENE,
  MAX_SECONDS_PER_SCENE,
  MIN_SECONDS_PER_SCENE,
  sceneBoundariesBySeconds,
} from '../stages/scene-cuts/by-seconds.ts'
import {
  ANIMATION_PREFIX_IMAGE_SECONDS,
  ANIMATION_PREFIX_SCENE_SECONDS,
} from '../types/video-provider.ts'

// Plan puro compartido por el corte real y la estimación del formulario.
// El prefijo tiene imágenes propias cada3s; la fase de animación agrupa
// parejas en clips de6s. La última imagen conserva el final real del audio.
const SECONDS_PER_MINUTE = 60
const TIME_EPSILON = 1e-9

export interface PrefixSceneWindow {
  startSeconds: number
  endSeconds: number
  animationRequestedSeconds?: number
}

interface PrefixSceneOptions {
  totalSeconds: number
  minutes: number
  secondsPerScene?: number
  sceneCount?: number
}

export function planPrefixSceneWindows({
  totalSeconds,
  minutes,
  secondsPerScene,
  sceneCount,
}: PrefixSceneOptions): PrefixSceneWindow[] {
  if (
    !Number.isFinite(totalSeconds) ||
    totalSeconds <= 0 ||
    !Number.isSafeInteger(minutes) ||
    minutes < 1 ||
    !Number.isSafeInteger(minutes * SECONDS_PER_MINUTE)
  )
    return []

  const prefixEnd = Math.min(totalSeconds, minutes * SECONDS_PER_MINUTE)
  const windows: PrefixSceneWindow[] = []
  for (
    let start = 0;
    start < prefixEnd - TIME_EPSILON;
    start += ANIMATION_PREFIX_IMAGE_SECONDS
  )
    windows.push({
      startSeconds: start,
      endSeconds: Math.min(prefixEnd, start + ANIMATION_PREFIX_IMAGE_SECONDS),
      animationRequestedSeconds: ANIMATION_PREFIX_SCENE_SECONDS,
    })

  const remaining = totalSeconds - prefixEnd
  if (remaining <= TIME_EPSILON) return windows

  let boundaries: number[]
  if (
    secondsPerScene !== undefined ||
    !sceneCount ||
    !Number.isFinite(sceneCount)
  ) {
    boundaries = sceneBoundariesBySeconds(
      remaining,
      secondsPerScene ?? DEFAULT_SECONDS_PER_SCENE,
    )
  } else {
    // En Catálogo la cantidad confirmada cuenta todo el video. Se descuentan
    // las imágenes del prefijo fijo y se limita únicamente el tramo restante.
    const minimum = Math.max(
      1,
      Math.ceil(remaining / MAX_SECONDS_PER_SCENE - TIME_EPSILON),
    )
    const maximum = Math.max(
      minimum,
      Math.floor(remaining / MIN_SECONDS_PER_SCENE + TIME_EPSILON),
    )
    const count = Math.min(
      maximum,
      Math.max(minimum, Math.round(sceneCount) - windows.length),
    )
    boundaries = Array.from({ length: count + 1 }, (_, index) =>
      index === count
        ? remaining
        : Math.round(((index * remaining) / count) * 1000) / 1000,
    )
  }
  for (let index = 0; index < boundaries.length - 1; index++)
    windows.push({
      startSeconds: Math.round((prefixEnd + boundaries[index]) * 1000) / 1000,
      endSeconds: Math.round((prefixEnd + boundaries[index + 1]) * 1000) / 1000,
    })
  return windows
}
