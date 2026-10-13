import {
  ANIMATION_FPS,
  frameBoundary,
  TIME_EPSILON,
} from '../animation/timing.ts'
import {
  AVATAR_CUT_NATURAL_PAUSE_SECONDS,
  AVATAR_CUT_PAUSE_WINDOW_SECONDS,
  AVATAR_MAX_PAUSE_SECONDS,
} from '../types/avatar.ts'
import type { TranscriptWord } from '../types/scenes.ts'

// Dónde termina una aparición del avatar (entrega 2g, diseño §23.2). Puro y
// browser-safe (sin `node:*`): lo usan el planificador (`planner.ts`) y el
// cambio de duración de una aparición desde el editor.
//
// La aparición arranca en `startSeconds` y apunta a `startSeconds +
// targetSeconds` (el objetivo). Corta en un hueco entre dos palabras, en el
// inicio de la palabra que sigue llevado al cuadro de 25 fps, como las
// fronteras de frase (`detectSentences`): la pausa corta queda con el avatar y
// ninguna palabra se corta. La regla:
//
// 1. Si a AVATAR_CUT_PAUSE_WINDOW_SECONDS o menos del objetivo hay un corte
//    natural —un fin de frase (`sentenceEnd`) o una pausa de
//    AVATAR_CUT_NATURAL_PAUSE_SECONDS o más entre las dos palabras—, gana el
//    natural más cercano.
// 2. Si no, gana el corte más cercano. Con empate, el natural (R-2g-12): así
//    no corta antes de la última palabra de una frase cuando el fin de esa
//    frase queda a la misma distancia.
//
// En cualquier otro empate gana el primero (el más temprano). Los cortes caen
// estrictamente después de `startSeconds` y a lo sumo en `limitSeconds`. El
// límite también es un corte, y natural, si no cae adentro de una palabra
// (entre dos palabras o después de la última): el fin del audio, o el que arma
// `avatarCutLimit` cuando una pausa larga corta la aparición (R-2g-11). Si
// inicio + objetivo pasa ese límite, el corte es el límite; si el límite cae
// adentro de una palabra, la regla elige entre los huecos de antes (sin un
// natural a medio segundo del objetivo, el último). Medido sobre las dos
// narraciones del dueño (2026-10-12), con 5 y con 10 s: 0,1 s de diferencia con
// lo elegido de mediana, 0,3 s o menos en el 90 % y nunca más de 0,5 s. Las
// comparaciones usan TIME_EPSILON, como el planificador.
//
// Precondición: `words` en orden, como en words.json. Una palabra cuyo inicio
// no es un número no da corte; sin palabras no hay ninguno.

export interface AvatarCutOptions {
  // Dónde arranca la aparición, en segundos del audio.
  startSeconds: number
  // Los segundos elegidos: el objetivo es startSeconds + targetSeconds.
  targetSeconds: number
  // El último segundo del audio donde puede cortar: el de `avatarCutLimit`, el
  // fin del audio o lo que pida quien llama.
  limitSeconds: number
}

// Un corte posible y si es natural (un fin de frase o una pausa).
interface CutCandidate {
  seconds: number
  natural: boolean
}

// El segundo donde termina la aparición, o undefined si no hay ningún corte
// entre el inicio (sin incluirlo) y el límite.
export function avatarCutEnd(
  words: readonly TranscriptWord[],
  options: AvatarCutOptions,
): number | undefined {
  const goal = options.startSeconds + options.targetSeconds
  let nearest: CutCandidate | undefined
  let nearestNatural: CutCandidate | undefined
  for (const candidate of cutCandidates(words, options)) {
    if (beats(candidate, nearest, goal)) nearest = candidate
    if (candidate.natural && beats(candidate, nearestNatural, goal))
      nearestNatural = candidate
  }

  if (!nearest) return undefined

  if (nearestNatural && withinPauseWindow(nearestNatural, goal))
    return nearestNatural.seconds

  return nearest.seconds
}

// El último segundo donde puede terminar una aparición que arranca en
// `startSeconds`, para pasárselo a `avatarCutEnd` (entrega 2g, R-2g-11):
// `maximumEndSeconds`, salvo que antes haya un silencio de más de
// `maximumPauseSeconds` —entre dos palabras, o después de la última palabra del
// audio, medido hasta `maximumEndSeconds`—; entonces, la última palabra antes
// de ese silencio más `tailSeconds` (por omisión, el mismo tope), al cuadro de
// 25 fps hacia abajo (así no lo pasa). Una pausa larga corta la aparición en vez
// de descartar su inicio, y la aparición nunca carga más silencio que ese. El
// silencio antes de la primera palabra de la aparición (el inicial, en la
// apertura, o la pausa que cierra la frase anterior) no cuenta. Lo usan el
// planificador (2 s; en el segundo intento de la apertura, carga las pausas de
// hasta 6 s y una más larga la corta con la cola de 2 s, R-2g-17) y el cambio
// de duración desde el editor.
export function avatarCutLimit(
  words: readonly TranscriptWord[],
  startSeconds: number,
  maximumEndSeconds: number,
  maximumPauseSeconds = AVATAR_MAX_PAUSE_SECONDS,
  tailSeconds = maximumPauseSeconds,
): number {
  const silenceStart = firstLongSilence(
    words,
    startSeconds,
    maximumEndSeconds,
    maximumPauseSeconds,
  )
  if (silenceStart === undefined) return maximumEndSeconds

  // TIME_EPSILON en segundos, antes de pasar a cuadros: un fin de palabra con
  // ruido de coma flotante no pierde su cuadro.
  const frames = Math.floor(
    (silenceStart + tailSeconds + TIME_EPSILON) * ANIMATION_FPS,
  )
  return Math.min(maximumEndSeconds, frames / ANIMATION_FPS)
}

// Dónde empieza el primer silencio de más de `maximumPauseSeconds` de la
// aparición: el fin de la palabra que lo precede (o el inicio, si ya venía de
// antes), contando el que sigue a la última palabra del audio hasta
// `maximumEndSeconds`. undefined si ninguno empieza antes de
// `maximumEndSeconds`. Un tiempo que no es un número no abre un silencio.
function firstLongSilence(
  words: readonly TranscriptWord[],
  startSeconds: number,
  maximumEndSeconds: number,
  maximumPauseSeconds: number,
): number | undefined {
  for (
    let index = firstGapNear(words, startSeconds);
    index < words.length;
    index++
  ) {
    const silenceStart = Math.max(words[index].end, startSeconds)
    if (silenceStart >= maximumEndSeconds) return undefined

    const nextStart = words[index + 1]?.start ?? maximumEndSeconds
    if (nextStart - silenceStart > maximumPauseSeconds + TIME_EPSILON)
      return silenceStart
  }

  return undefined
}

// El corte está a AVATAR_CUT_PAUSE_WINDOW_SECONDS o menos del objetivo.
function withinPauseWindow(candidate: CutCandidate, goal: number): boolean {
  const distance = Math.abs(candidate.seconds - goal)
  return distance <= AVATAR_CUT_PAUSE_WINDOW_SECONDS + TIME_EPSILON
}

// Los cortes posibles, en orden de tiempo: el hueco después de cada palabra
// (en el inicio de la siguiente, al cuadro) y el límite, si no cae adentro de
// una palabra.
function cutCandidates(
  words: readonly TranscriptWord[],
  options: AvatarCutOptions,
): CutCandidate[] {
  const { startSeconds, limitSeconds } = options
  const candidates: CutCandidate[] = []
  for (
    let index = firstGapNear(words, startSeconds);
    index < words.length - 1;
    index++
  ) {
    const seconds = frameBoundary(words[index + 1].start) / ANIMATION_FPS
    if (seconds > limitSeconds + TIME_EPSILON) break

    if (!Number.isFinite(seconds)) continue

    if (seconds <= startSeconds + TIME_EPSILON) continue

    candidates.push({ seconds, natural: isNaturalGap(words, index) })
  }

  if (!Number.isFinite(limitSeconds)) return candidates

  if (limitSeconds <= startSeconds + TIME_EPSILON) return candidates

  if (!betweenWords(words, limitSeconds)) return candidates

  candidates.push({ seconds: limitSeconds, natural: true })
  return candidates
}

// `seconds` cae entre dos palabras o después de la última, no adentro de una:
// la última palabra que empieza antes termina ahí o antes. Antes de la primera
// palabra no cuenta, y sin el fin de esa palabra (un words.json editado a mano)
// no se sabe, así que tampoco.
function betweenWords(
  words: readonly TranscriptWord[],
  seconds: number,
): boolean {
  const next = firstWordStartingFrom(words, seconds - TIME_EPSILON)
  if (next === 0) return false

  return words[next - 1].end <= seconds + TIME_EPSILON
}

// El hueco después de la palabra `index` es natural si ella cierra una frase o
// si la pausa hasta la siguiente es de AVATAR_CUT_NATURAL_PAUSE_SECONDS o más.
function isNaturalGap(
  words: readonly TranscriptWord[],
  index: number,
): boolean {
  if (words[index].sentenceEnd === true) return true

  const pause = words[index + 1].start - words[index].end
  return pause >= AVATAR_CUT_NATURAL_PAUSE_SECONDS - TIME_EPSILON
}

// El corte le gana a `best`: está más cerca del objetivo (con TIME_EPSILON) o,
// con empate, es natural y `best` no (R-2g-12). Los cortes llegan en orden de
// tiempo, así que en cualquier otro empate se queda el primero.
function beats(
  candidate: CutCandidate,
  best: CutCandidate | undefined,
  goal: number,
): boolean {
  if (!best) return true

  const difference =
    Math.abs(candidate.seconds - goal) - Math.abs(best.seconds - goal)
  if (difference < -TIME_EPSILON) return true

  if (difference > TIME_EPSILON) return false

  return candidate.natural && !best.natural
}

// El primer hueco cuyo corte puede caer después de `startSeconds`: el que
// sigue a la palabra anterior a la primera (desde la segunda) que empieza un
// cuadro antes de ese segundo o después, así cada aparición no recorre la
// narración entera. Un inicio llevado al cuadro se mueve medio cuadro como
// mucho: las palabras de antes no pueden dar un corte después de
// `startSeconds`.
function firstGapNear(
  words: readonly TranscriptWord[],
  startSeconds: number,
): number {
  const earliest = startSeconds - 1 / ANIMATION_FPS
  return firstWordStartingFrom(words, earliest, 1) - 1
}

// La primera palabra desde `fromIndex` que empieza en `seconds` o después, o
// `words.length` si no hay ninguna: búsqueda binaria sobre las palabras en
// orden. Una palabra cuyo inicio no es un número cuenta como «después».
function firstWordStartingFrom(
  words: readonly TranscriptWord[],
  seconds: number,
  fromIndex = 0,
): number {
  let low = fromIndex
  let high = words.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (words[middle].start < seconds) low = middle + 1
    else high = middle
  }

  return low
}
