// Planificador de apariciones del avatar (ADR-0057, entrega 2, tarea 3;
// diseño §5): ajuste a frases enteras (la siguiente entra solo si acerca al
// objetivo, nunca menos del mínimo —5 s desde la entrega 2d, antes 7— ni más
// del máximo), la
// primera aparición en 0 con «empieza con el avatar» y nunca antes de 3 s sin
// ella, reparto parejo con 10 s de imágenes entre apariciones, lo que no
// entra se cuenta en `dropped` y no falla, y el mismo plan para las mismas
// frases. El foco 1 del plan: una narración sin puntuación con una sola pausa
// larga da una aparición válida o un `dropped` honesto, nunca un avatar
// corto. Entrega 2b (decisiones del dueño del 2026-10-11): cada aparición del
// reparto arranca en la frase más cercana a su ancla desde la que cabe (la
// que no cabe se saltea, antes o después del ancla) y ninguna carga más de
// 2 s de silencio después de la última palabra de una frase (el tope, al
// cuadro, cierra la aparición; el silencio inicial de la primera frase no se
// recorta; el hueco y la zona libre se miden desde el fin útil). Rulings del
// mismo día: el tope nunca deja una cola de menos de 3 s antes del fin del
// audio (esa frase se mide hasta su fin para el máximo y hasta el recortado
// para el mínimo). Puro: importa el código real, sin disco ni red.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ANIMATION_FPS,
  frameBoundary,
} from '../../pipeline/animation/timing.ts'
import { planAvatarSpans } from '../../pipeline/avatar/planner.ts'
import { detectSentences } from '../../pipeline/narration/sentences.ts'
import { MIN_SECONDS_PER_SCENE } from '../../pipeline/stages/scene-cuts/by-seconds.ts'
import {
  AVATAR_DEFAULT_APPEARANCE_SECONDS,
  AVATAR_DEFAULT_APPEARANCES,
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MAX_APPEARANCES,
  AVATAR_MAX_PAUSE_SECONDS,
  AVATAR_MIN_APPEARANCE_SECONDS,
  AVATAR_MIN_APPEARANCES,
  AVATAR_MIN_GAP_SECONDS,
} from '../../pipeline/types/avatar.ts'

// Frases contiguas desde 0 con estos largos (en segundos). Sin `pauses`, la
// última palabra de cada frase termina con ella; `pauses` da, por índice, los
// segundos de silencio al final de una frase: `{ 1: 4 }` es la frase 1 con su
// última palabra 4 s antes de su fin (`lastWordEndSeconds = endSeconds − 4`).
function sentencesOf(lengths, { pauses = {} } = {}) {
  let start = 0
  return lengths.map((length, index) => {
    const endSeconds = start + length
    const sentence = {
      index,
      text: `frase ${index}`,
      startSeconds: start,
      endSeconds,
      lastWordEndSeconds: endSeconds - (pauses[index] ?? 0),
      wordFrom: index,
      wordTo: index,
    }
    start = endSeconds
    return sentence
  })
}

// Frases entre estas fronteras (en segundos), al cuadro de 25 fps como las da
// detectSentences; `pauses`, como en sentencesOf.
function sentencesAt(boundaries, { pauses = {} } = {}) {
  return boundaries.slice(1).map((endSeconds, index) => ({
    index,
    text: `frase ${index}`,
    startSeconds: boundaries[index],
    endSeconds,
    lastWordEndSeconds: endSeconds - (pauses[index] ?? 0),
    wordFrom: index,
    wordTo: index,
  }))
}

const repeat = (length, count) => Array.from({ length: count }, () => length)

// Una aparición de 10 s que abre el video, salvo que se pida otra cosa.
const planOf = (sentences, options = {}) =>
  planAvatarSpans(sentences, {
    appearances: 1,
    secondsPerAppearance: 10,
    startWithAvatar: true,
    ...options,
  })

const plan = (lengths, options = {}) => planOf(sentencesOf(lengths), options)

const spansOf = (result) =>
  result.spans.map(({ startSeconds, endSeconds, sentenceFrom, sentenceTo }) => [
    startSeconds,
    endSeconds,
    sentenceFrom,
    sentenceTo,
  ])

// Palabras de 0,45 s cada 0,5 s desde `from` (`prefix0`, `prefix1`, …).
function halfSecondWords(prefix, count, from) {
  return Array.from({ length: count }, (_, index) => ({
    word: `${prefix}${index}`,
    start: from + index * 0.5,
    end: from + index * 0.5 + 0.45,
  }))
}

test('fit: suma frases mientras el largo se acerca al objetivo y, en empate, no suma', () => {
  assert.deepEqual(spansOf(plan([6, 3, 3, 3])), [[0, 9, 0, 1]])
  assert.deepEqual(spansOf(plan([4, 4, 4, 4])), [[0, 8, 0, 1]])
  assert.deepEqual(spansOf(plan(repeat(5, 5), { secondsPerAppearance: 12 })), [
    [0, 10, 0, 1],
  ])
  assert.deepEqual(spansOf(plan(repeat(5, 5), { secondsPerAppearance: 14 })), [
    [0, 15, 0, 2],
  ])
  // Con fronteras al cuadro, 11,2 − 3,2 da 7,999… en coma flotante: 8 y 12 s
  // siguen empatados contra 10 y no suma.
  assert.deepEqual(
    spansOf(
      planAvatarSpans(sentencesAt([0, 3.2, 11.2, 15.2, 18.2]), {
        appearances: 1,
        secondsPerAppearance: 10,
        startWithAvatar: false,
      }),
    ),
    [[3.2, 11.2, 1, 1]],
  )
})

// Los dos tests que siguen se escriben contra las constantes: el mínimo (5 s
// desde la entrega 2d; antes, 7) y el máximo se cambian en un solo lugar.
test('fit: nunca menos del mínimo (sigue sumando) ni más del máximo', () => {
  // Con el objetivo en el mínimo y frases de 2 s, suma hasta alcanzarlo y no más.
  const [shortest] = plan(repeat(2, 40), {
    secondsPerAppearance: AVATAR_MIN_APPEARANCE_SECONDS,
  }).spans
  const shortestLength = shortest.endSeconds - shortest.startSeconds
  assert.ok(
    shortestLength >= AVATAR_MIN_APPEARANCE_SECONDS,
    String(shortestLength),
  )
  assert.ok(
    shortestLength - 2 < AVATAR_MIN_APPEARANCE_SECONDS,
    String(shortestLength),
  )
  // Con el objetivo en el máximo, suma frases mientras no lo pase.
  const sentenceSeconds = AVATAR_MAX_APPEARANCE_SECONDS / 4 + 1
  const [longest] = plan(repeat(sentenceSeconds, 8), {
    secondsPerAppearance: AVATAR_MAX_APPEARANCE_SECONDS,
  }).spans
  const longestLength = longest.endSeconds - longest.startSeconds
  assert.ok(
    longestLength <= AVATAR_MAX_APPEARANCE_SECONDS,
    String(longestLength),
  )
  assert.ok(
    longestLength + sentenceSeconds > AVATAR_MAX_APPEARANCE_SECONDS,
    String(longestLength),
  )
})

test('si el audio se acaba antes del mínimo, esa aparición no cabe: se cuenta en dropped y no falla', () => {
  // Un audio de un segundo menos que el mínimo, en dos frases.
  const short = [3, AVATAR_MIN_APPEARANCE_SECONDS - 4]
  assert.deepEqual(plan(short), { spans: [], dropped: 1 })
  assert.deepEqual(plan(short, { startWithAvatar: false }), {
    spans: [],
    dropped: 1,
  })
  assert.deepEqual(
    planAvatarSpans([], {
      appearances: 3,
      secondsPerAppearance: 10,
      startWithAvatar: true,
    }),
    { spans: [], dropped: 3 },
  )
})

// Pregunta 4 del dueño (entrega 2d, 2026-10-11: «5 o 10 segundos, máximo 1
// minuto»): el mínimo por aparición baja de 7 a 5 s; el máximo, el hueco y la
// cantidad no cambian.
test('mínimo de 5 s (entrega 2d): una aparición de 5 s entra, una frase de 5 s ya no necesita la siguiente, 4,96 s de audio no alcanzan y un objetivo menor se acota a 5', () => {
  assert.equal(AVATAR_MIN_APPEARANCE_SECONDS, 5)
  // Frases de 1 s con el objetivo en 5: la aparición mide justo 5 s.
  assert.deepEqual(spansOf(plan(repeat(1, 30), { secondsPerAppearance: 5 })), [
    [0, 5, 0, 4],
  ])
  // Una frase de 5 s alcanza sola; con el mínimo de 7 sumaba la siguiente
  // (0–10).
  assert.deepEqual(spansOf(plan([5, 5, 20], { secondsPerAppearance: 5 })), [
    [0, 5, 0, 0],
  ])
  // 4,96 s de audio no llegan al mínimo: esa aparición no cabe.
  assert.deepEqual(plan([2, 2.96], { secondsPerAppearance: 5 }), {
    spans: [],
    dropped: 1,
  })
  // Un objetivo por debajo del mínimo (un project.json editado) se acota a 5.
  assert.deepEqual(spansOf(plan(repeat(1, 30), { secondsPerAppearance: 3 })), [
    [0, 5, 0, 4],
  ])
  // El máximo, el hueco y la cantidad, como antes.
  assert.deepEqual(
    [
      AVATAR_MAX_APPEARANCE_SECONDS,
      AVATAR_MIN_GAP_SECONDS,
      AVATAR_MIN_APPEARANCES,
      AVATAR_MAX_APPEARANCES,
    ],
    [60, 10, 1, 10],
  )
})

test('con «empieza con el avatar» la primera aparición abre el video', () => {
  const result = plan(repeat(5, 12), { appearances: 3 })
  assert.deepEqual(result.spans[0], {
    startSeconds: 0,
    endSeconds: 10,
    sentenceFrom: 0,
    sentenceTo: 1,
  })
  assert.deepEqual(spansOf(result), [
    [0, 10, 0, 1],
    [25, 35, 5, 6],
    [45, 55, 9, 10],
  ])
  assert.equal(result.dropped, 0)
})

test('sin «empieza con el avatar» la primera nunca arranca antes de 3 s: el corte la pegaría al inicio', () => {
  assert.deepEqual(spansOf(plan([1, 10, 10], { startWithAvatar: false })), [
    [11, 21, 2, 2],
  ])
  // El mismo audio con apertura sí arranca en 0.
  assert.deepEqual(spansOf(plan([1, 10, 10])), [[0, 11, 0, 1]])
  const spread = plan(repeat(5, 12), { appearances: 3, startWithAvatar: false })
  assert.deepEqual(spansOf(spread), [
    [5, 15, 1, 2],
    [25, 35, 5, 6],
    [45, 55, 9, 10],
  ])
  for (const span of spread.spans)
    assert.ok(span.startSeconds >= MIN_SECONDS_PER_SCENE)
})

test('las demás apariciones se reparten parejo sobre la zona libre', () => {
  assert.deepEqual(spansOf(plan(repeat(5, 24), { appearances: 4 })), [
    [0, 10, 0, 1],
    [30, 40, 6, 7],
    [65, 75, 13, 14],
    [100, 110, 20, 21],
  ])
  // Dos frases a la misma distancia del ancla (20 y 25 s, con 22,5 de
  // objetivo): gana la primera.
  assert.deepEqual(spansOf(plan(repeat(5, 7), { appearances: 2 })), [
    [0, 10, 0, 1],
    [20, 30, 4, 5],
  ])
})

test('entre dos apariciones quedan al menos 10 s de imágenes; la que no entra se cuenta', () => {
  const result = plan(repeat(5, 8), { appearances: 3 })
  assert.deepEqual(spansOf(result), [
    [0, 10, 0, 1],
    [20, 30, 4, 5],
  ])
  assert.equal(result.dropped, 1)
  for (let index = 1; index < result.spans.length; index++)
    assert.ok(
      result.spans[index].startSeconds - result.spans[index - 1].endSeconds >=
        AVATAR_MIN_GAP_SECONDS,
    )
})

test('muchas apariciones en un audio corto: entran las que caben y el resto va a dropped', () => {
  const result = plan(repeat(5, 12), { appearances: 10 })
  assert.deepEqual(spansOf(result), [
    [0, 10, 0, 1],
    [20, 30, 4, 5],
    [40, 50, 8, 9],
  ])
  assert.equal(result.dropped, 7)
})

// Una frase puede pasar los 15 s: una sola palabra con un silencio largo
// detrás, o la pausa mayor justo antes de una palabra recortada al fin del
// audio (ver check-narration-sentences.mjs). Desde la entrega 2b una
// aparición no carga más de 2 s de silencio después de la última palabra de
// una frase, así que una palabra con un silencio largo detrás ya no es una
// aparición: mide un par de segundos útiles y se saltea (antes era una
// aparición de 19,6 s casi muda que HeyGen cobraba). Una frase de más del
// máximo (medida hasta su fin útil) no entra en ninguna aparición, ni siquiera
// en la apertura, y las demás se planifican igual.
test('frases de más de 15 s: una palabra con un silencio largo detrás ya no es una aparición; una frase de más del máximo no entra en ninguna y no tapa a las demás', () => {
  // «b0» sola y 19,15 s de silencio detrás: frases 0–8,4, 8,4–28 y 28–38.
  const sentences = detectSentences(
    [
      ...halfSecondWords('a', 16, 0),
      { word: 'b0', start: 8.4, end: 8.85 },
      ...halfSecondWords('c', 20, 28),
    ],
    38,
  )
  assert.deepEqual(
    sentences.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds]),
    [
      [0, 8.4],
      [8.4, 28],
      [28, 38],
    ],
  )
  // Su fin útil es 8,85 + 2 s al cuadro (10,84 s): mide 2,44 s y no llega al
  // mínimo. La frase 0 arranca antes de MIN_SECONDS_PER_SCENE: la aparición
  // es la frase 2.
  assert.equal(sentences[1].lastWordEndSeconds, 8.85)
  assert.equal(
    frameBoundary(8.85 + AVATAR_MAX_PAUSE_SECONDS) / ANIMATION_FPS,
    10.84,
  )
  const afterSilence = planAvatarSpans(sentences, {
    appearances: 1,
    secondsPerAppearance: 10,
    startWithAvatar: false,
  })
  assert.deepEqual(spansOf(afterSilence), [[28, 38, 2, 2]])
  assert.equal(afterSilence.dropped, 0)
  // Una frase de más del máximo en el medio: la apertura frena antes y la
  // aparición siguiente la saltea.
  const overMaximum = AVATAR_MAX_APPEARANCE_SECONDS + 5
  assert.deepEqual(
    spansOf(
      plan([5, 5, overMaximum, 5, 5], {
        appearances: 2,
        secondsPerAppearance: 14,
      }),
    ),
    [
      [0, 10, 0, 1],
      [overMaximum + 10, overMaximum + 20, 3, 4],
    ],
  )
  // La primera frase pasa el máximo: la apertura no cabe y se cuenta, y la
  // otra aparición se reparte como si no hubiera apertura (no se pierden las
  // dos).
  const longOpening = plan([overMaximum, ...repeat(5, 10)], { appearances: 2 })
  assert.deepEqual(spansOf(longOpening), [
    [overMaximum, overMaximum + 10, 1, 2],
  ])
  assert.equal(longOpening.dropped, 1)
})

test('determinista y puro: las mismas frases y opciones dan el mismo plan, y las frases no se tocan', () => {
  const sentences = sentencesOf(repeat(5, 24))
  const before = structuredClone(sentences)
  const options = {
    appearances: 4,
    secondsPerAppearance: 10,
    startWithAvatar: false,
  }
  const first = planAvatarSpans(sentences, options)
  assert.deepEqual(planAvatarSpans(sentences, options), first)
  assert.deepEqual(sentences, before)
})

// Crear valida las opciones; esto cubre un project.json editado a mano.
test('opciones fuera de rango se acotan a los límites de Crear y lo que no es un número toma el valor por defecto', () => {
  const sentences = sentencesOf(repeat(5, 24))
  const appearancesCounted = (appearances) => {
    const { spans, dropped } = planAvatarSpans(sentences, {
      appearances,
      secondsPerAppearance: 10,
      startWithAvatar: false,
    })
    return spans.length + dropped
  }
  assert.equal(appearancesCounted(0), AVATAR_MIN_APPEARANCES)
  assert.equal(appearancesCounted(99), AVATAR_MAX_APPEARANCES)
  assert.equal(appearancesCounted(2.4), 2)
  assert.equal(appearancesCounted(Number.NaN), AVATAR_DEFAULT_APPEARANCES)
  const spansWithTarget = (secondsPerAppearance) =>
    spansOf(
      planAvatarSpans(sentences, {
        appearances: 1,
        secondsPerAppearance,
        startWithAvatar: false,
      }),
    )
  assert.deepEqual(
    spansWithTarget(999),
    spansWithTarget(AVATAR_MAX_APPEARANCE_SECONDS),
  )
  assert.deepEqual(
    spansWithTarget(Number.NaN),
    spansWithTarget(AVATAR_DEFAULT_APPEARANCE_SECONDS),
  )
})

test('foco 1: sin puntuación y con una sola pausa larga da una aparición válida y cuenta las que no entran', () => {
  // Frases 0–8, 8–16,2 y 16,2–31,2 (las fija también
  // check-narration-sentences.mjs): si cambian, el plan de abajo no prueba lo
  // que dice.
  const sentences = detectSentences(
    [...halfSecondWords('a', 30, 0), ...halfSecondWords('b', 30, 16.2)],
    31.2,
  )
  assert.deepEqual(
    sentences.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds]),
    [
      [0, 8],
      [8, 16.2],
      [16.2, 31.2],
    ],
  )
  const opening = planAvatarSpans(sentences, {
    appearances: 3,
    secondsPerAppearance: 10,
    startWithAvatar: true,
  })
  assert.deepEqual(spansOf(opening), [[0, 8, 0, 0]])
  assert.equal(opening.dropped, 2)
  const later = planAvatarSpans(sentences, {
    appearances: 3,
    secondsPerAppearance: 10,
    startWithAvatar: false,
  })
  assert.deepEqual(spansOf(later), [[8, 16.2, 1, 1]])
  assert.equal(later.dropped, 2)
  for (const span of [...opening.spans, ...later.spans])
    assert.ok(
      span.endSeconds - span.startSeconds >= AVATAR_MIN_APPEARANCE_SECONDS,
    )
})

test('foco 1, audio corto: con una pausa larga a los 4 s, un avatar de 9 s si abre el video; si no, dropped, nunca uno de 4 s', () => {
  // 8 palabras, 1,05 s de silencio y otras 8: frases 0–5 y 5–9.
  const sentences = detectSentences(
    [...halfSecondWords('a', 8, 0), ...halfSecondWords('b', 8, 5)],
    9,
  )
  assert.deepEqual(
    sentences.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds]),
    [
      [0, 5],
      [5, 9],
    ],
  )
  assert.deepEqual(
    planAvatarSpans(sentences, {
      appearances: 1,
      secondsPerAppearance: 10,
      startWithAvatar: false,
    }),
    { spans: [], dropped: 1 },
  )
  assert.deepEqual(
    spansOf(
      planAvatarSpans(sentences, {
        appearances: 1,
        secondsPerAppearance: 10,
        startWithAvatar: true,
      }),
    ),
    [[0, 9, 0, 1]],
  )
})

// La tolerancia de coma flotante (TIME_EPSILON, 1e-6 s) en cada comparación de
// tiempo que cambia planes reales: con fronteras en la grilla de 25 fps, una
// resta o una suma deja ruido (8,04 − 3,04 = 4,999999999999999) y, sin la
// tolerancia, el plan cambia. Cada fixture usa un par de fronteras con ese
// ruido contra el valor de hoy de las constantes (5 s desde la entrega 2d,
// 60 s y 10 s): si una cambia, la precondición falla y hay que buscar otro
// par.
test('épsilon: el ruido de coma flotante entre fronteras al cuadro no cambia el plan', () => {
  const planAt = (boundaries, options) =>
    spansOf(planAvatarSpans(sentencesAt(boundaries), options))
  const minimum = AVATAR_MIN_APPEARANCE_SECONDS
  const maximum = AVATAR_MAX_APPEARANCE_SECONDS
  const one = (secondsPerAppearance) => ({
    appearances: 1,
    secondsPerAppearance,
    startWithAvatar: false,
  })

  // El hueco mínimo: la apertura termina en 7,24 y la siguiente puede
  // arrancar en 7,24 + 10 = 17,240000000000002, que es la frase de 17,24.
  assert.ok(7.24 + AVATAR_MIN_GAP_SECONDS > 17.24, 'precondición del hueco')
  const gap = planAvatarSpans(sentencesAt([0, 7.24, 17.24, 24.24]), {
    appearances: 2,
    secondsPerAppearance: minimum,
    startWithAvatar: true,
  })
  assert.deepEqual(spansOf(gap), [
    [0, 7.24, 0, 0],
    [17.24, 24.24, 2, 2],
  ])
  assert.equal(gap.dropped, 0)

  // El mínimo al final del ajuste: 8,04 − 3,04 es 5 con ruido por debajo.
  assert.ok(8.04 - 3.04 < minimum, 'precondición del mínimo')
  assert.deepEqual(planAt([0, 3.04, 8.04], one(minimum)), [[3.04, 8.04, 1, 1]])
  // El mínimo dentro del ajuste: con el mismo ruido no sigue sumando frases
  // (la última, de 4 s, se sumaría; sola no cabe, así que no compite).
  assert.deepEqual(planAt([0, 3.04, 8.04, 12.04], one(minimum)), [
    [3.04, 8.04, 1, 1],
  ])

  // El máximo al final del ajuste: 64,04 − 4,04 es 60 con ruido por encima.
  assert.ok(64.04 - 4.04 > maximum, 'precondición del máximo')
  assert.deepEqual(planAt([0, 4.04, 64.04], one(maximum)), [
    [4.04, 64.04, 1, 1],
  ])
  // El máximo dentro del ajuste: la frase que lo alcanza con ruido entra.
  assert.deepEqual(planAt([0, 4.04, 34.04, 64.04], one(maximum)), [
    [4.04, 64.04, 1, 2],
  ])
})

// Diseño §5, decisión del dueño del 2026-10-11 (entrega 2b): una frase desde
// la que la aparición no cabe (pasa el máximo, o el audio se acaba antes del
// mínimo) no descarta la aparición; se saltea y la aparición se arma desde la
// frase más cercana a su ancla desde la que sí cabe. Solo si ninguna sirve,
// va a `dropped`. Antes de la 2b la regla era literal (la más cercana, y si no
// cabía, se descartaba): el primer caso daba [[83, 93, 5, 6]] con 2
// descartadas.
test('una frase de más del máximo que es la más cercana al ancla se saltea y la aparición se arma desde la frase más cercana desde la que cabe', () => {
  // 3 s, una frase de 65 s y diez de 5 s (118 s). La apertura no cabe (3 s
  // no llegan al mínimo y con la frase de 65 s pasa el máximo) y se cuenta. La
  // primera del reparto busca arrancar a los 24,5 s: la frase más cercana es
  // la de 65 s, que no cabe, y arranca en la de 68 s; la segunda, desde
  // 78 + 10 s, en la de 88.
  const result = plan([3, 65, ...repeat(5, 10)], { appearances: 3 })
  assert.deepEqual(spansOf(result), [
    [68, 78, 2, 3],
    [88, 98, 6, 7],
  ])
  assert.equal(result.dropped, 1)
  // La más cercana desde la que cabe puede quedar ANTES del ancla: con
  // 39,5 s de inicio ideal, la frase de 65 s (arranca a los 14) es la más
  // cercana y no cabe; gana la que arranca a los 4 s (a 35,5 s del inicio
  // ideal) y no la de los 79 s (a 39,5), la primera que cabe después de la
  // más cercana.
  assert.deepEqual(spansOf(plan([4, 10, 65, 10], { startWithAvatar: false })), [
    [4, 14, 1, 1],
  ])
})

// Tope de silencio (entrega 2b, decisión del dueño del 2026-10-11): una
// aparición no carga más de AVATAR_MAX_PAUSE_SECONDS (2 s) de silencio después
// de la última palabra de una frase. La frase con más silencio termina en su
// última palabra más el tope, al cuadro, y CIERRA la aparición: la siguiente
// no se suma aunque acerque al objetivo. El silencio que queda afuera va a la
// escena de imagen siguiente.
test('tope de silencio: la aparición termina 2 s después de la última palabra y la frase siguiente no entra; con el silencio justo en el tope, nada cambia', () => {
  // La frase 1 termina a los 10 s y su última palabra a los 7: fin útil 9 s,
  // y la frase 2 no entra aunque 9 s queden lejos de los 20 del objetivo.
  assert.equal(frameBoundary(7 + AVATAR_MAX_PAUSE_SECONDS) / ANIMATION_FPS, 9)
  const capped = planOf(sentencesOf([5, 5, 5, 5], { pauses: { 1: 3 } }), {
    secondsPerAppearance: 20,
  })
  assert.deepEqual(spansOf(capped), [[0, 9, 0, 1]])
  // Justo en el tope (2 s de silencio): la frase 1 termina en 10 y la 2 entra.
  const atCap = planOf(
    sentencesOf([5, 5, 5, 5], { pauses: { 1: AVATAR_MAX_PAUSE_SECONDS } }),
    { secondsPerAppearance: 15 },
  )
  assert.deepEqual(spansOf(atCap), [[0, 15, 0, 2]])
  // Un cuadro más de silencio (2,04 s) ya recorta y cierra la aparición.
  const oneFrameOver = planOf(
    sentencesOf([5, 5, 5, 5], { pauses: { 1: 2.04 } }),
    { secondsPerAppearance: 15 },
  )
  assert.deepEqual(spansOf(oneFrameOver), [[0, 9.96, 0, 1]])
  // Justo en el tope con el fin del audio fuera de la grilla (25,01 s): la
  // frase tampoco se recorta (llevada al cuadro terminaría a los 25 s, y esa
  // cola corta la haría medir igual hasta su fin).
  const offGridAtCap = planOf(
    sentencesAt([0, 15, 25.01], { pauses: { 1: AVATAR_MAX_PAUSE_SECONDS } }),
    { startWithAvatar: false },
  )
  assert.deepEqual(spansOf(offGridAtCap), [[15, 25.01, 1, 1]])
})

// El tope nunca deja una cola corta (rulings del 2026-10-11, diseño §5): si el
// fin recortado de una frase queda a menos de MIN_SECONDS_PER_SCENE del fin
// del audio, el corte absorbería esa cola en el avatar (pinnedTimeline) y la
// aparición podría pasar el máximo. Esa frase se mide hasta su fin nominal
// para el máximo (y el tramo termina ahí) y hasta el recortado para el mínimo.
test('el tope nunca deja una cola de menos de 3 s antes del fin del audio: el máximo se mide hasta el fin de la frase y el mínimo hasta el recortado', () => {
  // Objetivo 60 s y la última frase 55–61 con su última palabra a los 57,95:
  // recortada (59,96 s) cabría, pero el corte le pegaría la cola de 1,04 s y
  // la aparición duraría 61 s; medida hasta su fin no cabe. Queda 0–55 y la
  // escena final de imagen 55–61, como antes de la 2b.
  const sixty = sentencesOf([...repeat(5, 11), 6])
  sixty[11].lastWordEndSeconds = 57.95
  assert.deepEqual(spansOf(planOf(sixty, { secondsPerAppearance: 60 })), [
    [0, 55, 0, 10],
  ])
  // La última frase 5–12 con su última palabra a los 7,95: recortada (9,96 s)
  // dejaría 2,04 s; la aparición llega al fin del audio.
  const twelve = sentencesOf([5, 7])
  twelve[1].lastWordEndSeconds = 7.95
  assert.deepEqual(spansOf(planOf(twelve)), [[0, 12, 0, 1]])
  // Justo 3 s antes del fin el corte deja la cola como imagen: sí se recorta.
  const exact = sentencesOf([5, 10])
  exact[1].lastWordEndSeconds = 10
  assert.deepEqual(spansOf(planOf(exact)), [[0, 12, 0, 1]])
  // También con el ruido de las fronteras al cuadro: 10,04 − 7,04 da
  // 2,999999999999999 y cuenta como 3.
  assert.ok(10.04 - 7.04 < MIN_SECONDS_PER_SCENE, 'precondición del ruido')
  const noisy = sentencesAt([0, 4, 10.04])
  noisy[1].lastWordEndSeconds = 5.04
  assert.deepEqual(spansOf(planOf(noisy)), [[0, 7.04, 0, 1]])
  // No es la última frase: la 1 (5–15, última palabra a los 11,5) recortada
  // terminaría a los 13,52, a 2,48 s del fin porque la sigue una frase de 1 s.
  // Se mide hasta 15 y ya no cierra la aparición: con objetivo 15 llega a 15
  // (no a 13,52) y con objetivo 16, la suma.
  const beforeShortLast = sentencesOf([5, 10, 1], { pauses: { 1: 3.5 } })
  assert.deepEqual(
    spansOf(planOf(beforeShortLast, { secondsPerAppearance: 15 })),
    [[0, 15, 0, 1]],
  )
  assert.deepEqual(
    spansOf(planOf(beforeShortLast, { secondsPerAppearance: 16 })),
    [[0, 16, 0, 2]],
  )
  // El mínimo, en cambio, se mide hasta el fin recortado (ruling del
  // 2026-10-11, ronda 2 de la 2b): una última frase casi muda al fin del audio
  // no se vuelve aparición. Contra la constante; con el mínimo de 5 s, la
  // última (3–10 s, última palabra a los 5,5) recortada mide 4,5 s y no cabe,
  // aunque hasta su fin mediría 7.
  const nearlyMute = sentencesOf([3, AVATAR_MIN_APPEARANCE_SECONDS + 2], {
    pauses: { 1: 4.5 },
  })
  assert.deepEqual(planOf(nearlyMute, { startWithAvatar: false }), {
    spans: [],
    dropped: 1,
  })
  // La que llega al mínimo con su fin recortado entra, y el tramo termina en
  // su fin nominal (al corte no le queda cola que pegarle): la última (3–13 s,
  // última palabra a los 9) recortada mide 8 s; el tramo, 3–13.
  const reachesMinimum = sentencesOf([3, 10], { pauses: { 1: 4 } })
  assert.deepEqual(
    spansOf(planOf(reachesMinimum, { startWithAvatar: false })),
    [[3, 13, 1, 1]],
  )
  // El mínimo también decide si sigue sumando, contra la constante. Con el
  // mínimo de 5 s: la frase 1 (3–8,52 s, última palabra a los 5,52, y la sigue
  // una frase de 1 s) recortada dice 4,52 s; aunque hasta su fin mida 5,52,
  // sigue debajo del mínimo y suma la última aunque no acerque al objetivo de
  // 5 s: 3–9,52.
  const minimumSeconds = AVATAR_MIN_APPEARANCE_SECONDS
  const keepsAdding = sentencesAt([
    0,
    3,
    minimumSeconds + 3.52,
    minimumSeconds + 4.52,
  ])
  keepsAdding[1].lastWordEndSeconds = minimumSeconds + 0.52
  assert.deepEqual(
    spansOf(
      planOf(keepsAdding, {
        startWithAvatar: false,
        secondsPerAppearance: minimumSeconds,
      }),
    ),
    [[3, minimumSeconds + 4.52, 1, 2]],
  )
  // Y el máximo se mide hasta el fin nominal: con el audio en 60 s (la última
  // frase 55–60, última palabra a los 56,95) la aparición entra entera, justo
  // en el máximo; con 61 s no entraba (arriba).
  const exactlySixty = sentencesOf([...repeat(5, 11), 5])
  exactlySixty[11].lastWordEndSeconds = 56.95
  assert.deepEqual(
    spansOf(planOf(exactlySixty, { secondsPerAppearance: 60 })),
    [[0, 60, 0, 11]],
  )
})

// El máximo por aparición es una regla del dueño («máx. 1 min») y se cumple
// siempre (ruling del 2026-10-11, ronda 3 de la 2b): si una aparición
// terminaría a menos de MIN_SECONDS_PER_SCENE del fin del audio, el corte le
// pega esa cola (pinnedTimeline), así que su máximo se mide hasta el fin del
// audio, haya o no tope de silencio en su última frase. El mínimo, como arriba.
test('el máximo se mide hasta el fin del audio cuando la aparición terminaría a menos de 3 s de él, también sin ninguna pausa', () => {
  // Once frases de 5 s, una de 4,6 y la final de 1,8, sin pausas (61,4 s).
  // Con objetivo 60 la aparición sumaba hasta los 59,6 y el corte le pegaba
  // la final: 61,4 s. Medida hasta el fin del audio, la de 4,6 no entra:
  // 0–55, y la imagen final 55–61,4.
  assert.deepEqual(
    spansOf(plan([...repeat(5, 11), 4.6, 1.8], { secondsPerAppearance: 60 })),
    [[0, 55, 0, 10]],
  )
  // Con la final de 3 s el corte la deja como imagen: la de 4,6 entra, 0–59,6.
  assert.deepEqual(
    spansOf(plan([...repeat(5, 11), 4.6, 3], { secondsPerAppearance: 60 })),
    [[0, 59.6, 0, 11]],
  )
  // También con el ruido de las fronteras al cuadro: 64,24 − 61,24 da
  // 2,999999999999993 y cuenta como 3, así que 3,24–61,24 (58 s) entra.
  assert.ok(64.24 - 61.24 < MIN_SECONDS_PER_SCENE, 'precondición del ruido')
  const noisyTail = sentencesAt([0, 3.24, 18.24, 33.24, 48.24, 61.24, 64.24])
  assert.deepEqual(
    spansOf(
      planOf(noisyTail, { startWithAvatar: false, secondsPerAppearance: 60 }),
    ),
    [[3.24, 61.24, 1, 4]],
  )
  // Si ni sacando frases la aparición queda en el máximo, no cabe: la apertura
  // de 59 s seguida de una final de 2 duraría 61 tras el corte.
  assert.deepEqual(plan([59, 2], { secondsPerAppearance: 60 }), {
    spans: [],
    dropped: 1,
  })
})

test('una frase cuya pausa pasa el tope igual es una aparición si llega al mínimo sola: termina en su fin útil y no suma la siguiente', () => {
  // Frases 0–5, 5–18 (su última palabra termina a los 13: fin útil 15) y dos
  // de 5 s. Sin el tope la aparición seguiría hasta los 23 s.
  const result = planOf(sentencesOf([5, 13, 5, 5], { pauses: { 1: 5 } }), {
    secondsPerAppearance: 20,
    startWithAvatar: false,
  })
  assert.deepEqual(spansOf(result), [[5, 15, 1, 1]])
  assert.equal(result.dropped, 0)
})

test('una frase casi muda (una palabra y 19 s de silencio) nunca es una aparición: el reparto arranca en otra frase', () => {
  // La frase 1 (5–25 s) es una palabra de 1 s y 19 s de silencio: su fin útil
  // es 8 s, mide 3 s útiles que no llegan al mínimo y cierra la aparición.
  const result = planOf(sentencesOf([5, 20, 5, 5], { pauses: { 1: 19 } }), {
    appearances: 3,
    startWithAvatar: false,
  })
  assert.ok(
    result.spans.every((span) => span.sentenceFrom !== 1),
    JSON.stringify(result.spans),
  )
  assert.deepEqual(spansOf(result), [[25, 35, 2, 3]])
  assert.equal(result.dropped, 2)
})

test('apertura casi muda: la apertura no cabe (fin útil a los 3 s), cuenta como una descartada y la otra se reparte desde la frase 1', () => {
  const result = planOf(sentencesOf([20, 5, 5, 5], { pauses: { 0: 19 } }), {
    appearances: 2,
  })
  assert.deepEqual(spansOf(result), [[20, 30, 1, 2]])
  assert.equal(result.dropped, 1)
})

// El mínimo se mide hasta el fin recortado también en la frase que el ajuste
// SUMA (no solo en la primera): el silencio de después de su última palabra
// no completa una aparición que HeyGen cobraría. Contra la constante.
test('el mínimo se mide hasta el fin recortado también en una frase sumada: una aparición que solo llegaría al mínimo con el silencio de su última frase no cabe', () => {
  const minimum = AVATAR_MIN_APPEARANCE_SECONDS
  // Frases 0–2, 2–12 y 12–22. La 0 sola no llega al mínimo y suma la 1.
  const withLastWordAt = (seconds) => {
    const sentences = sentencesOf([2, 10, 10])
    sentences[1].lastWordEndSeconds = seconds
    return sentences
  }
  // Con el mínimo de 5 s: la 1 habla hasta los 2,48; recortada termina a los
  // 4,48 y la aparición (0–4,48) no llega; hasta el fin de la frase mediría 12.
  assert.deepEqual(planOf(withLastWordAt(minimum - 2.52)), {
    spans: [],
    dropped: 1,
  })
  // Si habla hasta los 5, recortada termina a los 7 y llega: 0–7.
  assert.deepEqual(spansOf(planOf(withLastWordAt(minimum))), [
    [0, minimum + 2, 0, 1],
  ])
})

// El hueco de AVATAR_MIN_GAP_SECONDS y la zona libre del reparto se miden
// desde el fin útil de la aparición anterior: el silencio que el tope deja
// afuera ya es parte de las imágenes entre una y otra.
test('el hueco y la zona libre se miden desde el fin útil de la aparición anterior, no desde el fin de su frase', () => {
  // La apertura termina a los 7 s (la frase 0, 0–12, habla hasta los 5): la
  // zona libre arranca a los 17 y la otra aparición, también. Desde el fin de
  // la frase (12) arrancaría a los 22 y daría 27–37.
  const afterOpening = planOf(
    sentencesOf([12, 5, 10, 10], { pauses: { 0: 7 } }),
    { appearances: 2 },
  )
  assert.deepEqual(spansOf(afterOpening), [
    [0, 7, 0, 0],
    [17, 27, 2, 2],
  ])
  assert.equal(afterOpening.dropped, 0)
  // Sin apertura: la primera termina a los 12 (la frase 1, 5–17, habla hasta
  // los 10) y la segunda puede arrancar a los 22. Desde el fin de la frase
  // (17) no podría antes de los 27 y daría 32–42.
  const afterFirst = planOf(
    sentencesOf([5, 12, 5, 10, 10], { pauses: { 1: 7 } }),
    { appearances: 2, startWithAvatar: false },
  )
  assert.deepEqual(spansOf(afterFirst), [
    [5, 12, 1, 1],
    [22, 32, 3, 3],
  ])
})

test('el silencio inicial de la primera frase no se recorta: con «empieza con el avatar» el video abre con el avatar', () => {
  // La narración arranca a los 5 s: doce palabras hasta los 10,95 y dieciséis
  // desde los 12. La frase 0 de detectSentences empieza igual en 0 y la
  // apertura la toma entera, con los 5 s de silencio inicial: 0–12.
  const sentences = detectSentences(
    [...halfSecondWords('a', 12, 5), ...halfSecondWords('b', 16, 12)],
    20,
  )
  assert.deepEqual(
    sentences.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds]),
    [
      [0, 12],
      [12, 20],
    ],
  )
  assert.deepEqual(spansOf(planOf(sentences)), [[0, 12, 0, 0]])
  // El tope solo mira el silencio de después de la última palabra: con 1 s
  // de pausa al final (menos que el tope) la frase 0 no se recorta…
  assert.deepEqual(
    spansOf(planOf(sentencesAt([0, 12, 20], { pauses: { 0: 1 } }))),
    [[0, 12, 0, 0]],
  )
  // …y con 7 s el tope recorta la cola, nunca el comienzo: 0–10.
  assert.deepEqual(
    spansOf(planOf(sentencesAt([0, 15, 25], { pauses: { 0: 7 } }))),
    [[0, 10, 0, 0]],
  )
})

test('al cuadro: el fin útil es la última palabra más 2 s llevado al cuadro de 25 fps, y el ajuste mide con ese valor', () => {
  // 7,013 + 2 = 9,013 s es el cuadro 225,325: va al 225 (9 s).
  assert.equal(frameBoundary(7.013 + AVATAR_MAX_PAUSE_SECONDS), 225)
  // La frase 0 sola (7 s) queda a 3 s del objetivo; con el fin útil de la 1
  // (9 s), a 1: la suma. Medida hasta su fin nominal (20 s) quedaría a 10 y no
  // la sumaría.
  const closer = sentencesOf([7, 13])
  closer[1].lastWordEndSeconds = 7.013
  assert.deepEqual(spansOf(planOf(closer)), [[0, 225 / ANIMATION_FPS, 0, 1]])
  // El mínimo también se mide al cuadro, contra la constante. Con el mínimo de
  // 5 s: 2,99 + 2 = 4,99 s es el cuadro 124,75, que va al 125 (5 s), y la
  // aparición llega al mínimo.
  const minimum = sentencesOf([1, 19])
  minimum[1].lastWordEndSeconds = AVATAR_MIN_APPEARANCE_SECONDS - 2.01
  assert.deepEqual(spansOf(planOf(minimum)), [
    [0, AVATAR_MIN_APPEARANCE_SECONDS, 0, 1],
  ])
  // El fin útil nunca pasa el de la frase: con el audio fuera de la grilla
  // (25,035 s), el cuadro de 25,03 s es el de 25,04, después del audio (y,
  // con la cola corta, la frase se mide igual hasta su fin).
  const offGrid = sentencesAt([0, 15, 25.035], { pauses: { 1: 2.005 } })
  assert.deepEqual(spansOf(planOf(offGrid, { startWithAvatar: false })), [
    [15, 25.035, 1, 1],
  ])
})

// Un words.json editado a mano o dañado (la fase scene-cuts no valida los
// tiempos de cada palabra) no puede dejar un plan imposible.
test('un words.json roto: sin el fin de la última palabra la frase no se recorta (nada de NaN) y un fin anterior al inicio de la frase no corta la anterior', () => {
  const sentences = sentencesOf([5, 5, 5, 5])
  sentences[1].lastWordEndSeconds = Number.NaN
  assert.deepEqual(spansOf(planOf(sentences, { secondsPerAppearance: 20 })), [
    [0, 20, 0, 3],
  ])
  // La frase 1 (12–30 s) dice que su última palabra termina a los 9: su fin
  // útil se queda en su inicio (12), no en 11, y la aparición no termina antes
  // del fin de la frase 0.
  const backwards = sentencesOf([12, 18])
  backwards[1].lastWordEndSeconds = 9
  assert.deepEqual(spansOf(planOf(backwards)), [[0, 12, 0, 0]])
})
