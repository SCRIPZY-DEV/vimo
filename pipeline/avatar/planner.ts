import {
  ANIMATION_FPS,
  frameBoundary,
  TIME_EPSILON,
} from '../animation/timing.ts'
import type { NarrationSentence } from '../narration/sentences.ts'
import { MIN_SECONDS_PER_SCENE } from '../stages/scene-cuts/by-seconds.ts'
import {
  AVATAR_DEFAULT_APPEARANCES,
  AVATAR_DEFAULT_APPEARANCE_SECONDS,
  AVATAR_MAX_APPEARANCES,
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MAX_PAUSE_SECONDS,
  AVATAR_MIN_APPEARANCES,
  AVATAR_MIN_APPEARANCE_SECONDS,
  AVATAR_MIN_GAP_SECONDS,
} from '../types/avatar.ts'

// Planificador de apariciones del avatar (ADR-0057, diseño §5). Puro y
// determinista: las mismas frases y opciones dan el mismo plan. Cada
// aparición son frases enteras; la primera abre el video si la persona lo
// pidió, y las demás se reparten parejo con AVATAR_MIN_GAP_SECONDS de
// imágenes entre una y otra. Las que no caben se cuentan en `dropped`: no es
// un fallo (la fase lo informa con `avatar-planned`).
//
// Dos reglas de la entrega 2b (decisiones del dueño del 2026-10-11):
// - La frase desde la que no cabe se saltea. Cada aparición del reparto
//   arranca en la frase más cercana a su ancla DESDE LA QUE CABE (antes o
//   después del ancla): una frase desde la que el ajuste pasa el máximo, o
//   no llega al mínimo antes del fin del audio o del tope de silencio, ya no
//   descarta la aparición. Va a `dropped` solo si ninguna frase de la zona
//   sirve. La apertura no tiene alternativa: arranca en 0 o no cabe.
// - Tope de silencio. Una aparición no carga más de AVATAR_MAX_PAUSE_SECONDS
//   de silencio después de la última palabra de una frase. Cada frase tiene
//   un fin recortado (`cappedEnd`): su fin, o su última palabra más el tope,
//   al cuadro, si la pausa que sigue pasa el tope. Los largos se miden hasta
//   ahí, y una frase recortada CIERRA la aparición: la siguiente no se suma
//   aunque falte para el mínimo (entonces, desde ahí no cabe). El silencio
//   que queda afuera va al tramo de imágenes siguiente (el corte ya admite
//   escenas sin palabras). El tope nunca deja una cola corta (rulings del
//   2026-10-11): si el fin recortado queda a menos de MIN_SECONDS_PER_SCENE
//   del fin del audio, el corte absorbería esa cola en el avatar (pins.ts),
//   así que el tramo llega al fin de la frase (`usableEnd`); el mínimo se
//   sigue midiendo hasta el fin recortado, así una última frase casi muda no
//   se vuelve aparición. El silencio inicial de la primera frase (de 0 a su
//   primera palabra) no se recorta: con «empieza con el avatar» el video abre
//   con el avatar. El tope mira solo la pausa después de la última palabra:
//   una pausa larga ADENTRO de una frase la aparición la carga entera (límite
//   deliberado). El tope no cambia el plan cuando todas las pausas son de 2 s
//   o menos (la regla de arriba sí puede cambiarlo sin ninguna pausa).
// Así, una palabra con un silencio largo detrás ya no es una aparición casi
// muda que HeyGen cobra: mide un par de segundos útiles y, sola, no llega al
// mínimo. Una frase de más de AVATAR_MAX_APPEARANCE_SECONDS hasta su fin útil
// no entra en ninguna.
//
// El máximo, regla del dueño («máx. 1 min»), se cumple también después del
// corte (ruling del 2026-10-11): `pinnedTimeline` le pega a la última
// aparición la cola de menos de MIN_SECONDS_PER_SCENE que quede antes del fin
// del audio, así que una aparición que terminaría ahí se mide hasta el fin del
// audio (`lengthAfterCut`), haya o no tope de silencio en su última frase. Si
// ni así entra, se queda una frase antes o, sin otra frase desde la que quepa,
// va a `dropped`.
//
// Precondición: las frases están ordenadas y son contiguas desde 0, como las
// da `detectSentences` (fronteras en la grilla de 25 fps, cada una con el fin
// de su última palabra). Tolerancia: cada garantía de tiempo —el largo entre
// el mínimo y el máximo, el hueco entre apariciones, el inicio a 3 s o más
// sin apertura, el tope de silencio— vale con TIME_EPSILON (1e-6 s): restar
// fronteras de la grilla deja ruido de coma flotante, y un tramo de
// 60,00000000000001 s o un hueco de 9,999999999999993 s cuentan como 60 y 10.
// Un consumidor que compare estricto contra las constantes tiene que usar la
// misma tolerancia.

export interface AvatarPlanOptions {
  appearances: number
  secondsPerAppearance: number
  startWithAvatar: boolean
}

// Una aparición: frases enteras, de AVATAR_MIN_APPEARANCE_SECONDS (hasta lo
// que dice) a AVATAR_MAX_APPEARANCE_SECONDS (con lo que le deje el corte), con
// TIME_EPSILON.
// Termina en el fin útil de su última frase: antes de su fin si la pausa
// después de su última palabra pasa AVATAR_MAX_PAUSE_SECONDS y no deja una
// cola corta antes del fin del audio.
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

// Fin recortado de una frase, hasta donde habla el avatar: su fin, salvo que
// la pausa después de su última palabra pase AVATAR_MAX_PAUSE_SECONDS;
// entonces, la última palabra más el tope, al cuadro (nunca después del fin
// de la frase, que en la última puede no caer en la grilla, ni antes de su
// inicio). Con él se mide el mínimo. Sin el fin de su última palabra (un
// words.json editado a mano) la frase no se recorta: un NaN acá dejaría la
// aparición sin tiempos.
function cappedEnd(sentence: NarrationSentence): number {
  const cap = sentence.lastWordEndSeconds + AVATAR_MAX_PAUSE_SECONDS
  if (!Number.isFinite(cap)) return sentence.endSeconds

  if (sentence.endSeconds <= cap + TIME_EPSILON) return sentence.endSeconds

  const capped = frameBoundary(cap) / ANIMATION_FPS
  return Math.max(Math.min(capped, sentence.endSeconds), sentence.startSeconds)
}

// Fin útil de una frase, donde termina el tramo del avatar: el recortado,
// salvo que deje una cola de menos de MIN_SECONDS_PER_SCENE antes de
// `audioEnd`; ahí, el fin de la frase, porque el corte absorbería esa cola en
// el avatar (pins.ts). Con él se mide el acercamiento al objetivo (justo a
// 3 s, el corte deja la cola como imagen y sí se recorta).
function usableEnd(sentence: NarrationSentence, audioEnd: number): number {
  const capped = cappedEnd(sentence)
  const tail = audioEnd - capped
  if (tail < MIN_SECONDS_PER_SCENE - TIME_EPSILON) return sentence.endSeconds

  return capped
}

// El largo que el corte le deja a un tramo de `startSeconds` a `endSeconds`:
// si termina a menos de MIN_SECONDS_PER_SCENE de `audioEnd`, `pinnedTimeline`
// le pega esa cola y llega hasta el fin del audio. Con él se mide el máximo,
// así ninguna aparición pasa AVATAR_MAX_APPEARANCE_SECONDS después del corte.
function lengthAfterCut(
  startSeconds: number,
  endSeconds: number,
  audioEnd: number,
): number {
  const tail = audioEnd - endSeconds
  if (tail < MIN_SECONDS_PER_SCENE - TIME_EPSILON)
    return audioEnd - startSeconds

  return endSeconds - startSeconds
}

// La frase termina antes de su fin nominal: hay más silencio del que el avatar
// carga, y la siguiente no se puede sumar a la misma aparición.
function closesAppearance(
  sentence: NarrationSentence,
  audioEnd: number,
): boolean {
  return usableEnd(sentence, audioEnd) < sentence.endSeconds - TIME_EPSILON
}

// Ajuste a frases desde `from`: la aparición arranca en el inicio de esa
// frase (con la primera, en 0: su silencio inicial no se recorta) y el tramo
// llega al fin útil de la última frase sumada. Con ese largo se mide el
// acercamiento al objetivo; el máximo, con el largo que le deje el corte
// (`lengthAfterCut`); el mínimo, con lo que el avatar dice (hasta el fin
// recortado de la última frase), para seguir sumando y al final. Así una
// última frase casi muda no se vuelve aparición aunque el corte fuera a
// pegarle la cola, y ninguna pasa el máximo cuando el corte se la pega. Suma
// la frase siguiente solo si el largo se acerca al objetivo (|largo −
// objetivo| baja), sin quedar debajo del mínimo (sigue sumando) ni pasar el
// máximo. Una frase recortada por el tope de silencio cierra la aparición: la
// siguiente no se suma, ni para llegar al mínimo.
// null si no llega al mínimo sin pasar el máximo (el audio se acaba antes, la
// frase que falta es demasiado larga o el tope de silencio cierra antes) o si
// la frase `from` sola ya pasa el máximo: desde ahí la aparición no cabe, y el
// reparto prueba desde otra frase.
function fitFrom(
  sentences: readonly NarrationSentence[],
  from: number,
  targetSeconds: number,
): AvatarSpan | null {
  // Las frases llegan hasta el fin del audio (precondición).
  const audioEnd = sentences[sentences.length - 1].endSeconds
  const startSeconds = sentences[from].startSeconds
  let to = from
  let endSeconds = usableEnd(sentences[from], audioEnd)
  let length = endSeconds - startSeconds
  let spokenLength = cappedEnd(sentences[from]) - startSeconds
  while (to + 1 < sentences.length) {
    if (closesAppearance(sentences[to], audioEnd)) break

    const nextEnd = usableEnd(sentences[to + 1], audioEnd)
    const nextLength = nextEnd - startSeconds
    const nextAfterCut = lengthAfterCut(startSeconds, nextEnd, audioEnd)
    if (nextAfterCut > AVATAR_MAX_APPEARANCE_SECONDS + TIME_EPSILON) break

    const belowMinimum =
      spokenLength < AVATAR_MIN_APPEARANCE_SECONDS - TIME_EPSILON
    const closer =
      Math.abs(nextLength - targetSeconds) <
      Math.abs(length - targetSeconds) - TIME_EPSILON
    if (!belowMinimum && !closer) break

    to++
    endSeconds = nextEnd
    length = nextLength
    spokenLength = cappedEnd(sentences[to]) - startSeconds
  }

  if (spokenLength < AVATAR_MIN_APPEARANCE_SECONDS - TIME_EPSILON) return null

  const afterCut = lengthAfterCut(startSeconds, endSeconds, audioEnd)
  if (afterCut > AVATAR_MAX_APPEARANCE_SECONDS + TIME_EPSILON) return null

  return { startSeconds, endSeconds, sentenceFrom: from, sentenceTo: to }
}

// La aparición más cercana a `targetStart` que cabe: para cada frase que
// arranca en `earliest` o después se prueba `fitFrom`, y gana la que cabe con
// el inicio más cercano, antes o después de `targetStart` (con empate, la
// primera). undefined si ninguna cabe.
function nearestFittingSpan(
  sentences: readonly NarrationSentence[],
  earliest: number,
  targetStart: number,
  targetSeconds: number,
): AvatarSpan | undefined {
  let best: AvatarSpan | undefined
  for (let index = 0; index < sentences.length; index++) {
    const start = sentences[index].startSeconds
    if (start < earliest - TIME_EPSILON) continue

    const span = fitFrom(sentences, index, targetSeconds)
    if (!span) continue

    if (best === undefined) {
      best = span
      continue
    }

    const distance = Math.abs(start - targetStart)
    const bestDistance = Math.abs(best.startSeconds - targetStart)
    if (distance < bestDistance - TIME_EPSILON) best = span
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
  // primera frase de más del máximo o casi muda (el tope de silencio la deja
  // debajo del mínimo), y esa frase no se lleva el plan entero.
  const opening = options.startWithAvatar
    ? fitFrom(sentences, 0, targetSeconds)
    : null
  if (opening) spans.push(opening)

  // Las demás, parejas sobre la zona libre: desde el fin de la apertura más el
  // hueco mínimo (o desde 0 sin apertura) hasta el fin del audio. El ancla k
  // es el centro del tramo k de M tramos iguales, y cada aparición arranca en
  // la frase más cercana a su ancla desde la que cabe.
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
    const span = nearestFittingSpan(
      sentences,
      earliest,
      anchor - targetSeconds / 2,
      targetSeconds,
    )
    if (!span) continue

    spans.push(span)
    previousEnd = span.endSeconds
  }

  return { spans, dropped: appearances - spans.length }
}
