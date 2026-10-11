import { TIME_EPSILON } from '../animation/timing.ts'
import type { NarrationSentence } from '../narration/sentences.ts'
import { MIN_SECONDS_PER_SCENE } from '../stages/scene-cuts/by-seconds.ts'
import {
  AVATAR_DEFAULT_APPEARANCES,
  AVATAR_DEFAULT_APPEARANCE_SECONDS,
  AVATAR_MAX_APPEARANCES,
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MIN_APPEARANCES,
  AVATAR_MIN_APPEARANCE_SECONDS,
  AVATAR_MIN_GAP_SECONDS,
} from '../types/avatar.ts'

// Planificador de apariciones del avatar (ADR-0057, diseño §5). Puro y
// determinista: las mismas frases y opciones dan el mismo plan. Cada
// aparición son frases enteras; la primera abre el video si la persona lo
// pidió, y las demás se reparten parejo con AVATAR_MIN_GAP_SECONDS de
// imágenes entre una y otra. Las que no caben se cuentan en `dropped`: no es
// un fallo (la fase lo informa con `avatar-planned`). Una frase puede pasar
// los MAX_SENTENCE_SECONDS (una palabra con un silencio largo detrás): entra
// entera mientras no pase AVATAR_MAX_APPEARANCE_SECONDS, y si lo pasa no
// entra en ninguna aparición.
//
// Precondición: las frases están ordenadas y son contiguas desde 0, como las
// da `detectSentences` (fronteras en la grilla de 25 fps). Tolerancia: cada
// garantía de tiempo —el largo entre el mínimo y el máximo, el hueco entre
// apariciones, el inicio a 3 s o más sin apertura— vale con TIME_EPSILON
// (1e-6 s): restar fronteras de la grilla deja ruido de coma flotante, y un
// tramo de 60,00000000000001 s o un hueco de 9,999999999999993 s cuentan como
// 60 y 10. Un consumidor que compare estricto contra las constantes tiene que
// usar la misma tolerancia.

export interface AvatarPlanOptions {
  appearances: number
  secondsPerAppearance: number
  startWithAvatar: boolean
}

// Una aparición: frases enteras, de AVATAR_MIN_APPEARANCE_SECONDS a
// AVATAR_MAX_APPEARANCE_SECONDS (con TIME_EPSILON).
export interface AvatarSpan {
  startSeconds: number
  endSeconds: number
  // Índices de las frases que dice, los dos inclusive.
  sentenceFrom: number
  sentenceTo: number
}

export interface AvatarPlan {
  spans: AvatarSpan[]
  // Apariciones pedidas que no cupieron.
  dropped: number
}

// Acota un número de las opciones (validadas al crear: esto cubre un
// project.json editado a mano). Lo que no es un número toma el valor por
// defecto de Crear.
function bounded(
  value: number,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback

  return Math.min(maximum, Math.max(minimum, value))
}

// Ajuste a frases desde `from`: suma la frase siguiente solo si el largo se
// acerca al objetivo (|largo − objetivo| baja), sin quedar debajo del mínimo
// (sigue sumando) ni pasar el máximo. null si no llega al mínimo sin pasar el
// máximo (el audio se acaba antes, o la frase que falta es demasiado larga) o
// si la frase `from` sola ya pasa el máximo: ahí esa aparición no cabe.
function fitFrom(
  sentences: readonly NarrationSentence[],
  from: number,
  targetSeconds: number,
): AvatarSpan | null {
  const startSeconds = sentences[from].startSeconds
  let to = from
  let length = sentences[from].endSeconds - startSeconds
  while (to + 1 < sentences.length) {
    const nextLength = sentences[to + 1].endSeconds - startSeconds
    if (nextLength > AVATAR_MAX_APPEARANCE_SECONDS + TIME_EPSILON) break

    const belowMinimum = length < AVATAR_MIN_APPEARANCE_SECONDS - TIME_EPSILON
    const closer =
      Math.abs(nextLength - targetSeconds) <
      Math.abs(length - targetSeconds) - TIME_EPSILON
    if (!belowMinimum && !closer) break

    to++
    length = nextLength
  }

  if (length < AVATAR_MIN_APPEARANCE_SECONDS - TIME_EPSILON) return null

  if (length > AVATAR_MAX_APPEARANCE_SECONDS + TIME_EPSILON) return null

  return {
    startSeconds,
    endSeconds: sentences[to].endSeconds,
    sentenceFrom: from,
    sentenceTo: to,
  }
}

// La frase cuyo inicio queda más cerca de `targetStart` sin arrancar antes de
// `earliest` (con empate, la primera), o undefined si ninguna arranca después.
function nearestSentence(
  sentences: readonly NarrationSentence[],
  earliest: number,
  targetStart: number,
): number | undefined {
  let best: number | undefined
  for (let index = 0; index < sentences.length; index++) {
    const start = sentences[index].startSeconds
    if (start < earliest - TIME_EPSILON) continue

    if (best === undefined) {
      best = index
      continue
    }

    const distance = Math.abs(start - targetStart)
    const bestDistance = Math.abs(sentences[best].startSeconds - targetStart)
    if (distance < bestDistance - TIME_EPSILON) best = index
  }

  return best
}

export function planAvatarSpans(
  sentences: readonly NarrationSentence[],
  options: AvatarPlanOptions,
): AvatarPlan {
  const appearances = Math.round(
    bounded(
      options.appearances,
      AVATAR_MIN_APPEARANCES,
      AVATAR_MAX_APPEARANCES,
      AVATAR_DEFAULT_APPEARANCES,
    ),
  )
  const targetSeconds = bounded(
    options.secondsPerAppearance,
    AVATAR_MIN_APPEARANCE_SECONDS,
    AVATAR_MAX_APPEARANCE_SECONDS,
    AVATAR_DEFAULT_APPEARANCE_SECONDS,
  )
  if (sentences.length === 0) return { spans: [], dropped: appearances }

  const audioEnd = sentences[sentences.length - 1].endSeconds
  const spans: AvatarSpan[] = []
  // Con «empieza con el avatar», la primera es `fit` desde la frase 0. Si no
  // cabe, va a `dropped` y las demás se planifican igual, como sin apertura:
  // la causa puede ser un audio más corto que el mínimo, pero también una
  // primera frase de más del máximo, y esa frase no se lleva el plan entero.
  const opening = options.startWithAvatar
    ? fitFrom(sentences, 0, targetSeconds)
    : null
  if (opening) spans.push(opening)

  // Las demás, parejas sobre la zona libre: desde el fin de la apertura más el
  // hueco mínimo (o desde 0 sin apertura) hasta el fin del audio. El ancla k
  // es el centro del tramo k de M tramos iguales.
  const remaining = options.startWithAvatar ? appearances - 1 : appearances
  let previousEnd = opening?.endSeconds
  const zoneStart =
    previousEnd === undefined ? 0 : previousEnd + AVATAR_MIN_GAP_SECONDS
  const zoneLength = Math.max(0, audioEnd - zoneStart)
  for (let slot = 0; slot < remaining; slot++) {
    const anchor = zoneStart + ((slot + 0.5) * zoneLength) / remaining
    // Nunca antes del fin de la anterior más el hueco mínimo. Sin apertura, la
    // primera deja al menos una escena de imagen (MIN_SECONDS_PER_SCENE): si
    // no, el corte absorbería ese tramo corto y el video abriría con el
    // avatar aunque la persona no lo pidió.
    const earliest =
      previousEnd === undefined
        ? MIN_SECONDS_PER_SCENE
        : previousEnd + AVATAR_MIN_GAP_SECONDS
    const from = nearestSentence(
      sentences,
      earliest,
      anchor - targetSeconds / 2,
    )
    if (from === undefined) continue

    const span = fitFrom(sentences, from, targetSeconds)
    if (!span) continue

    spans.push(span)
    previousEnd = span.endSeconds
  }

  return { spans, dropped: appearances - spans.length }
}
