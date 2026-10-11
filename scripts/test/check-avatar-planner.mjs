// Planificador de apariciones del avatar (ADR-0057, entrega 2, tarea 3;
// diseño §5): ajuste a frases enteras (la siguiente entra solo si acerca al
// objetivo, nunca menos del mínimo —7 s en la spec— ni más del máximo), la
// primera aparición en 0 con «empieza con el avatar» y nunca antes de 3 s sin
// ella, reparto parejo con 10 s de imágenes entre apariciones, lo que no
// entra se cuenta en `dropped` y no falla, y el mismo plan para las mismas
// frases. El foco 1 del plan: una narración sin puntuación con una sola pausa
// larga da una aparición válida o un `dropped` honesto, nunca un avatar
// corto. Puro: importa el código real, sin disco ni red.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { planAvatarSpans } from '../../pipeline/avatar/planner.ts'
import { detectSentences } from '../../pipeline/narration/sentences.ts'
import { MIN_SECONDS_PER_SCENE } from '../../pipeline/stages/scene-cuts/by-seconds.ts'
import {
  AVATAR_DEFAULT_APPEARANCE_SECONDS,
  AVATAR_DEFAULT_APPEARANCES,
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MAX_APPEARANCES,
  AVATAR_MIN_APPEARANCE_SECONDS,
  AVATAR_MIN_APPEARANCES,
  AVATAR_MIN_GAP_SECONDS,
} from '../../pipeline/types/avatar.ts'

// Frases contiguas desde 0 con estos largos (en segundos).
function sentencesOf(lengths) {
  let start = 0
  return lengths.map((length, index) => {
    const sentence = {
      index,
      text: `frase ${index}`,
      startSeconds: start,
      endSeconds: start + length,
      wordFrom: index,
      wordTo: index,
    }
    start += length
    return sentence
  })
}

// Frases entre estas fronteras (en segundos), al cuadro de 25 fps como las da
// detectSentences.
function sentencesAt(boundaries) {
  return boundaries.slice(1).map((endSeconds, index) => ({
    index,
    text: `frase ${index}`,
    startSeconds: boundaries[index],
    endSeconds,
    wordFrom: index,
    wordTo: index,
  }))
}

const repeat = (length, count) => Array.from({ length: count }, () => length)

// Una aparición de 10 s que abre el video, salvo que se pida otra cosa.
const plan = (lengths, options = {}) =>
  planAvatarSpans(sentencesOf(lengths), {
    appearances: 1,
    secondsPerAppearance: 10,
    startWithAvatar: true,
    ...options,
  })

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

// Los dos tests que siguen se escriben contra las constantes: el mínimo (7 s
// en la spec, 5 si el dueño lo decide) y el máximo se cambian en un solo lugar.
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
// audio (ver check-narration-sentences.mjs). El planificador la toma entera
// mientras no pase el máximo. Una que lo pasa no entra en ninguna aparición,
// ni siquiera en la apertura, y las demás se planifican igual.
test('frases de más de 15 s: entran enteras hasta el máximo; una más larga no entra en ninguna aparición y no tapa a las demás', () => {
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
  assert.deepEqual(
    spansOf(
      planAvatarSpans(sentences, {
        appearances: 1,
        secondsPerAppearance: 10,
        startWithAvatar: false,
      }),
    ),
    [[8.4, 28, 1, 1]],
  )
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
// resta o una suma deja ruido (10,04 − 3,04 = 6,999999999999999) y, sin la
// tolerancia, el plan cambia. Cada fixture usa un par de fronteras con ese
// ruido contra el valor de hoy de las constantes (7 s, 60 s y 10 s): si una
// cambia, la precondición falla y hay que buscar otro par.
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

  // El mínimo al final del ajuste: 10,04 − 3,04 es 7 con ruido por debajo.
  assert.ok(10.04 - 3.04 < minimum, 'precondición del mínimo')
  assert.deepEqual(planAt([0, 3.04, 10.04], one(minimum)), [
    [3.04, 10.04, 1, 1],
  ])
  // El mínimo dentro del ajuste: con el mismo ruido no sigue sumando frases.
  assert.deepEqual(planAt([0, 3.04, 10.04, 20.04], one(minimum)), [
    [3.04, 10.04, 1, 1],
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

// La regla literal de la spec (diseño §5): la aparición arranca en la frase
// más cercana a su ancla y, si esa frase no cabe (pasa el máximo), la
// aparición se descarta aunque una frase un poco más lejos sí cabría. Es una
// pregunta abierta al dueño: cambiarla tiene que ser deliberado.
test('una frase de más del máximo que es la más cercana al ancla descarta esa aparición aunque haya lugar después', () => {
  // 3 s, una frase de 65 s y diez de 5 s (118 s). La apertura no cabe (3 s
  // no llegan al mínimo y con la frase de 65 s pasa el máximo); la primera del
  // reparto cae sobre la frase de 65 s, que no cabe, y se descarta; la segunda
  // arranca a los 83 s.
  const result = plan([3, 65, ...repeat(5, 10)], { appearances: 3 })
  assert.deepEqual(spansOf(result), [[83, 93, 5, 6]])
  assert.equal(result.dropped, 2)
})
