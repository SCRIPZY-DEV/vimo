// Cortes alrededor del avatar (ADR-0057, entrega 2, tarea 4; diseño §6.1):
// las apariciones son pines fijos y cada carril corta solo los tramos libres
// —por segundos, por cantidad repartida por promedios mayores (mínimo una por
// tramo; la automática, lo que entra a 3 s en cada uno) y con el prefijo
// animado hasta su segundo del video, con la fuente sobrante corta unida a la
// anterior y la cantidad pedida repartida después de descontar las fuentes—;
// un tramo libre de menos de 3 s lo absorbe el avatar; ids contiguos y textos
// por punto medio. La fase `scene-cuts` pausa con `avatarSpans` (los tramos
// como quedan, con la cola corta absorbida) y una cantidad que cuenta al
// avatar, no mueve los pines al confirmar otra cantidad, emite
// `avatar-planned` con lo que no entró una vez por corrida —antes de la pausa,
// con las escenas del corte sugerido, y después de cortar—, corre aunque la
// cantidad coincida, conserva un corte con recibos o clip de HeyGen (también
// sin apariciones) y rehace uno distinto sin nada pagado; el estado del
// proyecto rearma desde el disco los tramos y las descartadas de la pausa; un
// proyecto sin avatar corta igual que antes en los tres carriles, la vista
// previa del carril de segundos cuenta los pines (también con prefijo) y
// reemplazar la narración escala el corte entero (sin tiempos previos, el
// reparto uniforme). Con el tope de silencio del avatar (entrega 2b, diseño
// §5), el silencio que queda después de un pin sale como escenas de imagen
// sin palabras (también la cola final de 3 s o más) y, con apariciones de
// 60 s, la cola corta del final no lleva al avatar por encima del máximo.
// Desde la entrega 2e, la semilla de cada aparición lleva el motor elegido y
// `expressive: true` solo cuando la opción lo tiene. Desde la 2f,
// «3 veces en 2 minutos» llega al planificador solo en true (la fase la
// anuncia en la pausa) y una primera frase corta seguida de un silencio
// largo ya no deja al video sin la apertura.
// Importa el código real (Node quita los tipos), con carpetas temporales: sin
// red ni FFmpeg.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  planPrefixSceneWindows,
  planPrefixSceneWindowsWithin,
} from '../../pipeline/animation/prefix-scenes.ts'
import { redistributeSceneTimes } from '../../pipeline/commands/videos/audio-replacement.ts'
import { previewSceneCuts } from '../../pipeline/commands/videos/preview-scene-cuts.ts'
import { videoProjectStatus } from '../../pipeline/commands/videos/video-project-status.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'
import { readScenes, writeScenes } from '../../pipeline/project/scenes-file.ts'
import {
  cutScenesAtBoundaries,
  cutScenesBySeconds,
  MIN_SECONDS_PER_SCENE,
} from '../../pipeline/stages/scene-cuts/by-seconds.ts'
import {
  automaticFreeSceneCount,
  countFreeCutter,
  countScenesAroundSpans,
  cutLaneAroundPins,
  cutScenesAroundPins,
  droppedAppearances,
  pinnedTimeline,
  planAvatarPins,
  prefixFreeCutter,
  secondsFreeCutter,
} from '../../pipeline/stages/scene-cuts/pins.ts'
import {
  cutScenesByTime,
  sceneCutsStage,
} from '../../pipeline/stages/scene-cuts/scene-cuts.ts'
import {
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MIN_APPEARANCE_SECONDS,
} from '../../pipeline/types/avatar.ts'

const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

// Lo que el corte siembra en cada escena de avatar.
const SEED = {
  lookId: 'look-1',
  lookName: 'Ana',
  lookType: 'photo_avatar',
  engine: 'avatar_iii',
  origin: 'auto',
}

// options.avatar del proyecto: 3 apariciones de 10 s, empezando con el avatar.
const AVATAR = {
  avatarId: 'ana-aaaaaa',
  lookId: 'look-1',
  lookName: 'Ana',
  lookType: 'photo_avatar',
  engine: 'avatar_iii',
  appearances: 3,
  secondsPerAppearance: 10,
  startWithAvatar: true,
  placement: 'auto',
}

// `seconds` de narración: una palabra por segundo (w0, w1, …, de i a i + 0,5)
// y frases de 5 s (cada quinta palabra cierra frase). Con 60 s, el
// planificador pone al avatar en 0–10, 25–35 y 45–55.
function narration(seconds) {
  return Array.from({ length: seconds }, (_, index) => ({
    word: `w${index}`,
    start: index,
    end: index + 0.5,
    ...(index % 5 === 4 ? { sentenceEnd: true } : {}),
  }))
}
const SIXTY = narration(60)

// La narración vieja del foco 1: sin puntuación y con una sola pausa larga
// (frases 0–8, 8–16,2 y 16,2–31,2).
function onePauseWords() {
  const words = []
  for (const [prefix, from] of [
    ['a', 0],
    ['b', 16.2],
  ])
    for (let index = 0; index < 30; index++)
      words.push({
        word: `${prefix}${index}`,
        start: from + index * 0.5,
        end: from + index * 0.5 + 0.45,
      })
  return words
}

// Un pin hecho a mano (los del planificador traen sus frases; acá no importan).
const pin = (startSeconds, endSeconds) => ({
  startSeconds,
  endSeconds,
  sentenceFrom: 0,
  sentenceTo: 0,
  avatar: SEED,
})
const ends = (scenes) => scenes.map((scene) => scene.endSeconds)
const avatarIds = (scenes) =>
  scenes.filter((scene) => scene.avatar).map((scene) => scene.id)
const text = (from, to) =>
  Array.from({ length: to - from + 1 }, (_, index) => `w${from + index}`).join(
    ' ',
  )
const onFrame = (seconds) =>
  Math.abs(seconds * 25 - Math.round(seconds * 25)) < 1e-6

// Un proyecto en disco con la narración transcripta (60 s, si no se pasa otra)
// y la metadata que lee la fase; `options` pisa las del proyecto.
async function project(t, options = {}, { words = SIXTY, seconds = 60 } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-scene-pins-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.root, { recursive: true })
  await writeFile(paths.wordsFile, JSON.stringify(words))
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
      ...options,
    },
    completedStages: ['voice', 'transcription'],
    audioDurationSeconds: seconds,
    wordCount: words.length,
  }
  await writeFile(paths.metadataFile, JSON.stringify(metadata))
  const events = []
  const context = {
    job: {
      jobId: 'scene-pins',
      projectsRoot: root,
      apiKeys: {},
      binaryPaths: {},
      payload: {},
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit: (event) => events.push(event) },
    paths,
    metadata,
    options: metadata.options,
    async saveMetadata() {
      await writeFile(paths.metadataFile, JSON.stringify(metadata))
    },
  }
  return { paths, context, events }
}

test('carril de segundos: corta solo los tramos libres; cada pin es una escena de avatar planeada, con ids en orden y texto por palabras', () => {
  const pins = [pin(10, 21), pin(40, 50)]
  const scenes = cutScenesAroundPins(SIXTY, 60, pins, secondsFreeCutter(3))
  assert.deepEqual(
    ends(scenes),
    [3, 6, 10, 21, 24, 27, 30, 33, 36, 40, 50, 53, 56, 60],
  )
  assert.deepEqual(
    scenes.map((scene) => scene.id),
    Array.from({ length: 14 }, (_, index) => index + 1),
  )
  assert.equal(scenes[0].startSeconds, 0)
  assert.deepEqual(avatarIds(scenes), [4, 11])
  assert.deepEqual(scenes[3], {
    id: 4,
    text: text(10, 20),
    startSeconds: 10,
    endSeconds: 21,
    avatar: { ...SEED, status: 'planned' },
  })
  assert.equal(scenes[2].text, text(6, 9))
  // Cuenta lo mismo que corta (la vista previa y el «≈ N» de la UI).
  assert.equal(countScenesAroundSpans(60, pins, { secondsPerScene: 3 }), 14)
  assert.equal(
    cutLaneAroundPins(SIXTY, 60, pins, { secondsPerScene: 3 }).length,
    14,
  )
})

test('carril por cantidad: la cantidad menos los pines se reparte según la duración de cada tramo, mínimo una por tramo', () => {
  const pins = [pin(10, 21), pin(40, 50)]
  // 10 escenas: 8 libres para tramos de 10, 19 y 10 s → 2, 4 y 2.
  const ten = cutLaneAroundPins(SIXTY, 60, pins, { sceneCount: 10 })
  assert.deepEqual(ends(ten), [5, 10, 21, 25.75, 30.5, 35.25, 40, 50, 55, 60])
  assert.deepEqual(avatarIds(ten), [3, 8])
  assert.equal(countScenesAroundSpans(60, pins, { sceneCount: 10 }), 10)
  // 3 escenas no alcanzan para los tres tramos libres: una cada uno.
  const three = cutLaneAroundPins(SIXTY, 60, pins, { sceneCount: 3 })
  assert.deepEqual(ends(three), [10, 21, 40, 50, 60])
})

test('con prefijo animado: cada tramo libre lleva lo que queda del rango animado en fuentes de 3 s (la sobrante corta, unida a la anterior); el avatar nunca lleva el pedido de Kie', () => {
  const ninety = narration(90)
  const pins = [pin(20, 30), pin(50, 62)]
  const lane = { secondsPerScene: 5, prefixEndSeconds: 60 }
  const scenes = cutLaneAroundPins(ninety, 90, pins, lane)
  // Los tramos de 20 s terminan con una fuente de 2 s (18–20 y 48–50): se une
  // a la anterior, que queda de 5 s.
  assert.deepEqual(
    ends(scenes),
    [
      3, 6, 9, 12, 15, 20, 30, 33, 36, 39, 42, 45, 50, 62, 67, 72, 77, 82, 87,
      90,
    ],
  )
  assert.deepEqual(avatarIds(scenes), [7, 14])
  assert.deepEqual(
    scenes
      .filter((scene) => scene.animationRequestedSeconds === 6)
      .map((scene) => scene.id),
    [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13],
  )
  assert.equal(countScenesAroundSpans(90, pins, lane), 20)
})

test('un tramo libre de menos de 3 s lo absorbe el avatar: el que le sigue o, al final, el anterior', () => {
  // Desordenados a propósito: el corte los ordena y no los modifica.
  const pins = [pin(30, 58.5), pin(2, 12)]
  const before = structuredClone(pins)
  const timeline = pinnedTimeline(pins, 60)
  assert.deepEqual(
    timeline.pins.map(({ startSeconds, endSeconds }) => [
      startSeconds,
      endSeconds,
    ]),
    [
      [0, 12],
      [30, 60],
    ],
  )
  assert.deepEqual(timeline.free, [{ startSeconds: 12, endSeconds: 30 }])
  const scenes = cutScenesAroundPins(SIXTY, 60, pins, secondsFreeCutter(3))
  assert.deepEqual(ends(scenes), [12, 15, 18, 21, 24, 27, 30, 60])
  assert.deepEqual(avatarIds(scenes), [1, 8])
  assert.deepEqual(pins, before)
})

test('con pines el texto sale por punto medio: una palabra que empieza antes del avatar pero cae en él la dice el avatar', () => {
  const words = [
    { word: 'a', start: 0, end: 1 },
    { word: 'b', start: 2.8, end: 3.4 },
    { word: 'c', start: 4, end: 5 },
  ]
  const scenes = cutScenesAroundPins(
    words,
    5,
    [pin(3, 5)],
    secondsFreeCutter(3),
  )
  assert.deepEqual(
    scenes.map((scene) => [scene.text, Boolean(scene.avatar)]),
    [
      ['a', false],
      ['b c', true],
    ],
  )
})

test('foco 1 de punta a punta: sin puntuación y con una sola pausa larga, ningún avatar de menos del mínimo ni imagen de menos de 3 s', () => {
  const words = onePauseWords()
  for (const startWithAvatar of [true, false]) {
    const plan = planAvatarPins({ ...AVATAR, startWithAvatar }, words, 31.2)
    assert.equal(plan.dropped, 2, String(startWithAvatar))
    for (const span of plan.pins) {
      // Los pines caen en frontera de frase, al cuadro de 25 fps.
      assert.ok(onFrame(span.startSeconds) && onFrame(span.endSeconds))
      assert.deepEqual(span.avatar, SEED)
    }
    const scenes = cutLaneAroundPins(words, 31.2, plan.pins, {
      secondsPerScene: 3,
    })
    for (const scene of scenes) {
      const length = scene.endSeconds - scene.startSeconds
      const minimum = scene.avatar
        ? AVATAR_MIN_APPEARANCE_SECONDS
        : MIN_SECONDS_PER_SCENE
      assert.ok(length >= minimum - 1e-9, `${scene.id}: ${length}`)
    }
  }
  // Sin avatar, o con «lo elijo en el editor» (entrega 3), no hay pines.
  assert.equal(planAvatarPins(undefined, words, 31.2), null)
  assert.equal(
    planAvatarPins({ ...AVATAR, placement: 'manual' }, words, 31.2),
    null,
  )
})

test('semilla (entrega 2e): cada aparición lleva el motor elegido y `expressive: true` solo cuando la opción lo tiene; sin él, la semilla de antes byte a byte', () => {
  // Avatar III sin ajustes: la semilla de antes, con sus claves en su orden.
  for (const span of planAvatarPins(AVATAR, SIXTY, 60).pins)
    assert.equal(JSON.stringify(span.avatar), JSON.stringify(SEED))

  const expressive = planAvatarPins(
    { ...AVATAR, engine: 'avatar_iv', expressive: true },
    SIXTY,
    60,
  )
  assert.equal(expressive.pins.length, 3)
  for (const span of expressive.pins)
    assert.deepEqual(span.avatar, {
      ...SEED,
      engine: 'avatar_iv',
      expressive: true,
    })
  // Cada escena con su copia: el carril de una no toca la semilla de otra.
  assert.notEqual(expressive.pins[0].avatar, expressive.pins[1].avatar)

  // Apagado (o un valor que no es true) no siembra nada.
  for (const value of [false, 'true'])
    for (const span of planAvatarPins(
      { ...AVATAR, engine: 'avatar_v', expressive: value },
      SIXTY,
      60,
    ).pins)
      assert.deepEqual(span.avatar, { ...SEED, engine: 'avatar_v' })
})

// Una frase con puntuación: `count` palabras de 0,45 s cada 0,5 s desde
// `from`, la última con `sentenceEnd`.
function sentenceWords(prefix, count, from) {
  return Array.from({ length: count }, (_, index) => ({
    word: `${prefix}${index}`,
    start: from + index * 0.5,
    end: from + index * 0.5 + 0.45,
    ...(index === count - 1 ? { sentenceEnd: true } : {}),
  }))
}
const pinWindows = (plan) =>
  plan.pins.map((span) => [span.startSeconds, span.endSeconds])
// Cada escena del corte: inicio, fin, si no tiene palabras y si es del avatar.
const sceneWindows = (scenes) =>
  scenes.map((scene) => [
    scene.startSeconds,
    scene.endSeconds,
    scene.text === '',
    Boolean(scene.avatar),
  ])

// Tope de silencio (entrega 2b, diseño §5): una aparición no carga más de 2 s
// de silencio después de la última palabra de una frase, y el silencio que
// queda afuera lo corta el carril como escenas de imagen sin palabras.
test('tope de silencio: el silencio después de un pin sale como escenas de imagen sin palabras', () => {
  // Frases 0–5, «solo0» (5–5,45 s) con silencio hasta los 15 y 15–25: el
  // avatar termina a los 7,44 (la palabra más 2 s, al cuadro).
  const words = [
    ...sentenceWords('a', 10, 0),
    ...sentenceWords('solo', 1, 5),
    ...sentenceWords('c', 20, 15),
  ]
  const plan = planAvatarPins({ ...AVATAR, appearances: 1 }, words, 25)
  assert.deepEqual(pinWindows(plan), [[0, 7.44]])
  const scenes = cutLaneAroundPins(words, 25, plan.pins, { secondsPerScene: 3 })
  assert.deepEqual(sceneWindows(scenes), [
    [0, 7.44, false, true],
    [7.44, 10.44, true, false],
    [10.44, 13.44, true, false],
    [13.44, 16.44, false, false],
    [16.44, 19.44, false, false],
    [19.44, 25, false, false],
  ])
  // «solo0» la dice el avatar: la palabra cae adentro de su tramo.
  assert.ok(scenes[0].text.endsWith('a9 solo0'), scenes[0].text)
})

test('tope de silencio al fin del audio: una cola de 3 s o más sale como escena de imagen sin palabras', () => {
  // La última frase (5–15 s) termina de hablar a los 7,95: el avatar llega a
  // los 9,96 y los 5,04 s que quedan son una imagen muda.
  const words = [...sentenceWords('a', 10, 0), ...sentenceWords('b', 6, 5)]
  const plan = planAvatarPins({ ...AVATAR, appearances: 1 }, words, 15)
  assert.deepEqual(pinWindows(plan), [[0, 9.96]])
  const scenes = cutLaneAroundPins(words, 15, plan.pins, { secondsPerScene: 3 })
  assert.deepEqual(sceneWindows(scenes), [
    [0, 9.96, false, true],
    [9.96, 15, true, false],
  ])
})

test('tope de silencio con apariciones de 60 s: la cola corta del final no lleva al avatar por encima del máximo', () => {
  // Once frases de 5 s y la última, 55–61 s, que termina de hablar a los
  // 57,95. Recortada, la aparición mediría 59,96 s y el corte le pegaría la
  // cola de 1,04 (61 s); el planificador la mide hasta su fin: 0–55.
  const words = [
    ...Array.from({ length: 11 }, (_, index) =>
      sentenceWords(`s${index}w`, 10, index * 5),
    ).flat(),
    ...sentenceWords('fin', 6, 55),
  ]
  const plan = planAvatarPins(
    { ...AVATAR, appearances: 1, secondsPerAppearance: 60 },
    words,
    61,
  )
  assert.deepEqual(pinWindows(plan), [[0, 55]])
  assert.equal(plan.dropped, 0)
  const scenes = cutLaneAroundPins(words, 61, plan.pins, { secondsPerScene: 3 })
  for (const scene of scenes.filter((candidate) => candidate.avatar))
    assert.ok(
      scene.endSeconds - scene.startSeconds <=
        AVATAR_MAX_APPEARANCE_SECONDS + 1e-6,
      `${scene.id}: ${scene.startSeconds}–${scene.endSeconds}`,
    )
  assert.deepEqual(sceneWindows(scenes), [
    [0, 55, false, true],
    [55, 58, false, false],
    [58, 61, true, false],
  ])
})

test('tope de silencio al fin del audio: la última frase entra si llega al mínimo con su fin recortado, y el corte la deja en su fin', () => {
  // La última frase (5–15 s) termina de hablar a los 10,95: recortada mide
  // 7,96 s, llega al mínimo, y el tramo va hasta su fin, el del audio.
  const avatar = { ...AVATAR, appearances: 1, startWithAvatar: false }
  const words = [...sentenceWords('a', 10, 0), ...sentenceWords('b', 12, 5)]
  const plan = planAvatarPins(avatar, words, 15)
  assert.deepEqual(pinWindows(plan), [[5, 15]])
  const scenes = cutLaneAroundPins(words, 15, plan.pins, { secondsPerScene: 3 })
  assert.deepEqual(sceneWindows(scenes), [
    [0, 5, false, false],
    [5, 15, false, true],
  ])
  // Con seis palabras habla hasta los 7,95 y recortada mide 4,96 s, menos que
  // el mínimo de 5 s (entrega 2d), aunque hasta el fin del audio (12 s)
  // mediría 7: es casi muda, no hay aparición y el video son solo imágenes.
  const shorter = [...sentenceWords('a', 10, 0), ...sentenceWords('b', 6, 5)]
  const none = planAvatarPins(avatar, shorter, 12)
  assert.deepEqual(none.pins, [])
  assert.equal(none.dropped, 1)
})

// El máximo por aparición se cumple siempre (ruling del 2026-10-11, ronda 3
// de la 2b): una aparición que terminaría a menos de 3 s del fin del audio se
// mide hasta ahí, porque el corte le pega esa cola.
test('la última aparición nunca pasa el máximo después de que el corte le pegue la cola final, haya o no pausas', () => {
  // Once frases de 5 s, la 11 de 55 a 59,6 y una final corta, sin pausas de
  // más de 2 s: según sus palabras, el audio termina entre 0,75 y 2,75 s
  // después de los 59,6. Con objetivo 60 la aparición sumaba la 11 y el corte
  // la llevaba al fin del audio (de 60,35 a 62,35 s); ahora queda en 0–55.
  const avatar = { ...AVATAR, appearances: 1, secondsPerAppearance: 60 }
  const leading = [
    ...Array.from({ length: 11 }, (_, index) =>
      sentenceWords(`s${index}w`, 10, index * 5),
    ).flat(),
    ...sentenceWords('x', 9, 55),
  ]
  for (const count of [1, 2, 3, 4, 5]) {
    const words = [...leading, ...sentenceWords('fin', count, 59.6)]
    const audioEnd = words.at(-1).end + 0.3
    const plan = planAvatarPins(avatar, words, audioEnd)
    assert.deepEqual(pinWindows(plan), [[0, 55]], String(audioEnd))
    for (const pin of pinnedTimeline(plan.pins, audioEnd).pins)
      assert.ok(
        pin.endSeconds - pin.startSeconds <=
          AVATAR_MAX_APPEARANCE_SECONDS + 1e-6,
        `${audioEnd}: ${pin.startSeconds}–${pin.endSeconds}`,
      )
  }
})

// Entrega 2f (diseño §22.2): «3 veces en 2 minutos» llega al planificador
// desde `options.avatar`, solo en true. En 300 s de frases de 5 s, apagada da
// 0–10, 85–95 y 225–235; prendida, las tres arrancan antes de los 120 s.
test('planAvatarPins (2f): «3 veces en 2 minutos» llega al planificador solo en true, con la semilla de siempre; las pedidas que le faltan a un corte cuentan las tres', () => {
  const fiveMinutes = narration(300)
  for (const value of [undefined, false, 'true'])
    assert.deepEqual(
      pinWindows(
        planAvatarPins(
          { ...AVATAR, threeInFirstTwoMinutes: value },
          fiveMinutes,
          300,
        ),
      ),
      [
        [0, 10],
        [85, 95],
        [225, 235],
      ],
      String(value),
    )

  const early = planAvatarPins(
    { ...AVATAR, threeInFirstTwoMinutes: true },
    fiveMinutes,
    300,
  )
  assert.deepEqual(pinWindows(early), [
    [0, 10],
    [40, 50],
    [90, 100],
  ])
  assert.equal(early.dropped, 0)
  for (const span of early.pins)
    assert.equal(JSON.stringify(span.avatar), JSON.stringify(SEED))

  // Con una sola elegida salen tres; a un corte con dos escenas de avatar le
  // falta una.
  const one = planAvatarPins(
    { ...AVATAR, appearances: 1, threeInFirstTwoMinutes: true },
    fiveMinutes,
    300,
  )
  assert.deepEqual(pinWindows(one), pinWindows(early))
  assert.equal(droppedAppearances(one, 2), 1)
})

test('fase (2f): con «3 veces en 2 minutos» la pausa anuncia las tres apariciones dentro de los primeros 2 minutos', async (t) => {
  const { context, events } = await project(
    t,
    {
      avatar: { ...AVATAR, appearances: 1, threeInFirstTwoMinutes: true },
      confirmScenes: true,
    },
    { words: narration(300), seconds: 300 },
  )
  assert.deepEqual(await sceneCutsStage.run(context), { pause: true })
  assert.equal(events[0].type, 'avatar-planned')
  assert.equal(events[0].dropped, 0)
  assert.equal(events[0].sceneIds.length, 3)
  assert.deepEqual(events[1].avatarSpans, [
    { startSeconds: 0, endSeconds: 10 },
    { startSeconds: 40, endSeconds: 50 },
    { startSeconds: 90, endSeconds: 100 },
  ])
})

// La apertura siempre abre (entrega 2f, R-2f-4, diseño §22.3): una primera
// frase corta seguida de un silencio largo ya no deja al video sin la
// apertura; un audio de menos de 5 s, sí.
test('apertura con un silencio después de la primera frase (2f, R-2f-4): el video abre con el avatar, que carga ese silencio si es de 6 s o menos; con 19 s o con menos de 5 s de audio, no hay apertura', () => {
  // «Hola.» de 0,2 a 0,8 s, 5,2 s de silencio y frases de 5 s desde los 6.
  // Con el tope de silencio la apertura terminaría a los 2,8 s (no llega al
  // mínimo); sin él, 0–6 y la frase siguiente: 0–11. Hasta la 2e no había
  // apertura y la aparición se contaba como descartada.
  const words = [
    { word: 'hola', start: 0.2, end: 0.8, sentenceEnd: true },
    ...['a', 'b', 'c', 'd', 'e'].flatMap((prefix, index) =>
      sentenceWords(prefix, 10, 6 + index * 5),
    ),
  ]
  const plan = planAvatarPins({ ...AVATAR, appearances: 1 }, words, 31)
  assert.deepEqual(pinWindows(plan), [[0, 11]])
  assert.equal(plan.dropped, 0)
  const scenes = cutLaneAroundPins(words, 31, plan.pins, { secondsPerScene: 3 })
  assert.deepEqual(sceneWindows(scenes)[0], [0, 11, false, true])
  assert.ok(scenes[0].text.startsWith('hola a0'), scenes[0].text)

  // Con 19,2 s de silencio después de «Hola.» la apertura tendría que cargar
  // más de 6 s (ronda 1): no hay apertura y la aparición se cuenta como
  // descartada; el video abre con imágenes.
  const longSilence = [
    { word: 'hola', start: 0.2, end: 0.8, sentenceEnd: true },
    ...['a', 'b', 'c', 'd', 'e'].flatMap((prefix, index) =>
      sentenceWords(prefix, 10, 20 + index * 5),
    ),
  ]
  const muted = planAvatarPins({ ...AVATAR, appearances: 1 }, longSilence, 45)
  assert.deepEqual(muted.pins, [])
  assert.equal(muted.dropped, 1)

  const tooShort = planAvatarPins(
    { ...AVATAR, appearances: 1 },
    [{ word: 'hola', start: 0.2, end: 0.8, sentenceEnd: true }],
    4.9,
  )
  assert.deepEqual(tooShort.pins, [])
  assert.equal(tooShort.dropped, 1)
})

test('prefijo animado: planPrefixSceneWindows da lo mismo que antes y la versión en segundos arranca donde se le pide', () => {
  // 70 s, 1 minuto, 5 s por escena: 20 fuentes de 3 s y dos escenas de 5 s.
  const seconds = planPrefixSceneWindows({
    totalSeconds: 70,
    minutes: 1,
    secondsPerScene: 5,
  })
  assert.equal(seconds.length, 22)
  assert.deepEqual(seconds[0], {
    startSeconds: 0,
    endSeconds: 3,
    animationRequestedSeconds: 6,
  })
  assert.deepEqual(seconds[19], {
    startSeconds: 57,
    endSeconds: 60,
    animationRequestedSeconds: 6,
  })
  assert.deepEqual(seconds.slice(20), [
    { startSeconds: 60, endSeconds: 65 },
    { startSeconds: 65, endSeconds: 70 },
  ])
  // La cantidad confirmada cuenta todo el video: 25 − 20 fuentes, acotado a 3.
  assert.deepEqual(
    planPrefixSceneWindows({
      totalSeconds: 70,
      minutes: 1,
      sceneCount: 25,
    }).slice(20),
    [
      { startSeconds: 60, endSeconds: 63.333 },
      { startSeconds: 63.333, endSeconds: 66.667 },
      { startSeconds: 66.667, endSeconds: 70 },
    ],
  )
  // Un audio más corto que el prefijo: todo fuentes, la última hasta el final.
  const short = planPrefixSceneWindows({ totalSeconds: 40, minutes: 1 })
  assert.equal(short.length, 14)
  assert.deepEqual(short.at(-1), {
    startSeconds: 39,
    endSeconds: 40,
    animationRequestedSeconds: 6,
  })
  assert.deepEqual(
    planPrefixSceneWindows({ totalSeconds: 70, minutes: 0.5 }),
    [],
  )
  // En segundos: sin prefijo es el carril de siempre; con 4 s, fuentes de 3 y 1.
  assert.deepEqual(
    planPrefixSceneWindowsWithin({
      totalSeconds: 10,
      prefixSeconds: 0,
      secondsPerScene: 5,
    }),
    [
      { startSeconds: 0, endSeconds: 5 },
      { startSeconds: 5, endSeconds: 10 },
    ],
  )
  assert.deepEqual(
    planPrefixSceneWindowsWithin({
      totalSeconds: 10,
      prefixSeconds: 4,
      secondsPerScene: 5,
    }),
    [
      { startSeconds: 0, endSeconds: 3, animationRequestedSeconds: 6 },
      { startSeconds: 3, endSeconds: 4, animationRequestedSeconds: 6 },
      { startSeconds: 4, endSeconds: 10 },
    ],
  )
})

test('fase: un proyecto sin avatar corta exactamente como antes y no emite avatar-planned', async (t) => {
  const { paths, context, events } = await project(t, { sceneCount: 12 })
  await sceneCutsStage.run(context)
  assert.deepEqual(await readScenes(paths), cutScenesByTime(SIXTY, 12))
  assert.deepEqual(
    events.map((event) => event.type),
    ['scenes-planned'],
  )
  assert.equal(
    events[0].scenes.some((scene) => 'avatar' in scene),
    false,
  )
})

test('fase: con avatar pausa con avatarSpans y una cantidad que cuenta al avatar; confirmar otra cantidad no mueve los pines', async (t) => {
  const { paths, context, events } = await project(t, {
    avatar: AVATAR,
    confirmScenes: true,
  })
  assert.deepEqual(await sceneCutsStage.run(context), { pause: true })
  // Tres apariciones más las imágenes de 3 s o más que entran en cada tramo
  // libre de 15, 10 y 5 s: 5 + 3 + 1. Antes de la pausa, `avatar-planned`
  // (una vez) con las escenas de avatar del corte sugerido y las descartadas,
  // así el diálogo las cuenta antes de pagar las imágenes.
  assert.deepEqual(events, [
    { type: 'avatar-planned', sceneIds: [1, 7, 11], dropped: 0 },
    {
      type: 'awaiting-scene-confirmation',
      suggestedScenes: 12,
      audioDurationSeconds: 60,
      wordCount: 60,
      avatarSpans: [
        { startSeconds: 0, endSeconds: 10 },
        { startSeconds: 25, endSeconds: 35 },
        { startSeconds: 45, endSeconds: 55 },
      ],
    },
  ])
  assert.equal(context.metadata.sceneCount, 12)
  assert.equal(await readScenes(paths), null)

  // La persona confirma 10: siete imágenes por promedios mayores, 4, 2 y 1
  // para los tramos de 15, 10 y 5 s (ninguna de menos de 3 s).
  await writeFile(paths.scenesConfirmedFile, JSON.stringify({ sceneCount: 10 }))
  events.length = 0
  assert.equal(await sceneCutsStage.run(context), undefined)
  const scenes = await readScenes(paths)
  assert.deepEqual(
    ends(scenes),
    [10, 13.75, 17.5, 21.25, 25, 35, 40, 45, 55, 60],
  )
  assert.deepEqual(avatarIds(scenes), [1, 6, 9])
  assert.deepEqual(scenes[0], {
    id: 1,
    text: text(0, 9),
    startSeconds: 0,
    endSeconds: 10,
    avatar: { ...SEED, status: 'planned' },
  })
  assert.equal(scenes[1].text, text(10, 13))
  assert.deepEqual(
    events.map((event) => event.type),
    ['scenes-planned', 'avatar-planned'],
  )
  assert.deepEqual(events[1], {
    type: 'avatar-planned',
    sceneIds: [1, 6, 9],
    dropped: 0,
  })
  // La UI recibe el avatar planeado en el resumen de cada escena.
  assert.deepEqual(
    events[0].scenes
      .filter((scene) => scene.avatar)
      .map((scene) => [scene.id, scene.avatar.status]),
    [
      [1, 'planned'],
      [6, 'planned'],
      [9, 'planned'],
    ],
  )
  assert.equal(context.metadata.sceneCount, 10)
})

test('fase: un corte con un recibo de HeyGen no se rehace aunque ninguna otra fase esté cumplida', async (t) => {
  const { paths, context, events } = await project(t, { avatar: AVATAR })
  await writeScenes(paths, [
    {
      id: 1,
      text: text(0, 11),
      startSeconds: 0,
      endSeconds: 12,
      avatar: {
        ...SEED,
        status: 'planned',
        attempts: [
          {
            hash: HASH,
            state: 'pending',
            engine: 'avatar_iii',
            lookId: 'look-1',
            videoId: 'video-1',
            createdAt: '2026-10-10T00:00:00.000Z',
          },
        ],
      },
    },
    { id: 2, text: text(12, 59), startSeconds: 12, endSeconds: 60 },
  ])
  const before = await readFile(paths.scenesFile, 'utf8')
  await sceneCutsStage.run(context)
  assert.equal(await readFile(paths.scenesFile, 'utf8'), before)
  // El corte que se conserva tiene una sola aparición de las tres pedidas: las
  // otras dos no están en el video.
  assert.deepEqual(events.at(-1), {
    type: 'avatar-planned',
    sceneIds: [1],
    dropped: 2,
  })
})

test('fase: con avatar, un corte previo de la misma cantidad pero otro reparto se rehace si no tiene nada pagado', async (t) => {
  const { paths, context } = await project(t, { avatar: AVATAR })
  await writeScenes(paths, cutScenesByTime(SIXTY, 12))
  await sceneCutsStage.run(context)
  const scenes = await readScenes(paths)
  assert.equal(scenes.length, 12)
  assert.deepEqual(avatarIds(scenes), [1, 7, 11])
})

test('vista previa del carril de segundos: con avatar cuenta los pines, igual que la fase; sin avatar, como antes', async (t) => {
  const customStyle = {
    styleId: 'mi-estilo',
    name: 'Mi estilo',
    systemPrompt: 'Ilustraciones a lápiz.',
  }
  const preview = (context) =>
    previewSceneCuts({
      ...context,
      job: {
        ...context.job,
        payload: { projectId: 'fixture', secondsPerScene: 5 },
      },
    })
  const withAvatar = await project(t, {
    avatar: AVATAR,
    customStyle,
    secondsPerScene: 5,
  })
  assert.deepEqual(await preview(withAvatar.context), {
    sceneCount: 9,
    audioDurationSeconds: 60,
  })
  await sceneCutsStage.run(withAvatar.context)
  assert.equal((await readScenes(withAvatar.paths)).length, 9)
  const plain = await project(t, { customStyle, secondsPerScene: 5 })
  assert.deepEqual(await preview(plain.context), {
    sceneCount: 12,
    audioDurationSeconds: 60,
  })
})

test('reemplazar la narración con avatar escala el corte entero; sin avatar, el reparto uniforme de siempre', () => {
  const scenes = [
    {
      id: 1,
      text: 'a',
      startSeconds: 0,
      endSeconds: 10,
      avatar: { ...SEED, status: 'ready', clipFile: 'scene_1.a1b2c3d4.mp4' },
    },
    { id: 2, text: 'b', startSeconds: 10, endSeconds: 15 },
    { id: 3, text: 'c', startSeconds: 15, endSeconds: 20 },
    {
      id: 4,
      text: 'd',
      startSeconds: 20,
      endSeconds: 30,
      avatar: { ...SEED, status: 'planned' },
    },
    { id: 5, text: 'e', startSeconds: 30, endSeconds: 40 },
  ]
  const times = (list) =>
    list.map((scene) => [scene.startSeconds, scene.endSeconds])
  const scaled = redistributeSceneTimes(scenes, 20)
  assert.deepEqual(times(scaled), [
    [0, 5],
    [5, 7.5],
    [7.5, 10],
    [10, 15],
    [15, 20],
  ])
  assert.deepEqual(
    scaled.map((scene) => scene.avatar),
    scenes.map((scene) => scene.avatar),
  )
  const plain = scenes.map((scene) => {
    const copy = { ...scene }
    delete copy.avatar
    return copy
  })
  assert.deepEqual(times(redistributeSceneTimes(plain, 20)), [
    [0, 4],
    [4, 8],
    [8, 12],
    [12, 16],
    [16, 20],
  ])
})

// ─── La cola absorbida en la pausa, la caché, el desempate, el prefijo con
// avatar, los carriles sin avatar y los tramos que se pisan ───

test('fase: la pausa y el corte traen la aparición como queda, con la cola corta ya absorbida; dropped cuenta la que no entró', async (t) => {
  // 17 s en frases de 5 s (la última, de 2). El plan pone la aparición en
  // 5–15 y la segunda no entra; la cola de 2 s la dice el avatar, así que la
  // escena dura 12 s y la pausa la anuncia así, no como el plan.
  const { paths, context, events } = await project(
    t,
    {
      avatar: { ...AVATAR, appearances: 2, startWithAvatar: false },
      confirmScenes: true,
    },
    { words: narration(17), seconds: 17 },
  )
  assert.deepEqual(await sceneCutsStage.run(context), { pause: true })
  // Una aparición más una imagen para los 5 s libres (no entran dos de 3 s);
  // la pausa ya sabe que la segunda no entró.
  assert.deepEqual(events, [
    { type: 'avatar-planned', sceneIds: [2], dropped: 1 },
    {
      type: 'awaiting-scene-confirmation',
      suggestedScenes: 2,
      audioDurationSeconds: 17,
      wordCount: 17,
      avatarSpans: [{ startSeconds: 5, endSeconds: 17 }],
    },
  ])

  await writeFile(paths.scenesConfirmedFile, JSON.stringify({ sceneCount: 2 }))
  events.length = 0
  await sceneCutsStage.run(context)
  const scenes = await readScenes(paths)
  assert.deepEqual(ends(scenes), [5, 17])
  assert.deepEqual(scenes[1], {
    id: 2,
    text: text(5, 16),
    startSeconds: 5,
    endSeconds: 17,
    avatar: { ...SEED, status: 'planned' },
  })
  assert.deepEqual(events.at(-1), {
    type: 'avatar-planned',
    sceneIds: [2],
    dropped: 1,
  })
})

test('fase: con avatar skip() la deja correr aunque la cantidad coincida, y un clip de HeyGen o la fase avatar cumplida conservan el corte', async (t) => {
  // skip(): con avatar el total depende de los pines. Sin avatar, o con «lo
  // elijo en el editor», la caché por cantidad de siempre.
  for (const [avatar, skips] of [
    [AVATAR, false],
    [undefined, true],
    [{ ...AVATAR, placement: 'manual' }, true],
  ]) {
    const { paths, context } = await project(t, { avatar, sceneCount: 13 })
    await writeScenes(paths, cutScenesByTime(SIXTY, 13))
    assert.equal(await sceneCutsStage.skip(context), skips, String(avatar))
  }

  // Un corte que no es el de hoy se conserva si su avatar ya tiene el clip
  // (aunque no queden recibos) o si la fase avatar ya se cumplió.
  const cut = (avatar) => [
    { id: 1, text: text(0, 11), startSeconds: 0, endSeconds: 12, avatar },
    { id: 2, text: text(12, 59), startSeconds: 12, endSeconds: 60 },
  ]
  for (const [scenes, completed] of [
    [cut({ ...SEED, status: 'ready', clipFile: 'scene_1.a1b2c3d4.mp4' }), []],
    [cut({ ...SEED, status: 'planned' }), ['scene-cuts', 'avatar']],
  ]) {
    const { paths, context, events } = await project(t, { avatar: AVATAR })
    context.metadata.completedStages.push(...completed)
    await writeScenes(paths, scenes)
    const before = await readFile(paths.scenesFile, 'utf8')
    await sceneCutsStage.run(context)
    assert.equal(await readFile(paths.scenesFile, 'utf8'), before)
    assert.deepEqual(events.at(-1), {
      type: 'avatar-planned',
      sceneIds: [1],
      dropped: 2,
    })
  }
})

test('carril por cantidad: con empate entre dos tramos, la escena que sobra va al anterior', () => {
  // Dos tramos libres de 25 s y tres escenas libres: 2 y 1.
  const scenes = cutLaneAroundPins(SIXTY, 60, [pin(25, 35)], { sceneCount: 4 })
  assert.deepEqual(ends(scenes), [12.5, 25, 35, 60])
})

test('vista previa del carril de segundos con prefijo animado y avatar: cuenta las fuentes de 3 s de cada tramo libre, igual que la fase', async (t) => {
  const { paths, context } = await project(t, {
    avatar: AVATAR,
    customStyle: {
      styleId: 'mi-estilo',
      name: 'Mi estilo',
      systemPrompt: 'Ilustraciones a lápiz.',
    },
    secondsPerScene: 5,
    animationMinutes: 1,
  })
  // Todo el video cae en el primer minuto: 5 + 3 + 2 fuentes y las tres
  // apariciones (sin el prefijo serían 9). La fuente de 44–45 se une a la
  // anterior; la de 58–60 termina el audio y queda, como sin avatar.
  assert.deepEqual(
    await previewSceneCuts({
      ...context,
      job: {
        ...context.job,
        payload: { projectId: 'fixture', secondsPerScene: 5 },
      },
    }),
    { sceneCount: 13, audioDurationSeconds: 60 },
  )
  await sceneCutsStage.run(context)
  const scenes = await readScenes(paths)
  assert.equal(scenes.length, 13)
  assert.deepEqual(avatarIds(scenes), [1, 7, 11])
  assert.deepEqual(ends(scenes).slice(6, 10), [35, 38, 41, 45])
  // Cada escena de imagen es fuente del prefijo; ninguna de avatar.
  for (const scene of scenes)
    assert.equal(
      scene.animationRequestedSeconds === 6,
      !scene.avatar,
      String(scene.id),
    )
})

test('fase sin avatar: la cantidad automática, el carril de segundos y el prefijo animado cortan como antes', async (t) => {
  // 70 s con un minuto animado: 20 fuentes de 3 s y, después, escenas de 3 s
  // sin pedido de Kie (la réplica del corte con prefijo de scene-cuts.ts).
  const seventy = narration(70)
  const windows = planPrefixSceneWindows({
    totalSeconds: 70,
    minutes: 1,
    sceneCount: 0,
  })
  const prefixCut = cutScenesAtBoundaries(seventy, [
    0,
    ...windows.map((window) => window.endSeconds),
  ]).map((scene, index) => {
    const requested = windows[index].animationRequestedSeconds
    if (requested === undefined) return scene

    return { ...scene, animationRequestedSeconds: requested }
  })
  assert.equal(prefixCut.length, 23)
  const customStyle = {
    styleId: 'mi-estilo',
    name: 'Mi estilo',
    systemPrompt: 'Ilustraciones a lápiz.',
  }
  for (const [options, narrationOptions, expected] of [
    [{}, {}, cutScenesByTime(SIXTY, 20)],
    [{ customStyle, secondsPerScene: 5 }, {}, cutScenesBySeconds(SIXTY, 5, 60)],
    [{ animationMinutes: 1 }, { words: seventy, seconds: 70 }, prefixCut],
  ]) {
    const { paths, context, events } = await project(
      t,
      options,
      narrationOptions,
    )
    await sceneCutsStage.run(context)
    assert.deepEqual(await readScenes(paths), expected)
    assert.deepEqual(
      events.map((event) => event.type),
      ['scenes-planned'],
    )
  }
})

test('fase: carril clásico con prefijo animado y avatar, cantidad automática: fuentes de 3 s hasta el minuto y, después, escenas de 3 s', async (t) => {
  // 92 s en frases de 5 s (la última, de 2): el avatar en 0–10, 35–45 y
  // 70–80. El tramo 10–35 termina con una fuente de 1 s que se une a la
  // anterior (31–35). El tramo 45–70 cruza el fin del prefijo (60 s): fuentes
  // hasta ahí y el resto con el carril automático, como el corte sin avatar.
  const { paths, context, events } = await project(
    t,
    { avatar: AVATAR, animationMinutes: 1 },
    { words: narration(92), seconds: 92 },
  )
  await sceneCutsStage.run(context)
  const scenes = await readScenes(paths)
  assert.deepEqual(
    ends(scenes),
    [
      10, 13, 16, 19, 22, 25, 28, 31, 35, 45, 48, 51, 54, 57, 60, 63, 66, 70,
      80, 83, 86, 89, 92,
    ],
  )
  assert.deepEqual(avatarIds(scenes), [1, 10, 19])
  assert.deepEqual(
    scenes
      .filter((scene) => scene.animationRequestedSeconds === 6)
      .map((scene) => scene.id),
    [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15],
  )
  assert.deepEqual(events.at(-1), {
    type: 'avatar-planned',
    sceneIds: [1, 10, 19],
    dropped: 0,
  })
})

test('pinnedTimeline con tramos que se pisan (los del editor): el que pisa arranca donde terminó el anterior, el que queda adentro se descarta y ninguno pasa el fin del audio', () => {
  const timeline = pinnedTimeline(
    [pin(10, 20), pin(15, 30), pin(22, 28), pin(50, 70)],
    60,
  )
  assert.deepEqual(
    timeline.pins.map(({ startSeconds, endSeconds }) => [
      startSeconds,
      endSeconds,
    ]),
    [
      [10, 20],
      [20, 30],
      [50, 60],
    ],
  )
  assert.deepEqual(timeline.free, [
    { startSeconds: 0, endSeconds: 10 },
    { startSeconds: 30, endSeconds: 50 },
  ])
})

// ─── Ronda 1 de la revisión: el sobrante del prefijo, el reparto por
// promedios mayores, la cantidad pedida con prefijo y los bordes ───

// Un recibo de HeyGen pagado (trabajo que el corte no puede perder).
const RECEIPT = {
  hash: HASH,
  state: 'pending',
  engine: 'avatar_iii',
  lookId: 'look-1',
  videoId: 'video-1',
  createdAt: '2026-10-10T00:00:00.000Z',
}

test('carril por cantidad con avatar: hasta lo que entra en los tramos ninguna imagen dura menos de 3 s; una cantidad mayor las acorta parejo, como sin avatar', () => {
  const { pins } = planAvatarPins(AVATAR, SIXTY, 60)
  const imageLengths = (scenes) =>
    scenes
      .filter((scene) => !scene.avatar)
      .map((scene) => scene.endSeconds - scene.startSeconds)
  // La automática: tres apariciones y las imágenes de 3 s o más que entran en
  // los tramos de 15, 10 y 5 s (5 + 3 + 1).
  assert.equal(3 + automaticFreeSceneCount(pinnedTimeline(pins, 60).free), 12)
  for (const sceneCount of [6, 9, 12]) {
    const scenes = cutLaneAroundPins(SIXTY, 60, pins, { sceneCount })
    assert.equal(scenes.length, sceneCount)
    assert.ok(Math.min(...imageLengths(scenes)) >= 3 - 1e-9, String(sceneCount))
  }
  // 15 no entran a 3 s: por promedios mayores, la más corta queda lo más
  // larga posible (todas de 2,5 s, ninguna de 1,7).
  const fifteen = cutLaneAroundPins(SIXTY, 60, pins, { sceneCount: 15 })
  assert.equal(fifteen.length, 15)
  assert.deepEqual([...new Set(imageLengths(fifteen))], [2.5])
})

test('con prefijo, la fuente sobrante de menos de 3 s antes de una aparición se une a la anterior', () => {
  // El tramo 0–10 termina con una fuente de 1 s (9–10): queda 6–10.
  const pins = [pin(10, 60)]
  const lane = { secondsPerScene: 5, prefixEndSeconds: 60 }
  const scenes = cutLaneAroundPins(SIXTY, 60, pins, lane)
  assert.deepEqual(ends(scenes), [3, 6, 10, 60])
  assert.deepEqual(scenes[2], {
    id: 3,
    text: text(6, 9),
    startSeconds: 6,
    endSeconds: 10,
    animationRequestedSeconds: 6,
  })
  assert.equal(countScenesAroundSpans(60, pins, lane), 4)
})

test('con prefijo, la fuente corta del final del audio no se une: queda como en el corte sin avatar', () => {
  const scenes = cutLaneAroundPins(SIXTY, 60, [pin(0, 50)], {
    secondsPerScene: 5,
    prefixEndSeconds: 60,
  })
  assert.deepEqual(ends(scenes), [50, 53, 56, 59, 60])
  assert.equal(scenes.at(-1).startSeconds, 59)
  assert.equal(scenes.at(-1).animationRequestedSeconds, 6)
})

test('con prefijo, el tramo que cruza el fin del rango une su fuente corta de antes del fin y sigue con su carril', () => {
  // Tramo 10,04–46 con el rango animado hasta 40: la fuente 37,04–40 (2,96 s)
  // se une a la anterior (34,04–40) y el resto, 40–46, va de a 3 s.
  const pins = [pin(0, 10.04), pin(46, 60)]
  const lane = { secondsPerScene: 3, prefixEndSeconds: 40 }
  const scenes = cutLaneAroundPins(SIXTY, 60, pins, lane)
  assert.deepEqual(
    ends(scenes),
    [
      10.04, 13.04, 16.04, 19.04, 22.04, 25.04, 28.04, 31.04, 34.04, 40, 43, 46,
      60,
    ],
  )
  assert.deepEqual(
    scenes
      .filter((scene) => scene.animationRequestedSeconds === 6)
      .map((scene) => scene.id),
    [2, 3, 4, 5, 6, 7, 8, 9, 10],
  )
  assert.equal(countScenesAroundSpans(60, pins, lane), 13)
  // Igual si ese tramo llega al fin del audio: la fuente corta no es la del
  // final del video, la siguen escenas posteriores al prefijo.
  const toTheEnd = cutLaneAroundPins(SIXTY, 60, [pin(0, 10.04)], lane)
  assert.deepEqual(ends(toTheEnd).slice(8), [34.04, 40, 43, 46, 49, 52, 55, 60])
})

test('con prefijo, un tramo cuya única fuente es corta la conserva: no hay una anterior con quien unirla', () => {
  // El tramo 38–50 empieza 2 s antes del fin del rango (40): su única fuente
  // dura 2 s (lo anterior es el avatar) y el resto va de a 3 s.
  const pins = [pin(0, 38), pin(50, 60)]
  const scenes = cutLaneAroundPins(SIXTY, 60, pins, {
    secondsPerScene: 3,
    prefixEndSeconds: 40,
  })
  assert.deepEqual(ends(scenes), [38, 40, 43, 46, 50, 60])
  assert.equal(scenes[1].animationRequestedSeconds, 6)
  assert.equal(scenes[2].animationRequestedSeconds, undefined)
  // Con una cantidad pedida esa fuente cuenta como una escena: 5 son las dos
  // apariciones, la fuente y dos escenas para el resto.
  const five = cutLaneAroundPins(SIXTY, 60, pins, {
    sceneCount: 5,
    prefixEndSeconds: 40,
  })
  assert.deepEqual(ends(five), [38, 40, 45, 50, 60])
})

test('los cortadores exportados, llamados con un tramo que no está en `free`, lo cortan en una sola escena (o con su resto en una), sin error', () => {
  assert.deepEqual(
    countFreeCutter([{ startSeconds: 0, endSeconds: 30 }], 9)(40, 60),
    [],
  )
  // El tramo 50–70 cruza el fin del rango (60): sus fuentes (la de 59–60 se
  // une a la anterior) y el resto 60–70 entero, aunque al tramo de `free`
  // le hayan tocado 10 escenas en su resto.
  const cutter = prefixFreeCutter({
    prefixEndSeconds: 60,
    free: [{ startSeconds: 0, endSeconds: 90 }],
    freeSceneCount: 30,
    audioEndSeconds: 100,
  })
  assert.deepEqual(cutter(50, 70), [53, 56, 60])
})

test('fase: con avatar, un corte previo con una fuente de 5 s y nada pagado no se lee como el prefijo viejo: se rehace', async (t) => {
  const { paths, context } = await project(t, {
    avatar: AVATAR,
    animationMinutes: 1,
  })
  await writeScenes(paths, [
    {
      id: 1,
      text: text(0, 4),
      startSeconds: 0,
      endSeconds: 5,
      animationRequestedSeconds: 6,
    },
    { id: 2, text: text(5, 59), startSeconds: 5, endSeconds: 60 },
  ])
  const before = await readFile(paths.scenesFile, 'utf8')
  await sceneCutsStage.run(context)
  assert.notEqual(await readFile(paths.scenesFile, 'utf8'), before)
  const scenes = await readScenes(paths)
  assert.equal(scenes.length, 13)
  assert.deepEqual(avatarIds(scenes), [1, 7, 11])
})

test('fase: carril clásico con prefijo y avatar, cantidad pedida: confirmar la sugerida corta exactamente esa cantidad; otra se reparte solo después del prefijo y se acota como sin avatar', async (t) => {
  // 120 s con un minuto animado: el avatar en 0–10, 40–50 y 90–100. Las 13
  // fuentes (10 + 3: la de 59–60 se une a la anterior) se descuentan primero
  // y lo que queda va a los restos de 60–90 y 100–120.
  const options = { avatar: AVATAR, animationMinutes: 1, confirmScenes: true }
  const narrationOptions = { words: narration(120), seconds: 120 }
  const paused = await project(t, options, narrationOptions)
  assert.deepEqual(await sceneCutsStage.run(paused.context), { pause: true })
  assert.deepEqual(paused.events, [
    { type: 'avatar-planned', sceneIds: [1, 12, 26], dropped: 0 },
    {
      type: 'awaiting-scene-confirmation',
      suggestedScenes: 32,
      audioDurationSeconds: 120,
      wordCount: 120,
      animationMinutes: 1,
      avatarSpans: [
        { startSeconds: 0, endSeconds: 10 },
        { startSeconds: 40, endSeconds: 50 },
        { startSeconds: 90, endSeconds: 100 },
      ],
    },
  ])

  const cutWith = async (sceneCount) => {
    const { paths, context } = await project(t, options, narrationOptions)
    await writeFile(paths.scenesConfirmedFile, JSON.stringify({ sceneCount }))
    await sceneCutsStage.run(context)
    return readScenes(paths)
  }
  // La sugerida: 10 y 6 escenas de 3 s y 3,33 s en los restos.
  const suggested = await cutWith(32)
  assert.equal(suggested.length, 32)
  assert.deepEqual(
    ends(suggested).slice(11),
    [
      50, 53, 56, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 100, 103.333,
      106.667, 110, 113.333, 116.667, 120,
    ],
  )
  assert.equal(
    suggested.filter((scene) => scene.animationRequestedSeconds === 6).length,
    13,
  )
  // 30: 9 y 5 escenas para los restos de 30 y 20 s (antes salían 31).
  const thirty = await cutWith(30)
  assert.equal(thirty.length, 30)
  assert.deepEqual(
    ends(thirty).slice(14),
    [
      60, 63.333, 66.667, 70, 73.333, 76.667, 80, 83.333, 86.667, 90, 100, 104,
      108, 112, 116, 120,
    ],
  )
  // Como el prefijo sin avatar, cada resto queda entre una escena cada 12 s y
  // una cada 3 s: 40 se acota a lo que entra y 20 no deja un resto de 20 s en
  // una sola escena (sale 21: 3 y 2 escenas en los restos).
  assert.equal((await cutWith(40)).length, 32)
  const twenty = await cutWith(20)
  assert.equal(twenty.length, 21)
  assert.ok(
    twenty
      .filter((scene) => !scene.avatar)
      .every((scene) => scene.endSeconds - scene.startSeconds <= 12),
  )
})

test('fase: con avatar automático pero sin ninguna aparición que entre, la pausa trae avatarSpans vacío, avatar-planned cuenta las descartadas y un corte previo con recibos se conserva', async (t) => {
  // Un segundo menos que el mínimo de una aparición (4 s con el mínimo de
  // 5 s de la entrega 2d). El corte es el de siempre.
  const seconds = AVATAR_MIN_APPEARANCE_SECONDS - 1
  const short = narration(seconds)
  const { paths, context, events } = await project(
    t,
    { avatar: AVATAR, confirmScenes: true },
    { words: short, seconds },
  )
  assert.deepEqual(await sceneCutsStage.run(context), { pause: true })
  // La pausa ya lo dice: ninguna aparición entró y las tres pedidas quedan
  // descartadas, antes de pagar ninguna imagen.
  assert.deepEqual(events, [
    { type: 'avatar-planned', sceneIds: [], dropped: 3 },
    {
      type: 'awaiting-scene-confirmation',
      suggestedScenes: 1,
      audioDurationSeconds: seconds,
      wordCount: seconds,
      avatarSpans: [],
    },
  ])
  await writeFile(paths.scenesConfirmedFile, JSON.stringify({ sceneCount: 1 }))
  events.length = 0
  await sceneCutsStage.run(context)
  assert.deepEqual(await readScenes(paths), cutScenesByTime(short, 1))
  assert.deepEqual(events.at(-1), {
    type: 'avatar-planned',
    sceneIds: [],
    dropped: 3,
  })

  // La narración se reemplazó por una donde ya no entra ninguna aparición,
  // pero el corte previo tiene un recibo de HeyGen: se conserva aunque tenga
  // otra cantidad (rehacerlo perdería lo pagado).
  const kept = await project(t, { avatar: AVATAR }, { words: short, seconds })
  await writeScenes(kept.paths, [
    {
      id: 1,
      text: text(0, seconds - 1),
      startSeconds: 0,
      endSeconds: seconds,
      avatar: { ...SEED, status: 'planned', attempts: [RECEIPT] },
    },
  ])
  const before = await readFile(kept.paths.scenesFile, 'utf8')
  await sceneCutsStage.run(kept.context)
  assert.equal(await readFile(kept.paths.scenesFile, 'utf8'), before)
  // Las descartadas son las que le faltan a ESE corte (una de tres está en el
  // video), no las del plan de hoy (ninguna entra en 4 s).
  assert.deepEqual(kept.events.at(-1), {
    type: 'avatar-planned',
    sceneIds: [1],
    dropped: 2,
  })
})

test('reemplazar la narración con escenas de avatar sin tiempos previos (o sin duración): el reparto uniforme, nunca Infinity ni NaN', () => {
  const avatar = { ...SEED, status: 'planned' }
  const times = (list) =>
    list.map((scene) => [scene.startSeconds, scene.endSeconds])
  for (const scenes of [
    [
      { id: 1, text: 'a', avatar },
      { id: 2, text: 'b' },
    ],
    [
      { id: 1, text: 'a', startSeconds: 0, endSeconds: 10, avatar },
      { id: 2, text: 'b' },
    ],
    [
      { id: 1, text: 'a', startSeconds: 0, endSeconds: 0, avatar },
      { id: 2, text: 'b', startSeconds: 0, endSeconds: 0 },
    ],
  ]) {
    const redistributed = redistributeSceneTimes(scenes, 10)
    assert.deepEqual(times(redistributed), [
      [0, 5],
      [5, 10],
    ])
    assert.deepEqual(redistributed[0].avatar, avatar)
  }
})

// ─── La pausa rearmada desde el disco (tras reiniciar la app) ───

// El estado del proyecto como lo pide la UI (`video-project-status`).
function statusOf(context) {
  return videoProjectStatus({
    ...context,
    job: { ...context.job, payload: { projectId: 'fixture' } },
  })
}

test('estado: la pausa con avatar trae avatarSpans y avatarDropped como los anunció la fase; con el corte hecho, los tramos de sus escenas; sin avatar automático, ninguno de los dos', async (t) => {
  // La pausa de 17 s: una aparición con la cola corta absorbida y una que no
  // entró. La pausa no guarda el plan; el estado lo rearma igual.
  const paused = await project(
    t,
    {
      avatar: { ...AVATAR, appearances: 2, startWithAvatar: false },
      confirmScenes: true,
    },
    { words: narration(17), seconds: 17 },
  )
  await sceneCutsStage.run(paused.context)
  const announced = Object.fromEntries(
    paused.events.map((event) => [event.type, event]),
  )
  const atPause = await statusOf(paused.context)
  assert.equal(atPause.metadata.state, 'awaiting-confirmation')
  assert.deepEqual(atPause.scenes, [])
  assert.deepEqual(
    atPause.avatarSpans,
    announced['awaiting-scene-confirmation'].avatarSpans,
  )
  assert.deepEqual(atPause.avatarSpans, [{ startSeconds: 5, endSeconds: 17 }])
  assert.equal(atPause.avatarDropped, announced['avatar-planned'].dropped)
  assert.equal(atPause.avatarDropped, 1)

  // Ninguna aparición entra (4 s, un segundo menos que el mínimo): tramos
  // vacíos y las tres pedidas descartadas.
  const none = await project(
    t,
    { avatar: AVATAR, confirmScenes: true },
    {
      words: narration(AVATAR_MIN_APPEARANCE_SECONDS - 1),
      seconds: AVATAR_MIN_APPEARANCE_SECONDS - 1,
    },
  )
  await sceneCutsStage.run(none.context)
  const noneStatus = await statusOf(none.context)
  assert.deepEqual(noneStatus.avatarSpans, [])
  assert.equal(noneStatus.avatarDropped, 3)

  // Con el corte hecho manda scenes.json: un corte previo con un recibo de
  // HeyGen (0–12 s) se conserva aunque el plan de hoy diga 0–10.
  const kept = await project(t, { avatar: AVATAR })
  await writeScenes(kept.paths, [
    {
      id: 1,
      text: text(0, 11),
      startSeconds: 0,
      endSeconds: 12,
      avatar: { ...SEED, status: 'planned', attempts: [RECEIPT] },
    },
    { id: 2, text: text(12, 59), startSeconds: 12, endSeconds: 60 },
  ])
  await sceneCutsStage.run(kept.context)
  const afterCut = await statusOf(kept.context)
  assert.deepEqual(afterCut.avatarSpans, [{ startSeconds: 0, endSeconds: 12 }])
  // Y las descartadas son las que le faltan a ese corte (tiene una de tres),
  // como el `avatar-planned` del job que cortó.
  assert.equal(afterCut.avatarDropped, 2)
  assert.equal(
    afterCut.avatarDropped,
    kept.events.find((event) => event.type === 'avatar-planned').dropped,
  )

  // Sin avatar, o con «lo elijo en el editor», el estado no habla del avatar.
  for (const avatar of [undefined, { ...AVATAR, placement: 'manual' }]) {
    const plain = await project(t, { avatar, confirmScenes: true })
    await sceneCutsStage.run(plain.context)
    const plainStatus = await statusOf(plain.context)
    assert.equal('avatarSpans' in plainStatus, false, String(avatar))
    assert.equal('avatarDropped' in plainStatus, false, String(avatar))
  }

  // Sin words.json legible tampoco (el estado nunca falla por esto).
  await rm(paused.paths.wordsFile)
  const withoutWords = await statusOf(paused.context)
  assert.equal('avatarSpans' in withoutWords, false)
})

test('carril de segundos con avatar: una confirmación por cantidad se traduce a segundos sobre el audio libre y las escenas libres, no sobre los pines', async (t) => {
  // 60 s con el avatar en 0–10, 25–35 y 45–55: quedan 30 s libres. Confirmar
  // 9 escenas son 6 imágenes de 5 s (30 / 6), el mismo corte que confirmar
  // 5 s. El audio entero dividido por las 9 (que cuentan los pines) daría
  // 7 s por imagen y otro corte.
  const customStyle = {
    styleId: 'mi-estilo',
    name: 'Mi estilo',
    systemPrompt: 'Ilustraciones a lápiz.',
  }
  const confirmedCut = async (confirmation) => {
    const { paths, context } = await project(t, {
      avatar: AVATAR,
      customStyle,
      secondsPerScene: 3,
    })
    await writeFile(paths.scenesConfirmedFile, JSON.stringify(confirmation))
    await sceneCutsStage.run(context)
    return readScenes(paths)
  }
  const byCount = await confirmedCut({ sceneCount: 9 })
  assert.deepEqual(byCount, await confirmedCut({ secondsPerScene: 5 }))
  assert.equal(byCount.length, 9)
  assert.deepEqual(avatarIds(byCount), [1, 5, 8])
  assert.notDeepEqual(byCount, await confirmedCut({ secondsPerScene: 7 }))
})

test('fase y estado: un corte reusado con sus tres apariciones (con recibos) tras reemplazar la narración por una de 6 s no las cuenta como descartadas', async (t) => {
  // El corte de 60 s con el avatar en las escenas 1, 7 y 11, cada aparición con
  // su recibo de HeyGen, escalado a una narración nueva de 6 s como lo deja el
  // reemplazo de narración. En 6 s hoy no entra ninguna aparición (el plan
  // diría tres descartadas), pero las tres siguen en el video.
  const original = await project(t, { avatar: AVATAR })
  await sceneCutsStage.run(original.context)
  const paid = (await readScenes(original.paths)).map((scene) => {
    if (!scene.avatar) return scene

    return { ...scene, avatar: { ...scene.avatar, attempts: [RECEIPT] } }
  })
  assert.deepEqual(avatarIds(paid), [1, 7, 11])
  const replaced = redistributeSceneTimes(paid, 6)

  // Tras confirmar, el job reusa el corte (tiene recibos) y lo anuncia una
  // sola vez, sin descartadas; el estado dice lo mismo.
  const { paths, context, events } = await project(
    t,
    { avatar: AVATAR, confirmScenes: true },
    { words: narration(6), seconds: 6 },
  )
  await writeScenes(paths, replaced)
  await writeFile(paths.scenesConfirmedFile, JSON.stringify({ sceneCount: 12 }))
  const before = await readFile(paths.scenesFile, 'utf8')
  await sceneCutsStage.run(context)
  assert.equal(await readFile(paths.scenesFile, 'utf8'), before)
  assert.deepEqual(
    events.filter((event) => event.type === 'avatar-planned'),
    [{ type: 'avatar-planned', sceneIds: [1, 7, 11], dropped: 0 }],
  )
  const status = await statusOf(context)
  assert.equal(status.avatarDropped, 0)
  assert.deepEqual(
    status.avatarSpans,
    replaced
      .filter((scene) => scene.avatar)
      .map(({ startSeconds, endSeconds }) => ({ startSeconds, endSeconds })),
  )
})

test('estado: un words.json roto ([null], [1, 2], palabras sin tiempos) no rompe el estado ni trae los campos del avatar', async (t) => {
  // Antes de la ola el estado no leía words.json: un archivo así (editado a
  // mano o dañado) no puede impedir abrir el proyecto en pausa.
  const { paths, context } = await project(t, {
    avatar: AVATAR,
    confirmScenes: true,
  })
  await sceneCutsStage.run(context)
  for (const words of [
    [null],
    [1, 2],
    [{ word: 'hola' }],
    [{ word: 'hola', start: 0, end: null }],
  ]) {
    await writeFile(paths.wordsFile, JSON.stringify(words))
    const message = JSON.stringify(words)
    const status = await statusOf(context)
    assert.equal(status.metadata.state, 'awaiting-confirmation', message)
    assert.equal('avatarSpans' in status, false, message)
    assert.equal('avatarDropped' in status, false, message)
  }
})
