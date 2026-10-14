// El corte exacto de una aparición del avatar y los límites de su duración
// (entrega 2g, diseño §23.2 y §23.3). `avatarCutEnd` corta en el fin de frase o
// la pausa de 0,25 s o más más cercana a inicio + segundos elegidos si está a
// 0,5 s o menos y, si no, en el hueco entre dos palabras más cercano (con
// empate, el natural: R-2g-12): siempre en el inicio de la palabra que sigue, al
// cuadro de 25 fps, estrictamente después del inicio y a lo sumo en el límite,
// que también es un corte, y natural, si no cae adentro de una palabra (entre
// dos palabras o después de la última, R-2g-11); en cualquier otro empate, el
// primero, y sin ningún corte, undefined. `avatarCutLimit` arma ese límite: la
// última palabra antes de la primera pausa de más de 2 s (o 6) más ese tope (o
// la cola que se le pida, R-2g-17), o la última del audio más el tope, al
// cuadro hacia abajo, o el máximo si llega antes (R-2g-11).
// `avatarResizeLimits` da de cuántos a cuántos segundos enteros puede durar una
// escena de avatar en su lugar (60 s, la próxima de avatar menos 3 s, la
// primera escena bloqueada que la sigue, el fin del audio; si la que la sigue
// está bloqueada, o si es la última del video (R-2g-18), no se achica ni
// crece), `avatarResizeCoveredScenes`, cuántas escenas de imagen taparía
// (ninguna con segundos que no son un número), y `scenesAfter`, las que vienen
// después (la comparte el cambio de duración). Cada tolerancia (TIME_EPSILON,
// en segundos) tiene su caso con ruido de coma flotante. Los dos módulos son
// puros y browser-safe (los usa la UI): importa el código real, sin disco ni
// red, y mira que no importen nada de `node:`.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  avatarCutEnd,
  avatarCutLimit,
} from '../../pipeline/avatar/appearance-cut.ts'
import {
  avatarResizeCoveredScenes,
  avatarResizeLimits,
  scenesAfter,
} from '../../pipeline/avatar/resize-limits.ts'
import {
  AVATAR_CUT_NATURAL_PAUSE_SECONDS,
  AVATAR_CUT_PAUSE_WINDOW_SECONDS,
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MAX_PAUSE_SECONDS,
  AVATAR_MIN_APPEARANCE_SECONDS,
  AVATAR_OPENING_MAX_PAUSE_SECONDS,
} from '../../pipeline/types/avatar.ts'

// Palabras de 0,4 s desde `from`, una cada `every` segundos (0,5 por defecto:
// huecos de 0,1 s, que no son naturales). `ends` marca, por índice, las que
// cierran frase. Con palabras cada 0,5 s, los huecos caen en los segundos
// enteros y en los x,52 (el cuadro de x,5).
function wordsFrom(from, count, { every = 0.5, ends = [] } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    word: `w${index}`,
    start: from + index * every,
    end: from + index * every + 0.4,
    ...(ends.includes(index) ? { sentenceEnd: true } : {}),
  }))
}

const cut = (words, startSeconds, targetSeconds, limitSeconds = 1000) =>
  avatarCutEnd(words, { startSeconds, targetSeconds, limitSeconds })

// Los tiempos y las marcas de fin de frase de las palabras 11 a 18 de la
// narración de «Video-3-avatar» del dueño (R-2g-9: palabras neutras, sin su
// texto). La 13 cierra la primera frase («…durante una hora.», 3,92–4,42) y
// las dos que siguen son las que el dueño oyó de más (4,72–4,96 y 4,96–5,36).
const VIDEO_3_EXCERPT = [
  [3.4399998, 3.6799998],
  [3.6799998, 3.9199998],
  [3.9199998, 4.42, true],
  [4.72, 4.96],
  [4.96, 5.3599997],
  [5.3599997, 5.6],
  [5.6, 6.1],
  [6.3999996, 6.56],
].map(([start, end, sentenceEnd], index) => ({
  word: `w${index + 11}`,
  start,
  end,
  ...(sentenceEnd ? { sentenceEnd: true } : {}),
}))

test('el caso real (R-2g-9): con 5 s elegidos desde 0 corta a los 4,72 s, en el fin de frase, y no en el hueco de los 4,96 s, más cercano', () => {
  assert.deepEqual(
    [AVATAR_CUT_PAUSE_WINDOW_SECONDS, AVATAR_CUT_NATURAL_PAUSE_SECONDS],
    [0.5, 0.25],
  )
  assert.equal(cut(VIDEO_3_EXCERPT, 0, 5, 10.32), 4.72)
  // Sin la marca de fin de frase, la pausa de 0,3 s antes de la palabra que
  // sigue también lo hace natural: el mismo corte.
  const unmarked = VIDEO_3_EXCERPT.map(({ word, start, end }) => ({
    word,
    start,
    end,
  }))
  assert.equal(cut(unmarked, 0, 5, 10.32), 4.72)
  // Sin ningún natural cerca (la pausa de 0,3 s pasa a 0,1 y sin la marca),
  // gana el hueco más cercano.
  const tight = unmarked.map((word) => {
    if (word.start !== 4.72) return word

    return { ...word, start: 4.52 }
  })
  assert.equal(cut(tight, 0, 5, 10.32), 4.96)
})

test('regla 1: el natural más cercano gana si está a 0,5 s o menos del objetivo; a un cuadro más, gana el hueco más cercano', () => {
  // La palabra 9 (4,5–4,9 s) cierra frase: su corte natural cae en los 5 s.
  const words = wordsFrom(0, 30, { ends: [9] })
  assert.equal(cut(words, 0, 5.5), 5)
  assert.equal(cut(words, 0, 4.5), 5)
  // A 0,52 s el natural ya no gana: el hueco más cercano.
  assert.equal(cut(words, 0, 5.52), 5.52)
  assert.equal(cut(words, 0, 4.48), 4.52)
  // Con el ruido de coma flotante, medio segundo justo sigue contando: el fin
  // de frase de los 2,28 s contra el objetivo 0,08 + 2,7.
  assert.ok(0.08 + 2.7 - 2.28 > 0.5, 'precondición del ruido')
  const noisy = [
    { word: 'a', start: 0.1, end: 1 },
    { word: 'b', start: 1.1, end: 2, sentenceEnd: true },
    { word: 'c', start: 2.28, end: 2.7 },
    { word: 'd', start: 2.72, end: 3.2 },
    { word: 'e', start: 3.24, end: 4 },
  ]
  assert.equal(cut(noisy, 0.08, 2.7), 2.28)
})

test('natural: un fin de frase o una pausa de 0,25 s o más entre las dos palabras; con 0,24 s, no', () => {
  // Diez palabras hasta los 4,9 s, una pausa y diez más cada 0,5 s.
  const withPause = (pause) => [
    ...wordsFrom(0, 10),
    ...wordsFrom(4.9 + pause, 10).map((word, index) => ({
      ...word,
      word: `b${index}`,
    })),
  ]
  // Con 0,25 s la palabra que sigue arranca a los 5,15 (cuadro de 5,16) y ese
  // corte natural, a 0,44 s del objetivo 5,6, le gana al hueco de los 5,64.
  assert.equal(cut(withPause(AVATAR_CUT_NATURAL_PAUSE_SECONDS), 0, 5.6), 5.16)
  // Con 0,24 s (la palabra arranca a los 5,14, el mismo cuadro), no es natural.
  assert.equal(cut(withPause(0.24), 0, 5.6), 5.64)
})

test('natural: una pausa de 0,25 s con ruido de coma flotante (0,35 − 0,1 = 0,24999999999999997) sigue siendo natural', () => {
  const words = [
    { word: 'a', start: 0, end: 0.1 },
    { word: 'b', start: 0.35, end: 0.75 },
    { word: 'c', start: 0.85, end: 1.25 },
    { word: 'd', start: 1.35, end: 1.75 },
  ]
  assert.ok(
    0.35 - 0.1 < AVATAR_CUT_NATURAL_PAUSE_SECONDS,
    'precondición del ruido',
  )
  // El natural (0,36, a 0,48 s del objetivo) le gana al hueco de los 0,84.
  assert.equal(cut(words, 0, 0.84), 0.36)
})

test('con empate en la regla 2 gana el natural (R-2g-12); entre dos naturales o entre dos huecos, el primero', () => {
  // El objetivo (5 s) cae en la pausa de 0,8 s que sigue al fin de frase de la
  // palabra «b»: el hueco antes de «b» (4,4) y el fin de frase (5,6) quedan a
  // 0,6 s, afuera de la ventana. Gana el fin de frase; hasta R-2g-12 ganaba el
  // primero y «b» la decía la imagen.
  const tied = [
    { word: 'a', start: 0, end: 4.4 },
    { word: 'b', start: 4.4, end: 4.8, sentenceEnd: true },
    { word: 'c', start: 5.6, end: 6 },
    { word: 'd', start: 6, end: 9 },
  ]
  assert.equal(cut(tied, 0, 5), 5.6)
  // Con una pausa de 0,3 s antes de «b», los dos son naturales: el primero.
  const bothNatural = tied.map((word) => {
    if (word.word !== 'a') return word

    return { ...word, end: 4.1 }
  })
  assert.equal(cut(bothNatural, 0, 5), 4.4)
  // Fines de frase en las palabras 9 y 11 (cortes a los 5 y a los 6 s) y el
  // objetivo en el medio: los dos naturales, gana el primero.
  assert.equal(cut(wordsFrom(0, 30, { ends: [9, 11] }), 0, 5.5), 5)
  // Palabras de 0,95 s cada 1 s (huecos de 0,05 s, ninguno natural): los
  // huecos de los 5 y de los 6 s quedan a medio segundo de 5,5.
  const spaced = wordsFrom(0, 20, { every: 1 }).map((word) => ({
    ...word,
    end: word.start + 0.95,
  }))
  assert.equal(cut(spaced, 0, 5.5), 5)
})

test('el empate de R-2g-12 resiste el ruido: 3,92 y 5,12 están a 0,6 s de 4,52 (0,5999999999999996 y 0,6000000000000005)', () => {
  const words = [
    { word: 'a', start: 0, end: 3.75 },
    { word: 'b', start: 3.92, end: 4.9, sentenceEnd: true },
    { word: 'c', start: 5.12, end: 9 },
    { word: 'd', start: 9.1, end: 10 },
  ]
  assert.ok(
    Math.abs(5.12 - 4.52) > Math.abs(4.52 - 3.92),
    'precondición del ruido',
  )
  // Gana el fin de frase: si no, «b» la diría la imagen.
  assert.equal(cut(words, 0, 4.52), 5.12)
})

test('entre dos huecos gana el primero aunque el ruido muestre al segundo más cerca: 3,4 y 4,6 a 0,6 s de 4', () => {
  const words = [
    { word: 'a', start: 0, end: 3.3 },
    { word: 'b', start: 3.4, end: 4.5 },
    { word: 'c', start: 4.6, end: 9 },
    { word: 'd', start: 9.1, end: 9.5 },
  ]
  assert.ok(Math.abs(4.6 - 4) < Math.abs(4 - 3.4), 'precondición del ruido')
  assert.equal(cut(words, 0, 4), 3.4)
})

test('el corte cae en el inicio de la palabra que sigue, llevado al cuadro de 25 fps', () => {
  const words = [
    { word: 'a', start: 0, end: 4.9 },
    { word: 'b', start: 5.013, end: 5.4 },
    { word: 'c', start: 5.43, end: 9 },
  ]
  // 5,013 s es el cuadro 125,3 (5 s); 5,43, el 135,75 (5,44 s).
  assert.equal(cut(words, 0, 5), 5)
  assert.equal(cut(words, 0, 5.45), 5.44)
})

test('estrictamente después del inicio y a lo sumo en el límite: un natural justo después del límite no gana, y un corte en el inicio no cuenta', () => {
  // La palabra 11 (5,5–5,9 s) cierra frase: su corte natural cae en los 6 s.
  const words = wordsFrom(0, 30, { ends: [11] })
  assert.equal(cut(words, 0, 5.5, 6), 6)
  // Con el límite en 5,8 (adentro de esa palabra) ese natural no entra: gana el
  // hueco más cercano.
  assert.equal(cut(words, 0, 5.5, 5.8), 5.52)
  // Con el límite antes del objetivo, el último hueco que entra.
  assert.equal(cut(words, 0, 10, 3.3), 3)
  // El inicio (5 s, un hueco) no es un corte: el primero es el de 5,52.
  assert.equal(cut(words, 5, 0.1), 5.52)
})

test('el límite es un corte, y natural, si no cae adentro de una palabra (R-2g-11): entre dos palabras o después de la última, como el fin del audio', () => {
  // Diez palabras hasta los 4,9 s y el audio hasta los 5,6.
  const words = wordsFrom(0, 10)
  assert.equal(cut(words, 0, 60, 5.6), 5.6)
  // A 0,45 s del objetivo y natural, el fin le gana al hueco de los 4,52.
  assert.equal(cut(words, 0, 5.15, 5.6), 5.6)
  // A 0,6 s ya no: gana el hueco más cercano, antes de la última palabra.
  assert.equal(cut(words, 0, 5, 5.6), 4.52)
  // Un límite después de la última palabra también es un corte (el silencio
  // final que arma avatarCutLimit).
  assert.equal(cut(words, 0, 60, 6.9), 6.9)
  // Con la última palabra pasando el límite, el límite no es un corte.
  assert.equal(cut(words, 0, 60, 4.8), 4.52)
  // Entre dos palabras (2,45 s, entre la que termina a los 2,4 y la que
  // empieza a los 2,5) también es un corte natural; adentro de una (2,6), no.
  const thirty = wordsFrom(0, 30)
  assert.equal(cut(thirty, 0, 2.5, 2.45), 2.45)
  assert.equal(cut(thirty, 0, 2.5, 2.6), 2.52)
  // Justo en el fin de una palabra, también.
  assert.equal(cut(thirty, 0, 60, 2.4), 2.4)
})

// Un límite en el inicio de una escena cae en el cuadro del inicio de una
// palabra, que en words.json llega con ruido (3,9199998 por 3,92).
test('el límite justo en el inicio de una palabra, con el ruido de words.json, cae entre dos palabras: es un corte natural', () => {
  const words = [
    { word: 'a', start: 0, end: 3, sentenceEnd: true },
    { word: 'b', start: 3.6, end: 3.85 },
    { word: 'c', start: 3.9199998, end: 5 },
    { word: 'd', start: 5.1, end: 6 },
  ]
  assert.ok(3.9199998 < 3.92, 'precondición del ruido')
  // El límite (3,92, a 0,08 s del objetivo) es natural y le gana al fin de
  // frase de los 3,6, que también está en la ventana.
  assert.equal(cut(words, 0, 4, 3.92), 3.92)
})

test('sin ningún corte, undefined: sin palabras, con una sola palabra que pasa el límite, con el inicio después de todo, con el límite adentro de la primera palabra o antes de ella', () => {
  assert.equal(cut([], 0, 5, 10), undefined)
  assert.equal(cut([{ word: 'a', start: 0, end: 12 }], 0, 5, 10), undefined)
  const words = wordsFrom(0, 10)
  assert.equal(cut(words, 6, 5, 6), undefined)
  assert.equal(cut(words, 0, 5, 0.3), undefined)
  // Antes de la primera palabra el límite no es un corte (no hay ninguna antes).
  assert.equal(cut(wordsFrom(1, 10), 0, 5, 0.8), undefined)
})

test('avatarCutLimit (R-2g-11): la última palabra antes de la primera pausa de más de 2 s más 2, al cuadro hacia abajo; sin una pausa así, el silencio final; el máximo si llega antes', () => {
  assert.deepEqual(
    [AVATAR_MAX_PAUSE_SECONDS, AVATAR_OPENING_MAX_PAUSE_SECONDS],
    [2, 6],
  )
  // Diez palabras hasta los 5 s, una pausa de 3,1 s y diez más hasta los 13.
  const words = [...wordsFrom(0.1, 10), ...wordsFrom(8.1, 10)]
  assert.equal(avatarCutLimit(words, 0, 60), 7)
  assert.equal(avatarCutLimit(words, 0, 60, AVATAR_MAX_PAUSE_SECONDS), 7)
  // Con 6 s la pausa no corta: el silencio final (13 + 6).
  assert.equal(avatarCutLimit(words, 0, 60, 6), 19)
  // El máximo, si llega antes.
  assert.equal(avatarCutLimit(words, 0, 6), 6)
  assert.equal(avatarCutLimit(words, 0, 7.5), 7)
  // Desde la palabra que sigue a la pausa, esa pausa no cuenta: el silencio
  // final (13 + 2).
  assert.equal(avatarCutLimit(words, 8.1, 60), 15)
  // Una pausa que ya venía de antes del inicio cuenta desde el inicio.
  assert.equal(avatarCutLimit(words, 6, 60), 8)
  // Una pausa de 2 s justos no corta: el silencio final, 11,9 + 2 al cuadro
  // hacia abajo (13,88).
  const atLimit = [...wordsFrom(0.1, 10), ...wordsFrom(7, 10)]
  assert.equal(avatarCutLimit(atLimit, 0, 60), 13.88)
  // El silencio inicial (de 0 a la primera palabra, a los 7,1 s) no cuenta.
  assert.equal(avatarCutLimit(wordsFrom(7.1, 10), 0, 60), 14)
  // Sin palabras, el máximo.
  assert.equal(avatarCutLimit([], 0, 60), 60)
})

test('avatarCutLimit: el cuadro hacia abajo resiste el ruido ((0,32 + 2) × 25 = 57,99999999999999), con TIME_EPSILON en segundos', () => {
  assert.ok((0.32 + 2) * 25 < 58, 'precondición del ruido')
  assert.equal(
    avatarCutLimit([{ word: 'a', start: 0.1, end: 0.32 }], 0, 60),
    2.32,
  )
  // La tolerancia es de 1e-6 s también al pasar a cuadros: un fin de palabra
  // medio microsegundo antes de los 0,32 s cuenta como 0,32.
  assert.equal(
    avatarCutLimit([{ word: 'a', start: 0.1, end: 0.32 - 5e-7 }], 0, 60),
    2.32,
  )
})

// R-2g-17: el segundo intento de la apertura detecta las pausas de más de 6 s
// pero las corta con la cola de 2, como cualquier aparición. El silencio final
// se mide hasta el máximo: con el tope y la cola iguales da lo mismo que
// tomarlo infinito, y con 6 s de tope carga el que no pasa los 6.
test('avatarCutLimit con una cola distinta del tope (R-2g-17): detecta las pausas de más de 6 s y corta 2 s después de la palabra; el silencio final se mide hasta el máximo', () => {
  // Diez palabras hasta los 5 s, 8,1 s de pausa y diez más desde los 13,1.
  const eightSeconds = [...wordsFrom(0.1, 10), ...wordsFrom(13.1, 10)]
  assert.equal(avatarCutLimit(eightSeconds, 0, 60, 6, 2), 7)
  // Con la cola por omisión (el mismo tope), 5 + 6.
  assert.equal(avatarCutLimit(eightSeconds, 0, 60, 6), 11)
  // La pausa de 3,1 s no pasa los 6: el silencio final (desde los 13), con la
  // cola de 2.
  const threeSeconds = [...wordsFrom(0.1, 10), ...wordsFrom(8.1, 10)]
  assert.equal(avatarCutLimit(threeSeconds, 0, 60, 6, 2), 15)
  // Hasta un máximo de 18 el silencio final mide 5 s y se carga; hasta 20, 7.
  assert.equal(avatarCutLimit(threeSeconds, 0, 18, 6, 2), 18)
  assert.equal(avatarCutLimit(threeSeconds, 0, 20, 6, 2), 15)
  // Con el tope y la cola de 2 (las demás apariciones y el editor): diez
  // palabras hasta los 4,9 s; hasta 6,5 el silencio final mide 1,6 s y el
  // límite es el máximo; hasta 8, la palabra más 2 (6,88 al cuadro).
  assert.equal(avatarCutLimit(wordsFrom(0, 10), 0, 6.5), 6.5)
  assert.equal(avatarCutLimit(wordsFrom(0, 10), 0, 8), 6.88)
})

// Un words.json editado a mano o dañado: una palabra sin tiempos no abre un
// silencio ni deja un límite NaN (el silencio que la atraviesa no se ve:
// límite deliberado, como en el corte).
test('avatarCutLimit con tiempos que no son números: sin NaN', () => {
  const broken = [
    { word: 'a', start: 0, end: 1 },
    { word: 'roto', start: Number.NaN, end: Number.NaN },
    { word: 'c', start: 6, end: 7 },
  ]
  assert.equal(avatarCutLimit(broken, 0, 60), 9)
  assert.equal(
    avatarCutLimit([{ word: 'a', start: 0, end: Number.NaN }], 0, 60),
    60,
  )
})

// Un words.json editado a mano o dañado (la fase no valida cada palabra) no
// puede dejar un corte NaN.
test('tiempos que no son números no dan cortes (nunca NaN), sin la última palabra entera el límite no es un corte, y las palabras no se tocan', () => {
  const words = wordsFrom(0, 20)
  words[10] = { word: 'roto', start: Number.NaN, end: Number.NaN }
  const before = structuredClone(words)
  // El hueco de la palabra rota no existe y el que la sigue no es natural.
  assert.equal(cut(words, 0, 5), 4.52)
  assert.equal(cut(words, 0, 5.4), 5.52)
  assert.deepEqual(words, before)
  assert.equal(
    cut([{ word: 'a', start: 0, end: Number.NaN }], 0, 5, 10),
    undefined,
  )
})

// La búsqueda binaria del primer hueco no puede saltear cortes: contra la regla
// recorriendo todas las palabras, sobre narraciones al azar (semilla fija).
test('el mismo corte que la regla recorriendo todas las palabras, en 2000 casos al azar', () => {
  const random = mulberry32(2026)
  for (let round = 0; round < 2000; round++) {
    const words = []
    let time = random() * 2
    for (let index = 0; index < 60; index++) {
      const length = 0.1 + random() * 0.5
      words.push({
        word: `w${index}`,
        start: time,
        end: time + length,
        ...(random() < 0.1 ? { sentenceEnd: true } : {}),
      })
      time += length + (random() < 0.2 ? random() * 1.5 : random() * 0.1)
    }
    const startSeconds = random() * time
    const targetSeconds = random() * 20
    const limitSeconds = startSeconds + random() * 25
    const label = JSON.stringify({ round, startSeconds, targetSeconds })
    assert.equal(
      cut(words, startSeconds, targetSeconds, limitSeconds),
      linearCut(words, startSeconds, targetSeconds, limitSeconds),
      label,
    )
  }
})

test('browser-safe: appearance-cut.ts y resize-limits.ts no importan nada de node:', async () => {
  for (const file of ['appearance-cut.ts', 'resize-limits.ts']) {
    const source = await readFile(`pipeline/avatar/${file}`, 'utf8')
    assert.doesNotMatch(source, /from 'node:/, file)
  }
})

// ─── Los límites de la duración desde el editor (§23.3) ───

// Una escena para los límites: tramo, si es de avatar y si está bloqueada.
const scene = (id, startSeconds, endSeconds, extra = {}) => ({
  id,
  startSeconds,
  endSeconds,
  isAvatar: false,
  timingLocked: false,
  ...extra,
})
const avatar = (id, startSeconds, endSeconds, extra = {}) =>
  scene(id, startSeconds, endSeconds, { isAvatar: true, ...extra })
const locked = { timingLocked: true }

test('límites: el máximo es lo primero que llega entre 60 s, la próxima de avatar menos 3 s, la primera bloqueada que la sigue y el fin del audio, en segundos enteros hacia abajo', () => {
  assert.deepEqual(
    [AVATAR_MIN_APPEARANCE_SECONDS, AVATAR_MAX_APPEARANCE_SECONDS],
    [5, 60],
  )
  // Una aparición de 10 s en 20–30 e imágenes de 10 s hasta los 200.
  const images = Array.from({ length: 17 }, (_, index) =>
    scene(index + 3, 30 + index * 10, 40 + index * 10),
  )
  const base = [scene(1, 0, 20), avatar(2, 20, 30), ...images]
  assert.deepEqual(avatarResizeLimits(base, 2, 200), {
    currentSeconds: 10,
    minSeconds: 5,
    maxSeconds: 60,
  })
  // La próxima de avatar a los 60 s: hasta los 57 (deja 3 s de imágenes).
  const nextAvatar = base.map((candidate) => {
    if (candidate.id !== 6) return candidate

    return { ...candidate, isAvatar: true }
  })
  assert.equal(avatarResizeLimits(nextAvatar, 2, 200).maxSeconds, 37)
  // La primera bloqueada que la sigue arranca a los 50,5: 30 s.
  const lockedLater = [
    ...base.filter((candidate) => candidate.id < 5),
    scene(5, 50, 50.5),
    scene(99, 50.5, 60, locked),
    ...base.filter((candidate) => candidate.id > 5),
  ]
  assert.equal(avatarResizeLimits(lockedLater, 2, 200).maxSeconds, 30)
  // Una bloqueada ANTES de la aparición no la limita.
  const lockedBefore = base.map((candidate) => {
    if (candidate.id !== 1) return candidate

    return { ...candidate, timingLocked: true }
  })
  assert.equal(avatarResizeLimits(lockedBefore, 2, 200).maxSeconds, 60)
  // El fin del audio a los 64,9: 44 s.
  assert.equal(avatarResizeLimits(base, 2, 64.9).maxSeconds, 44)
  // Gana lo primero que llega, con las escenas en cualquier orden.
  assert.equal(
    avatarResizeLimits([...nextAvatar].reverse(), 2, 64.9).maxSeconds,
    37,
  )
})

test('límites: si la escena que la sigue está bloqueada, no se achica ni crece (mínimo y máximo, lo que dura hoy redondeado); el máximo nunca baja del mínimo', () => {
  const scenes = [
    avatar(1, 0, 12.4),
    scene(2, 12.4, 20, locked),
    scene(3, 20, 40),
  ]
  assert.deepEqual(avatarResizeLimits(scenes, 1, 40), {
    currentSeconds: 12.4,
    minSeconds: 12,
    maxSeconds: 12,
  })
  // 12,6 redondea a 13, más que lo que entra (12): el máximo sube al mínimo.
  const longer = [avatar(1, 0, 12.6), scene(2, 12.6, 20, locked)]
  assert.deepEqual(avatarResizeLimits(longer, 1, 20), {
    currentSeconds: 12.6,
    minSeconds: 13,
    maxSeconds: 13,
  })
  // La próxima de avatar a los 6 s: entrarían 3 s, y el máximo sube a los 5
  // del mínimo.
  const tight = [avatar(1, 0, 4.72), scene(2, 4.72, 6), avatar(3, 6, 12)]
  assert.deepEqual(avatarResizeLimits(tight, 1, 12), {
    currentSeconds: 4.72,
    minSeconds: 5,
    maxSeconds: 5,
  })
})

test('límites: una bloqueada que no es la que sigue solo limita el máximo, no sube el mínimo', () => {
  const scenes = [
    scene(1, 0, 20),
    avatar(2, 20, 30),
    scene(3, 30, 40),
    scene(4, 40, 50, locked),
    scene(5, 50, 100),
  ]
  assert.deepEqual(avatarResizeLimits(scenes, 2, 100), {
    currentSeconds: 10,
    minSeconds: 5,
    maxSeconds: 20,
  })
})

// R-2g-18: la última escena del video no cambia de duración (lo que soltara no
// tendría imagen y alargarla pasaría el fin del audio).
test('límites: la última escena del video no se achica ni crece (R-2g-18): mínimo y máximo, lo que dura hoy redondeado', () => {
  const last = [scene(1, 0, 20), avatar(2, 20, 31.75)]
  assert.deepEqual(avatarResizeLimits(last, 2, 31.75), {
    currentSeconds: 11.75,
    minSeconds: 12,
    maxSeconds: 12,
  })
  // Aunque el fin del audio diga otra cosa, y en cualquier orden.
  assert.deepEqual(avatarResizeLimits([...last].reverse(), 2, 40), {
    currentSeconds: 11.75,
    minSeconds: 12,
    maxSeconds: 12,
  })
  // Corta (4,72 s), también se queda en lo que dura redondeado.
  assert.deepEqual(avatarResizeLimits([avatar(1, 0, 4.72)], 1, 4.72), {
    currentSeconds: 4.72,
    minSeconds: 5,
    maxSeconds: 5,
  })
})

test('límites: null si la escena no es de avatar, no existe o no tiene tiempos; el ruido de coma flotante no le quita un segundo al máximo', () => {
  const scenes = [
    scene(1, 0, 4.24),
    avatar(2, 4.24, 14.24),
    scene(3, 14.24, 80),
  ]
  assert.equal(avatarResizeLimits(scenes, 1, 80), null)
  assert.equal(avatarResizeLimits(scenes, 9, 80), null)
  assert.equal(avatarResizeLimits([avatar(1, Number.NaN, 10)], 1, 80), null)
  // 64,24 − 4,24 da 59,99999999999999 en coma flotante: cuenta como 60.
  assert.ok(64.24 - 4.24 < 60, 'precondición del ruido')
  assert.equal(avatarResizeLimits(scenes, 2, 64.24).maxSeconds, 60)
  // Un fin del audio que no es un número no limita.
  assert.equal(avatarResizeLimits(scenes, 2, Number.NaN).maxSeconds, 60)
})

test('límites: una escena de avatar sin fin numérico no tiene límites', () => {
  assert.equal(avatarResizeLimits([avatar(1, 0, Number.NaN)], 1, 80), null)
})

test('escenas tapadas: las de imagen que terminan antes del fin nuevo, más la que quedaría con menos de 3 s; más corta o igual, ninguna', () => {
  // La aparición 20–30 y escenas de imagen de 5 s desde los 30.
  const scenes = [
    scene(1, 0, 20),
    avatar(2, 20, 30),
    ...Array.from({ length: 8 }, (_, index) =>
      scene(index + 3, 30 + index * 5, 35 + index * 5),
    ),
  ]
  const covered = (seconds) => avatarResizeCoveredScenes(scenes, 2, seconds)
  assert.equal(covered(10), 0)
  assert.equal(covered(7), 0)
  // 12 s: el fin nuevo (32) le deja 3 s a la escena 30–35, que no sale.
  assert.equal(covered(12), 0)
  // 13 s: le dejaría 2, así que sale.
  assert.equal(covered(13), 1)
  // 15 s la tapa entera; 18 s, esa y la que queda con 2 s; 20 s, las dos.
  assert.equal(covered(15), 1)
  assert.equal(covered(18), 2)
  assert.equal(covered(20), 2)
  // Para en la próxima de avatar: con ella a los 40 s cuenta las dos de antes.
  const withAvatarAfter = scenes.map((candidate) => {
    if (candidate.id !== 5) return candidate

    return { ...candidate, isAvatar: true }
  })
  assert.equal(avatarResizeCoveredScenes(withAvatarAfter, 2, 40), 2)
  // La escena del final del audio que quedaría corta también sale.
  assert.equal(
    avatarResizeCoveredScenes([avatar(1, 0, 10), scene(2, 10, 14)], 1, 12),
    1,
  )
  // Una escena que no es de avatar no tapa nada.
  assert.equal(avatarResizeCoveredScenes(scenes, 1, 60), 0)
})

// Un campo vacío o una resta mal hecha no pueden decir «tapa 2 escenas» en la
// confirmación del cobro.
test('escenas tapadas: un objetivo que no es un número, o infinito, no tapa nada', () => {
  const scenes = [avatar(1, 0, 10), scene(2, 10, 20), scene(3, 20, 30)]
  assert.equal(avatarResizeCoveredScenes(scenes, 1, Number.NaN), 0)
  assert.equal(
    avatarResizeCoveredScenes(scenes, 1, Number.POSITIVE_INFINITY),
    0,
  )
})

test('scenesAfter: las que arrancan después del inicio de la escena (con TIME_EPSILON), en orden de tiempo y sin ella', () => {
  const avatarScene = avatar(2, 20, 30)
  const scenes = [
    scene(4, 40, 50),
    scene(1, 0, 20),
    avatarScene,
    scene(3, 30, 40),
    // Arranca con ella, con ruido de coma flotante: no viene después.
    scene(9, 20 + 1e-9, 25),
  ]
  assert.deepEqual(
    scenesAfter(scenes, avatarScene).map((candidate) => candidate.id),
    [3, 4],
  )
})

// ─── Ayudantes ───

// La regla de §23.2 recorriendo todas las palabras, para comparar.
function linearCut(words, startSeconds, targetSeconds, limitSeconds) {
  const goal = startSeconds + targetSeconds
  const candidates = []
  for (let index = 0; index + 1 < words.length; index++) {
    const seconds = Math.round(words[index + 1].start * 25) / 25
    if (seconds <= startSeconds + 1e-6 || seconds > limitSeconds + 1e-6)
      continue

    const natural =
      words[index].sentenceEnd === true ||
      words[index + 1].start - words[index].end >= 0.25 - 1e-6
    candidates.push({ seconds, natural })
  }
  // El límite, si no cae adentro de la última palabra que empieza antes.
  const before = words.filter((word) => word.start < limitSeconds - 1e-6)
  const lastBefore = before.at(-1)
  if (
    lastBefore &&
    lastBefore.end <= limitSeconds + 1e-6 &&
    limitSeconds > startSeconds + 1e-6
  )
    candidates.push({ seconds: limitSeconds, natural: true })

  // El más cercano; con empate, el natural (R-2g-12) y si no, el primero.
  const nearest = (list) => {
    let best
    for (const candidate of list) {
      if (!best) {
        best = candidate
        continue
      }

      const difference =
        Math.abs(candidate.seconds - goal) - Math.abs(best.seconds - goal)
      const tie = Math.abs(difference) <= 1e-6
      if (difference < -1e-6 || (tie && candidate.natural && !best.natural))
        best = candidate
    }
    return best
  }
  const natural = nearest(candidates.filter((candidate) => candidate.natural))
  if (natural && Math.abs(natural.seconds - goal) <= 0.5 + 1e-6)
    return natural.seconds

  return nearest(candidates)?.seconds
}

function mulberry32(seed) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
