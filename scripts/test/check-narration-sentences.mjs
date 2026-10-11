// Frases de la narración (ADR-0057, entrega 2, tarea 2; diseño §4): la unidad
// de continuidad del avatar. Deepgram se pide con `punctuate=true` y la palabra
// que cierra una frase (termina en . ? ! … o 。！？｡, con comillas o paréntesis
// de cierre detrás) gana `sentenceEnd: true` sin que `word` cambie; con esa
// marca las frases cortan ahí, y sin ella (los words.json de antes y el de la
// demo) en una pausa de 0,35 s. Una frase de más de 15 s se parte en su pausa
// más larga (sin pausas, por el centro) entre los cortes que caen adentro de
// ella; las frases son contiguas de 0 al fin del audio, con las fronteras al
// cuadro de 25 fps y sin frases vacías, tampoco de 0 cuadros cuando el audio
// no termina en la grilla. Cada frase lleva el fin de su última palabra tal
// cual en words.json, sin llevar al cuadro (`lastWordEndSeconds`, entrega 2b:
// con él el planificador mide el silencio que carga el avatar), también al
// unir y al partir frases.
// La marca llega a words.json por la fase de transcripción real, también en la
// palabra que la fase recorta al fin del audio.
// Importa el código real (Node quita los tipos) y simula Deepgram con `fetch`
// falso: nada sale a la red. La fase de punta a punta usa el ffmpeg del repo
// y una narración de 2 s generada al vuelo.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { detectSentences } from '../../pipeline/narration/sentences.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'
import { transcribeWithDeepgram } from '../../pipeline/providers/transcription/deepgram.ts'
import { transcriptionStage } from '../../pipeline/stages/transcription/transcription.ts'
import { MAX_SENTENCE_SECONDS } from '../../pipeline/types/avatar.ts'
import { FFMPEG, writeNarration } from './avatar-fixture.mjs'

// Un solo fetch simulado vivo por test.
function mockFetch(t, implementation) {
  globalThis.fetch.mock?.restore()
  return t.mock.method(globalThis, 'fetch', implementation)
}

// Palabras de 0,45 s que empiezan en `starts` (w0, w1, …); las de `marks`
// cierran frase.
function wordsAt(starts, marks = []) {
  return starts.map((start, index) => ({
    word: `w${index}`,
    start,
    end: start + 0.45,
    ...(marks.includes(index) ? { sentenceEnd: true } : {}),
  }))
}

// `count` inicios cada 0,5 s desde `from`: entre palabras de 0,45 s quedan
// 0,05 s, menos que SENTENCE_PAUSE_SECONDS.
const halfSeconds = (count, from = 0) =>
  Array.from({ length: count }, (_, index) => from + index * 0.5)

const wordsText = (from, to) =>
  Array.from({ length: to - from + 1 }, (_, index) => `w${from + index}`).join(
    ' ',
  )

const shape = (sentences) =>
  sentences.map(({ startSeconds, endSeconds, text, wordFrom, wordTo }) => [
    startSeconds,
    endSeconds,
    text,
    wordFrom,
    wordTo,
  ])

const onFrame = (seconds) =>
  Math.abs(seconds * 25 - Math.round(seconds * 25)) < 1e-6

// El fin de la última palabra de cada frase es el `end` de words.json de su
// palabra `wordTo`, tal cual.
function assertLastWordEnds(sentences, words) {
  assert.ok(sentences.length > 0)
  for (const sentence of sentences)
    assert.equal(
      sentence.lastWordEndSeconds,
      words[sentence.wordTo].end,
      JSON.stringify(sentence),
    )
}

// Lo que manda Deepgram con `punctuate=true`: `word` limpia y la palabra
// puntuada aparte (con «¿», «¡», comas y cierres de comillas).
const RAW_WORDS = [
  {
    word: 'hola',
    start: 0,
    end: 0.4,
    confidence: 0.99,
    punctuated_word: 'Hola,',
  },
  {
    word: 'mundo',
    start: 0.5,
    end: 0.9,
    confidence: 0.98,
    punctuated_word: 'mundo.',
  },
  { word: 'qué', start: 1.2, end: 1.4, punctuated_word: '¿Qué' },
  { word: 'tal', start: 1.5, end: 1.8, punctuated_word: 'tal?' },
  { word: 'bien', start: 2, end: 2.3, punctuated_word: '¡Bien!' },
  { word: 'dijo', start: 2.5, end: 2.8, punctuated_word: 'dijo."' },
  { word: 'y', start: 3, end: 3.1, punctuated_word: 'y…' },
  { word: 'fin', start: 3.3, end: 3.6 },
]

test('Deepgram: pide puntuación y marca sentenceEnd solo en la palabra que cierra frase, con word intacta', async (t) => {
  const requests = []
  mockFetch(t, async (url) => {
    requests.push(new URL(String(url)))
    return new Response(
      JSON.stringify({
        results: { channels: [{ alternatives: [{ words: RAW_WORDS }] }] },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  const words = await transcribeWithDeepgram(Buffer.from('mp3'), 'fake-key')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].searchParams.get('punctuate'), 'true')
  assert.equal(requests[0].searchParams.get('model'), 'nova-2')
  assert.equal(requests[0].searchParams.get('detect_language'), 'true')
  assert.deepEqual(words, [
    { word: 'hola', start: 0, end: 0.4 },
    { word: 'mundo', start: 0.5, end: 0.9, sentenceEnd: true },
    { word: 'qué', start: 1.2, end: 1.4 },
    { word: 'tal', start: 1.5, end: 1.8, sentenceEnd: true },
    { word: 'bien', start: 2, end: 2.3, sentenceEnd: true },
    // El cierre de comillas después del punto no le saca la marca.
    { word: 'dijo', start: 2.5, end: 2.8, sentenceEnd: true },
    { word: 'y', start: 3, end: 3.1, sentenceEnd: true },
    // Sin `punctuated_word` (una respuesta sin puntuación): sin marca.
    { word: 'fin', start: 3.3, end: 3.6 },
  ])
})

test('con puntuación: las frases cortan en las palabras con sentenceEnd, una pausa sin punto no corta y la cola sin punto es una frase más', () => {
  // Entre w9 (termina en 4,95) y w10 (5,5) hay 0,55 s de silencio.
  const starts = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5.5, 6]
  const words = wordsAt(starts, [3, 7])
  const sentences = detectSentences(words, 6.5)
  assert.deepEqual(shape(sentences), [
    [0, 2, wordsText(0, 3), 0, 3],
    [2, 4, wordsText(4, 7), 4, 7],
    [4, 6.5, wordsText(8, 11), 8, 11],
  ])
  assert.deepEqual(
    sentences.map((sentence) => sentence.index),
    [0, 1, 2],
  )
  assertLastWordEnds(sentences, words)
})

test('sin puntuación (los words.json de antes y el de la demo): una pausa de 0,35 s o más cierra la frase', () => {
  const starts = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5.5, 6]
  // w10 empieza en 5,5 s, justo entre dos cuadros (137,5): la frontera va al
  // más cercano redondeando hacia arriba, el 138 (5,52 s).
  const words = wordsAt(starts)
  const sentences = detectSentences(words, 6.5)
  assert.deepEqual(shape(sentences), [
    [0, 5.52, wordsText(0, 9), 0, 9],
    [5.52, 6.5, wordsText(10, 11), 10, 11],
  ])
  assertLastWordEnds(sentences, words)
  // 0,34 s no cierra; 0,35 s sí (la frontera va al cuadro: 1,59 → 1,6).
  const closing = wordsAt([0, 0.79, 1.59])
  const closed = detectSentences(closing, 2.1)
  assert.deepEqual(shape(closed), [
    [0, 1.6, 'w0 w1', 0, 1],
    [1.6, 2.1, 'w2', 2, 2],
  ])
  assertLastWordEnds(closed, closing)
  // Una pausa de 0,35 s que la coma flotante deja en 0,3499… (2,8 − 2,45)
  // también cierra.
  const noisy = wordsAt([2, 2.8])
  const noisySentences = detectSentences(noisy, 3.5)
  assert.deepEqual(shape(noisySentences), [
    [0, 2.8, 'w0', 0, 0],
    [2.8, 3.5, 'w1', 1, 1],
  ])
  assertLastWordEnds(noisySentences, noisy)
})

test('una frase de 40 s sin pausas se parte por el centro, una y otra vez, hasta quedar de 15 s o menos', () => {
  const words = wordsAt(halfSeconds(80))
  const sentences = detectSentences(words, 40)
  assert.deepEqual(shape(sentences), [
    [0, 10, wordsText(0, 19), 0, 19],
    [10, 20, wordsText(20, 39), 20, 39],
    [20, 30, wordsText(40, 59), 40, 59],
    [30, 40, wordsText(60, 79), 60, 79],
  ])
  assertLastWordEnds(sentences, words)
})

test('la pausa más larga manda: una frase larga se parte primero donde la narración respira', () => {
  // w0…w29 cada 0,5 s; desde w30, 0,25 s más tarde: una pausa de 0,30 s (no
  // llega a cerrar frase) y el audio llega a 40,25 s.
  const starts = [...halfSeconds(30), ...halfSeconds(50, 15.25)]
  const words = wordsAt(starts)
  const sentences = detectSentences(words, 40.25)
  assertLastWordEnds(sentences, words)
  assert.deepEqual(
    sentences.map(({ startSeconds, wordFrom }) => [startSeconds, wordFrom]),
    [
      [0, 0],
      [7.52, 15],
      [15.24, 30],
      [27.76, 55],
    ],
  )
  assert.equal(sentences.at(-1).endSeconds, 40.25)
  for (const sentence of sentences)
    assert.ok(
      sentence.endSeconds - sentence.startSeconds <=
        MAX_SENTENCE_SECONDS + 1e-9,
      JSON.stringify(sentence),
    )
})

test('las fronteras van al cuadro de 25 fps y dos palabras en el mismo cuadro no dejan una frase vacía', () => {
  const words = [
    { word: 'uno', start: 0, end: 0.4, sentenceEnd: true },
    { word: 'dos', start: 1.001, end: 1.01, sentenceEnd: true },
    { word: 'tres', start: 1.015, end: 1.5, sentenceEnd: true },
    { word: 'cuatro', start: 2.013, end: 2.5, sentenceEnd: true },
    { word: 'cinco', start: 2.53, end: 2.9 },
  ]
  const sentences = detectSentences(words, 3)
  assert.deepEqual(shape(sentences), [
    [0, 1, 'uno', 0, 0],
    [1, 2, 'dos tres', 1, 2],
    [2, 2.52, 'cuatro', 3, 3],
    [2.52, 3, 'cinco', 4, 4],
  ])
  for (const sentence of sentences.slice(1))
    assert.ok(onFrame(sentence.startSeconds), String(sentence.startSeconds))
  // El fin de la última palabra no va al cuadro (2,9 s, no 2,92) y, en la
  // frase unida, es el de «tres» (1,5), no el de «dos».
  assert.deepEqual(
    sentences.map((sentence) => sentence.lastWordEndSeconds),
    [0.4, 1.5, 2.5, 2.9],
  )
  assertLastWordEnds(sentences, words)
})

test('foco 1: una narración vieja sin puntuación y con una sola pausa larga da frases de 15 s o menos, contiguas de 0 al final', () => {
  // 30 palabras, 1,25 s de silencio y otras 30; el audio dura 31,2 s.
  const words = wordsAt([...halfSeconds(30), ...halfSeconds(30, 16.2)])
  const sentences = detectSentences(words, 31.2)
  assert.deepEqual(
    sentences.map(({ startSeconds, endSeconds, wordFrom, wordTo }) => [
      startSeconds,
      endSeconds,
      wordFrom,
      wordTo,
    ]),
    [
      [0, 8, 0, 15],
      [8, 16.2, 16, 29],
      [16.2, 31.2, 30, 59],
    ],
  )
  for (let index = 1; index < sentences.length; index++)
    assert.equal(sentences[index].startSeconds, sentences[index - 1].endSeconds)
  assertLastWordEnds(sentences, words)
})

test('sin palabras no hay frases; un fin de audio roto o menor que la última palabra no la corta', () => {
  assert.deepEqual(detectSentences([], 10), [])
  const one = [{ word: 'hola', start: 0.2, end: 1.4 }]
  assert.deepEqual(shape(detectSentences(one, Number.NaN)), [
    [0, 1.4, 'hola', 0, 0],
  ])
  assert.deepEqual(shape(detectSentences(one, 1)), [[0, 1.4, 'hola', 0, 0]])
})

test('la cola del audio: una palabra recortada al fin del audio no deja una frase vacía y una palabra con un silencio largo detrás no se parte', () => {
  // La transcripción recorta la palabra que se pasa del audio: empieza y
  // termina en el fin (2 s). Su frase se une a la anterior.
  const clipped = [
    { word: 'uno', start: 0, end: 1, sentenceEnd: true },
    { word: 'dos', start: 2, end: 2, sentenceEnd: true },
  ]
  const merged = detectSentences(clipped, 2)
  assert.deepEqual(shape(merged), [[0, 2, 'uno dos', 0, 1]])
  assertLastWordEnds(merged, clipped)
  // La misma palabra detrás de la pausa más larga de una frase de 25 s: el
  // corte en esa pausa caería en el fin del audio y dejaría una frase vacía.
  const tail = [
    ...wordsAt(halfSeconds(40)),
    { word: 'w40', start: 25, end: 25 },
  ]
  const sentences = detectSentences(tail, 25)
  assert.equal(sentences[0].startSeconds, 0)
  assert.equal(sentences[0].wordFrom, 0)
  assert.equal(sentences.at(-1).endSeconds, 25)
  assert.equal(sentences.at(-1).wordTo, 40)
  for (const [index, sentence] of sentences.entries()) {
    assert.ok(
      sentence.endSeconds > sentence.startSeconds,
      JSON.stringify(sentence),
    )
    if (index === 0) continue

    assert.equal(sentence.startSeconds, sentences[index - 1].endSeconds)
    assert.equal(sentence.wordFrom, sentences[index - 1].wordTo + 1)
  }
  assertLastWordEnds(sentences, tail)
  // Una sola palabra y 30 s de audio: no hay dónde partirla. La frase llega
  // al fin del audio y su última palabra termina a los 1,4 s: el silencio
  // de después queda adentro de la frase (el planificador lo recorta).
  const one = [{ word: 'hola', start: 0.2, end: 1.4 }]
  const alone = detectSentences(one, 30)
  assert.deepEqual(shape(alone), [[0, 30, 'hola', 0, 0]])
  assert.equal(alone[0].lastWordEndSeconds, 1.4)
})

// Simula la respuesta de Deepgram con esas palabras crudas y devuelve lo que
// guarda words.json.
function transcribeRaw(t, rawWords) {
  mockFetch(t, async () => {
    return new Response(
      JSON.stringify({
        results: { channels: [{ alternatives: [{ words: rawWords }] }] },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  return transcribeWithDeepgram(Buffer.from('mp3'), 'fake-key')
}

// Una palabra cruda por segundo con esas `punctuated_word`.
function rawWordsFrom(punctuatedWords) {
  return punctuatedWords.map((punctuatedWord, index) => ({
    word: `p${index}`,
    start: index,
    end: index + 0.5,
    punctuated_word: punctuatedWord,
  }))
}

// Cuáles palabras de words.json cierran frase.
const sentenceEnds = (words) => words.map((word) => word.sentenceEnd === true)

test('Deepgram: . ? ! … cierran frase aunque detrás vengan uno o varios cierres de comillas o paréntesis; un punto interno, una coma o un valor que no es texto no', async (t) => {
  const closing = [
    'sí.)',
    'fin.»',
    'fin.”',
    'fin.’',
    "fin.'",
    'ok.]',
    'ok.")',
    '¡no!)',
    'bueno…"',
    'dijo."',
  ]
  const open = [
    'Sr.,',
    '3.5',
    'etc.,',
    'hola,"',
    '(hola',
    '¿Qué',
    'a.b',
    'bien;',
  ]
  // RegExp.test convierte un array en texto (['fin.'] → 'fin.'): solo un texto
  // cierra frase.
  const notText = [
    ['fin.'],
    [['fin.']],
    ['a', 'fin.'],
    null,
    5,
    true,
    { text: 'fin.' },
  ]
  const words = await transcribeRaw(
    t,
    rawWordsFrom([...closing, ...open, ...notText]),
  )
  assert.deepEqual(sentenceEnds(words), [
    ...closing.map(() => true),
    ...open.map(() => false),
    ...notText.map(() => false),
  ])
})

test('Deepgram en ja/zh: 。！？｡ cierran frase sin espacio detrás, también con 」』）】 después; una 、 o una 。 interna no', async (t) => {
  const closing = [
    'です。',
    'ですか？',
    'すごい！',
    '好的。',
    '你好吗？',
    '太好了！',
    'ｱｲｳ｡',
    '行きます。」',
    '言った。』',
    '終わり。）',
    '完了。】',
    '好了！」',
  ]
  const open = [
    'こんにちは、',
    '你好，',
    '好的、',
    '「はい',
    '（好',
    '今日は',
    'あ。い',
  ]
  const words = await transcribeRaw(t, rawWordsFrom([...closing, ...open]))
  assert.deepEqual(sentenceEnds(words), [
    ...closing.map(() => true),
    ...open.map(() => false),
  ])
})

test('una narración en japonés con puntuación se parte en sus frases en vez de caer al modo por pausas', async (t) => {
  // Respuesta simulada (no se comprobó con Deepgram real qué devuelve para
  // ja/zh): habla corrida, sin una pausa de 0,35 s; solo el 。 y el ！ separan
  // las frases. Sin la marca saldría una sola frase de 3,2 s.
  const words = await transcribeRaw(t, [
    { word: '今日', start: 0, end: 0.4, punctuated_word: '今日' },
    { word: 'は', start: 0.4, end: 0.5, punctuated_word: 'は' },
    { word: '天気', start: 0.5, end: 0.9, punctuated_word: '天気' },
    { word: 'が', start: 0.9, end: 1, punctuated_word: 'が' },
    { word: 'いい', start: 1, end: 1.3, punctuated_word: 'いい' },
    { word: 'です', start: 1.3, end: 1.7, punctuated_word: 'です。' },
    { word: '散歩', start: 1.8, end: 2.2, punctuated_word: '散歩' },
    { word: 'に', start: 2.2, end: 2.3, punctuated_word: 'に' },
    { word: '行き', start: 2.3, end: 2.6, punctuated_word: '行き' },
    { word: 'ましょう', start: 2.6, end: 3.2, punctuated_word: 'ましょう！' },
  ])
  const sentences = detectSentences(words, 3.2)
  assert.deepEqual(
    sentences.map(({ startSeconds, endSeconds, wordFrom, wordTo }) => [
      startSeconds,
      endSeconds,
      wordFrom,
      wordTo,
    ]),
    [
      [0, 1.8, 0, 5],
      [1.8, 3.2, 6, 9],
    ],
  )
  assertLastWordEnds(sentences, words)
})

test('con puntuación: una sola palabra con sentenceEnd (la última) ya pone el modo con puntuación y la pausa sin punto no corta', () => {
  // Entre w9 (termina en 4,95) y w10 (5,5) hay 0,55 s de silencio: en el modo
  // por pausas cortaría ahí.
  const starts = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5.5, 6]
  const words = wordsAt(starts, [11])
  const sentences = detectSentences(words, 6.5)
  assert.deepEqual(shape(sentences), [[0, 6.5, wordsText(0, 11), 0, 11]])
  assertLastWordEnds(sentences, words)
})

// 40 palabras cada 0,5 s y 0,25 s más de silencio detrás de la palabra
// `gapAfter`: una frase de 20 s cuya pausa más larga está en un extremo del
// tramo (tras la primera, la segunda o la tercera palabra, o antes de la
// penúltima o de la última) tiene que cortar ahí.
for (const gapAfter of [0, 1, 2, 37, 38]) {
  test(`la pausa más larga se busca en todo el tramo: una frase de 20 s se parte tras la palabra ${gapAfter}`, () => {
    const starts = Array.from(
      { length: 40 },
      (_, index) => index * 0.5 + (index > gapAfter ? 0.25 : 0),
    )
    const words = wordsAt(starts)
    const sentences = detectSentences(words, starts[39] + 0.45)
    assert.ok(
      sentences.some(
        (sentence, index) =>
          sentence.wordTo === gapAfter &&
          sentences[index + 1]?.wordFrom === gapAfter + 1,
      ),
      JSON.stringify(shape(sentences)),
    )
    assertLastWordEnds(sentences, words)
  })
}

test('un fin de audio infinito se descarta como el NaN y no deja una frase infinita', () => {
  const one = [{ word: 'hola', start: 0.2, end: 1.4 }]
  assert.deepEqual(shape(detectSentences(one, Number.POSITIVE_INFINITY)), [
    [0, 1.4, 'hola', 0, 0],
  ])
})

test('una frase de 25 s con la última palabra recortada al fin del audio se parte por otro corte y queda en frases de 15 s o menos', () => {
  // La pausa más larga (5,05 s) precede a w40, que la transcripción recortó al
  // fin del audio: ese corte caería en el fin y no sirve, pero hay otros que sí.
  const words = [
    ...wordsAt(halfSeconds(40)),
    { word: 'w40', start: 25, end: 25 },
  ]
  const sentences = detectSentences(words, 25)
  assert.deepEqual(
    sentences.map(({ startSeconds, endSeconds, wordFrom, wordTo }) => [
      startSeconds,
      endSeconds,
      wordFrom,
      wordTo,
    ]),
    [
      [0, 12.52, 0, 24],
      [12.52, 25, 25, 40],
    ],
  )
  assertLastWordEnds(sentences, words)
})

test('dos palabras en el mismo cuadro al inicio del tramo: el corte que no avanza se salta y la frase de 20 s se parte por otro', () => {
  // w0 dura 0 s y w1 empieza a 0,01 s: la pausa más larga (0,01 s, las demás
  // son de 0) precede a w1, pero su frontera cae en el cuadro 0, donde empieza
  // el tramo, y dejaría una frase vacía.
  const words = [
    { word: 'w0', start: 0, end: 0 },
    ...Array.from({ length: 40 }, (_, index) => ({
      word: `w${index + 1}`,
      start: index === 0 ? 0.01 : index * 0.5,
      end: (index + 1) * 0.5,
    })),
  ]
  const sentences = detectSentences(words, 20)
  assert.deepEqual(
    sentences.map(({ startSeconds, endSeconds, wordFrom, wordTo }) => [
      startSeconds,
      endSeconds,
      wordFrom,
      wordTo,
    ]),
    [
      [0, 10, 0, 20],
      [10, 20, 21, 40],
    ],
  )
  assertLastWordEnds(sentences, words)
})

test('con el fin del audio fuera de la grilla de cuadros, una palabra recortada en su último cuadro se une a la frase anterior y ninguna frase dura 0 cuadros', () => {
  const frames = (sentence) =>
    Math.round(sentence.endSeconds * 25) -
    Math.round(sentence.startSeconds * 25)
  const spans = (sentences) =>
    sentences.map(({ startSeconds, endSeconds, wordFrom, wordTo }) => [
      startSeconds,
      endSeconds,
      wordFrom,
      wordTo,
    ])
  // El audio dura 25,01 s: su último cuadro empieza a los 25 s. La
  // transcripción recortó w40 a 25,01 y la pausa de 5 s antes la dejaría como
  // frase propia de 25 a 25,01 (10 ms, 0 cuadros en el render). Unida a la
  // anterior, esa pausa tampoco sirve para partir la frase de 25 s: se parte
  // por el centro (12,5 s, que al cuadro es 12,52).
  const clippedWords = [
    ...wordsAt(halfSeconds(40)),
    { word: 'w40', start: 25.01, end: 25.01 },
  ]
  const clipped = detectSentences(clippedWords, 25.01)
  assert.deepEqual(spans(clipped), [
    [0, 12.52, 0, 24],
    [12.52, 25.01, 25, 40],
  ])
  for (const sentence of clipped)
    assert.ok(frames(sentence) >= 1, JSON.stringify(sentence))
  assertLastWordEnds(clipped, clippedWords)

  // Con un cuadro entero antes del fin (25 a 25,03 s es el cuadro 625), la
  // palabra sigue siendo su propia frase.
  const lastFrameWords = [
    ...wordsAt(halfSeconds(40)),
    { word: 'w40', start: 25, end: 25.03 },
  ]
  const lastFrame = detectSentences(lastFrameWords, 25.03)
  assert.deepEqual(spans(lastFrame), [
    [0, 12.52, 0, 24],
    [12.52, 25, 25, 39],
    [25, 25.03, 40, 40],
  ])
  assert.equal(frames(lastFrame.at(-1)), 1)
  assertLastWordEnds(lastFrame, lastFrameWords)
})

test('fase de transcripción: la marca de Deepgram llega a words.json, también en la palabra que la fase recorta al fin del audio', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-narration-sentences-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.root, { recursive: true })
  writeNarration(paths.narrationFile, 2)
  // La última palabra termina a los 2,4 s, pasado el fin del audio: la fase la
  // recorta a la duración medida y tiene que conservar su marca.
  mockFetch(t, async () => {
    return new Response(
      JSON.stringify({
        results: {
          channels: [
            {
              alternatives: [
                {
                  words: [
                    {
                      word: 'hola',
                      start: 0.1,
                      end: 0.5,
                      punctuated_word: 'Hola,',
                    },
                    {
                      word: 'mundo',
                      start: 0.9,
                      end: 1.2,
                      punctuated_word: 'mundo.',
                    },
                    {
                      word: 'adiós',
                      start: 1.5,
                      end: 2.4,
                      punctuated_word: 'adiós.',
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  const metadata = {
    id: 'fixture',
    name: 'Fixture',
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    state: 'generating',
    options: {
      styleId: 'cartoon',
      sceneCount: 0,
      narrationMode: 'tts',
      imageProvider: 'fal',
      useBgm: false,
      useOverlay: false,
      confirmScenes: false,
    },
    completedStages: ['voice'],
  }
  await transcriptionStage.run({
    job: {
      jobId: 'narration-sentences',
      projectsRoot: root,
      apiKeys: { deepgram: 'fake-key' },
      binaryPaths: { ffmpeg: FFMPEG },
      payload: {},
    },
    signal: new AbortController().signal,
    emitter: { emit() {} },
    paths,
    metadata,
    options: metadata.options,
    async saveMetadata() {
      await writeFile(paths.metadataFile, JSON.stringify(metadata))
    },
  })

  const audioSeconds = metadata.audioDurationSeconds
  assert.ok(audioSeconds > 1.5 && audioSeconds < 2.4, String(audioSeconds))
  const words = JSON.parse(await readFile(paths.wordsFile, 'utf8'))
  assert.deepEqual(words, [
    { word: 'hola', start: 0.1, end: 0.5 },
    { word: 'mundo', start: 0.9, end: 1.2, sentenceEnd: true },
    { word: 'adiós', start: 1.5, end: audioSeconds, sentenceEnd: true },
  ])
  // Y las frases salen de la puntuación, no de las pausas: la de 0,4 s después
  // de «Hola,» no corta (es una coma) y la de 0,3 s antes de «adiós» sí, por el
  // punto de «mundo.». Por pausas saldría «hola» y «mundo adiós».
  const sentences = detectSentences(words, audioSeconds)
  assert.deepEqual(shape(sentences), [
    [0, 1.52, 'hola mundo', 0, 1],
    [1.52, audioSeconds, 'adiós', 2, 2],
  ])
  // La palabra recortada al fin del audio cierra su frase en ese fin.
  assertLastWordEnds(sentences, words)
  assert.equal(sentences[1].lastWordEndSeconds, audioSeconds)
})

test('centinela: al terminar, fetch vuelve a ser el real', () => {
  assert.equal(globalThis.fetch.mock, undefined)
})
