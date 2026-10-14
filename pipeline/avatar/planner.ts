import { TIME_EPSILON } from '../animation/timing.ts'
import type { NarrationSentence } from '../narration/sentences.ts'
import { MIN_SECONDS_PER_SCENE } from '../stages/scene-cuts/by-seconds.ts'
import {
  AVATAR_DEFAULT_APPEARANCES,
  AVATAR_DEFAULT_APPEARANCE_SECONDS,
  AVATAR_EARLY_APPEARANCES,
  AVATAR_EARLY_MAX_SECONDS,
  AVATAR_EARLY_WINDOW_SECONDS,
  AVATAR_MAX_APPEARANCES,
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MAX_PAUSE_SECONDS,
  AVATAR_MIN_APPEARANCES,
  AVATAR_MIN_APPEARANCE_SECONDS,
  AVATAR_MIN_GAP_SECONDS,
  AVATAR_OPENING_MAX_PAUSE_SECONDS,
  AVATAR_SHORTEST_APPEARANCE_SECONDS,
} from '../types/avatar.ts'
import type { TranscriptWord } from '../types/scenes.ts'
import { avatarCutEnd, avatarCutLimit } from './appearance-cut.ts'

// Planificador de apariciones del avatar (ADR-0057, diseño §5 y §23.2). Puro y
// determinista: las mismas frases, palabras y opciones dan el mismo plan. La
// primera aparición abre el video si la persona lo pidió, y las demás se
// reparten parejo con AVATAR_MIN_GAP_SECONDS de imágenes entre una y otra. Las
// que no caben se cuentan en `dropped`: no es un fallo (la fase lo informa con
// `avatar-planned`).
//
// DÓNDE ARRANCA cada aparición (como en la 2f): en el inicio de una frase. La
// apertura, en 0. Las del reparto, en la frase más cercana a su ancla (el
// centro de su tramo de la zona libre, menos medio objetivo) DESDE LA QUE SIRVE,
// antes o después del ancla, con empate la primera (decisión del dueño de la
// entrega 2b); sin apertura, nunca antes de MIN_SECONDS_PER_SCENE (el corte
// pegaría ese tramo corto al inicio y el video abriría con el avatar). Va a
// `dropped` solo si ninguna frase de su zona sirve.
//
// DÓNDE TERMINA (entrega 2g, §23.2): donde corta `avatarCutEnd`
// (`appearance-cut.ts`), con inicio + segundos elegidos como objetivo: en el fin
// de frase o la pausa más cercana si está a medio segundo o menos y, si no, en
// el hueco entre dos palabras más cercano, sin cortar nunca una palabra. Así,
// en una narración TTS, la aparición dura lo elegido ±0,5 s (una palabra con su
// pausa de más de 1 s junto al objetivo puede correrlo algo más), salvo que la
// corten antes una pausa larga, el máximo o el fin del audio. Hasta la 2f cada
// aparición decía frases enteras: sumaba frases mientras se acercara al
// objetivo y hasta llegar al mínimo, con 5 s elegidos salían de 6 a 13 s. Eso se
// fue, y con él el fin recortado de cada frase (el tope de silencio de la 2b
// medido por frase) y el reintento de la apertura que cargaba el silencio frase
// por frase (`pauseRule`, R-2f-4). Los subtítulos de una escena de avatar siguen
// yendo por frases enteras (§23.6).
//
// LAS PAUSAS LARGAS (R-2g-11): el avatar no se queda mudo (decisión del dueño
// de la 2b). El límite del corte (`avatarCutLimit`) es la última palabra antes
// de la primera pausa de más de AVATAR_MAX_PAUSE_SECONDS más ese tope, al
// cuadro hacia abajo, y lo mismo con el silencio después de la última palabra
// del audio: una pausa larga corta la aparición ahí en vez de descartar su
// inicio, y el silencio que queda afuera es una escena de imagen. La apertura,
// si así no sirve, vuelve a probar cargando las pausas de hasta
// AVATAR_OPENING_MAX_PAUSE_SECONDS; una más larga la corta igual, con la misma
// cola de AVATAR_MAX_PAUSE_SECONDS (R-2f-4, R-2f-6 y R-2g-17; `openingSpan`).
// El silencio inicial, de 0 a la primera palabra, no cuenta: con «empieza con
// el avatar» el video abre con el avatar.
//
// Una frase NO SIRVE de inicio si su aparición:
// - pasaría el máximo con lo que le deje el corte de escenas (`lengthAfterCut`:
//   `pinnedTimeline` le pega la cola de menos de MIN_SECONDS_PER_SCENE que quede
//   antes del fin del audio; el máximo es la regla del dueño, «máx. 1 min»), o
//   duraría menos de AVATAR_SHORTEST_APPEARANCE_SECONDS (el mínimo elegible
//   menos el medio segundo del corte; el mismo piso que el cambio de duración
//   desde el editor), medido hasta su corte y sin la cola que se le
//   pegue: un audio que se acaba antes, o una pausa larga muy cerca del inicio,
//   no dan un avatar corto, y una última frase casi muda no se vuelve aparición
//   por el silencio que el corte le pega (como el mínimo de la 2b, que se medía
//   hasta el fin recortado).
// - dejaría menos de MIN_SECONDS_PER_SCENE antes del fin del audio: el corte de
//   escenas se la pegaría y la aparición pasaría lo elegido. Si ninguna frase
//   sirve, se acepta la cola corta (`acceptShortTail`): el corte de escenas la
//   pega y, si así la aparición pasaría el máximo, el corte deja esos 3 s antes
//   del fin.
//
// «3 veces en 2 minutos» (`threeInFirstTwoMinutes`, entrega 2f, §22.2, R-2f-2,
// R-2f-3 y R-2f-8): al menos AVATAR_EARLY_APPEARANCES apariciones. Las tres
// primeras —la apertura cuenta si cupo; si no, la ventana prueba las tres—
// ARRANCAN antes de AVATAR_EARLY_WINDOW_SECONDS, o del fin del audio si es más
// corto, repartidas con la regla de anclas de siempre dentro de esa ventana y
// con el hueco mínimo, apuntando a min(segundos elegidos,
// AVATAR_EARLY_MAX_SECONDS) y sin pasar ese tope: Crear dice que «duran hasta»
// ahí. El corte nunca pasa inicio + tope, así que el respaldo a 60 s de la 2f
// (`targetsToTry`, para frases más largas que el tope) se fue. Las demás, con
// los segundos elegidos, se reparten parejas en la zona que queda después de la
// última de esas tres. La que no entra va a `dropped`, nunca a otro lugar.
// Apagada (o ausente), solo hay apertura y reparto.
//
// Precondición: las frases están ordenadas y son contiguas desde 0 hasta el fin
// del audio, como las da `detectSentences` con las mismas palabras (fronteras en
// la grilla de 25 fps; cada frase con sus índices de palabras). Tolerancia:
// cada garantía de tiempo —el largo entre AVATAR_SHORTEST_APPEARANCE_SECONDS y
// el máximo, el hueco entre apariciones, el inicio a 3 s o más sin apertura, las
// pausas, la cola corta, el inicio antes del fin de la ventana de «3 veces en 2
// minutos»— vale con TIME_EPSILON (1e-6 s): restar fronteras de la grilla deja
// ruido de coma flotante, y un tramo de 60,00000000000001 s o un hueco de
// 9,999999999999993 s cuentan como 60 y 10. Un consumidor que compare estricto
// contra las constantes tiene que usar la misma tolerancia.

export interface AvatarPlanOptions {
  appearances: number
  secondsPerAppearance: number
  startWithAvatar: boolean
  // «3 veces en 2 minutos» (entrega 2f, §22.2): solo `true` la prende.
  threeInFirstTwoMinutes?: boolean
}

// Una aparición: arranca en el inicio de una frase (la apertura, en 0) y
// termina donde corta `avatarCutEnd`, entre dos palabras o en el fin del audio.
// Dura de AVATAR_SHORTEST_APPEARANCE_SECONDS a AVATAR_MAX_APPEARANCE_SECONDS con
// lo que le deje el corte de escenas, con TIME_EPSILON.
export interface AvatarSpan {
  startSeconds: number
  endSeconds: number
  // La frase donde arranca y la de la última palabra que dice (por su punto
  // medio, como el texto de las escenas); los dos índices inclusive.
  sentenceFrom: number
  sentenceTo: number
}

export interface AvatarPlan {
  spans: AvatarSpan[]
  // Apariciones pedidas que no cupieron.
  dropped: number
}

// Lo que el planificador lee de la narración: las frases (de 0 al fin del
// audio), las palabras de words.json y el fin del audio.
interface Narration {
  sentences: readonly NarrationSentence[]
  words: readonly TranscriptWord[]
  audioEnd: number
}

// A cuánto apunta una aparición (`seconds`) y cuánto puede durar como mucho,
// con lo que le deje el corte: AVATAR_MAX_APPEARANCE_SECONDS, salvo las tres
// primeras de «3 veces en 2 minutos», que no pasan AVATAR_EARLY_MAX_SECONDS
// (R-2f-3).
interface AppearanceTarget {
  seconds: number
  maximumSeconds: number
}

// Cómo se prueba una frase de inicio: cuánto silencio puede cargar la
// aparición antes de que una pausa la corte (entre dos palabras y después de la
// última del audio), y si acepta la cola corta que el corte de escenas le
// pegará (la segunda pasada, cuando sin ella ninguna frase sirve).
interface AppearanceRules {
  maximumPauseSeconds: number
  acceptShortTail: boolean
}

// Una zona del reparto parejo: cuántas apariciones, hasta qué segundo, a
// cuánto apunta cada una y, para las primeras de «3 veces en 2 minutos», el
// segundo antes del cual tienen que arrancar.
interface SpreadZone {
  count: number
  endSeconds: number
  target: AppearanceTarget
  startsBefore?: number
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

// El largo que el corte de escenas le deja a un tramo de `startSeconds` a
// `endSeconds`: si termina a menos de MIN_SECONDS_PER_SCENE de `audioEnd`,
// `pinnedTimeline` le pega esa cola y llega hasta el fin del audio. Con él se
// mide el máximo, así ninguna aparición pasa AVATAR_MAX_APPEARANCE_SECONDS
// después del corte.
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

// El corte deja algo de audio, pero menos de MIN_SECONDS_PER_SCENE, antes del
// fin: el corte de escenas pegaría esa cola a la aparición.
function leavesShortTail(endSeconds: number, audioEnd: number): boolean {
  const tail = audioEnd - endSeconds
  return tail > TIME_EPSILON && tail < MIN_SECONDS_PER_SCENE - TIME_EPSILON
}

// Hasta dónde puede cortar `avatarCutEnd` desde `startSeconds`
// (`avatarCutLimit`): el fin del audio o el inicio más el máximo, salvo que
// antes una pausa de más de `rules.maximumPauseSeconds` (o el silencio después
// de la última palabra del audio) corte la aparición. Aceptando la cola corta,
// si pegársela la haría pasar el máximo, el corte deja MIN_SECONDS_PER_SCENE
// antes del fin (hasta la 2f el ajuste se quedaba una frase antes).
function cutLimit(
  narration: Narration,
  startSeconds: number,
  target: AppearanceTarget,
  rules: AppearanceRules,
): number {
  const { words, audioEnd } = narration
  const glueExceedsMaximum =
    audioEnd - startSeconds > target.maximumSeconds + TIME_EPSILON
  const maximumEnd = Math.min(
    audioEnd,
    startSeconds + target.maximumSeconds,
    rules.acceptShortTail && glueExceedsMaximum
      ? audioEnd - MIN_SECONDS_PER_SCENE
      : Number.POSITIVE_INFINITY,
  )

  // La pausa que corta la aparición deja siempre la misma cola, también cuando
  // la apertura carga pausas más largas (R-2g-17).
  return avatarCutLimit(
    words,
    startSeconds,
    maximumEnd,
    rules.maximumPauseSeconds,
    AVATAR_MAX_PAUSE_SECONDS,
  )
}

// La última palabra que dice la aparición que termina en `endSeconds`, por su
// punto medio como el texto de las escenas, desde la primera palabra de su
// frase de inicio (`fromWord`; ella misma si no dice ninguna). Un tiempo que no
// es un número no la mueve.
function lastSpokenWord(
  words: readonly TranscriptWord[],
  fromWord: number,
  endSeconds: number,
): number {
  let lastWord = fromWord
  for (let index = fromWord; index < words.length; index++) {
    const word = words[index]
    if (word.start >= endSeconds - TIME_EPSILON) break

    if ((word.start + word.end) / 2 < endSeconds) lastWord = index
  }

  return lastWord
}

// La frase que tiene la palabra `wordIndex`, buscando desde la frase `from`.
function sentenceOfWord(
  sentences: readonly NarrationSentence[],
  wordIndex: number,
  from: number,
): number {
  for (let index = from; index < sentences.length; index++) {
    if (wordIndex <= sentences[index].wordTo) return index
  }

  return sentences.length - 1
}

// La aparición que arranca en la frase `index`, o undefined si desde ahí no
// sirve (ver la cabecera).
function appearanceFrom(
  narration: Narration,
  index: number,
  target: AppearanceTarget,
  rules: AppearanceRules,
): AvatarSpan | undefined {
  const { sentences, words, audioEnd } = narration
  const sentence = sentences[index]
  const startSeconds = sentence.startSeconds
  const endSeconds = avatarCutEnd(words, {
    startSeconds,
    targetSeconds: target.seconds,
    limitSeconds: cutLimit(narration, startSeconds, target, rules),
  })
  if (endSeconds === undefined) return undefined

  const afterCut = lengthAfterCut(startSeconds, endSeconds, audioEnd)
  if (afterCut > target.maximumSeconds + TIME_EPSILON) return undefined

  const length = endSeconds - startSeconds
  if (length < AVATAR_SHORTEST_APPEARANCE_SECONDS - TIME_EPSILON)
    return undefined

  if (!rules.acceptShortTail && leavesShortTail(endSeconds, audioEnd))
    return undefined

  const lastWord = lastSpokenWord(words, sentence.wordFrom, endSeconds)
  return {
    startSeconds,
    endSeconds,
    sentenceFrom: index,
    sentenceTo: sentenceOfWord(sentences, lastWord, index),
  }
}

// Las frases desde las que puede arrancar una aparición del reparto, de la que
// arranca más cerca de `targetStart` a la más lejana, con empate la primera:
// las que arrancan en `earliest` o después y antes de `startsBefore`.
function startsByDistance(
  sentences: readonly NarrationSentence[],
  earliest: number,
  targetStart: number,
  startsBefore: number,
): number[] {
  const indices: number[] = []
  for (const [index, sentence] of sentences.entries()) {
    if (sentence.startSeconds < earliest - TIME_EPSILON) continue

    // Una de las primeras de «3 veces en 2 minutos» arranca adentro de su
    // ventana: justo en el fin (con TIME_EPSILON) ya no.
    if (sentence.startSeconds > startsBefore - TIME_EPSILON) continue

    indices.push(index)
  }

  const distance = (index: number) => {
    return Math.abs(sentences[index].startSeconds - targetStart)
  }
  return indices.sort((first, second) => {
    const difference = distance(first) - distance(second)
    if (Math.abs(difference) > TIME_EPSILON) return difference

    return first - second
  })
}

// La aparición que arranca más cerca de `targetStart` y sirve (ver la
// cabecera): primero las que no dejan una cola corta y, si ninguna frase sirve
// así, aceptándola. undefined si ninguna sirve.
function nearestAppearance(
  narration: Narration,
  earliest: number,
  targetStart: number,
  target: AppearanceTarget,
  startsBefore = Number.POSITIVE_INFINITY,
): AvatarSpan | undefined {
  const starts = startsByDistance(
    narration.sentences,
    earliest,
    targetStart,
    startsBefore,
  )
  for (const acceptShortTail of [false, true]) {
    for (const index of starts) {
      const span = appearanceFrom(narration, index, target, {
        maximumPauseSeconds: AVATAR_MAX_PAUSE_SECONDS,
        acceptShortTail,
      })
      if (span) return span
    }
  }

  return undefined
}

// La apertura (R-2f-4, §22.3): arranca en 0 o no hay. Dos intentos (D4), cada
// uno primero sin dejar una cola corta y después aceptándola:
// 1. Las pausas de más de AVATAR_MAX_PAUSE_SECONDS la cortan (R-2g-11).
// 2. Si así no llega a AVATAR_SHORTEST_APPEARANCE_SECONDS, carga las de hasta
//    AVATAR_OPENING_MAX_PAUSE_SECONDS (R-2f-4 y R-2f-6): «Hola.» y 5,2 s de
//    silencio abre el video. Una pausa más larga la corta como en el primer
//    intento, en la última palabra antes de ella más AVATAR_MAX_PAUSE_SECONDS
//    (R-2g-17); si así tampoco llega, no hay apertura, como en la 2f, y una
//    palabra y 19 s de silencio no son una apertura muda que HeyGen cobra.
// El cambio de duración de la apertura desde el editor prueba igual
// (`avatarResizePlan`, R-2g-21).
// null si ninguno sirve: un audio de menos de AVATAR_SHORTEST_APPEARANCE_SECONDS
// o una primera palabra seguida de más silencio del que la apertura carga.
function openingSpan(
  narration: Narration,
  target: AppearanceTarget,
): AvatarSpan | null {
  for (const maximumPauseSeconds of [
    AVATAR_MAX_PAUSE_SECONDS,
    AVATAR_OPENING_MAX_PAUSE_SECONDS,
  ]) {
    for (const acceptShortTail of [false, true]) {
      const span = appearanceFrom(narration, 0, target, {
        maximumPauseSeconds,
        acceptShortTail,
      })
      if (span) return span
    }
  }

  return null
}

// El reparto parejo (diseño §5): `zone.count` apariciones sobre la zona libre,
// que va desde el fin de la anterior (`previousEnd`) más el hueco mínimo —o
// desde 0, sin ninguna antes— hasta `zone.endSeconds`. El ancla k es el centro
// del tramo k de `count` tramos iguales, y cada aparición arranca en la frase
// más cercana a su ancla menos medio objetivo desde la que sirve. La que no
// sirve desde ninguna se saltea: quien llama la cuenta en `dropped`.
function spreadAppearances(
  narration: Narration,
  previousEnd: number | undefined,
  zone: SpreadZone,
): AvatarSpan[] {
  const zoneStart =
    previousEnd === undefined ? 0 : previousEnd + AVATAR_MIN_GAP_SECONDS
  const zoneLength = Math.max(0, zone.endSeconds - zoneStart)
  const spans: AvatarSpan[] = []
  let lastEnd = previousEnd
  for (let slot = 0; slot < zone.count; slot++) {
    const anchor = zoneStart + ((slot + 0.5) * zoneLength) / zone.count
    // Nunca antes del fin de la anterior más el hueco mínimo. Sin ninguna
    // antes, la primera deja al menos una escena de imagen
    // (MIN_SECONDS_PER_SCENE): si no, el corte absorbería ese tramo corto y el
    // video abriría con el avatar aunque la persona no lo pidió.
    const earliest =
      lastEnd === undefined
        ? MIN_SECONDS_PER_SCENE
        : lastEnd + AVATAR_MIN_GAP_SECONDS
    const span = nearestAppearance(
      narration,
      earliest,
      anchor - zone.target.seconds / 2,
      zone.target,
      zone.startsBefore,
    )
    if (!span) continue

    spans.push(span)
    lastEnd = span.endSeconds
  }

  return spans
}

export function planAvatarSpans(
  sentences: readonly NarrationSentence[],
  words: readonly TranscriptWord[],
  options: AvatarPlanOptions,
): AvatarPlan {
  const chosenAppearances = Math.round(
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
  const target = {
    seconds: targetSeconds,
    maximumSeconds: AVATAR_MAX_APPEARANCE_SECONDS,
  }
  // «3 veces en 2 minutos» (§22.2): al menos tres apariciones (R-2f-2), y las
  // tres primeras apuntan a lo sumo a AVATAR_EARLY_MAX_SECONDS y no lo pasan
  // (R-2f-3).
  const threeEarly = options.threeInFirstTwoMinutes === true
  const appearances = threeEarly
    ? Math.max(chosenAppearances, AVATAR_EARLY_APPEARANCES)
    : chosenAppearances
  const earlyTarget = threeEarly
    ? {
        seconds: Math.min(targetSeconds, AVATAR_EARLY_MAX_SECONDS),
        maximumSeconds: AVATAR_EARLY_MAX_SECONDS,
      }
    : target
  if (sentences.length === 0) return { spans: [], dropped: appearances }

  const narration = {
    sentences,
    words,
    audioEnd: sentences[sentences.length - 1].endSeconds,
  }
  const spans: AvatarSpan[] = []
  // Con «empieza con el avatar», la primera arranca en 0. Si no sirve, las
  // demás se planifican igual, como sin apertura: la causa es un audio más
  // corto que el mínimo o más silencio del que carga, y eso no se lleva el plan
  // entero. Apagada «3 veces en 2 minutos», la apertura cuenta como una de las
  // pedidas haya cabido o no (la que no cupo va a `dropped`).
  const opening = options.startWithAvatar
    ? openingSpan(narration, earlyTarget)
    : null
  if (opening) spans.push(opening)
  const openingCount = options.startWithAvatar ? 1 : 0

  // Las demás, parejas sobre la zona libre: desde el fin de la apertura más el
  // hueco mínimo (o desde 0 sin apertura) hasta el fin del audio.
  if (!threeEarly) {
    spans.push(
      ...spreadAppearances(narration, opening?.endSeconds, {
        count: appearances - openingCount,
        endSeconds: narration.audioEnd,
        target,
      }),
    )
    return { spans, dropped: appearances - spans.length }
  }

  // «3 veces en 2 minutos»: las que faltan para las tres primeras, parejas
  // sobre la zona libre hasta el fin de la ventana (los primeros dos minutos,
  // o el video si es más corto) y arrancando antes de él. Una apertura que no
  // cupo no ocupa lugar: la ventana prueba las tres (R-2f-7).
  const windowEnd = Math.min(AVATAR_EARLY_WINDOW_SECONDS, narration.audioEnd)
  spans.push(
    ...spreadAppearances(narration, opening?.endSeconds, {
      count: opening ? AVATAR_EARLY_APPEARANCES - 1 : AVATAR_EARLY_APPEARANCES,
      endSeconds: windowEnd,
      target: earlyTarget,
      startsBefore: windowEnd,
    }),
  )
  // Las demás, con los segundos elegidos, parejas en la zona que queda
  // después de la última de las primeras (la tercera, si entró).
  spans.push(
    ...spreadAppearances(narration, spans.at(-1)?.endSeconds, {
      count: appearances - AVATAR_EARLY_APPEARANCES,
      endSeconds: narration.audioEnd,
      target,
    }),
  )

  return { spans, dropped: appearances - spans.length }
}
