// Planificador de apariciones del avatar (ADR-0057, diseño §5 y §23.2). Cada
// aparición ARRANCA donde arrancaba hasta la 2f: en el inicio de una frase —la
// apertura, en 0 con «empieza con el avatar»; sin ella, nunca antes de 3 s—,
// repartidas parejo con 10 s de imágenes entre una y otra (la frase más
// cercana a su ancla desde la que sirve, antes o después de él, con empate la
// primera; lo que no entra va a `dropped`, sin fallar). Desde la entrega 2g
// TERMINA donde corta `avatarCutEnd` con inicio + segundos elegidos como
// objetivo (el fin de frase o la pausa más cercana a medio segundo o menos, si
// no el hueco más cercano; ver check-avatar-appearance-cut.mjs): en
// narraciones tipo TTS dura lo elegido ±0,5 s, salvo al fin del audio, y ya no
// suma frases enteras (con 5 s elegidos salían de 6 a 13 s). Una pausa de más
// de 2 s entre dos palabras, o el silencio después de la última del audio,
// corta la aparición 2 s después de la palabra que la precede
// (`avatarCutLimit`, R-2g-11; el silencio inicial no cuenta). La apertura, si
// así no llega a 4,5 s, carga las de hasta 6 s, y una más larga la corta
// igual, con la cola de 2 s (R-2f-4, R-2f-6 y R-2g-17). Una frase no sirve de
// inicio si su aparición pasaría los 60 s con lo que le pega el corte de
// escenas, si duraría menos de 4,5 s (el mínimo menos el medio segundo del
// corte) o si dejaría menos de 3 s antes del fin del audio (salvo que ninguna
// sirva: entonces se acepta la cola corta, y si pegársela pasaría el máximo,
// el corte deja esos 3 s). «3 veces en 2 minutos» (entrega 2f): al menos 3,
// las tres primeras (la apertura cuenta; si no cupo, la ventana prueba las
// tres) arrancan antes de los 120 s —o del fin de un video más corto; justo a
// los 120, no— y el corte no pasa inicio + el tope (AVATAR_EARLY_MAX_SECONDS:
// los casos lo leen de la constante y uno fija los 32 s de R-2g-10); las
// demás, con los segundos elegidos, después de la tercera. La apertura de
// «Video-3-avatar» con sus tiempos reales (palabras neutras, R-2g-9) queda en
// 0–4,72 s. Puro: importa el código real, sin disco ni red.
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
  AVATAR_CUT_PAUSE_WINDOW_SECONDS,
  AVATAR_DEFAULT_APPEARANCE_SECONDS,
  AVATAR_DEFAULT_APPEARANCES,
  AVATAR_EARLY_APPEARANCES,
  AVATAR_EARLY_MAX_SECONDS,
  AVATAR_EARLY_WINDOW_SECONDS,
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MAX_APPEARANCES,
  AVATAR_MAX_PAUSE_SECONDS,
  AVATAR_MIN_APPEARANCE_SECONDS,
  AVATAR_MIN_APPEARANCES,
  AVATAR_MIN_GAP_SECONDS,
  AVATAR_OPENING_MAX_PAUSE_SECONDS,
} from '../../pipeline/types/avatar.ts'

// `count` palabras de 0,4 s cada 0,5 s desde `from`; la última cierra frase.
// Así hablan las narraciones de estas pruebas: los huecos de 0,1 s no son
// cortes naturales y los fines de frase sí.
function spoken(from, count, prefix = 'w') {
  return Array.from({ length: count }, (_, index) => ({
    word: `${prefix}${index}`,
    start: from + index * 0.5,
    end: from + index * 0.5 + 0.4,
    ...(index === count - 1 ? { sentenceEnd: true } : {}),
  }))
}

// Frases contiguas desde 0 con estos largos (en segundos), habladas con
// `spoken`. `pauses` da, por índice, el silencio exacto entre la última palabra
// de una frase y la siguiente (0,1 s si no se dice: la última palabra se estira
// o se acorta hasta ahí). El audio termina con la última frase, o en
// `audioEnd`. detectSentences parte una frase de más de 15 s (por ejemplo, una
// palabra y 19 s de silencio) en su pausa interna más larga: los índices de
// las frases que siguen corren uno.
function narrationOf(lengths, { pauses = {}, audioEnd } = {}) {
  const words = []
  let start = 0
  for (const [index, length] of lengths.entries()) {
    const spokenEnd = start + length - (pauses[index] ?? 0.1)
    const count = Math.max(
      1,
      Math.floor((spokenEnd - start - 0.4) / 0.5 + 1e-9) + 1,
    )
    const sentence = spoken(start, count, `f${index}w`)
    sentence[count - 1].end = spokenEnd
    words.push(...sentence)
    start += length
  }
  return { words, audioEnd: audioEnd ?? start }
}

// Una narración hecha a mano: sus palabras y el fin del audio.
const narrationFrom = (words, audioEnd) => ({ words, audioEnd })

const repeat = (length, count) => Array.from({ length: count }, () => length)

// El plan de una narración como lo arma la fase (frases de detectSentences y
// las mismas palabras): una aparición de 10 s que abre el video, salvo que se
// pida otra cosa.
const planOf = (narration, options = {}) =>
  planAvatarSpans(
    detectSentences(narration.words, narration.audioEnd),
    narration.words,
    {
      appearances: 1,
      secondsPerAppearance: 10,
      startWithAvatar: true,
      ...options,
    },
  )

const spansOf = (result) =>
  result.spans.map(({ startSeconds, endSeconds, sentenceFrom, sentenceTo }) => [
    startSeconds,
    endSeconds,
    sentenceFrom,
    sentenceTo,
  ])

const spread = { startWithAvatar: false }

// ─── El corte (entrega 2g, §23.2) ───

test('el corte (2g): la aparición termina en el fin de frase más cercano a inicio + elegidos si está a 0,5 s o menos y, si no, entre dos palabras; ya no suma frases enteras', () => {
  // Frases de 5 s. Con 10 s, en el fin de frase de los 10.
  const fives = narrationOf(repeat(5, 12))
  assert.deepEqual(spansOf(planOf(fives)), [[0, 10, 0, 1]])
  // Con 12 s, a mitad de la frase 10–15 (hasta la 2f, 0–10: sumar la tercera
  // frase alejaba del objetivo); la última palabra que dice es de esa frase.
  assert.deepEqual(spansOf(planOf(fives, { secondsPerAppearance: 12 })), [
    [0, 12, 0, 2],
  ])
  // Con 14,6 s, el fin de frase de los 15 está a 0,4 s: corta ahí.
  assert.deepEqual(spansOf(planOf(fives, { secondsPerAppearance: 14.6 })), [
    [0, 15, 0, 2],
  ])
  // Con 13 s, los fines de frase quedan a 2 y a 3 s: corta en el hueco.
  assert.deepEqual(spansOf(planOf(fives, { secondsPerAppearance: 13 })), [
    [0, 13, 0, 2],
  ])
  assert.equal(AVATAR_CUT_PAUSE_WINDOW_SECONDS, 0.5)
})

// La medición que fijó la regla (§23.2) dio, sobre las narraciones del dueño,
// 0,1 s de diferencia de mediana y nunca más de 0,5 s. Acá, una narración tipo
// TTS de frases largas (8 a 15 s), palabras de 0,25 a 0,45 s y pausas de fin de
// frase de 0,2 a 0,5 s: el hueco o el fin de frase más cercano siempre queda a
// medio segundo o menos.
test('5, 10 y 35 s elegidos sobre una narración de frases largas: todas las apariciones a ±0,5 s de lo elegido, salvo las que terminan en el fin del audio', () => {
  const random = mulberry32(2026)
  const words = []
  let time = 0.2
  while (time < 600) {
    const sentenceEnd = time + 8 + random() * 7
    while (time < sentenceEnd) {
      const length = 0.25 + random() * 0.2
      words.push({ word: `w${words.length}`, start: time, end: time + length })
      time += length + random() * 0.05
    }
    words.at(-1).sentenceEnd = true
    time += 0.2 + random() * 0.3
  }
  const narration = narrationFrom(words, words.at(-1).end + 0.4)
  let checked = 0
  for (const secondsPerAppearance of [5, 10, 35])
    for (const startWithAvatar of [true, false])
      for (const appearances of [1, 4, 10]) {
        const options = { appearances, secondsPerAppearance, startWithAvatar }
        const result = planOf(narration, options)
        assert.equal(result.dropped, 0, JSON.stringify(options))
        for (const span of result.spans) {
          if (Math.abs(span.endSeconds - narration.audioEnd) < 1e-6) continue

          const length = span.endSeconds - span.startSeconds
          assert.ok(
            Math.abs(length - secondsPerAppearance) <=
              AVATAR_CUT_PAUSE_WINDOW_SECONDS + 1e-6,
            `${JSON.stringify(options)}: ${span.startSeconds}–${span.endSeconds}`,
          )
          checked++
        }
      }
  assert.ok(checked >= 80, String(checked))
})

// Los tiempos y las marcas de fin de frase de las primeras 30 palabras de la
// narración de «Video-3-avatar» del dueño (R-2g-9: palabras neutras, sin su
// texto; el planificador solo mira los tiempos). La palabra 13 cierra la
// primera frase («…durante una hora.») a los 4,42 s, y la que sigue empieza a
// los 4,72.
const VIDEO_3_WORDS = [
  [0.08, 0.39999998],
  [0.39999998, 0.9],
  [1.12, 1.36],
  [1.36, 1.5999999],
  [1.5999999, 1.76],
  [1.76, 2.08],
  [2.08, 2.48],
  [2.48, 2.56],
  [2.56, 2.8799999],
  [2.8799999, 3.3799999],
  [3.4399998, 3.6799998],
  [3.6799998, 3.9199998],
  [3.9199998, 4.42, true],
  [4.72, 4.96],
  [4.96, 5.3599997],
  [5.3599997, 5.6],
  [5.6, 6.1],
  [6.3999996, 6.56],
  [6.56, 7.04],
  [7.04, 7.2799997],
  [7.2799997, 7.52],
  [7.52, 8.02],
  [8.48, 8.639999],
  [8.639999, 8.88],
  [8.88, 9.2],
  [9.2, 9.44],
  [9.44, 9.76],
  [9.76, 10.08],
  [10.08, 10.2],
  [10.2, 10.32],
].map(([start, end, sentenceEnd], index) => ({
  word: `w${index + 1}`,
  start,
  end,
  ...(sentenceEnd ? { sentenceEnd: true } : {}),
}))

test('la apertura de «Video-3-avatar» (R-2g-9): con sus tiempos reales y 5 s elegidos abre en 0–4,72, justo en «…durante una hora.», también con las opciones del dueño (5 de 5 s y «3 veces en 2 minutos»)', () => {
  const narration = narrationFrom(VIDEO_3_WORDS, 10.32)
  const opening = {
    startSeconds: 0,
    endSeconds: 4.72,
    sentenceFrom: 0,
    sentenceTo: 0,
  }
  assert.deepEqual(planOf(narration, { secondsPerAppearance: 5 }), {
    spans: [opening],
    dropped: 0,
  })
  const owner = planOf(narration, {
    appearances: 5,
    secondsPerAppearance: 5,
    threeInFirstTwoMinutes: true,
  })
  assert.deepEqual(owner.spans[0], opening)
  // Hasta la 2f la apertura era la primera frase entera más la segunda (0–13
  // en el video real): el dueño oyó 13 s con 5 elegidos.
})

// ─── Dónde arranca: la apertura, el reparto, el hueco y los 3 s ───

test('con «empieza con el avatar» la primera aparición abre el video y las demás se reparten después', () => {
  const result = planOf(narrationOf(repeat(5, 12)), { appearances: 3 })
  assert.deepEqual(spansOf(result), [
    [0, 10, 0, 1],
    [25, 35, 5, 6],
    [45, 55, 9, 10],
  ])
  assert.equal(result.dropped, 0)
})

test('sin «empieza con el avatar» la primera nunca arranca antes de 3 s: el corte la pegaría al inicio', () => {
  // Una frase de 1 s, y dos de 10: la de 1 s arranca en 1, antes de los 3.
  const short = narrationOf([1, 10, 10])
  assert.deepEqual(spansOf(planOf(short, spread)), [[11, 21, 2, 2]])
  // El mismo audio con apertura arranca en 0 (y corta en el hueco de los
  // 10 s: los fines de frase de 1 y 11 quedan lejos).
  assert.deepEqual(spansOf(planOf(short)), [[0, 10, 0, 1]])
  const fives = planOf(narrationOf(repeat(5, 12)), {
    ...spread,
    appearances: 3,
  })
  assert.deepEqual(spansOf(fives), [
    [5, 15, 1, 2],
    [25, 35, 5, 6],
    [45, 55, 9, 10],
  ])
  for (const span of fives.spans)
    assert.ok(span.startSeconds >= MIN_SECONDS_PER_SCENE)
})

test('las demás apariciones se reparten parejo sobre la zona libre; con dos frases a la misma distancia del ancla, la primera', () => {
  assert.deepEqual(
    spansOf(planOf(narrationOf(repeat(5, 24)), { appearances: 4 })),
    [
      [0, 10, 0, 1],
      [30, 40, 6, 7],
      [65, 75, 13, 14],
      [100, 110, 20, 21],
    ],
  )
  // 20 y 25 s quedan a la misma distancia de los 22,5 de inicio ideal.
  assert.deepEqual(
    spansOf(planOf(narrationOf(repeat(5, 7)), { appearances: 2 })),
    [
      [0, 10, 0, 1],
      [20, 30, 4, 5],
    ],
  )
})

test('entre dos apariciones quedan al menos 10 s de imágenes, y las que no entran van a dropped sin fallar', () => {
  const result = planOf(narrationOf(repeat(5, 8)), { appearances: 3 })
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
  const many = planOf(narrationOf(repeat(5, 12)), { appearances: 10 })
  assert.deepEqual(spansOf(many), [
    [0, 10, 0, 1],
    [20, 30, 4, 5],
    [40, 50, 8, 9],
  ])
  assert.equal(many.dropped, 7)
  assert.deepEqual(
    planAvatarSpans([], [], {
      appearances: 3,
      secondsPerAppearance: 10,
      startWithAvatar: true,
    }),
    { spans: [], dropped: 3 },
  )
})

// ─── El largo: el mínimo, el máximo y las opciones ───

// El mínimo elegible es 5 s (entrega 2d) y el corte puede dejar la aparición
// medio segundo más corta (§23.2): por debajo de 4,5 s el audio se acabó
// antes y no hay aparición.
test('el mínimo (2g): una aparición dura al menos 4,5 s; un audio de 4,4 s no da apertura y uno de 4,96 s sí (hasta la 2f no: el mínimo se medía por frases); un objetivo menor que 5 se acota a 5', () => {
  assert.equal(AVATAR_MIN_APPEARANCE_SECONDS, 5)
  assert.deepEqual(planOf(narrationOf([2, 2.4]), { secondsPerAppearance: 5 }), {
    spans: [],
    dropped: 1,
  })
  assert.deepEqual(
    planOf(narrationOf([2, 2.4]), { ...spread, secondsPerAppearance: 5 }),
    { spans: [], dropped: 1 },
  )
  assert.deepEqual(
    spansOf(planOf(narrationOf([2, 2.96]), { secondsPerAppearance: 5 })),
    [[0, 4.96, 0, 1]],
  )
  // Frases de 1 s: con 5 s, justo 5; con 3 (un project.json editado), igual.
  const ones = narrationOf(repeat(1, 30))
  assert.deepEqual(spansOf(planOf(ones, { secondsPerAppearance: 5 })), [
    [0, 5, 0, 4],
  ])
  assert.deepEqual(spansOf(planOf(ones, { secondsPerAppearance: 3 })), [
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

test('el máximo: con 60 s elegidos la aparición no pasa los 60, ni con lo que le pega el corte de escenas', () => {
  // Frases de 5 s: justo 60.
  const long = narrationOf(repeat(5, 30))
  assert.deepEqual(spansOf(planOf(long, { secondsPerAppearance: 60 })), [
    [0, 60, 0, 11],
  ])
  // Un objetivo de más de 60 (un project.json editado) se acota a 60.
  assert.deepEqual(
    spansOf(planOf(long, { secondsPerAppearance: 999 })),
    spansOf(planOf(long, { secondsPerAppearance: 60 })),
  )
})

// Crear valida las opciones; esto cubre un project.json editado a mano.
test('opciones fuera de rango se acotan a los límites de Crear y lo que no es un número toma el valor por defecto', () => {
  const narration = narrationOf(repeat(5, 24))
  const appearancesCounted = (appearances) => {
    const { spans, dropped } = planOf(narration, {
      ...spread,
      appearances,
    })
    return spans.length + dropped
  }
  assert.equal(appearancesCounted(0), AVATAR_MIN_APPEARANCES)
  assert.equal(appearancesCounted(99), AVATAR_MAX_APPEARANCES)
  assert.equal(appearancesCounted(2.4), 2)
  assert.equal(appearancesCounted(Number.NaN), AVATAR_DEFAULT_APPEARANCES)
  const spansWithTarget = (secondsPerAppearance) =>
    spansOf(planOf(narration, { ...spread, secondsPerAppearance }))
  assert.deepEqual(
    spansWithTarget(Number.NaN),
    spansWithTarget(AVATAR_DEFAULT_APPEARANCE_SECONDS),
  )
})

// El foco 1 del plan de la entrega 2: una narración sin puntuación con una sola
// pausa larga da una aparición válida o un `dropped` honesto, nunca un avatar
// corto. Palabras de 0,45 s cada 0,5 s, sin `sentenceEnd`.
test('foco 1: sin puntuación y con una sola pausa larga, una aparición válida y las que no entran en dropped; con el audio corto, 0–9 si abre el video y si no, ninguna', () => {
  const unpunctuated = (prefix, count, from) =>
    Array.from({ length: count }, (_, index) => ({
      word: `${prefix}${index}`,
      start: from + index * 0.5,
      end: from + index * 0.5 + 0.45,
    }))
  // Frases 0–8, 8–16,2 y 16,2–31,2 (las fija check-narration-sentences.mjs).
  // Con apertura, 0–10 (hasta la 2g, la frase 0–8); sin ella, desde los 8
  // hasta el hueco de los 18,2, con la pausa de 1,25 s adentro.
  const long = narrationFrom(
    [...unpunctuated('a', 30, 0), ...unpunctuated('b', 30, 16.2)],
    31.2,
  )
  const opening = planOf(long, { appearances: 3 })
  assert.deepEqual(spansOf(opening), [[0, 10, 0, 1]])
  assert.equal(opening.dropped, 2)
  const later = planOf(long, { ...spread, appearances: 3 })
  assert.deepEqual(spansOf(later), [[8, 18.2, 1, 2]])
  assert.equal(later.dropped, 2)
  // 8 palabras, 1,05 s de silencio y otras 8 (frases 0–5 y 5–9): la apertura
  // llega al fin del audio; sin ella, desde los 5 quedan 4 s, menos que el
  // mínimo.
  const short = narrationFrom(
    [...unpunctuated('a', 8, 0), ...unpunctuated('b', 8, 5)],
    9,
  )
  assert.deepEqual(spansOf(planOf(short)), [[0, 9, 0, 1]])
  assert.deepEqual(planOf(short, spread), { spans: [], dropped: 1 })
})

test('determinista y puro: las mismas frases, palabras y opciones dan el mismo plan, y no se tocan', () => {
  const narration = narrationOf(repeat(5, 24))
  const sentences = detectSentences(narration.words, narration.audioEnd)
  const before = structuredClone([sentences, narration.words])
  const options = {
    appearances: 4,
    secondsPerAppearance: 10,
    startWithAvatar: false,
  }
  const first = planAvatarSpans(sentences, narration.words, options)
  assert.deepEqual(planAvatarSpans(sentences, narration.words, options), first)
  assert.deepEqual([sentences, narration.words], before)
})

// ─── Las pausas: dentro de la aparición y al final del audio ───

test('una pausa de 3 s corta la aparición 2 s después de la palabra que la precede (R-2g-11); si así dura menos de 4,5 s, gana la frase siguiente más cercana al ancla', () => {
  assert.equal(AVATAR_MAX_PAUSE_SECONDS, 2)
  // La frase 25–30 habla hasta los 27: 3 s de pausa hasta la siguiente. El
  // ancla pide arrancar a los 25: desde ahí la pausa corta la aparición a los
  // 29 (25–29, 4 s, no llega). Desde los 20 (empata con los 30 y gana la
  // primera), 20–29: el fin de frase de los 25 queda a 5 s del objetivo y el
  // corte de los 29, a 1. Como en la 2f (su tope de silencio también cerraba
  // la aparición ahí).
  const paused = narrationOf(repeat(5, 12), { pauses: { 5: 3 } })
  assert.deepEqual(spansOf(planOf(paused, spread)), [[20, 29, 4, 5]])
  // Con 2 s justos de pausa se carga: arranca en los 25.
  const atLimit = narrationOf(repeat(5, 12), { pauses: { 5: 2 } })
  assert.deepEqual(spansOf(planOf(atLimit, spread)), [[25, 35, 5, 6]])
})

test('una palabra con 19 s de silencio detrás nunca es una aparición: el reparto arranca en otra frase', () => {
  // La frase 5–25 son dos palabras hasta los 6 s y 19 s de silencio (de más de
  // 15 s, detectSentences la parte entre sus dos palabras: las que siguen son
  // la 3 y la 4).
  const result = planOf(narrationOf([5, 20, 5, 5], { pauses: { 1: 19 } }), {
    ...spread,
    appearances: 3,
  })
  assert.deepEqual(spansOf(result), [[25, 35, 3, 4]])
  assert.equal(result.dropped, 2)
  // Lo mismo con una palabra sin puntuación: frases 0–8,4, 8,4–28 y 28–38.
  const unpunctuated = narrationFrom(
    [
      ...spoken(0, 16, 'a').map(({ word, start, end }) => ({
        word,
        start,
        end,
      })),
      { word: 'b0', start: 8.4, end: 8.85 },
      ...spoken(28, 20, 'c').map(({ word, start, end }) => ({
        word,
        start,
        end,
      })),
    ],
    38,
  )
  assert.deepEqual(
    detectSentences(unpunctuated.words, 38).map(
      ({ startSeconds, endSeconds }) => [startSeconds, endSeconds],
    ),
    [
      [0, 8.4],
      [8.4, 28],
      [28, 38],
    ],
  )
  const afterSilence = planOf(unpunctuated, spread)
  assert.deepEqual(spansOf(afterSilence), [[28, 38, 2, 2]])
  assert.equal(afterSilence.dropped, 0)
})

// El fin del audio es un corte más: sin un tope, la aparición cargaría todo el
// silencio final. Como el tope de la 2b, no carga más de 2 s después de la
// última palabra (al cuadro hacia abajo); el resto es una escena de imagen o,
// si es de menos de 3 s, el corte de escenas lo pega.
test('el silencio final: la aparición no carga más de 2 s después de la última palabra del audio', () => {
  // La última palabra termina a los 9,9 y el audio a los 15: con 12 s
  // elegidos, el corte cae a los 11,88 (9,9 + 2 al cuadro) y lo demás es
  // imagen.
  const quiet = narrationOf([5, 5], { audioEnd: 15 })
  assert.equal(
    Math.floor((9.9 + AVATAR_MAX_PAUSE_SECONDS) * ANIMATION_FPS) /
      ANIMATION_FPS,
    11.88,
  )
  assert.deepEqual(spansOf(planOf(quiet, { secondsPerAppearance: 12 })), [
    [0, 11.88, 0, 1],
  ])
  // Con 10 s el corte más cercano es el hueco antes de la última palabra
  // (9,52, a 0,48 s): la última palabra va con la imagen.
  assert.deepEqual(spansOf(planOf(quiet)), [[0, 9.52, 0, 1]])
  // Con el audio a los 13 la cola de 1,12 s no entra como imagen: se acepta
  // la cola corta y el corte de escenas la pega (0–13).
  assert.deepEqual(
    spansOf(
      planOf(narrationOf([5, 5], { audioEnd: 13 }), {
        secondsPerAppearance: 12,
      }),
    ),
    [[0, 11.88, 0, 1]],
  )
})

test('el silencio inicial no cuenta: con «empieza con el avatar» el video abre con el avatar aunque la voz arranque a los 5 o a los 7 s', () => {
  // Doce palabras desde los 5 s y dieciséis desde los 12, sin puntuación: la
  // frase 0 arranca igual en 0.
  const words = [...spoken(5, 12, 'a'), ...spoken(12, 16, 'b')].map(
    ({ word, start, end }) => ({ word, start, end }),
  )
  const late = narrationFrom(words, 20)
  assert.deepEqual(
    detectSentences(words, 20).map(({ startSeconds, endSeconds }) => [
      startSeconds,
      endSeconds,
    ]),
    [
      [0, 12],
      [12, 20],
    ],
  )
  assert.deepEqual(spansOf(planOf(late)), [[0, 10, 0, 0]])
  // Con 7 s de silencio inicial (más de lo que la apertura carga entre dos
  // palabras) tampoco cuenta.
  const later = narrationFrom(
    [...spoken(7, 12, 'a'), ...spoken(14, 16, 'b')].map(
      ({ word, start, end }) => ({ word, start, end }),
    ),
    22,
  )
  assert.deepEqual(spansOf(planOf(later)), [[0, 10, 0, 0]])
})

// ─── La apertura que siempre abre (2f, R-2f-4 y R-2f-6) ───

// R-2f-4, R-2f-6, R-2g-11 y R-2g-17: si cortada en las pausas de más de 2 s la
// apertura no llega a 4,5 s, carga las de hasta 6 s. Una más larga la corta
// como en el primer intento (la palabra que la precede más 2 s): si así
// tampoco llega, no hay apertura, como en la 2f.
test('la apertura: si cortada en las pausas de más de 2 s no llega a 4,5 s, carga las de hasta 6 s y una más larga la corta con la cola de 2 s (R-2g-17); «Hola» y 5,2 s abre en 0–10, con 6 s justos también, y con 6,04, 19 o 19,2 s no hay apertura', () => {
  assert.equal(AVATAR_OPENING_MAX_PAUSE_SECONDS, 6)
  // «Hola» de 0,2 a 0,8 s y frases de 5 s desde los 6.
  const hello = narrationFrom(
    [
      { word: 'hola', start: 0.2, end: 0.8, sentenceEnd: true },
      ...Array.from({ length: 11 }, (_, index) =>
        spoken(6 + index * 5, 10, `s${index}w`),
      ).flat(),
    ],
    61,
  )
  assert.deepEqual(planOf(hello), {
    spans: [
      { startSeconds: 0, endSeconds: 10, sentenceFrom: 0, sentenceTo: 1 },
    ],
    dropped: 0,
  })
  // Con 5 s, el primer corte después de «Hola» es el de los 6.
  assert.deepEqual(spansOf(planOf(hello, { secondsPerAppearance: 5 })), [
    [0, 6, 0, 0],
  ])
  const three = planOf(hello, { appearances: 3 })
  assert.deepEqual(spansOf(three), [
    [0, 10, 0, 1],
    [26, 36, 5, 6],
    [46, 56, 9, 10],
  ])
  assert.equal(three.dropped, 0)
  // Justo 6 s de pausa se cargan (0–10). Con 6,04 la pausa corta la apertura
  // a los 3 s (la palabra más 2): no llega a 4,5 y no hay apertura.
  const pausedFor = (pause) =>
    narrationFrom(
      [
        { word: 'hola', start: 0, end: 1, sentenceEnd: true },
        ...spoken(1 + pause, 30),
      ],
      1 + pause + 15,
    )
  assert.deepEqual(
    spansOf(planOf(pausedFor(AVATAR_OPENING_MAX_PAUSE_SECONDS))),
    [[0, 10, 0, 1]],
  )
  assert.deepEqual(planOf(pausedFor(6.04)), { spans: [], dropped: 1 })
  // Lo mismo con el silencio después de la última palabra del audio, medido
  // hasta el fin: «Hola» (0–1) y 6 s justos abre en 0–7; con 6,04 s el
  // silencio la corta a los 3 s y no hay apertura.
  const onlyHello = [{ word: 'hola', start: 0, end: 1, sentenceEnd: true }]
  assert.deepEqual(spansOf(planOf(narrationFrom(onlyHello, 7))), [[0, 7, 0, 0]])
  assert.deepEqual(planOf(narrationFrom(onlyHello, 7.04)), {
    spans: [],
    dropped: 1,
  })
  // «Hola.» con 19,2 s de silencio, tampoco.
  const helloLong = narrationFrom(
    [
      { word: 'hola', start: 0.2, end: 0.8, sentenceEnd: true },
      ...Array.from({ length: 5 }, (_, index) =>
        spoken(20 + index * 5, 10, `s${index}w`),
      ).flat(),
    ],
    45,
  )
  assert.deepEqual(planOf(helloLong), { spans: [], dropped: 1 })
  // Dos palabras hasta 1 s y 19 s de silencio: sin apertura; la otra se
  // reparte desde los 20 (detectSentences parte la frase de 20 s entre las dos
  // palabras, así que es la frase 2).
  const mute = planOf(narrationOf([20, 5, 5, 5], { pauses: { 0: 19 } }), {
    appearances: 2,
  })
  assert.deepEqual(spansOf(mute), [[20, 30, 2, 3]])
  assert.equal(mute.dropped, 1)
})

// R-2g-17: en el segundo intento la pausa larga corta la apertura como a
// cualquier aparición, así el resultado no depende del objetivo elegido.
test('la apertura del segundo intento carga la pausa de 3 s y la de 8 s la corta con la cola de 2 s: abre con 5, 6 y 10 s elegidos (R-2g-17)', () => {
  // «Hola» (0–1), 3 s de pausa, tres palabras de los 4 a los 5,4, 8 s de
  // pausa y frases de 5 s desde los 13,4. Cortada a los 2 s no llega (0–3).
  const twoPauses = narrationFrom(
    [
      { word: 'hola', start: 0, end: 1, sentenceEnd: true },
      ...spoken(4, 3, 'b'),
      ...Array.from({ length: 10 }, (_, index) =>
        spoken(13.4 + index * 5, 10, `s${index}w`),
      ).flat(),
    ],
    63.4,
  )
  // Con 5 o 6 s elegidos el corte cae a los 5, en el hueco más cercano.
  for (const secondsPerAppearance of [5, 6])
    assert.deepEqual(
      spansOf(planOf(twoPauses, { secondsPerAppearance })),
      [[0, 5, 0, 1]],
      String(secondsPerAppearance),
    )
  // Con 10 s, en el límite que deja la pausa de 8 s: la palabra que la
  // precede (5,4) más 2.
  assert.deepEqual(spansOf(planOf(twoPauses)), [[0, 7.4, 0, 1]])
})

// Con 2 s alcanza: primero se prueba con el tope de siempre, así el silencio
// final no se carga entero.
test('la apertura prueba primero con 2 s de silencio: si alcanza, el silencio final se queda en 2 s', () => {
  // Una sola frase que habla hasta los 4,9 s y un audio de 9: con 2 s, el
  // corte cae a los 6,88 (se acepta la cola corta de 2,12 s y el corte de
  // escenas la pega); con 6 s el avatar cargaría hasta los 9.
  const short = narrationOf([5], { audioEnd: 9 })
  assert.deepEqual(spansOf(planOf(short, { secondsPerAppearance: 7 })), [
    [0, 6.88, 0, 0],
  ])
})

// ─── La cola corta y el máximo después del corte ───

test('la cola corta: un corte que deja menos de 3 s antes del fin del audio no se usa si otra frase sirve; si ninguna sirve, se acepta y el corte de escenas la pega', () => {
  // 17 s en frases de 5 s (la última, de 2): desde los 5 el corte (15) deja
  // 2 s; desde los 10 la aparición llega al fin del audio. Hasta la 2f, 5–15
  // y el corte la llevaba a 5–17 (2 s más de lo elegido).
  const result = planOf(narrationOf([5, 5, 5, 2]), {
    ...spread,
    appearances: 2,
  })
  assert.deepEqual(spansOf(result), [[10, 17, 2, 3]])
  assert.equal(result.dropped, 1)
  // Si la única frase deja la cola corta (5–17 es una sola frase), se acepta:
  // 5–15 y el corte de escenas le pega los 2 s.
  assert.deepEqual(spansOf(planOf(narrationOf([5, 12]), spread)), [
    [5, 15, 1, 1],
  ])
})

test('el máximo con lo que le pega el corte: si pegarle la cola corta pasaría los 60 s, el corte deja 3 s antes del fin; nunca pasa los 60', () => {
  // 61 s: once frases de 5 s, una de 5 y una final de 1. Con 60 s el corte
  // más cercano (60) dejaría 1 s, y el corte de escenas lo llevaría a 61:
  // aceptando la cola corta, la aparición corta a los 58 y deja 3 s de imagen.
  // Hasta la 2f, 0–55 (una frase menos).
  const sixtyOne = narrationOf([...repeat(5, 12), 1])
  assert.deepEqual(spansOf(planOf(sixtyOne, { secondsPerAppearance: 60 })), [
    [0, 58, 0, 11],
  ])
  // Con la final de 3 s el corte la deja como imagen: 0–60.
  assert.deepEqual(
    spansOf(
      planOf(narrationOf([...repeat(5, 12), 3]), { secondsPerAppearance: 60 }),
    ),
    [[0, 60, 0, 11]],
  )
})

// ─── La tolerancia de coma flotante ───

// Con fronteras en la grilla de 25 fps, una resta o una suma deja ruido
// (10,04 − 7,04 = 2,999999999999999) y, sin TIME_EPSILON, el plan cambia. Cada
// caso tiene una alternativa que ganaría sin la tolerancia; si una constante
// cambia, la precondición falla y hay que buscar otro par.
test('épsilon: el ruido de coma flotante en el hueco, la cola, la pausa y el máximo no cambia el plan', () => {
  // El hueco: la apertura termina a los 7,24 y la siguiente puede arrancar en
  // 7,24 + 10 = 17,240000000000002, que es la frase de los 17,24.
  assert.ok(7.24 + AVATAR_MIN_GAP_SECONDS > 17.24, 'precondición del hueco')
  const gap = planOf(
    narrationFrom(
      [
        ...spoken(0, 14, 'a'),
        ...spoken(7.24, 20, 'b'),
        ...spoken(17.24, 14, 'c'),
      ],
      24.24,
    ),
    { appearances: 2, secondsPerAppearance: 7 },
  )
  assert.deepEqual(spansOf(gap), [
    [0, 7.24, 0, 0],
    [17.24, 24.24, 2, 2],
  ])
  // La cola: el corte de los 14,08 deja 17,08 − 14,08 = 2,999999999999999 s,
  // que cuentan como 3 (si no, ganaría la frase de los 7,08, que llega al fin).
  assert.ok(17.08 - 14.08 < MIN_SECONDS_PER_SCENE, 'precondición de la cola')
  const tail = planOf(
    narrationFrom(
      [
        ...spoken(0, 8, 'a'),
        ...spoken(4.08, 6, 'b'),
        ...spoken(7.08, 14, 'c'),
        ...spoken(14.08, 6, 'd'),
      ],
      17.08,
    ),
    spread,
  )
  assert.deepEqual(spansOf(tail), [[4.08, 14.08, 1, 2]])
  // La pausa: de 6,56 a 8,56 son 2,000000000000001 s, que cuentan como 2 (si
  // no, la pausa cortaría la aparición a los 8,56).
  assert.ok(8.56 - 6.56 > AVATAR_MAX_PAUSE_SECONDS, 'precondición de la pausa')
  const pause = planOf(
    narrationFrom(
      [
        ...spoken(0, 8, 'a'),
        ...spoken(4, 4, 'b').map(({ word, start, end }) => ({
          word,
          start,
          end,
        })),
        { word: 'b4', start: 6.1, end: 6.56, sentenceEnd: true },
        ...spoken(8.56, 18, 'c'),
      ],
      18,
    ),
    spread,
  )
  assert.deepEqual(spansOf(pause), [[4, 14.08, 1, 2]])
  // El máximo: 64,04 − 4,04 da 60,00000000000001, que cuenta como 60 (si no,
  // ganaría la frase de los 9,04).
  assert.ok(
    64.04 - 4.04 > AVATAR_MAX_APPEARANCE_SECONDS,
    'precondición del máximo',
  )
  const maximum = planOf(
    narrationFrom(
      [
        ...spoken(0, 8, 'a'),
        ...Array.from({ length: 12 }, (_, index) =>
          spoken(4.04 + index * 5, 10, `s${index}w`),
        ).flat(),
      ],
      64.04,
    ),
    { ...spread, secondsPerAppearance: 60 },
  )
  assert.deepEqual(spansOf(maximum), [[4.04, 64.04, 1, 12]])
})

// Un words.json editado a mano o dañado (la fase scene-cuts no valida los
// tiempos de cada palabra) no puede dejar un plan imposible.
test('un words.json roto: una palabra sin tiempos no deja NaN en el plan', () => {
  // La primera palabra de la frase 10–15 sin tiempos: detectSentences une esa
  // frase a la anterior (5–15), su hueco no es un corte y el que la sigue no es
  // natural. La apertura corta en el hueco de los 9,52 (el de los 10,52 queda
  // más lejos).
  const broken = narrationOf(repeat(5, 8))
  broken.words[20] = { word: 'roto', start: Number.NaN, end: Number.NaN }
  const result = planOf(broken, { appearances: 2 })
  for (const span of result.spans)
    assert.ok(
      Number.isFinite(span.startSeconds) && Number.isFinite(span.endSeconds),
      JSON.stringify(span),
    )
  assert.deepEqual(spansOf(result), [
    [0, 9.52, 0, 1],
    [25, 35, 4, 5],
  ])
})

// ─── «3 veces en 2 minutos» (entrega 2f, §22.2) con el corte nuevo ───

// Cinco minutos de frases de 5 s: el reparto cae en múltiplos de 5 y los
// cortes, en fines de frase.
const FIVE_MINUTES = narrationOf(repeat(5, 60))
const threeInTwo = (narration, options = {}) =>
  planOf(narration, { threeInFirstTwoMinutes: true, ...options })

// El tope de las tres primeras (AVATAR_EARLY_MAX_SECONDS) se lee de la
// constante: ya cambió (45, 40, 35 y 32 s) y se elige midiendo. El valor
// vigente queda fijado acá (R-2g-10), así cambiarlo es a propósito y con la
// medición nueva en el comentario de la constante.
test('3 veces en 2 minutos sigue entrando: con 1, 3 y 5 elegidas, con y sin apertura y con 10, 45 y 60 s, las tres primeras arrancan antes de los 120 s y duran min(elegidos, tope); las demás, lo elegido', () => {
  assert.deepEqual(
    [AVATAR_EARLY_WINDOW_SECONDS, AVATAR_EARLY_APPEARANCES],
    [120, 3],
  )
  assert.equal(AVATAR_EARLY_MAX_SECONDS, 32)
  for (const appearances of [1, 3, 5])
    for (const startWithAvatar of [true, false])
      for (const secondsPerAppearance of [10, 45, 60]) {
        const label = `${appearances} elegidas, apertura ${startWithAvatar}, ${secondsPerAppearance} s`
        const result = threeInTwo(FIVE_MINUTES, {
          appearances,
          startWithAvatar,
          secondsPerAppearance,
        })
        assert.equal(
          result.spans.length,
          Math.max(appearances, AVATAR_EARLY_APPEARANCES),
          label,
        )
        assert.equal(result.dropped, 0, label)
        if (startWithAvatar)
          assert.equal(result.spans[0].startSeconds, 0, label)
        else
          assert.ok(
            result.spans[0].startSeconds >= MIN_SECONDS_PER_SCENE,
            label,
          )
        const earlySeconds = Math.min(
          secondsPerAppearance,
          AVATAR_EARLY_MAX_SECONDS,
        )
        for (const span of result.spans.slice(0, AVATAR_EARLY_APPEARANCES)) {
          assert.ok(span.startSeconds < AVATAR_EARLY_WINDOW_SECONDS, label)
          assert.equal(span.endSeconds - span.startSeconds, earlySeconds, label)
        }
        for (const span of result.spans.slice(AVATAR_EARLY_APPEARANCES))
          assert.equal(
            span.endSeconds - span.startSeconds,
            secondsPerAppearance,
            label,
          )
        for (let index = 1; index < result.spans.length; index++)
          assert.ok(
            result.spans[index].startSeconds -
              result.spans[index - 1].endSeconds >=
              AVATAR_MIN_GAP_SECONDS,
            label,
          )
      }
})

test('3 veces en 2 minutos: las tres primeras se reparten con la regla de anclas dentro de la ventana y las demás, parejas en la zona que queda después de la tercera', () => {
  // Con apertura y 10 s: dos más en la zona libre de la ventana (20–120 s,
  // anclas a los 45 y 95). Apagada caían a los 85 y 225 s.
  assert.deepEqual(spansOf(threeInTwo(FIVE_MINUTES, { appearances: 3 })), [
    [0, 10, 0, 1],
    [40, 50, 8, 9],
    [90, 100, 18, 19],
  ])
  // Sin apertura: tres en 0–120 s, anclas a los 20, 60 y 100.
  assert.deepEqual(
    spansOf(threeInTwo(FIVE_MINUTES, { ...spread, appearances: 3 })),
    [
      [15, 25, 3, 4],
      [55, 65, 11, 12],
      [95, 105, 19, 20],
    ],
  )
  // Cinco de 10 s: las dos que siguen, parejas en 110–300 s. (Con más segundos
  // que el tope, los largos los fija la prueba de arriba con la constante.)
  assert.deepEqual(spansOf(threeInTwo(FIVE_MINUTES, { appearances: 5 })), [
    [0, 10, 0, 1],
    [40, 50, 8, 9],
    [90, 100, 18, 19],
    [150, 160, 30, 31],
    [245, 255, 49, 50],
  ])
})

// R-2f-3: Crear dice que las tres primeras «duran hasta» el tope, así que el
// corte nunca pasa inicio + tope, aunque un fin de frase justo después quede
// más cerca. Así el respaldo a 60 s de la 2f (para frases más largas que el
// tope) ya no hace falta: se fue. Con palabras cada 0,5 s, el último hueco
// antes del límite queda a menos de medio segundo de él.
test('3 veces en 2 minutos: el corte de las tres primeras no pasa inicio + el tope aunque un fin de frase justo después quede más cerca; las demás, hasta 60', () => {
  const cap = AVATAR_EARLY_MAX_SECONDS
  const nearCap = (span) => {
    const length = span.endSeconds - span.startSeconds
    return length <= cap + 1e-6 && length > cap - 0.5 - 1e-6
  }
  // Frases de 6 s: las tres primeras cortan en el hueco de inicio + tope; las
  // dos que siguen, en el fin de frase de inicio + 60.
  const six = narrationOf(repeat(6, 50))
  const result = threeInTwo(six, { appearances: 5, secondsPerAppearance: 60 })
  assert.equal(result.spans.length, 5)
  assert.equal(result.dropped, 0)
  for (const span of result.spans.slice(0, AVATAR_EARLY_APPEARANCES)) {
    assert.ok(nearCap(span), JSON.stringify(span))
    assert.ok(span.startSeconds < AVATAR_EARLY_WINDOW_SECONDS)
  }
  for (const span of result.spans.slice(AVATAR_EARLY_APPEARANCES))
    assert.equal(span.endSeconds - span.startSeconds, 60)
  // Un fin de frase 0,4 s después del tope ganaría por la regla del corte,
  // pero queda afuera del límite: la apertura corta en el último hueco antes
  // del tope y no se pierde.
  const fives = Math.floor(cap / 5)
  const pastCap = narrationOf([
    ...repeat(5, fives),
    cap + 0.4 - fives * 5,
    ...repeat(5, 40),
  ])
  const [opening] = threeInTwo(pastCap, { secondsPerAppearance: 60 }).spans
  assert.equal(opening.startSeconds, 0)
  assert.ok(nearCap(opening), JSON.stringify(opening))
})

// Desde R-2g-11 la apertura casi siempre abre (una pausa larga la corta), así
// que para que no quepa hace falta un words.json raro: una primera «palabra»
// de 70 s (música transcripta como una sola, por ejemplo), sin ningún hueco ni
// silencio antes del máximo.
test('3 veces en 2 minutos (ronda 1 de la 2f): si la apertura no cabe, la ventana intenta las tres; apagada, la apertura sigue contando como descartada', () => {
  const longFirst = narrationFrom(
    [
      { word: 'larga', start: 0, end: 70, sentenceEnd: true },
      ...Array.from({ length: 50 }, (_, index) =>
        spoken(70 + index * 5, 10, `s${index}w`),
      ).flat(),
    ],
    320,
  )
  const result = threeInTwo(longFirst, { appearances: 3 })
  assert.deepEqual(spansOf(result), [
    [70, 80, 1, 2],
    [90, 100, 5, 6],
    [110, 120, 9, 10],
  ])
  assert.equal(result.dropped, 0)
  const off = planOf(longFirst, { appearances: 3 })
  assert.deepEqual(spansOf(off), [
    [75, 85, 2, 3],
    [235, 245, 34, 35],
  ])
  assert.equal(off.dropped, 1)
})

test('3 veces en 2 minutos: con un video de menos de 2 minutos la ventana es el video, y lo que no entra va a dropped', () => {
  const ninety = narrationOf(repeat(5, 18))
  // Sin apertura, anclas a los 15, 45 y 75 s.
  const early = threeInTwo(ninety, spread)
  assert.deepEqual(spansOf(early), [
    [10, 20, 2, 3],
    [40, 50, 8, 9],
    [70, 80, 14, 15],
  ])
  // Con tres elegidas y la apertura, el mismo plan que apagada.
  assert.deepEqual(
    threeInTwo(ninety, { appearances: 3 }),
    planOf(ninety, { appearances: 3 }),
  )
  // Cinco elegidas: después de la tercera no queda lugar.
  const five = threeInTwo(ninety, { ...spread, appearances: 5 })
  assert.deepEqual(five.spans, early.spans)
  assert.equal(five.dropped, 2)
  // 40 s con apertura: la segunda entra (20–30 s) y la tercera no.
  const forty = threeInTwo(narrationOf(repeat(5, 8)))
  assert.deepEqual(spansOf(forty), [
    [0, 10, 0, 1],
    [20, 30, 4, 5],
  ])
  assert.equal(forty.dropped, 1)
})

test('3 veces en 2 minutos: arrancar justo a los 120 s ya no es «en los primeros 2 minutos»; un cuadro antes, sí', () => {
  // Frases de 5 s hasta los 90 s, una palabra a los 90 con silencio hasta
  // `third` y frases de 5 s desde ahí, al cuadro. Una de 60 s con apertura:
  // las dos primeras del tope y la tercera, que desde los 90 cargaría el
  // silencio.
  const withThirdAt = (third) =>
    narrationFrom(
      [
        ...Array.from({ length: 18 }, (_, index) =>
          spoken(index * 5, 10, `s${index}w`),
        ).flat(),
        { word: 'sola', start: 90, end: 90.4, sentenceEnd: true },
        ...Array.from({ length: 37 }, (_, index) =>
          spoken(
            frameBoundary(third + index * 5) / ANIMATION_FPS,
            10,
            `t${index}w`,
          ),
        ).flat(),
      ],
      frameBoundary(third + 37 * 5) / ANIMATION_FPS,
    )
  const cap = AVATAR_EARLY_MAX_SECONDS
  const atLimit = threeInTwo(withThirdAt(AVATAR_EARLY_WINDOW_SECONDS), {
    secondsPerAppearance: 60,
  })
  assert.equal(atLimit.spans.length, 2)
  assert.equal(atLimit.dropped, 1)
  assert.equal(atLimit.spans[0].startSeconds, 0)
  for (const span of atLimit.spans) {
    assert.equal(span.endSeconds - span.startSeconds, cap)
    assert.ok(span.startSeconds < 90)
  }
  const frameBefore = threeInTwo(withThirdAt(119.96), {
    secondsPerAppearance: 60,
  })
  assert.deepEqual(frameBefore.spans.slice(0, 2), atLimit.spans)
  assert.equal(frameBefore.spans.length, 3)
  assert.equal(frameBefore.dropped, 0)
  const third = frameBefore.spans[2]
  assert.equal(third.startSeconds, 119.96)
  assert.ok(Math.abs(third.endSeconds - (119.96 + cap)) < 1e-6)
})

// Apagada (ausente, false o cualquier valor que no sea true), solo hay
// apertura y reparto. Con frases de 5 s los cortes caen en sus fines y los
// planes son los mismos de la 2e.
test('3 veces en 2 minutos apagada: el plan de siempre, también con false o con un valor que no es true', () => {
  for (const [options, before] of [
    [
      { appearances: 3 },
      [
        [0, 10, 0, 1],
        [85, 95, 17, 18],
        [225, 235, 45, 46],
      ],
    ],
    [
      { appearances: 3, startWithAvatar: false },
      [
        [45, 55, 9, 10],
        [145, 155, 29, 30],
        [245, 255, 49, 50],
      ],
    ],
    [{ secondsPerAppearance: 60 }, [[0, 60, 0, 11]]],
    [
      { appearances: 5, secondsPerAppearance: 60 },
      [
        [0, 60, 0, 11],
        [70, 130, 14, 25],
        [140, 200, 28, 39],
        [210, 270, 42, 53],
        [280, 300, 56, 59],
      ],
    ],
    [
      { appearances: 5, startWithAvatar: false, secondsPerAppearance: 45 },
      [
        [5, 50, 1, 9],
        [65, 110, 13, 21],
        [125, 170, 25, 33],
        [185, 230, 37, 45],
        [245, 290, 49, 57],
      ],
    ],
  ])
    for (const threeInFirstTwoMinutes of [undefined, false, 'true', 1]) {
      const label = JSON.stringify({ ...options, threeInFirstTwoMinutes })
      const result = planOf(FIVE_MINUTES, {
        ...options,
        threeInFirstTwoMinutes,
      })
      assert.deepEqual(spansOf(result), before, label)
      assert.equal(result.dropped, 0, label)
    }
})

test('3 veces en 2 minutos: determinista y sin tocar frases ni palabras; sin frases, las tres pedidas van a dropped', () => {
  const narration = narrationOf(repeat(7, 40))
  const sentences = detectSentences(narration.words, narration.audioEnd)
  const before = structuredClone([sentences, narration.words])
  const options = {
    appearances: 4,
    secondsPerAppearance: 30,
    startWithAvatar: true,
    threeInFirstTwoMinutes: true,
  }
  const first = planAvatarSpans(sentences, narration.words, options)
  assert.deepEqual(planAvatarSpans(sentences, narration.words, options), first)
  assert.deepEqual([sentences, narration.words], before)
  assert.deepEqual(
    planAvatarSpans([], [], {
      appearances: 1,
      secondsPerAppearance: 10,
      startWithAvatar: true,
      threeInFirstTwoMinutes: true,
    }),
    { spans: [], dropped: AVATAR_EARLY_APPEARANCES },
  )
})

function mulberry32(seed) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
