import type { Scene, TranscriptWord } from '../../types/scenes.ts'

// Ventanas nominales de3–12s con cola repartida antes de generar prompts.
// Silencios conservan su intervalo y reciben prompt e imagen propios;
// nunca alargan una escena indefinidamente ni inventan palabras narradas.
export const MIN_SECONDS_PER_SCENE = 3
export const MAX_SECONDS_PER_SCENE = 12
export const DEFAULT_SECONDS_PER_SCENE = 3
const EPSILON = 1e-9

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000
}

function safeNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function resolveAudioEnd(
  words: readonly TranscriptWord[],
  totalDurationSeconds?: number,
): number {
  let endSeconds = safeNumber(totalDurationSeconds)
  for (const word of words)
    endSeconds = Math.max(endSeconds, safeNumber(word.end))
  return roundMs(endSeconds)
}

export function clampSecondsPerScene(value: unknown): number {
  const seconds = Math.round(Number(value))
  if (!Number.isFinite(seconds)) return DEFAULT_SECONDS_PER_SCENE
  return Math.min(
    MAX_SECONDS_PER_SCENE,
    Math.max(MIN_SECONDS_PER_SCENE, seconds),
  )
}

export function cutScenesBySeconds(
  words: readonly TranscriptWord[],
  seconds: number,
  totalDurationSeconds?: number,
): Scene[] {
  if (words.length === 0) return []
  const audioEnd = resolveAudioEnd(words, totalDurationSeconds)
  if (audioEnd <= 0) return []
  return cutScenesAtBoundaries(
    words,
    sceneBoundariesBySeconds(audioEnd, seconds),
  )
}

export function sceneBoundariesBySeconds(
  audioEnd: number,
  seconds: number,
): number[] {
  if (!Number.isFinite(audioEnd) || audioEnd <= 0) return [0]
  const window = clampSecondsPerScene(seconds)
  const count = Math.max(1, Math.ceil(audioEnd / window - EPSILON))
  const boundaries = Array.from({ length: count + 1 }, (_, index) =>
    index === count ? audioEnd : roundMs(index * window),
  )

  // Una cola<3 se incorpora si cabe en12; si no, se redistribuye:
  // 12+1 pasa a10+3. Un proyecto entero<3 mantiene su duración real.
  if (
    count > 1 &&
    audioEnd - boundaries[count - 1] < MIN_SECONDS_PER_SCENE - EPSILON
  ) {
    if (audioEnd - boundaries[count - 2] <= MAX_SECONDS_PER_SCENE + EPSILON)
      boundaries.splice(count - 1, 1)
    else boundaries[count - 1] = roundMs(audioEnd - MIN_SECONDS_PER_SCENE)
  }

  return boundaries
}

export function cutScenesAtBoundaries(
  words: readonly TranscriptWord[],
  boundaries: readonly number[],
): Scene[] {
  if (words.length === 0 || boundaries.length < 2) return []
  const buckets: string[][] = Array.from(
    { length: boundaries.length - 1 },
    () => [],
  )
  let minimum = 0
  for (const word of words) {
    const middle = roundMs((safeNumber(word.start) + safeNumber(word.end)) / 2)
    while (
      minimum < buckets.length - 1 &&
      middle >= boundaries[minimum + 1] - EPSILON
    )
      minimum++
    buckets[minimum].push(word.word)
  }

  const scenes = buckets.map((bucket, index): Scene => ({
    id: index + 1,
    text: bucket.join(' ').trim(),
    startSeconds: boundaries[index],
    endSeconds: boundaries[index + 1],
  }))
  return scenes
}
