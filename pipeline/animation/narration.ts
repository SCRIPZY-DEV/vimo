import type { TranscriptWord } from '../types/scenes.ts'

export interface AnimationNarrationCue {
  word: string
  fromSeconds: number
  toSeconds: number
}

export interface AnimationNarration {
  text: string
  cues?: AnimationNarrationCue[]
}

export interface AnimationNarrationWindow {
  startSeconds: number
  endSeconds: number
  clipStartSeconds: number
  rate: number
}

// Solo acepta un reloj completo y ordenado. Una transcripción ausente o inválida
// conserva el texto de escena sin inventar alineación fina ni editar sus cortes.
export function parseAnimationNarrationWords(
  source: string | undefined,
): TranscriptWord[] | undefined {
  if (!source) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return undefined
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return undefined

  const words: TranscriptWord[] = []
  let previousStart = 0
  for (const entry of parsed) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.word !== 'string' ||
      !entry.word.trim() ||
      !Number.isFinite(entry.start) ||
      !Number.isFinite(entry.end) ||
      entry.start < 0 ||
      entry.end < entry.start ||
      entry.start < previousStart
    )
      return undefined
    previousStart = entry.start
    // La transcripción puede ajustar la última palabra al fin exacto del audio.
    if (entry.end === entry.start) continue
    words.push({ word: entry.word, start: entry.start, end: entry.end })
  }
  return words.length > 0 ? words : undefined
}

// La voz conserva su reloj. Las marcas que lee el redactor se trasladan al
// reloj del clip generado, incluida la aceleración 4/3 y los bloques fusionados.
export function animationNarrationWithin(
  words: TranscriptWord[] | undefined,
  fallbackText: string,
  window: AnimationNarrationWindow,
): AnimationNarration {
  const { startSeconds, endSeconds, clipStartSeconds, rate } = window
  if (
    !words ||
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    !Number.isFinite(clipStartSeconds) ||
    !Number.isFinite(rate) ||
    endSeconds <= startSeconds ||
    rate <= 0
  )
    return { text: fallbackText }

  const cues = words
    .filter((word) => word.start < endSeconds && word.end > startSeconds)
    .map((word) => ({
      word: word.word,
      fromSeconds:
        (Math.max(startSeconds, word.start) - clipStartSeconds) * rate,
      toSeconds: (Math.min(endSeconds, word.end) - clipStartSeconds) * rate,
    }))
  return { text: cues.map((cue) => cue.word).join(' '), cues }
}
