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
//   sirve. La apertura no tiene alternativa: arranca en 0 o no cabe (desde
//   la 2f, cargando el silencio si con el tope no cabe; ver abajo).
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
// no entra en ninguna. La excepción, desde la 2f, es la apertura (R-2f-4,
// abajo): si con el tope no cabe, carga ese silencio, hasta 6 s por frase.
//
// El máximo, regla del dueño («máx. 1 min»), se cumple también después del
// corte (ruling del 2026-10-11): `pinnedTimeline` le pega a la última
// aparición la cola de menos de MIN_SECONDS_PER_SCENE que quede antes del fin
// del audio, así que una aparición que terminaría ahí se mide hasta el fin del
// audio (`lengthAfterCut`), haya o no tope de silencio en su última frase. Si
// ni así entra, se queda una frase antes o, sin otra frase desde la que quepa,
// va a `dropped`.
//
// Dos reglas de la entrega 2f (pedidos del dueño del 2026-10-12, diseño §22):
// - La apertura siempre abre (R-2f-4, §22.3). Con «empieza con el avatar», si
//   el ajuste desde la frase 0 no cabe, se vuelve a probar SIN el tope de
//   silencio (`openingSpan`, `pauseRule: 'carried'`): cada frase se mide hasta
//   su fin, así la apertura carga ese silencio y suma frases hasta el mínimo,
//   sin pasar el máximo. Pero no carga más de AVATAR_OPENING_MAX_PAUSE_SECONDS
//   (6 s) después de la última palabra de cada frase (ronda 1 del
//   2026-10-12): si hace falta más, no hay apertura, como antes de la 2f, así
//   una palabra y 19 s de silencio no son una apertura muda que HeyGen cobra.
//   Solo la dejan afuera un audio de menos del mínimo, una apertura que no
//   llega al mínimo sin pasar el máximo después del corte (una primera frase
//   de más del máximo, o una corta seguida de una que lo pasa) o más silencio
//   del que carga. Si el ajuste normal cabe, la apertura es la de siempre.
//   Esta regla no depende de «3 veces en 2 minutos»: cambia el plan solo de
//   los videos cuya apertura antes se descartaba por el tope.
// - «3 veces en 2 minutos» (`threeInFirstTwoMinutes`, §22.2, R-2f-2 y
//   R-2f-3): al menos AVATAR_EARLY_APPEARANCES apariciones. Las tres primeras
//   —la apertura cuenta si cupo; si no, la ventana prueba las tres (ronda 1)—
//   ARRANCAN antes de AVATAR_EARLY_WINDOW_SECONDS, o del fin del audio si es
//   más corto, repartidas con la regla de anclas de siempre dentro de esa
//   ventana, con el hueco mínimo, apuntando a min(segundos elegidos,
//   AVATAR_EARLY_MAX_SECONDS) y sin pasar AVATAR_EARLY_MAX_SECONDS: Crear dice
//   que «duran hasta» ese tope, y como objetivo solo dejaba tramos más largos
//   y a la tercera afuera (con 45 s y frases de 8 s, 0–48 y 64–112). El tope
//   bajó de 45 a 40 s en la ronda 1 y a 35 en la ronda 2 (R-2f-8) para que
//   las tres entren siempre (ver la constante). Solo si desde ninguna frase de
//   su zona cabe una del tope o menos (frases muy largas; la apertura, con una
//   primera frase más larga que el tope) se prueba con el máximo de siempre:
//   mejor una de 48 s que perderla. Solo el inicio tiene que caer en la
//   ventana. Las demás, con los segundos elegidos, se reparten parejas en la
//   zona que queda después de la última de esas tres. La que no entra va a
//   `dropped`, nunca a otro lugar. Apagada (o ausente), el plan es el de
//   siempre.
//
// Precondición: las frases están ordenadas y son contiguas desde 0, como las
// da `detectSentences` (fronteras en la grilla de 25 fps, cada una con el fin
// de su última palabra). Tolerancia: cada garantía de tiempo —el largo entre
// el mínimo y el máximo, el hueco entre apariciones, el inicio a 3 s o más
// sin apertura, el tope de silencio, el inicio antes del fin de la ventana de
// «3 veces en 2 minutos»— vale con TIME_EPSILON (1e-6 s): restar
// fronteras de la grilla deja ruido de coma flotante, y un tramo de
// 60,00000000000001 s o un hueco de 9,999999999999993 s cuentan como 60 y 10.
// Un consumidor que compare estricto contra las constantes tiene que usar la
// misma tolerancia.

export interface AvatarPlanOptions {
  appearances: number
  secondsPerAppearance: number
  startWithAvatar: boolean
  // «3 veces en 2 minutos» (entrega 2f, §22.2): solo `true` la prende.
  threeInFirstTwoMinutes?: boolean
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

// A cuánto apunta una aparición (`seconds`) y cuánto puede durar como mucho,
// con lo que le deje el corte: AVATAR_MAX_APPEARANCE_SECONDS, salvo las tres
// primeras de «3 veces en 2 minutos», que no pasan AVATAR_EARLY_MAX_SECONDS
// mientras puedan (R-2f-3: Crear dice que «duran hasta» ese tope;
// targetsToTry).
interface AppearanceTarget {
  seconds: number
  maximumSeconds: number
}

// Cómo mide el ajuste cada frase: con el tope de silencio, como siempre, o
// cargando el silencio hasta su fin (`carried`: solo la apertura que con el
// tope no cabe, R-2f-4), sin pasar AVATAR_OPENING_MAX_PAUSE_SECONDS.
type PauseRule = 'capped' | 'carried'

// Hasta dónde habla el avatar en la frase, para el mínimo: su fin recortado o,
// cargando el silencio, su fin.
function spokenEnd(sentence: NarrationSentence, pauseRule: PauseRule): number {
  if (pauseRule === 'carried') return sentence.endSeconds

  return cappedEnd(sentence)
}

// Dónde termina el tramo si la frase es la última: su fin útil o, cargando el
// silencio, su fin.
function fitEnd(
  sentence: NarrationSentence,
  audioEnd: number,
  pauseRule: PauseRule,
): number {
  if (pauseRule === 'carried') return sentence.endSeconds

  return usableEnd(sentence, audioEnd)
}

// La apertura que carga el silencio (R-2f-4, ronda 1) no carga más de
// AVATAR_OPENING_MAX_PAUSE_SECONDS después de la última palabra de una frase:
// una frase con más no entra en ella. Sin el fin de su última palabra (un
// words.json editado a mano) no se sabe, y entra.
function exceedsOpeningPause(sentence: NarrationSentence): boolean {
  const pause = sentence.endSeconds - sentence.lastWordEndSeconds
  return pause > AVATAR_OPENING_MAX_PAUSE_SECONDS + TIME_EPSILON
}

// La frase termina antes de su fin nominal: hay más silencio del que el avatar
// carga, y la siguiente no se puede sumar a la misma aparición. Cargando el
// silencio, ninguna cierra.
function closesAppearance(
  sentence: NarrationSentence,
  audioEnd: number,
  pauseRule: PauseRule,
): boolean {
  return (
    fitEnd(sentence, audioEnd, pauseRule) < sentence.endSeconds - TIME_EPSILON
  )
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
// El objetivo y el máximo son los de `target` (el máximo de siempre es
// AVATAR_MAX_APPEARANCE_SECONDS). Con `pauseRule: 'carried'` (la apertura de
// R-2f-4) el ajuste es el mismo pero sin el tope de silencio: cada frase
// cuenta hasta su fin para el mínimo, el tramo y el acercamiento, y ninguna
// cierra la aparición; una frase con más de AVATAR_OPENING_MAX_PAUSE_SECONDS
// de silencio después de su última palabra no entra (si es la primera, no
// hay aparición; si no, el ajuste para antes de ella). El máximo se sigue
// midiendo con lo que le deja el corte.
function fitFrom(
  sentences: readonly NarrationSentence[],
  from: number,
  target: AppearanceTarget,
  pauseRule: PauseRule = 'capped',
): AvatarSpan | null {
  const carried = pauseRule === 'carried'
  if (carried && exceedsOpeningPause(sentences[from])) return null

  // Las frases llegan hasta el fin del audio (precondición).
  const audioEnd = sentences[sentences.length - 1].endSeconds
  const startSeconds = sentences[from].startSeconds
  let to = from
  let endSeconds = fitEnd(sentences[from], audioEnd, pauseRule)
  let length = endSeconds - startSeconds
  let spokenLength = spokenEnd(sentences[from], pauseRule) - startSeconds
  while (to + 1 < sentences.length) {
    if (closesAppearance(sentences[to], audioEnd, pauseRule)) break
    if (carried && exceedsOpeningPause(sentences[to + 1])) break

    const nextEnd = fitEnd(sentences[to + 1], audioEnd, pauseRule)
    const nextLength = nextEnd - startSeconds
    const nextAfterCut = lengthAfterCut(startSeconds, nextEnd, audioEnd)
    if (nextAfterCut > target.maximumSeconds + TIME_EPSILON) break

    const belowMinimum =
      spokenLength < AVATAR_MIN_APPEARANCE_SECONDS - TIME_EPSILON
    const closer =
      Math.abs(nextLength - target.seconds) <
      Math.abs(length - target.seconds) - TIME_EPSILON
    if (!belowMinimum && !closer) break

    to++
    endSeconds = nextEnd
    length = nextLength
    spokenLength = spokenEnd(sentences[to], pauseRule) - startSeconds
  }

  if (spokenLength < AVATAR_MIN_APPEARANCE_SECONDS - TIME_EPSILON) return null

  const afterCut = lengthAfterCut(startSeconds, endSeconds, audioEnd)
  if (afterCut > target.maximumSeconds + TIME_EPSILON) return null

  return { startSeconds, endSeconds, sentenceFrom: from, sentenceTo: to }
}

// La aparición más cercana a `targetStart` que cabe: para cada frase que
// arranca en `earliest` o después —y, con `startsBefore`, antes de ese
// segundo— se prueba `fitFrom`, y gana la que cabe con el inicio más cercano,
// antes o después de `targetStart` (con empate, la primera). undefined si
// ninguna cabe.
function nearestFittingSpan(
  sentences: readonly NarrationSentence[],
  earliest: number,
  targetStart: number,
  target: AppearanceTarget,
  startsBefore = Number.POSITIVE_INFINITY,
): AvatarSpan | undefined {
  let best: AvatarSpan | undefined
  for (let index = 0; index < sentences.length; index++) {
    const start = sentences[index].startSeconds
    if (start < earliest - TIME_EPSILON) continue

    // Una de las primeras de «3 veces en 2 minutos» arranca adentro de su
    // ventana: justo en el fin (con TIME_EPSILON) ya no.
    if (start > startsBefore - TIME_EPSILON) continue

    const span = fitFrom(sentences, index, target)
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

// Con qué máximos se prueba una aparición, en orden: el suyo y, si es menor
// que el de siempre (las tres primeras de «3 veces en 2 minutos»), el de
// siempre. Una de las primeras que con el tope no cabe desde ninguna frase de
// su zona (frases muy largas) no se pierde si cabe con 60. Con el tope de
// 35 s, en las narraciones simuladas tipo TTS (frases de 2 a 12 s o de 2 a
// 15 s) no hizo falta nunca; en un corpus con frases de hasta 65 s sumó una
// aparición en la ventana en el 5,6 % de los casos y nunca restó (ronda 2).
function targetsToTry(target: AppearanceTarget): AppearanceTarget[] {
  if (target.maximumSeconds >= AVATAR_MAX_APPEARANCE_SECONDS) return [target]

  return [target, { ...target, maximumSeconds: AVATAR_MAX_APPEARANCE_SECONDS }]
}

// La apertura (R-2f-4, §22.3): el ajuste desde la frase 0 y, si con el tope
// de silencio no cabe, otra vez cargando el silencio (hasta
// AVATAR_OPENING_MAX_PAUSE_SECONDS por frase); con «3 veces en 2 minutos»,
// primero sin pasar AVATAR_EARLY_MAX_SECONDS y después con el máximo de
// siempre (targetsToTry): la apertura manda sobre ese tope. null si tampoco
// así llega al mínimo sin pasar el máximo ni cargar más silencio.
function openingSpan(
  sentences: readonly NarrationSentence[],
  target: AppearanceTarget,
): AvatarSpan | null {
  for (const candidate of targetsToTry(target)) {
    const opening =
      fitFrom(sentences, 0, candidate) ??
      fitFrom(sentences, 0, candidate, 'carried')
    if (opening) return opening
  }

  return null
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

// El reparto parejo (diseño §5): `zone.count` apariciones sobre la zona libre,
// que va desde el fin de la anterior (`previousEnd`) más el hueco mínimo —o
// desde 0, sin ninguna antes— hasta `zone.endSeconds`. El ancla k es el
// centro del tramo k de `count` tramos iguales, y cada aparición arranca en
// la frase más cercana a su ancla desde la que cabe (con el máximo de la zona
// y, si así no cabe ninguna, con el de siempre: targetsToTry). La que no cabe
// se saltea: quien llama la cuenta en `dropped`.
function spreadAppearances(
  sentences: readonly NarrationSentence[],
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
    // Con el máximo de la zona y, si así no cabe ninguna, con el de siempre.
    let span: AvatarSpan | undefined
    for (const target of targetsToTry(zone.target))
      span ??= nearestFittingSpan(
        sentences,
        earliest,
        anchor - target.seconds / 2,
        target,
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

  const audioEnd = sentences[sentences.length - 1].endSeconds
  const spans: AvatarSpan[] = []
  // Con «empieza con el avatar», la primera es `fit` desde la frase 0
  // (cargando el silencio si con el tope no cabe, R-2f-4). Si ni así cabe, las
  // demás se planifican igual, como sin apertura: la causa es un audio más
  // corto que el mínimo, una apertura que pasa el máximo o más silencio del
  // que carga, y esa frase no se lleva el plan entero. Apagada «3 veces en 2
  // minutos», la apertura cuenta como una de las pedidas haya cabido o no (la
  // que no cupo va a `dropped`).
  const opening = options.startWithAvatar
    ? openingSpan(sentences, earlyTarget)
    : null
  if (opening) spans.push(opening)
  const openingCount = options.startWithAvatar ? 1 : 0

  // Las demás, parejas sobre la zona libre: desde el fin de la apertura más el
  // hueco mínimo (o desde 0 sin apertura) hasta el fin del audio.
  if (!threeEarly) {
    spans.push(
      ...spreadAppearances(sentences, opening?.endSeconds, {
        count: appearances - openingCount,
        endSeconds: audioEnd,
        target,
      }),
    )
    return { spans, dropped: appearances - spans.length }
  }

  // «3 veces en 2 minutos»: las que faltan para las tres primeras, parejas
  // sobre la zona libre hasta el fin de la ventana (los primeros dos minutos,
  // o el video si es más corto) y arrancando antes de él. Una apertura que no
  // cupo no ocupa lugar: la ventana prueba las tres (ronda 1, D5).
  const windowEnd = Math.min(AVATAR_EARLY_WINDOW_SECONDS, audioEnd)
  spans.push(
    ...spreadAppearances(sentences, opening?.endSeconds, {
      count: opening ? AVATAR_EARLY_APPEARANCES - 1 : AVATAR_EARLY_APPEARANCES,
      endSeconds: windowEnd,
      target: earlyTarget,
      startsBefore: windowEnd,
    }),
  )
  // Las demás, con los segundos elegidos, parejas en la zona que queda
  // después de la última de las primeras (la tercera, si entró).
  spans.push(
    ...spreadAppearances(sentences, spans.at(-1)?.endSeconds, {
      count: appearances - AVATAR_EARLY_APPEARANCES,
      endSeconds: audioEnd,
      target,
    }),
  )

  return { spans, dropped: appearances - spans.length }
}
