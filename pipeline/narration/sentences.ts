import {
  ANIMATION_FPS,
  frameBoundary,
  TIME_EPSILON,
} from '../animation/timing.ts'
import {
  MAX_SENTENCE_SECONDS,
  SENTENCE_PAUSE_SECONDS,
} from '../types/avatar.ts'
import type { TranscriptWord } from '../types/scenes.ts'

// Frases de la narración (ADR-0057, diseño §4): la unidad de continuidad del
// avatar. Puro y browser-safe (lo usan el sidecar y el editor). Con
// puntuación (`sentenceEnd` en words.json, desde la entrega 2) las fronteras
// son las palabras que cierran frase; sin ella (los proyectos anteriores y la
// demo), una pausa de SENTENCE_PAUSE_SECONDS o más. En los dos modos, una
// frase de más de MAX_SENTENCE_SECONDS se parte en su pausa interna más
// larga. Las frases son contiguas de 0 al fin del audio: la pausa pertenece a
// la frase anterior y cada frontera es el inicio de la primera palabra de la
// frase que sigue, llevado al cuadro más cercano (25 fps, el reloj visual).

export interface NarrationSentence {
  index: number
  text: string
  // Contiguas: la pausa pertenece a la frase anterior.
  startSeconds: number
  endSeconds: number
  // Índices en words.json, los dos inclusive.
  wordFrom: number
  wordTo: number
}

// Palabras consecutivas [from, to], los dos inclusive.
interface WordRange {
  from: number
  to: number
}

// Una frase en armado: sus palabras y su tramo contiguo.
interface SentenceSpan extends WordRange {
  startSeconds: number
  endSeconds: number
}

function toFrame(seconds: number): number {
  return frameBoundary(seconds) / ANIMATION_FPS
}

function pauseAfter(words: readonly TranscriptWord[], index: number): number {
  return words[index + 1].start - words[index].end
}

// El fin del audio: el medido o, si no sirve o es menor, el de la última
// palabra (ninguna frase deja palabras afuera).
function resolveAudioEnd(
  words: readonly TranscriptWord[],
  audioEndSeconds: number,
): number {
  const lastWordEnd = words[words.length - 1].end
  if (!Number.isFinite(audioEndSeconds)) return lastWordEnd

  return Math.max(audioEndSeconds, lastWordEnd)
}

// Con puntuación: cada palabra con `sentenceEnd` cierra su frase; las que
// quedan después de la última (una cola sin punto) forman una frase más.
function punctuatedRanges(words: readonly TranscriptWord[]): WordRange[] {
  const ranges: WordRange[] = []
  let from = 0
  for (let index = 0; index < words.length; index++) {
    if (words[index].sentenceEnd !== true) continue

    ranges.push({ from, to: index })
    from = index + 1
  }
  if (from < words.length) ranges.push({ from, to: words.length - 1 })

  return ranges
}

// Sin puntuación: una pausa de SENTENCE_PAUSE_SECONDS o más entre dos
// palabras cierra la frase.
function pausedRanges(words: readonly TranscriptWord[]): WordRange[] {
  const ranges: WordRange[] = []
  let from = 0
  for (let index = 0; index < words.length - 1; index++) {
    if (pauseAfter(words, index) < SENTENCE_PAUSE_SECONDS - TIME_EPSILON)
      continue

    ranges.push({ from, to: index })
    from = index + 1
  }
  ranges.push({ from, to: words.length - 1 })

  return ranges
}

// Las fronteras contiguas: la primera frase empieza en 0, cada una de las
// demás en el inicio (al cuadro) de su primera palabra, y la última termina
// en el fin del audio. Si al llevarla al cuadro una frontera no avanza (dos
// palabras en el mismo cuadro) o no deja ni un cuadro antes del fin del audio,
// esa frase se une a la anterior: nunca queda una frase vacía, tampoco en
// cuadros (una palabra recortada al fin de un audio que no termina en la
// grilla, 25,00–25,01 s, sería una aparición o un subtítulo de 0 cuadros).
function contiguousSpans(
  words: readonly TranscriptWord[],
  ranges: WordRange[],
  audioEnd: number,
): SentenceSpan[] {
  const lastFrame = toFrame(audioEnd)
  const spans: SentenceSpan[] = []
  for (const range of ranges) {
    const previous = spans.at(-1)
    if (!previous) {
      spans.push({ ...range, startSeconds: 0, endSeconds: audioEnd })
      continue
    }

    const startSeconds = toFrame(words[range.from].start)
    const advances =
      startSeconds > previous.startSeconds + TIME_EPSILON &&
      startSeconds < lastFrame - TIME_EPSILON
    if (!advances) {
      previous.to = range.to
      continue
    }

    previous.endSeconds = startSeconds
    spans.push({ ...range, startSeconds, endSeconds: audioEnd })
  }

  return spans
}

// La pausa más larga entre dos palabras del tramo cuyo corte (el inicio de la
// palabra que sigue, llevado al cuadro) cae ADENTRO del tramo, con al menos un
// cuadro a cada lado; devuelve el índice de la palabra que la precede. Un
// corte que cae afuera (una palabra recortada al fin del audio, o dos palabras
// en el mismo cuadro al inicio del tramo) no es candidato: si ganara por ser
// la pausa más larga y después se descartara, la frase quedaría entera
// habiendo otros cortes válidos. Con empate, la más cercana al centro del
// tramo: una frase sin pausas se parte por la mitad y no en una palabra
// suelta. Sin ningún corte posible (una sola palabra, o todos afuera) devuelve
// undefined.
function longestPauseIndex(
  words: readonly TranscriptWord[],
  span: SentenceSpan,
): number | undefined {
  const center = (span.startSeconds + span.endSeconds) / 2
  // El fin del tramo en cuadros: el de la última frase es el fin del audio,
  // que puede no caer en la grilla.
  const lastFrame = toFrame(span.endSeconds)
  let best: number | undefined
  for (let index = span.from; index < span.to; index++) {
    const frontier = toFrame(words[index + 1].start)
    const inside =
      frontier > span.startSeconds + TIME_EPSILON &&
      frontier < lastFrame - TIME_EPSILON
    if (!inside) continue

    if (best === undefined) {
      best = index
      continue
    }

    const pause = pauseAfter(words, index)
    const bestPause = pauseAfter(words, best)
    if (pause > bestPause + TIME_EPSILON) {
      best = index
      continue
    }

    if (pause < bestPause - TIME_EPSILON) continue

    const distance = Math.abs(words[index + 1].start - center)
    const bestDistance = Math.abs(words[best + 1].start - center)
    if (distance < bestDistance - TIME_EPSILON) best = index
  }

  return best
}

// Parte una frase de más de MAX_SENTENCE_SECONDS en su pausa más larga, y
// sigue con cada mitad. Una frase sin ningún corte posible (de una sola
// palabra, o sin una pausa cuyo corte caiga adentro del tramo) queda como está.
function splitLongSpan(
  words: readonly TranscriptWord[],
  span: SentenceSpan,
): SentenceSpan[] {
  const length = span.endSeconds - span.startSeconds
  if (length <= MAX_SENTENCE_SECONDS + TIME_EPSILON) return [span]

  const cut = longestPauseIndex(words, span)
  if (cut === undefined) return [span]

  const middle = toFrame(words[cut + 1].start)
  return [
    ...splitLongSpan(words, {
      from: span.from,
      to: cut,
      startSeconds: span.startSeconds,
      endSeconds: middle,
    }),
    ...splitLongSpan(words, {
      from: cut + 1,
      to: span.to,
      startSeconds: middle,
      endSeconds: span.endSeconds,
    }),
  ]
}

export function detectSentences(
  words: readonly TranscriptWord[],
  audioEndSeconds: number,
): NarrationSentence[] {
  if (words.length === 0) return []

  const audioEnd = resolveAudioEnd(words, audioEndSeconds)
  const punctuated = words.some((word) => word.sentenceEnd === true)
  const ranges = punctuated ? punctuatedRanges(words) : pausedRanges(words)
  const spans = contiguousSpans(words, ranges, audioEnd).flatMap((span) =>
    splitLongSpan(words, span),
  )

  return spans.map((span, index) => {
    const text = words
      .slice(span.from, span.to + 1)
      .map((word) => word.word)
      .join(' ')
    return {
      index,
      text,
      startSeconds: span.startSeconds,
      endSeconds: span.endSeconds,
      wordFrom: span.from,
      wordTo: span.to,
    }
  })
}
