// La duración de una aparición elegida en el editor (entrega 2g, diseño §23.3).
// El plan (`avatarResizePlan`, pipeline/avatar/resize-plan.ts, puro y
// browser-safe): el inicio no se mueve y el fin lo pone `avatarCutEnd` con el
// límite de `avatarCutLimit` (una pausa de más de 2 s corta ahí) sobre el máximo
// de `avatarResizeLimits` (el fin del audio, si es lo que limita, es un corte);
// al crecer, las escenas de imagen que tapa enteras salen y la que tiene el fin
// empieza ahí, o sale si le quedarían menos de 3 s y la que sigue empieza en el
// fin; si no hay una que pueda empezar antes (la última, o una bloqueada), el
// avatar se queda con ese resto sin pasar 60 s ni quedar a menos de 3 s de la
// próxima de avatar (si no, el corte se busca de nuevo dejando 3 s); al
// achicar, la que sigue empieza en el fin (la última escena no se achica); una
// bloqueada o de avatar nunca se mueve (`avatar_resize_locked`); fuera de los
// límites, `avatar_resize_out_of_range`; la misma duración no cambia nada; los
// textos tocados salen de la regla del corte entero (`cutScenesAtBoundaries`).
// El render con `durations` (`avatar-render-scenes`, HeyGen simulado y el
// ffmpeg del repo): el payload validado y el plan antes de hablar con HeyGen
// (un plan que no mueve el fin hacia lo pedido tampoco sirve); el carril
// trabaja una copia con el tramo nuevo (su corte de audio, su huella, su
// costo) mientras la escena real conserva su tramo; el plan se aplica con el
// clip nuevo, en la misma escritura, sobre lo que hay en disco (si ya no
// entra, el clip queda en disco, la escena no cambia y sale
// `avatar_resize_out_of_range`); si el render falla o se cancela, nada cambia
// (la lista conserva su clip) y la misma duración cosecha el render pago sin
// pagar otro. El recorte (`avatar-trim-scene`): sin proveedor y sin clave,
// del crudo del proveedor (o del clip si no está) a un archivo nuevo con la
// huella del tramo nuevo, sin retimar; la escena y su vecina en una escritura
// y el video desactualizado; `avatar_trim_unavailable` sin clip listo y al
// día o sin achicar; el payload; y el lease exclusivo del proyecto.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  withAnimationCheckpointLease,
  withProjectAnimationLease,
} from '../../pipeline/animation/coordination.ts'
import { inspectAnimationFile } from '../../pipeline/animation/normalize-file.ts'
import { avatarClipFileName } from '../../pipeline/avatar/clip-path.ts'
import {
  avatarAudioCutHash,
  avatarIdempotencyKey,
  avatarRenderHash,
  avatarRequestKey,
} from '../../pipeline/avatar/fingerprint.ts'
import { avatarSceneRequestHash } from '../../pipeline/avatar/lane.ts'
import { avatarMotionTextHash } from '../../pipeline/avatar/motion-prompt.ts'
import { planAvatarSpans } from '../../pipeline/avatar/planner.ts'
import { renderAvatarScenes } from '../../pipeline/avatar/render-scenes.ts'
import {
  applyAvatarResizePlan,
  avatarResizeAudioEnd,
  avatarResizePlan,
  avatarResizeScenesOf,
  isAvatarAppearanceSeconds,
  sameSpanFrames,
  withAvatarResizeSpan,
} from '../../pipeline/avatar/resize-plan.ts'
import { videosSubcommands } from '../../pipeline/commands/videos/subcommands.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { detectSentences } from '../../pipeline/narration/sentences.ts'
import { toSceneSummaries } from '../../pipeline/project/scenes-file.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { cutScenesAtBoundaries } from '../../pipeline/stages/scene-cuts/by-seconds.ts'
import {
  AVATAR_CUT_PAUSE_WINDOW_SECONDS,
  AVATAR_MIN_APPEARANCE_SECONDS,
} from '../../pipeline/types/avatar.ts'
import {
  FFMPEG,
  ORIGINAL_FETCH,
  fakeClock,
  fakeHeyGen,
  isBlue,
  isGreen,
  isRed,
  pixelAt,
  writeHeyGenClip,
  writeNarration,
} from './avatar-fixture.mjs'

// ─── El plan (puro) ───

// Palabras de 0,15 s cada 0,2 s (5 cuadros) de `from` a `to`: los huecos (0,05
// s) no son naturales y caen en la grilla de 25 fps, así un objetivo entero
// corta justo ahí. `ends` marca, por su inicio, las que cierran frase; `gaps`
// saca las de esos tramos (un silencio).
function narration(from, to, { ends = [], gaps = [] } = {}) {
  const words = []
  for (
    let milliseconds = Math.round(from * 1000);
    milliseconds < Math.round(to * 1000) - 1;
    milliseconds += 200
  ) {
    const start = milliseconds / 1000
    if (gaps.some(([gapStart, gapEnd]) => start >= gapStart && start < gapEnd))
      continue

    words.push({
      word: `w${milliseconds / 200}`,
      start,
      end: (milliseconds + 150) / 1000,
      ...(ends.includes(start) ? { sentenceEnd: true } : {}),
    })
  }
  return words
}

const image = (id, startSeconds, endSeconds, timingLocked = false) => ({
  id,
  startSeconds,
  endSeconds,
  isAvatar: false,
  timingLocked,
})
const avatar = (id, startSeconds, endSeconds) => ({
  id,
  startSeconds,
  endSeconds,
  isAvatar: true,
  timingLocked: false,
})
const planOf = (scenes, words, sceneId, seconds) =>
  avatarResizePlan(
    scenes,
    words,
    sceneId,
    seconds,
    avatarResizeAudioEnd(scenes),
  )
// Lo que cambia de cada escena: [id, inicio, fin].
const spansOf = (plan) =>
  plan.changes.map((change) => [
    change.sceneId,
    change.startSeconds,
    change.endSeconds,
  ])

// Los textos que daría el corte entero (`cutScenesAtBoundaries`) sobre la
// línea de tiempo con el plan aplicado, por id.
function wholeCutTexts(scenes, plan, words) {
  const removed = new Set(plan.removedIds)
  const changes = new Map(
    plan.changes.map((change) => [change.sceneId, change]),
  )
  const timeline = scenes
    .filter((scene) => !removed.has(scene.id))
    .map((scene) => ({ ...scene, ...changes.get(scene.id) }))
    .sort((first, second) => first.startSeconds - second.startSeconds)
  const cut = cutScenesAtBoundaries(words, [
    timeline[0].startSeconds,
    ...timeline.map((scene) => scene.endSeconds),
  ])
  return new Map(timeline.map((scene, index) => [scene.id, cut[index].text]))
}

// Cada escena tocada lleva el texto que le daría el corte entero.
function assertWholeCutTexts(scenes, plan, words) {
  const texts = wholeCutTexts(scenes, plan, words)
  for (const change of plan.changes)
    assert.equal(
      change.text,
      texts.get(change.sceneId),
      `texto ${change.sceneId}`,
    )
}

// Una narración de 40 s, la escena de avatar 2 de 4 a 14 s (10 s) y escenas
// de imagen de 4 s, la última de 6.
const WORDS_40 = narration(0, 40)
const TIMELINE = [
  image(1, 0, 4),
  avatar(2, 4, 14),
  image(3, 14, 18),
  image(4, 18, 22),
  image(5, 22, 26),
  image(6, 26, 30),
  image(7, 30, 34),
  image(8, 34, 40),
]
const locked = (scenes, ...ids) =>
  scenes.map((scene) =>
    ids.includes(scene.id) ? { ...scene, timingLocked: true } : scene,
  )

test('crecer: las de imagen que tapa enteras salen y la que tiene el fin empieza ahí, sobre una, dos y tres escenas; el texto de cada escena tocada es el del corte entero', () => {
  const cases = [
    // 11 s: corta a los 15 y a la 3 le quedan 3 s.
    [
      11,
      [
        [2, 4, 15],
        [3, 15, 18],
      ],
      [],
    ],
    // 14 s: tapa la 3 entera; la 4 ya empieza a los 18.
    [14, [[2, 4, 18]], [3]],
    // 15, 19 y 23 s: tapa una, dos y tres y la que tiene el fin empieza ahí.
    [
      15,
      [
        [2, 4, 19],
        [4, 19, 22],
      ],
      [3],
    ],
    [
      19,
      [
        [2, 4, 23],
        [5, 23, 26],
      ],
      [3, 4],
    ],
    [
      23,
      [
        [2, 4, 27],
        [6, 27, 30],
      ],
      [3, 4, 5],
    ],
  ]
  for (const [seconds, spans, removedIds] of cases) {
    const { plan } = planOf(TIMELINE, WORDS_40, 2, seconds)
    assert.deepEqual(
      [plan.startSeconds, plan.endSeconds],
      [4, spans[0][2]],
      `${seconds} s`,
    )
    assert.deepEqual(spansOf(plan), spans, `${seconds} s`)
    assert.deepEqual(plan.removedIds, removedIds, `${seconds} s`)
    assertWholeCutTexts(TIMELINE, plan, WORDS_40)
  }
  // 36 s llega al fin del audio (el máximo): tapa todas las que siguen.
  const { plan } = planOf(TIMELINE, WORDS_40, 2, 36)
  assert.deepEqual(spansOf(plan), [[2, 4, 40]])
  assert.deepEqual(plan.removedIds, [3, 4, 5, 6, 7, 8])
  assertWholeCutTexts(TIMELINE, plan, WORDS_40)
})

test('la que queda corta: si a la escena del fin le quedarían menos de 3 s, sale y la de imagen que sigue empieza en el fin; también con el corte en un fin de frase', () => {
  const { plan } = planOf(TIMELINE, WORDS_40, 2, 12)
  assert.deepEqual(spansOf(plan), [
    [2, 4, 16],
    [4, 16, 22],
  ])
  assert.deepEqual(plan.removedIds, [3])
  assertWholeCutTexts(TIMELINE, plan, WORDS_40)

  // Un fin de frase a 0,4 s del objetivo gana (la regla de §23.2): corta a los
  // 15,4 y a la 3 le quedarían 2,6 s.
  const sentences = narration(0, 40, { ends: [15.2] })
  const natural = planOf(TIMELINE, sentences, 2, 11).plan
  assert.deepEqual(spansOf(natural), [
    [2, 4, 15.4],
    [4, 15.4, 22],
  ])
  assert.deepEqual(natural.removedIds, [3])
  assertWholeCutTexts(TIMELINE, natural, sentences)
})

test('achicar: la que sigue empieza en el fin nuevo y suma las palabras que el avatar ya no dice', () => {
  const { plan } = planOf(TIMELINE, WORDS_40, 2, 7)
  assert.deepEqual(spansOf(plan), [
    [2, 4, 11],
    [3, 11, 18],
  ])
  assert.deepEqual(plan.removedIds, [])
  assertWholeCutTexts(TIMELINE, plan, WORDS_40)
  assert.match(plan.changes[1].text, /^w55 /)
})

test('la misma duración no cambia nada: los segundos que redondean a la de hoy, y un corte que cae en el mismo cuadro que el fin de hoy', () => {
  const unchanged = {
    startSeconds: 4,
    endSeconds: 14,
    changes: [],
    removedIds: [],
  }
  assert.deepEqual(planOf(TIMELINE, WORDS_40, 2, 10).plan, unchanged)
  // 10,4 s redondea a 10.
  const longer = TIMELINE.map((scene) => {
    if (scene.id === 2) return { ...scene, endSeconds: 14.4 }
    if (scene.id === 3) return { ...scene, startSeconds: 14.4 }
    return scene
  })
  assert.deepEqual(planOf(longer, WORDS_40, 2, 10).plan, {
    ...unchanged,
    endSeconds: 14.4,
  })
  // Una palabra de 2 s (de los 14 a los 16): con 11 s, el hueco más cercano a
  // los 15 es el de los 14, el fin de hoy.
  const held = [
    ...narration(0, 14),
    { word: 'larga', start: 14, end: 16 },
    ...narration(16.05, 40),
  ]
  assert.deepEqual(planOf(TIMELINE, held, 2, 11).plan, unchanged)
  // Un fin de hoy fuera de la grilla (14,01): el corte a los 14 cae en el mismo
  // cuadro y nada se mueve, ni la escena que sigue.
  const offGrid = TIMELINE.map((scene) => {
    if (scene.id === 2) return { ...scene, endSeconds: 14.01 }
    if (scene.id === 3) return { ...scene, startSeconds: 14.01 }
    return scene
  })
  assert.deepEqual(planOf(offGrid, held, 2, 11).plan, {
    ...unchanged,
    endSeconds: 14.01,
  })
})

test('límites: fuera de 5 a 60, del máximo del lugar o con segundos que no son enteros, avatar_resize_out_of_range; la próxima de avatar deja 3 s', () => {
  for (const seconds of [37, 4, 61, 7.5, Number.NaN, '7'])
    assert.deepEqual(
      planOf(TIMELINE, WORDS_40, 2, seconds),
      { errorCode: 'avatar_resize_out_of_range' },
      String(seconds),
    )
  // Una escena que no es de avatar, o que no existe.
  for (const sceneId of [3, 99])
    assert.deepEqual(planOf(TIMELINE, WORDS_40, sceneId, 7), {
      errorCode: 'avatar_resize_out_of_range',
    })

  // La próxima de avatar arranca a los 26: hasta los 23 (19 s).
  const twoAvatars = [
    image(1, 0, 4),
    avatar(2, 4, 14),
    image(3, 14, 18),
    image(4, 18, 22),
    image(5, 22, 26),
    avatar(6, 26, 36),
    image(7, 36, 40),
  ]
  const { plan } = planOf(twoAvatars, WORDS_40, 2, 19)
  assert.deepEqual(spansOf(plan), [
    [2, 4, 23],
    [5, 23, 26],
  ])
  assert.deepEqual(plan.removedIds, [3, 4])
  assert.deepEqual(planOf(twoAvatars, WORDS_40, 2, 20), {
    errorCode: 'avatar_resize_out_of_range',
  })
})

test('bloqueadas: con la que sigue bloqueada la duración no cambia (avatar_resize_locked, salvo la de hoy); una bloqueada más adelante limita, y el avatar se queda con el resto de la escena que no puede empezar antes', () => {
  const nextLocked = locked(TIMELINE, 3)
  for (const seconds of [11, 7])
    assert.deepEqual(planOf(nextLocked, WORDS_40, 2, seconds), {
      errorCode: 'avatar_resize_locked',
    })
  assert.deepEqual(planOf(nextLocked, WORDS_40, 2, 10).plan.changes, [])

  // La 5 (22 a 26) está bloqueada: hasta los 22 (18 s). Con 17 s el corte cae
  // a los 21 y a la 4 le quedaría 1 s; la que sigue no puede empezar antes, así
  // que el avatar se queda con ese segundo.
  const fifthLocked = locked(TIMELINE, 5)
  for (const seconds of [17, 18]) {
    const { plan } = planOf(fifthLocked, WORDS_40, 2, seconds)
    assert.deepEqual(spansOf(plan), [[2, 4, 22]], `${seconds} s`)
    assert.deepEqual(plan.removedIds, [3, 4], `${seconds} s`)
    assertWholeCutTexts(fifthLocked, plan, WORDS_40)
  }
  assert.deepEqual(planOf(fifthLocked, WORDS_40, 2, 19), {
    errorCode: 'avatar_resize_out_of_range',
  })

  // Una bloqueada (15 a 17) justo antes de la próxima de avatar (a los 17):
  // quedarse con el resto de la 2 dejaría el avatar a 2 s del siguiente, así que
  // el corte se busca de nuevo dejándole 3 s a la 2.
  const beforeNextAvatar = [
    avatar(1, 0, 10),
    image(2, 10, 15),
    image(3, 15, 17, true),
    avatar(4, 17, 27),
    image(5, 27, 30),
  ]
  const words = narration(0, 30)
  const { plan } = planOf(beforeNextAvatar, words, 1, 14)
  assert.deepEqual(spansOf(plan), [
    [1, 0, 12],
    [2, 12, 15],
  ])
  assert.deepEqual(plan.removedIds, [])
  assertWholeCutTexts(beforeNextAvatar, plan, words)

  // Una bloqueada de medio segundo al final del audio (no la arma el corte): el
  // máximo, que llegaría al fin del audio, para en su inicio (m3 de la
  // revisión). Sin eso, el fin de frase de los 40,2 le pasaría el inicio y el
  // plan se rechazaría; así da 4 a 40, saca la 3 y deja la bloqueada.
  const shortLockedEnd = [
    image(1, 0, 4),
    avatar(2, 4, 14),
    image(3, 14, 40),
    image(4, 40, 40.5, true),
  ]
  const lockedEndWords = narration(0, 40.5, { ends: [40] })
  const beforeLocked = planOf(shortLockedEnd, lockedEndWords, 2, 36).plan
  assert.deepEqual(spansOf(beforeLocked), [[2, 4, 40]])
  assert.deepEqual(beforeLocked.removedIds, [3])
  assertWholeCutTexts(shortLockedEnd, beforeLocked, lockedEndWords)

  // Dos avatares pegados (no los arma el planificador): achicar el primero
  // movería el segundo.
  const adjacent = [avatar(1, 0, 10), avatar(2, 10, 20), image(3, 20, 30)]
  assert.deepEqual(planOf(adjacent, narration(0, 30), 1, 7), {
    errorCode: 'avatar_resize_locked',
  })
})

test('el fin del audio: la última escena de avatar no se achica; si a la última de imagen le quedarían menos de 3 s, el avatar llega al fin (con la palabra que pasa del audio); si no, empieza en el fin', () => {
  const lastAvatar = [image(1, 0, 10), image(2, 10, 20), avatar(3, 20, 30)]
  assert.deepEqual(planOf(lastAvatar, narration(0, 30), 3, 7), {
    errorCode: 'avatar_resize_out_of_range',
  })

  // Una palabra que pasa del fin del audio (36,8 a 37,3): el corte entero se la
  // da a la última escena.
  const words = [
    ...narration(0, 36.8),
    { word: 'cola', start: 36.8, end: 37.3 },
  ]
  const nearEnd = [
    image(1, 0, 20),
    avatar(2, 20, 30),
    image(3, 30, 34),
    image(4, 34, 37),
  ]
  for (const seconds of [15, 17]) {
    const { plan } = planOf(nearEnd, words, 2, seconds)
    assert.deepEqual(spansOf(plan), [[2, 20, 37]], `${seconds} s`)
    assert.deepEqual(plan.removedIds, [3, 4], `${seconds} s`)
    assert.match(plan.changes[0].text, / cola$/)
    assertWholeCutTexts(nearEnd, plan, words)
  }
  const { plan } = planOf(nearEnd, words, 2, 12)
  assert.deepEqual(spansOf(plan), [
    [2, 20, 32],
    [4, 32, 37],
  ])
  assert.deepEqual(plan.removedIds, [3])
  assertWholeCutTexts(nearEnd, plan, words)

  // Si lo que limita es el fin del audio, el máximo llega hasta él aunque no
  // sea un segundo entero desde el inicio (36,5 s; el máximo dice 36): con una
  // última escena de medio segundo (no la arma el corte), el fin de frase de los
  // 40,2 gana y el avatar llega al fin. Con el máximo en 4 + 36, el corte
  // quedaría en los 40 y la escena de medio segundo seguiría en el video.
  const halfSecondEnd = [
    image(1, 0, 4),
    avatar(2, 4, 14),
    image(3, 14, 40),
    image(4, 40, 40.5),
  ]
  const endWords = narration(0, 40.5, { ends: [40] })
  const reached = planOf(halfSecondEnd, endWords, 2, 36).plan
  assert.deepEqual(spansOf(reached), [[2, 4, 40.5]])
  assert.deepEqual(reached.removedIds, [3, 4])
  assertWholeCutTexts(halfSecondEnd, reached, endWords)
})

test('el tope de 60 s: si quedarse con el resto lo pasaría, el corte se busca de nuevo dejándole 3 s a esa escena', () => {
  const words = narration(0, 61.5)
  const scenes = [avatar(1, 0, 52), image(2, 52, 56), image(3, 56, 61.5)]
  const { plan } = planOf(scenes, words, 1, 60)
  assert.deepEqual(spansOf(plan), [
    [1, 0, 58.4],
    [3, 58.4, 61.5],
  ])
  assert.deepEqual(plan.removedIds, [2])
  assertWholeCutTexts(scenes, plan, words)
})

test('una pausa de más de 2 s corta la aparición (avatarCutLimit, R-2g-11): la última palabra antes del silencio más 2 s', () => {
  const words = narration(0, 40, { gaps: [[16, 19.5]] })
  const { plan } = planOf(TIMELINE, words, 2, 20)
  assert.deepEqual(spansOf(plan), [
    [2, 4, 17.92],
    [4, 17.92, 22],
  ])
  assert.deepEqual(plan.removedIds, [3])
  assertWholeCutTexts(TIMELINE, plan, words)
})

// La narración de la sonda de la revisión final de la 2g (I-1): «Hola.» de 0,5
// a 0,9 s con fin de frase, 3 s de silencio y, desde los 3,9 s, una palabra de
// 0,3 s cada 0,4 s con fin de frase cada cinco, hasta los 40,4 s del audio.
const PAUSED_AUDIO_END = 40.4
function pausedOpeningWords() {
  const words = [{ word: 'Hola.', start: 0.5, end: 0.9, sentenceEnd: true }]
  for (let index = 1; 3900 + (index - 1) * 400 < 40_000; index++) {
    const milliseconds = 3900 + (index - 1) * 400
    const sentenceEnd = index % 5 === 0
    words.push({
      word: sentenceEnd ? `w${index}.` : `w${index}`,
      start: milliseconds / 1000,
      end: (milliseconds + 300) / 1000,
      ...(sentenceEnd ? { sentenceEnd: true } : {}),
    })
  }
  return words
}
const PAUSED_WORDS = pausedOpeningWords()
// La apertura sobre esa narración, de 0 a `endSeconds`, y las escenas de imagen
// que la siguen hasta el fin del audio.
const pausedOpening = (endSeconds) => [
  avatar(1, 0, endSeconds),
  image(2, endSeconds, 20),
  image(3, 20, 30),
  image(4, 30, PAUSED_AUDIO_END),
]
// El piso de una aparición: lo mínimo que se puede elegir menos el medio
// segundo del corte (4,5 s).
const FLOOR = AVATAR_MIN_APPEARANCE_SECONDS - AVATAR_CUT_PAUSE_WINDOW_SECONDS
// [id, inicio, fin] de la escena de avatar y de la que empieza en su fin.
const shrunkOrGrown = (avatarId, startSeconds, endSeconds, nextEndSeconds) => [
  [avatarId, startSeconds, endSeconds],
  [avatarId + 1, endSeconds, nextEndSeconds],
]

test('la apertura que carga una pausa (R-2g-21, I-1 de la revisión final): si con la regla de 2 s el corte la deja por debajo de 4,5 s, el plan prueba como el segundo intento del planificador (pausas de hasta 6 s); así se recorta cerca de 7 u 8 s y se alarga a 12 o 15, y una apertura que un recorte de antes dejó en 2,88 s vuelve', () => {
  // El planificador abre el video cargando la pausa de 3 s (R-2g-17).
  const { spans } = planAvatarSpans(
    detectSentences(PAUSED_WORDS, PAUSED_AUDIO_END),
    PAUSED_WORDS,
    { appearances: 1, secondsPerAppearance: 10, startWithAvatar: true },
  )
  assert.deepEqual(
    spans.map((span) => [span.startSeconds, span.endSeconds]),
    [[0, 9.92]],
  )

  // Con la regla de 2 s, la pausa la cortaba a los 2,88 s con cualquier
  // duración: «Recortar a 8 s» la dejaba en 2,88 y 12 o 15 no entraban.
  const scenes = pausedOpening(9.92)
  for (const [seconds, end] of [
    [8, 7.92],
    [7, 7.12],
    [12, 11.92],
    [15, 15.12],
  ]) {
    const { plan } = planOf(scenes, PAUSED_WORDS, 1, seconds)
    assert.deepEqual(
      spansOf(plan),
      shrunkOrGrown(1, 0, end, 20),
      `${seconds} s`,
    )
    assert.deepEqual(plan.removedIds, [], `${seconds} s`)
    assertWholeCutTexts(scenes, plan, PAUSED_WORDS)
  }

  // Una apertura que un recorte de antes dejó en 2,88 s ya no queda clavada:
  // vuelve a 5 o a 10 s.
  const stuck = pausedOpening(2.88)
  for (const [seconds, end] of [
    [5, 5.08],
    [10, 9.92],
  ]) {
    const { plan } = planOf(stuck, PAUSED_WORDS, 1, seconds)
    assert.deepEqual(
      spansOf(plan),
      shrunkOrGrown(1, 0, end, 20),
      `${seconds} s`,
    )
    assertWholeCutTexts(stuck, plan, PAUSED_WORDS)
  }
})

test('el segundo intento de la apertura es el del planificador (R-2g-17 y R-2g-21): primero corta en las pausas de más de 2 s y, si así llega a 4,5 s, no carga la pausa; cargando las de hasta 6 s, una más larga la corta igual, 2 s después de la palabra que la precede', () => {
  // Habla de 0 a 4,95, calla 3,05 s y sigue: con la regla de 2 s la apertura
  // llega a 6,92 (más que el piso), así que no carga ese silencio, que el
  // proveedor cobraría. Con 9 s se recorta a los 6,92, no a los 9.
  const talksFirst = narration(0, 40, { gaps: [[5, 8]] })
  const longOpening = [avatar(1, 0, 10), image(2, 10, 20), image(3, 20, 40)]
  assert.deepEqual(
    spansOf(planOf(longOpening, talksFirst, 1, 9).plan),
    shrunkOrGrown(1, 0, 6.92, 20),
  )

  // «Hola.», 3 s de pausa, cinco palabras hasta los 5,8 y 8,2 s de silencio:
  // el segundo intento carga la primera pausa y la segunda lo corta a los 7,8
  // (5,8 + 2), como en el planificador, también pidiendo 9 o 12 s.
  const twoPauses = [...PAUSED_WORDS.slice(0, 6), ...narration(14, 40)]
  const { spans } = planAvatarSpans(detectSentences(twoPauses, 40), twoPauses, {
    appearances: 1,
    secondsPerAppearance: 10,
    startWithAvatar: true,
  })
  assert.deepEqual(
    spans.map((span) => [span.startSeconds, span.endSeconds]),
    [[0, 7.8]],
  )
  for (const seconds of [9, 12])
    assert.deepEqual(
      spansOf(planOf(longOpening, twoPauses, 1, seconds).plan),
      shrunkOrGrown(1, 0, 7.8, 20),
      `${seconds} s`,
    )
})

test('ningún plan deja una aparición de menos de 4,5 s (R-2g-21): una escena que no abre el video con una pausa de 3 s adentro no cambia de duración (avatar_resize_out_of_range); un corte a los 4,6 s sí sirve; y, en cada lugar de este guard, todo plan dura al menos el piso', () => {
  // De los 5 a los 8 no hay palabras: la regla de 2 s corta a los 6,92 y la
  // escena 2 (de 4 a 14) duraría 2,92 s con cualquier duración pedida.
  const gapped = narration(0, 40, { gaps: [[5, 8]] })
  for (const seconds of [5, 7, 9, 12, 19, 36])
    assert.deepEqual(
      planOf(TIMELINE, gapped, 2, seconds),
      { errorCode: 'avatar_resize_out_of_range' },
      `${seconds} s`,
    )
  // La duración de hoy sigue sin pedir nada.
  assert.deepEqual(planOf(TIMELINE, gapped, 2, 10).plan.changes, [])

  // Un fin de frase a los 8,4 (el corte cae a los 8,6): con 5 s la aparición
  // dura 4,6, entre el piso y lo mínimo que se elige, y sirve.
  const nearFloor = narration(0, 40, { ends: [8.4] })
  assert.deepEqual(
    spansOf(planOf(TIMELINE, nearFloor, 2, 5).plan),
    shrunkOrGrown(2, 4, 8.6, 18),
  )

  // Cada duración elegible en cada lugar: si hay plan, dura al menos el piso.
  const stuckInside = TIMELINE.map((scene) => {
    if (scene.id === 2) return { ...scene, endSeconds: 6.92 }
    if (scene.id === 3) return { ...scene, startSeconds: 6.92 }
    return scene
  })
  const places = [
    [TIMELINE, WORDS_40, 2],
    [TIMELINE, gapped, 2],
    [TIMELINE, nearFloor, 2],
    [stuckInside, gapped, 2],
    [pausedOpening(9.92), PAUSED_WORDS, 1],
    [pausedOpening(2.88), PAUSED_WORDS, 1],
  ]
  let plans = 0
  for (const [scenes, words, sceneId] of places)
    for (let seconds = 5; seconds <= 60; seconds++) {
      const outcome = planOf(scenes, words, sceneId, seconds)
      if (!('plan' in outcome)) continue

      plans++
      const { startSeconds, endSeconds } = outcome.plan
      assert.ok(
        endSeconds - startSeconds >= FLOOR - 1e-6,
        `${seconds} s en la escena ${sceneId}: ${startSeconds} a ${endSeconds}`,
      )
    }
  assert.ok(plans > 100, `planes revisados: ${plans}`)
})

test('avatarResizeScenesOf: el candado es el de update-scenes (animaciones hechas o pendientes, por sus `sceneIds`); avatarResizeAudioEnd es el fin de la última escena', () => {
  const block = (sceneIds) => ({ sceneIds })
  const scenes = [
    {
      id: 1,
      text: '',
      startSeconds: 0,
      endSeconds: 4,
      animation: block([1, 2]),
    },
    { id: 2, text: '', startSeconds: 4, endSeconds: 8 },
    {
      id: 3,
      text: '',
      startSeconds: 8,
      endSeconds: 12,
      animations: [block([3])],
    },
    {
      id: 4,
      text: '',
      startSeconds: 12,
      endSeconds: 16,
      animationPending: [block([5])],
    },
    { id: 5, text: '', startSeconds: 16, endSeconds: 20 },
    {
      id: 6,
      text: '',
      startSeconds: 20,
      endSeconds: 26,
      avatar: { lookId: 'look-1' },
    },
    { id: 7, text: '' },
  ]
  const resize = avatarResizeScenesOf(scenes)
  assert.deepEqual(
    resize.map((scene) => [scene.id, scene.timingLocked, scene.isAvatar]),
    [
      [1, true, false],
      [2, true, false],
      [3, true, false],
      [4, false, false],
      [5, true, false],
      [6, false, true],
      [7, false, false],
    ],
  )
  assert.ok(Number.isNaN(resize[6].startSeconds))
  assert.equal(avatarResizeAudioEnd(resize), 26)
  assert.ok(Number.isNaN(avatarResizeAudioEnd([resize[6]])))
})

test('applyAvatarResizePlan: saca las que salen, cambia tramo y texto de las tocadas y pone el avatar; no toca nada más; withAvatarResizeSpan y sameSpanFrames', () => {
  const plan = planOf(TIMELINE, WORDS_40, 2, 12).plan
  const scenes = TIMELINE.map(({ id, startSeconds, endSeconds, isAvatar }) => ({
    id,
    text: `texto ${id}`,
    startSeconds,
    endSeconds,
    imagePrompt: `prompt ${id}`,
    ...(isAvatar ? { avatar: { lookId: 'look-1', status: 'planned' } } : {}),
  }))
  const ready = {
    lookId: 'look-1',
    status: 'ready',
    clipFile: 'scene_2.ab12cd34.mp4',
  }
  const applied = applyAvatarResizePlan(scenes, 2, plan, ready)
  assert.deepEqual(
    applied.map((scene) => scene.id),
    [1, 2, 4, 5, 6, 7, 8],
  )
  const byId = new Map(applied.map((scene) => [scene.id, scene]))
  assert.deepEqual(byId.get(2), {
    ...scenes[1],
    startSeconds: 4,
    endSeconds: 16,
    text: plan.changes[0].text,
    avatar: ready,
  })
  assert.deepEqual(byId.get(4), {
    ...scenes[3],
    startSeconds: 16,
    text: plan.changes[1].text,
  })
  for (const id of [1, 5, 6, 7, 8])
    assert.equal(byId.get(id), scenes[id - 1], `escena ${id}`)

  const copy = withAvatarResizeSpan(scenes[1], plan)
  assert.deepEqual(copy, {
    ...scenes[1],
    endSeconds: 16,
    text: plan.changes[0].text,
  })
  assert.equal(copy.avatar, scenes[1].avatar)
  assert.equal(withAvatarResizeSpan(scenes[2], plan), scenes[2])

  assert.ok(sameSpanFrames({ startSeconds: 4, endSeconds: 16 }, plan))
  // Medio cuadro no cambia el cuadro; uno entero, sí.
  assert.ok(sameSpanFrames({ startSeconds: 4, endSeconds: 16.019 }, plan))
  assert.ok(!sameSpanFrames({ startSeconds: 4, endSeconds: 16.04 }, plan))
})

test('isAvatarAppearanceSeconds: un entero de 5 a 60', () => {
  for (const value of [5, 12, 60]) assert.ok(isAvatarAppearanceSeconds(value))
  for (const value of [4, 61, 7.5, '7', Number.NaN, null, undefined])
    assert.ok(!isAvatarAppearanceSeconds(value), String(value))
})

test('browser-safe: resize-plan.ts y lo que importa no traen nada de node:', async () => {
  for (const file of [
    'pipeline/avatar/resize-plan.ts',
    'pipeline/avatar/appearance-cut.ts',
    'pipeline/avatar/resize-limits.ts',
    'pipeline/animation/scene-blocks.ts',
    'pipeline/animation/timing.ts',
    'pipeline/stages/scene-cuts/by-seconds.ts',
    'pipeline/types/avatar.ts',
    'pipeline/types/scenes.ts',
  ]) {
    const source = await readFile(
      new URL(`../../${file}`, import.meta.url),
      'utf8',
    )
    assert.doesNotMatch(source, /from 'node:/, file)
  }
})

// ─── El render con `durations` y el recorte (sidecar) ───

const PROJECT_ID = 'mi-video'
const AUDIO_SECONDS = 30
const WORDS = narration(0, AUDIO_SECONDS)
// Imágenes de 4 s y la escena de avatar 2, de 4 a 10 s (6 s): hasta 26 s.
const BOUNDARIES = [0, 4, 10, 14, 18, 22, 26, 30]
const LOOK = {
  lookId: 'look-1',
  lookName: 'Ana',
  lookType: 'photo_avatar',
  engine: 'avatar_iii',
  origin: 'auto',
}
const OPTIONS = {
  styleId: 'normal',
  sceneCount: 0,
  narrationMode: 'tts',
  imageProvider: 'evolink',
  useBgm: false,
  useOverlay: false,
  confirmScenes: false,
  videoFormat: '16:9',
}
// El clip listo de una escena de avatar de este proyecto (su nombre es el de
// un pedido; su crudo lleva los mismos 8 hex).
const READY_CLIP = 'scene_2.ab12cd34.mp4'
const READY_RAW = 'scene_2.ab12cd34.raw.mp4'

const renderHashOf = (startSeconds, endSeconds, narrationVersion = 0) =>
  avatarRenderHash({
    lookId: LOOK.lookId,
    engine: LOOK.engine,
    startFrame: Math.round(startSeconds * 25),
    endFrame: Math.round(endSeconds * 25),
    narrationVersion,
  })

// Las escenas del proyecto: el corte entero de `words` en `boundaries`, con
// la escena `avatarId` de avatar (con `avatarPatch`) y las demás con prompt.
function projectScenes({
  words = WORDS,
  boundaries = BOUNDARIES,
  avatarId = 2,
  avatarPatch = {},
} = {}) {
  return cutScenesAtBoundaries(words, boundaries).map((scene) => {
    if (scene.id !== avatarId)
      return { ...scene, imagePrompt: `prompt ${scene.id}` }

    return {
      ...scene,
      avatar: { ...LOOK, status: 'planned', ...avatarPatch },
    }
  })
}

// Una escena de avatar lista con su clip al día (de 4 a 10 s).
const readyAvatar = (patch = {}) => ({
  status: 'ready',
  clipFile: READY_CLIP,
  normalizedSeconds: 6,
  renderHash: renderHashOf(4, 10),
  narrationVersion: 0,
  usdEstimated: 0.099,
  ...patch,
})

// Un clip de un color a 1920×1080 (el cuadro del render en 16:9), sin audio.
function solidClip(path, color, seconds) {
  execFileSync(FFMPEG, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:size=1920x1080:rate=25:duration=${seconds}`,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-y',
    path,
  ])
}

// Proyecto en disco: narración de 30 s, words.json, escenas, una imagen por
// escena de imagen, el mp4 exportado y, con `readyClip`, el clip listo de la
// escena 2 (verde) y, con `raw`, su crudo del proveedor (rojo y azul desde
// los 0,48 s). Devuelve también los bytes del mp4 «de HeyGen» (2 s).
async function videoProject(
  t,
  scenes,
  { words = WORDS, metadata = {}, readyClip = false, raw = false } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-resize-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const projectDir = join(root, PROJECT_ID)
  await mkdir(join(projectDir, 'scenes'), { recursive: true })
  await mkdir(join(projectDir, 'avatar'), { recursive: true })
  writeNarration(join(projectDir, 'narration.mp3'), AUDIO_SECONDS)
  await writeFile(join(projectDir, 'words.json'), JSON.stringify(words))
  await writeFile(
    join(projectDir, 'scenes.json'),
    JSON.stringify(scenes, null, 2),
  )
  for (const scene of scenes)
    if (!scene.avatar)
      await writeFile(
        join(projectDir, 'scenes', `scene_${scene.id}.jpg`),
        'jpg',
      )
  await writeFile(
    join(projectDir, 'project.json'),
    JSON.stringify(
      {
        id: PROJECT_ID,
        name: 'Mi video',
        createdAt: '2026-10-12T15:00:00.000Z',
        updatedAt: '2026-10-12T15:00:00.000Z',
        state: 'completed',
        options: OPTIONS,
        completedStages: [
          'voice',
          'transcription',
          'scene-cuts',
          'scene-prompts',
          'images',
          'avatar',
          'animation',
          'render',
        ],
        audioDurationSeconds: AUDIO_SECONDS,
        ...metadata,
      },
      null,
      2,
    ),
  )
  await writeFile(join(projectDir, `${PROJECT_ID}.mp4`), 'previous render')
  if (readyClip) solidClip(join(projectDir, 'avatar', READY_CLIP), 'green', 6)
  if (raw)
    writeHeyGenClip(join(projectDir, 'avatar', READY_RAW), {
      seconds: 7,
      switchSeconds: 0.48,
    })
  const clipPath = join(root, 'heygen-source.mp4')
  writeHeyGenClip(clipPath, { seconds: 2, switchSeconds: 0.48 })
  return { root, projectDir, clip: await readFile(clipPath) }
}

function baseContext(
  root,
  events,
  { payload, apiKeys = { heygen: 'key-123' }, signal } = {},
) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys,
      binaryPaths: { ffmpeg: FFMPEG },
      payload,
    },
    config: resolvePipelineConfig(),
    signal: signal ?? new AbortController().signal,
    emitter: { emit: (event) => events.push(event) },
  }
}

// Los dos comandos por el registro de subcomandos de `videos`, con el lease
// que les pone ese envoltorio.
const renderScenes = (root, payload, events = [], options = {}) =>
  videosSubcommands['avatar-render-scenes'](
    baseContext(root, events, { payload, ...options }),
  )
const trimScene = (root, payload, options = {}) =>
  videosSubcommands['avatar-trim-scene'](
    baseContext(root, [], { payload, ...options }),
  )

const scenesFileOf = (projectDir) => join(projectDir, 'scenes.json')
const readScenesJson = async (projectDir) =>
  JSON.parse(await readFile(scenesFileOf(projectDir), 'utf8'))
const readMetadata = async (projectDir) =>
  JSON.parse(await readFile(join(projectDir, 'project.json'), 'utf8'))
const sceneOf = (scenes, id) => scenes.find((scene) => scene.id === id)
const spanOf = (scene) => [scene.startSeconds, scene.endSeconds]
const ofType = (events, type) => events.filter((event) => event.type === type)
const isPoll = (call) =>
  call.method === 'GET' && /^\/v3\/videos\/[^/]+$/.test(call.path)
const isBalanceRead = (call) => call.path === '/v3/users/me'
const wallet = (remaining_balance) => ({
  status: 200,
  body: { data: { wallet: { currency: 'usd', remaining_balance } } },
})
const exists = async (path) =>
  stat(path).then(
    () => true,
    () => false,
  )
// El texto que da el corte entero a [inicio, fin) dentro de `boundaries`.
const textBetween = (words, boundaries, startSeconds) =>
  cutScenesAtBoundaries(words, boundaries).find(
    (scene) => scene.startSeconds === startSeconds,
  ).text

async function narrationSha256(projectDir) {
  return createHash('sha256')
    .update(await readFile(join(projectDir, 'narration.mp3')))
    .digest('hex')
}

// La huella del pedido de la escena con ese tramo, como el carril.
async function requestHashFor(projectDir, scene, startSeconds, endSeconds) {
  return avatarSceneRequestHash(
    { ...scene, startSeconds, endSeconds },
    {
      format: '16:9',
      narrationSha256: await narrationSha256(projectDir),
      narrationVersion: 0,
    },
  )
}

// La escena 2 como una lista real (m2 de la revisión): el recibo `succeeded`
// del render de su tramo de hoy (4 a 10) y el clip con el nombre que le dio el
// carril, la clave de ese recibo. Así pasa por la cosecha antes del saldo, como
// en la app. Devuelve la huella de ese pedido y el nombre del clip.
async function paidReadyScene(projectDir) {
  const scenes = await readScenesJson(projectDir)
  const scene = sceneOf(scenes, 2)
  const hash = await requestHashFor(projectDir, scene, 4, 10)
  const clipFile = avatarClipFileName(2, avatarRequestKey(hash, 0))
  solidClip(join(projectDir, 'avatar', clipFile), 'green', 6)
  scene.avatar = {
    ...scene.avatar,
    ...readyAvatar({ clipFile }),
    attempts: [
      {
        hash,
        state: 'succeeded',
        engine: LOOK.engine,
        lookId: LOOK.lookId,
        audioAssetId: 'asset-pagado',
        videoId: 'video-pagado',
        videoUrl: 'https://cdn.example/video-pagado.mp4',
        createdAt: '2026-10-12T15:00:00.000Z',
      },
    ],
  }
  await writeFile(scenesFileOf(projectDir), JSON.stringify(scenes, null, 2))
  return { hash, clipFile }
}

// Marca la escena `sceneId` como bloqueada en scenes.json: una animación
// pendiente que la incluye, el candado de update-scenes.
async function lockScene(projectDir, sceneId) {
  const scenes = await readScenesJson(projectDir)
  for (const scene of scenes)
    if (scene.id === sceneId)
      scene.animationPending = [
        {
          id: `pendiente-${sceneId}`,
          sceneIds: [sceneId],
          startSeconds: scene.startSeconds,
          endSeconds: scene.endSeconds,
          status: 'pending',
        },
      ]
  await writeFile(scenesFileOf(projectDir), JSON.stringify(scenes, null, 2))
}

test('avatar-render-scenes: `durations` que no sirven se rechazan sin hablar con HeyGen ni guardar nada; la fase no las acepta', async (t) => {
  const project = await videoProject(t, projectScenes())
  const before = await readFile(scenesFileOf(project.projectDir), 'utf8')
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 2 })
  const valid = { sceneId: 2, seconds: 9 }
  for (const durations of [
    null,
    {},
    valid,
    [null],
    [[]],
    [{ ...valid, sceneId: 3 }],
    [{ ...valid, sceneId: 1 }],
    [{ ...valid, sceneId: '2' }],
    [{ ...valid, sceneId: 2.5 }],
    [{ ...valid, seconds: 4 }],
    [{ ...valid, seconds: 61 }],
    [{ ...valid, seconds: 9.5 }],
    [{ ...valid, seconds: '9' }],
    [{ sceneId: 2 }],
    [valid, { ...valid, seconds: 10 }],
  ])
    await assert.rejects(
      renderScenes(project.root, {
        projectId: PROJECT_ID,
        sceneIds: [2],
        durations,
      }),
      { code: 'invalid_payload' },
      JSON.stringify(durations),
    )
  const context = await buildCreateVideoContext(
    baseContext(project.root, []),
    PROJECT_ID,
  )
  await assert.rejects(renderAvatarScenes(context, { durations: [valid] }), {
    code: 'invalid_payload',
  })
  assert.deepEqual(fake.calls, [])
  assert.equal(await readFile(scenesFileOf(project.projectDir), 'utf8'), before)
})

test('avatar-render-scenes: un plan que no se puede frena la corrida con su código antes de hablar con HeyGen —fuera del máximo, con la escena que sigue bloqueada, o un corte que no mueve el fin hacia lo pedido, al crecer o al achicar—', async (t) => {
  const project = await videoProject(t, projectScenes())
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 2 })
  const request = (seconds) => ({
    projectId: PROJECT_ID,
    sceneIds: [2],
    durations: [{ sceneId: 2, seconds }],
  })
  await assert.rejects(renderScenes(project.root, request(27)), {
    code: 'avatar_resize_out_of_range',
  })
  // Como un payload inválido, el plan va antes que la clave: sin ella, el
  // motivo sigue siendo la duración.
  await assert.rejects(
    renderScenes(project.root, request(27), [], { apiKeys: {} }),
    { code: 'avatar_resize_out_of_range' },
  )

  await lockScene(project.projectDir, 3)
  const lockedBefore = await readFile(scenesFileOf(project.projectDir), 'utf8')
  for (const seconds of [9, 5])
    await assert.rejects(renderScenes(project.root, request(seconds)), {
      code: 'avatar_resize_locked',
    })
  assert.equal(
    await readFile(scenesFileOf(project.projectDir), 'utf8'),
    lockedBefore,
  )

  // Una palabra de 2 s de los 10 a los 12: con 7 s el corte más cercano a los
  // 11 es el fin de hoy. Pagar otra vez el mismo tramo no es lo pedido.
  const held = [
    ...narration(0, 10),
    { word: 'larga', start: 10, end: 12 },
    ...narration(12.05, AUDIO_SECONDS),
  ]
  const heldProject = await videoProject(t, projectScenes({ words: held }), {
    words: held,
  })
  await assert.rejects(renderScenes(heldProject.root, request(7)), {
    code: 'avatar_resize_out_of_range',
  })

  // Al achicar, lo mismo (D4). Una palabra larga de 7,8 a 9,95: con 5 s, el
  // hueco más cercano a los 9 es el de los 10, el fin de hoy.
  const shrinkHeld = [
    ...narration(0, 7.8),
    { word: 'larga', start: 7.8, end: 9.95 },
    ...narration(10, AUDIO_SECONDS),
  ]
  const shrinkProject = await videoProject(
    t,
    projectScenes({ words: shrinkHeld }),
    { words: shrinkHeld },
  )
  await assert.rejects(renderScenes(shrinkProject.root, request(5)), {
    code: 'avatar_resize_out_of_range',
  })
  // Y el corte que cae después del fin de hoy: una palabra de 6,4 a 10,2 deja
  // con 5 s el hueco de los 10,24 más cerca que el de los 6,4. Pidió más corta:
  // no paga un tramo más largo.
  const pastEnd = [
    ...narration(0, 6.4),
    { word: 'larga', start: 6.4, end: 10.2 },
    ...narration(10.25, AUDIO_SECONDS),
  ]
  const pastEndProject = await videoProject(
    t,
    projectScenes({ words: pastEnd }),
    { words: pastEnd },
  )
  await assert.rejects(renderScenes(pastEndProject.root, request(5)), {
    code: 'avatar_resize_out_of_range',
  })
  // Y un tramo por debajo del piso (R-2g-21): de los 5 a los 8 no hay
  // palabras, así que la regla de 2 s corta a los 6,92 y la escena (que no
  // abre el video) duraría 2,92 s. No se paga un avatar más corto que 4,5 s.
  const gapped = narration(0, AUDIO_SECONDS, { gaps: [[5, 8]] })
  const gappedProject = await videoProject(
    t,
    projectScenes({ words: gapped }),
    { words: gapped },
  )
  await assert.rejects(renderScenes(gappedProject.root, request(5)), {
    code: 'avatar_resize_out_of_range',
  })
  assert.deepEqual(fake.calls, [])
})

test('bajo el lease se vuelve a planear con scenes.json releído: si la escena que sigue se bloqueó entre la primera lectura y el lease, la corrida frena con avatar_resize_locked sin hablar con HeyGen', async (t) => {
  const project = await videoProject(t, projectScenes())
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 2 })
  const lockedScenes = (await readScenesJson(project.projectDir)).map(
    (scene) => {
      if (scene.id !== 3) return scene

      return {
        ...scene,
        animationPending: [
          {
            id: 'pendiente-3',
            sceneIds: [3],
            startSeconds: scene.startSeconds,
            endSeconds: scene.endSeconds,
            status: 'pending',
          },
        ],
      }
    },
  )
  // La animación de la 3 (otro job) aterriza entre la primera lectura de
  // scenes.json y el lease: el comando toca la narración por primera vez en
  // ese hueco (como el guard de la fase).
  const context = await buildCreateVideoContext(
    baseContext(project.root, []),
    PROJECT_ID,
  )
  const { narrationFile, scenesFile } = context.paths
  let scenesReads = 0
  let landed = false
  context.paths = Object.defineProperties(
    { ...context.paths },
    {
      scenesFile: {
        get() {
          scenesReads++
          return scenesFile
        },
      },
      narrationFile: {
        get() {
          if (!landed && scenesReads > 0) {
            landed = true
            writeFileSync(scenesFile, JSON.stringify(lockedScenes, null, 2))
          }
          return narrationFile
        },
      },
    },
  )
  await assert.rejects(
    renderAvatarScenes(context, {
      sceneIds: [2],
      durations: [{ sceneId: 2, seconds: 9 }],
    }),
    { code: 'avatar_resize_locked' },
  )
  assert.ok(landed)
  assert.deepEqual(fake.calls, [])
})

test('crecer una escena planeada: el carril pide el tramo nuevo (su corte de audio, su huella, su costo) mientras la escena real conserva el suyo; con el clip nuevo, en una escritura, el tramo, el texto, las escenas de imagen del plan y el video desactualizado', async (t) => {
  const project = await videoProject(t, projectScenes())
  const original = await readScenesJson(project.projectDir)
  const duringPoll = []
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 2,
    onRequest: async (call) => {
      if (isPoll(call))
        duringPoll.push(await readScenesJson(project.projectDir))
    },
  })
  const events = []
  assert.deepEqual(
    await renderScenes(
      project.root,
      {
        projectId: PROJECT_ID,
        sceneIds: [2],
        durations: [{ sceneId: 2, seconds: 9 }],
      },
      events,
    ),
    { rendered: [2], failed: [] },
  )

  // Mientras HeyGen renderiza, nada cambió de tramo: ni el avatar ni las
  // imágenes.
  assert.ok(duringPoll.length > 0)
  for (const snapshot of duringPoll) {
    assert.deepEqual(snapshot.map(spanOf), original.map(spanOf))
    assert.deepEqual(
      snapshot.map((scene) => scene.text),
      original.map((scene) => scene.text),
    )
  }

  // El pedido fue el del tramo nuevo (4 a 13 s): el audio cortado ahí, su
  // huella y la clave que sale de ella.
  const [upload] = fake.uploads()
  const cutHash = avatarAudioCutHash({
    narrationSha256: await narrationSha256(project.projectDir),
    startFrame: 100,
    endFrame: 325,
  })
  assert.equal(upload.fileName, `scene_2.${cutHash.slice(0, 8)}.wav`)
  const hash = await requestHashFor(
    project.projectDir,
    sceneOf(original, 2),
    4,
    13,
  )
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [avatarIdempotencyKey(PROJECT_ID, 2, avatarRequestKey(hash, 0))],
  )

  // Con el clip nuevo: 4 a 13 s; la 3 (10 a 14) salió (le quedaba 1 s) y la 4
  // empieza a los 13; las demás, como estaban.
  const scenes = await readScenesJson(project.projectDir)
  assert.deepEqual(
    scenes.map((scene) => [scene.id, ...spanOf(scene)]),
    [
      [1, 0, 4],
      [2, 4, 13],
      [4, 13, 18],
      [5, 18, 22],
      [6, 22, 26],
      [7, 26, 30],
    ],
  )
  const boundaries = [0, 4, 13, 18, 22, 26, 30]
  const resized = sceneOf(scenes, 2)
  assert.equal(resized.text, textBetween(WORDS, boundaries, 4))
  assert.equal(sceneOf(scenes, 4).text, textBetween(WORDS, boundaries, 13))
  assert.equal(sceneOf(scenes, 4).imagePrompt, 'prompt 4')
  for (const id of [1, 5, 6, 7])
    assert.deepEqual(sceneOf(scenes, id), sceneOf(original, id), `escena ${id}`)
  assert.equal(resized.avatar.status, 'ready')
  assert.equal(resized.avatar.normalizedSeconds, 9)
  assert.equal(resized.avatar.renderHash, renderHashOf(4, 13))
  assert.equal(
    resized.avatar.clipFile,
    avatarClipFileName(2, avatarRequestKey(hash, 0)),
  )
  // La imagen de la que salió sigue en disco; el video quedó atrás.
  assert.ok(await exists(join(project.projectDir, 'scenes', 'scene_3.jpg')))
  assert.equal((await readMetadata(project.projectDir)).videoOutdated, true)
  // La vista: lista, al día, con su clip; el evento lleva el tramo nuevo.
  const context = await buildCreateVideoContext(
    baseContext(project.root, []),
    PROJECT_ID,
  )
  const [view] = await toSceneSummaries(context.paths, [resized], {
    narrationVersion: 0,
  })
  assert.equal(view.avatar.status, 'ready')
  assert.equal(view.avatar.stale, undefined)
  const [ready] = ofType(events, 'avatar-scene-ready')
  assert.deepEqual(
    [ready.scene.startSeconds, ready.scene.endSeconds, ready.scene.text],
    [4, 13, resized.text],
  )
  assert.deepEqual(fake.unexpected, [])
})

test('con Avatar V el movimiento automático es el de la copia: el escritor ve el tramo nuevo (9 s) y su texto, el POST lleva el prompt que escribió para ella y la escena queda con ese automático', async (t) => {
  const project = await videoProject(t, projectScenes())
  const scenes = await readScenesJson(project.projectDir)
  const scene = sceneOf(scenes, 2)
  // Una lista de V con el automático que Vimo escribió para su texto de 6 s.
  const previousPrompt = 'Calm nod while explaining the first idea.'
  solidClip(join(project.projectDir, 'avatar', READY_CLIP), 'green', 6)
  scene.avatar = {
    ...scene.avatar,
    ...readyAvatar({
      renderHash: avatarRenderHash({
        lookId: LOOK.lookId,
        engine: 'avatar_v',
        startFrame: 100,
        endFrame: 250,
        narrationVersion: 0,
      }),
    }),
    engine: 'avatar_v',
    motionPrompt: previousPrompt,
    autoMotionPrompt: previousPrompt,
    motionSource: 'auto',
    autoMotionTextHash: avatarMotionTextHash(`calm\n${scene.text}`),
  }
  await writeFile(
    scenesFileOf(project.projectDir),
    JSON.stringify(scenes, null, 2),
  )
  // El escritor del movimiento, simulado: anota lo que ve y responde.
  const writtenPrompt = 'Warm smile and a slow nod across the longer take.'
  const llmCalls = []
  const motionLlm = {
    async generate(request) {
      llmCalls.push(request)
      const { scenes: asked } = JSON.parse(request.userPrompt)
      return JSON.stringify({
        motions: asked.map((item) => ({
          sceneId: item.sceneId,
          prompt: writtenPrompt,
        })),
      })
    },
  }
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 2 })
  const context = await buildCreateVideoContext(
    baseContext(project.root, []),
    PROJECT_ID,
  )
  assert.deepEqual(
    await renderAvatarScenes(context, {
      sceneIds: [2],
      durations: [{ sceneId: 2, seconds: 9 }],
      motionLlm,
    }),
    { rendered: [2], failed: [] },
  )

  const newText = textBetween(WORDS, [0, 4, 13, 18, 22, 26, 30], 4)
  assert.equal(llmCalls.length, 1)
  const [seen] = JSON.parse(llmCalls[0].userPrompt).scenes
  assert.deepEqual([seen.sceneId, seen.seconds, seen.text], [2, 9, newText])
  const [post] = fake.posts()
  assert.equal(post.body.motion_prompt, writtenPrompt)
  const resized = sceneOf(await readScenesJson(project.projectDir), 2)
  assert.deepEqual(spanOf(resized), [4, 13])
  assert.equal(resized.text, newText)
  assert.equal(resized.avatar.motionPrompt, writtenPrompt)
  assert.equal(
    resized.avatar.autoMotionTextHash,
    avatarMotionTextHash(`calm\n${newText}`),
  )
})

test('la duración de hoy no pide nada: una lista al día con `durations` que redondea a lo que dura no habla con HeyGen ni toca scenes.json', async (t) => {
  const project = await videoProject(
    t,
    projectScenes({
      avatarPatch: readyAvatar({
        attempts: [
          {
            hash: 'pedido-pagado',
            state: 'succeeded',
            engine: 'avatar_iii',
            lookId: 'look-1',
            audioAssetId: 'asset-pagado',
            videoId: 'video-pagado',
            videoUrl: 'https://cdn.example/video-pagado.mp4',
            createdAt: '2026-10-12T15:00:00.000Z',
          },
        ],
      }),
    }),
    { readyClip: true },
  )
  const before = await readFile(scenesFileOf(project.projectDir), 'utf8')
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 2 })
  assert.deepEqual(
    await renderScenes(project.root, {
      projectId: PROJECT_ID,
      sceneIds: [2],
      durations: [{ sceneId: 2, seconds: 6 }],
    }),
    { rendered: [2], failed: [] },
  )
  assert.deepEqual(fake.calls, [])
  assert.equal(await readFile(scenesFileOf(project.projectDir), 'utf8'), before)
})

test('con `durations` el render toma el lease exclusivo del proyecto (R-2g-19): mientras HeyGen renderiza, el proyecto se lee pero otro generador no entra; con `durations` vacío, convive con él como siempre', async (t) => {
  const project = await videoProject(t, projectScenes())
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 2 })
  // Corre el render con `payload`, retiene su primera consulta a HeyGen y, con
  // el render en vuelo, corre `check`.
  const whileRendering = async (payload, check) => {
    let release
    const held = new Promise((resolve) => {
      release = resolve
    })
    let rendering
    const renderingStarted = new Promise((resolve) => {
      rendering = resolve
    })
    fake.reset({
      clip: project.clip,
      clipSeconds: 2,
      async onRequest(call) {
        if (!isPoll(call)) return

        rendering()
        await held
      },
    })
    const job = renderScenes(project.root, payload)
    try {
      // Si el comando falla antes de llegar a HeyGen sale su error, no un cuelgue.
      await Promise.race([renderingStarted, job])
      await check()
    } finally {
      // Aunque una aserción falle, el render retenido se suelta y se espera.
      release()
      await job.catch(() => undefined)
    }
    return job
  }
  const readProject = () =>
    videosSubcommands['video-project-status'](
      baseContext(project.root, [], { payload: { projectId: PROJECT_ID } }),
    )
  // `animate-scenes` con una lista vacía: si entra al proyecto, su propio
  // handler la rechaza adentro (`invalid_payload`); si no entra, el lease.
  const animate = () =>
    videosSubcommands['animate-scenes'](
      baseContext(project.root, [], {
        payload: { projectId: PROJECT_ID, sceneIds: [] },
      }),
    )

  const resized = await whileRendering(
    {
      projectId: PROJECT_ID,
      sceneIds: [2],
      durations: [{ sceneId: 2, seconds: 9 }],
    },
    async () => {
      assert.equal((await readProject()).scenes.length, 7)
      await assert.rejects(animate(), { code: 'animation_project_busy' })
    },
  )
  assert.deepEqual(await resized, { rendered: [2], failed: [] })

  // Con `durations` vacío (regenerar la lista que quedó de 4 a 13): el lease
  // de siempre, compartido con los generadores. Sin el campo, lo mismo: lo
  // prueba check-avatar-stage («corre con el lease de animación»).
  const regenerated = await whileRendering(
    {
      projectId: PROJECT_ID,
      sceneIds: [2],
      regenerateSceneIds: [2],
      durations: [],
    },
    async () => {
      assert.equal((await readProject()).scenes.length, 6)
      await assert.rejects(animate(), { code: 'invalid_payload' })
    },
  )
  assert.deepEqual(await regenerated, { rendered: [2], failed: [] })
})

test('achicar una escena planeada con un render nuevo: la que sigue empieza en el fin nuevo', async (t) => {
  const project = await videoProject(t, projectScenes())
  fakeHeyGen(t, { clip: project.clip, clipSeconds: 2 })
  assert.deepEqual(
    await renderScenes(project.root, {
      projectId: PROJECT_ID,
      sceneIds: [2],
      durations: [{ sceneId: 2, seconds: 5 }],
    }),
    { rendered: [2], failed: [] },
  )
  const scenes = await readScenesJson(project.projectDir)
  assert.deepEqual(spanOf(sceneOf(scenes, 2)), [4, 9])
  assert.deepEqual(spanOf(sceneOf(scenes, 3)), [9, 14])
  assert.equal(
    sceneOf(scenes, 3).text,
    textBetween(WORDS, [0, 4, 9, 14, 18, 22, 26, 30], 9),
  )
})

test('crecer una lista que se regenera: con el recibo pagado de su tramo de hoy, conserva su clip mientras HeyGen renderiza, paga una sola vez (una subida, una lectura del saldo, un POST) y el clip anterior queda en disco; la toma no sube (el tramo nuevo ya es otro pedido)', async (t) => {
  const project = await videoProject(t, projectScenes())
  const paid = await paidReadyScene(project.projectDir)
  const original = await readScenesJson(project.projectDir)
  const duringPoll = []
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 2,
    onRequest: async (call) => {
      if (isPoll(call))
        duringPoll.push(await readScenesJson(project.projectDir))
    },
  })
  assert.deepEqual(
    await renderScenes(project.root, {
      projectId: PROJECT_ID,
      sceneIds: [2],
      regenerateSceneIds: [2],
      durations: [{ sceneId: 2, seconds: 12 }],
    }),
    { rendered: [2], failed: [] },
  )
  assert.equal(fake.posts().length, 1)
  assert.equal(fake.uploads().length, 1)
  assert.equal(fake.calls.filter(isBalanceRead).length, 1)
  assert.ok(duringPoll.length > 0)
  for (const snapshot of duringPoll) {
    const kept = sceneOf(snapshot, 2)
    assert.deepEqual(spanOf(kept), [4, 10])
    assert.equal(kept.avatar.status, 'ready')
    assert.equal(kept.avatar.clipFile, paid.clipFile)
  }
  // 12 s: corta a los 16; la 3 queda tapada, a la 4 le quedarían 2 s y sale,
  // y la 5 empieza a los 16.
  const scenes = await readScenesJson(project.projectDir)
  assert.deepEqual(
    scenes.map((scene) => scene.id),
    [1, 2, 5, 6, 7],
  )
  assert.deepEqual(spanOf(sceneOf(scenes, 2)), [4, 16])
  assert.deepEqual(spanOf(sceneOf(scenes, 5)), [16, 22])
  const resized = sceneOf(scenes, 2).avatar
  const newHash = await requestHashFor(
    project.projectDir,
    sceneOf(original, 2),
    4,
    16,
  )
  assert.deepEqual(
    resized.attempts.map((attempt) => [attempt.hash, attempt.state]),
    [
      [paid.hash, 'succeeded'],
      [newHash, 'succeeded'],
    ],
  )
  assert.equal(
    resized.clipFile,
    avatarClipFileName(2, avatarRequestKey(newHash, 0)),
  )
  assert.equal(resized.renderHash, renderHashOf(4, 16))
  assert.equal('take' in resized, false)
  assert.ok(await exists(join(project.projectDir, 'avatar', paid.clipFile)))
  assert.ok(await exists(join(project.projectDir, 'avatar', resized.clipFile)))
})

test('el render que falla no cambia nada: la lista sigue con su tramo, su texto y su clip (también sin pedir regenerarla), las imágenes como estaban, el recibo guardado y el video al día', async (t) => {
  const project = await videoProject(t, projectScenes())
  const paid = await paidReadyScene(project.projectDir)
  const original = await readScenesJson(project.projectDir)
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 2,
    poll: () => ({
      status: 'failed',
      extra: {
        failure_code: 'rendering_failed',
        failure_message: 'Avatar rendering timed out',
      },
    }),
  })
  const events = []
  assert.deepEqual(
    await renderScenes(
      project.root,
      {
        projectId: PROJECT_ID,
        sceneIds: [2],
        durations: [{ sceneId: 2, seconds: 9 }],
      },
      events,
    ),
    { rendered: [], failed: [2] },
  )
  assert.equal(fake.posts().length, 1)
  assert.deepEqual(ofType(events, 'avatar-scene-failed'), [
    { type: 'avatar-scene-failed', sceneId: 2, code: 'avatar_render_failed' },
  ])
  const scenes = await readScenesJson(project.projectDir)
  assert.deepEqual(
    scenes.map((scene) => ({ ...scene, avatar: undefined })),
    original.map((scene) => ({ ...scene, avatar: undefined })),
  )
  const { attempts, ...kept } = sceneOf(scenes, 2).avatar
  const { attempts: originalAttempts, ...originalKept } = sceneOf(
    original,
    2,
  ).avatar
  assert.deepEqual(kept, originalKept)
  const newHash = await requestHashFor(
    project.projectDir,
    sceneOf(original, 2),
    4,
    13,
  )
  assert.deepEqual(
    attempts.map((attempt) => [attempt.hash, attempt.state, attempt.errorCode]),
    [
      [paid.hash, 'succeeded', undefined],
      [newHash, 'failed', 'avatar_render_failed'],
    ],
  )
  assert.deepEqual(attempts[0], originalAttempts[0])
  assert.notEqual((await readMetadata(project.projectDir)).videoOutdated, true)
})

test('la misma duración otra vez cosecha el render pago: un plazo vencido o una cancelación dejan el recibo y la escena como estaba; la corrida siguiente lo baja sin POST, sin audio y sin mirar el saldo, y aplica el tramo', async (t) => {
  const project = await videoProject(t, projectScenes())
  const original = await readScenesJson(project.projectDir)
  const request = {
    sceneIds: [2],
    durations: [{ sceneId: 2, seconds: 9 }],
  }
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 2,
    poll: () => ({ status: 'processing' }),
  })
  // HeyGen no termina antes del plazo (con el reloj del carril adelantado).
  const context = await buildCreateVideoContext(
    baseContext(project.root, []),
    PROJECT_ID,
  )
  assert.deepEqual(
    await renderAvatarScenes(context, { ...request, clock: fakeClock() }),
    { rendered: [], failed: [2], dominantCode: 'avatar_timeout' },
  )
  assert.equal(fake.posts().length, 1)
  const timedOut = await readScenesJson(project.projectDir)
  assert.deepEqual(timedOut.map(spanOf), original.map(spanOf))
  assert.deepEqual(
    timedOut.map((scene) => scene.text),
    original.map((scene) => scene.text),
  )
  assert.deepEqual(
    sceneOf(timedOut, 2).avatar.attempts.map((attempt) => attempt.state),
    ['pending'],
  )

  // Cancelar mientras lo consulta: sale como cancelación y nada cambia.
  const controller = new AbortController()
  fake.reset({
    clip: project.clip,
    clipSeconds: 2,
    poll: () => ({ status: 'processing' }),
    onRequest: (call) => {
      if (isPoll(call)) controller.abort()
    },
  })
  await assert.rejects(
    renderScenes(project.root, { projectId: PROJECT_ID, ...request }, [], {
      signal: controller.signal,
    }),
    { name: 'AbortError' },
  )
  assert.deepEqual(fake.posts(), [])
  assert.deepEqual(
    (await readScenesJson(project.projectDir)).map(spanOf),
    original.map(spanOf),
  )

  // La misma duración: el render pago se cosecha y el tramo se aplica.
  fake.reset({ clip: project.clip, clipSeconds: 2 })
  assert.deepEqual(
    await renderScenes(project.root, { projectId: PROJECT_ID, ...request }),
    { rendered: [2], failed: [] },
  )
  assert.deepEqual(fake.posts(), [])
  assert.deepEqual(fake.uploads(), [])
  assert.equal(fake.calls.filter(isBalanceRead).length, 0)
  const harvested = await readScenesJson(project.projectDir)
  assert.deepEqual(spanOf(sceneOf(harvested, 2)), [4, 13])
  assert.equal(sceneOf(harvested, 2).avatar.status, 'ready')
  assert.deepEqual(spanOf(sceneOf(harvested, 4)), [13, 18])
})

test('el plan que ya no entra al terminar: si otra escena se bloqueó mientras HeyGen renderizaba, el clip queda en disco, la escena no cambia y sale avatar_resize_out_of_range; al desbloquearla, la misma duración cosecha ese render', async (t) => {
  const project = await videoProject(t, projectScenes())
  const original = await readScenesJson(project.projectDir)
  // Mientras HeyGen renderiza, una animación toma la escena 4, la que el plan
  // iba a mover.
  let lockedOnce = false
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 2,
    onRequest: async (call) => {
      if (!isPoll(call) || lockedOnce) return

      lockedOnce = true
      await lockScene(project.projectDir, 4)
    },
  })
  const events = []
  const request = {
    projectId: PROJECT_ID,
    sceneIds: [2],
    durations: [{ sceneId: 2, seconds: 9 }],
  }
  assert.deepEqual(await renderScenes(project.root, request, events), {
    rendered: [],
    failed: [2],
  })
  assert.deepEqual(ofType(events, 'avatar-scene-failed'), [
    {
      type: 'avatar-scene-failed',
      sceneId: 2,
      code: 'avatar_resize_out_of_range',
    },
  ])
  assert.deepEqual(ofType(events, 'avatar-scene-ready'), [])
  const scenes = await readScenesJson(project.projectDir)
  assert.deepEqual(scenes.map(spanOf), original.map(spanOf))
  assert.deepEqual(
    scenes.map((scene) => scene.text),
    original.map((scene) => scene.text),
  )
  const kept = sceneOf(scenes, 2).avatar
  assert.equal(kept.status, 'planned')
  assert.equal('clipFile' in kept, false)
  assert.deepEqual(
    kept.attempts.map((attempt) => attempt.state),
    ['succeeded'],
  )
  // El clip del render pago quedó en disco.
  const hash = await requestHashFor(
    project.projectDir,
    sceneOf(original, 2),
    4,
    13,
  )
  const paidClip = avatarClipFileName(2, avatarRequestKey(hash, 0))
  assert.ok(await exists(join(project.projectDir, 'avatar', paidClip)))
  assert.notEqual((await readMetadata(project.projectDir)).videoOutdated, true)

  // Sin el candado: la misma duración baja ese render sin pagar otro.
  const unlocked = await readScenesJson(project.projectDir)
  delete sceneOf(unlocked, 4).animationPending
  await writeFile(
    scenesFileOf(project.projectDir),
    JSON.stringify(unlocked, null, 2),
  )
  fake.reset({ clip: project.clip, clipSeconds: 2 })
  assert.deepEqual(await renderScenes(project.root, request), {
    rendered: [2],
    failed: [],
  })
  assert.deepEqual(fake.posts(), [])
  const applied = await readScenesJson(project.projectDir)
  assert.deepEqual(spanOf(sceneOf(applied, 2)), [4, 13])
  assert.equal(sceneOf(applied, 2).avatar.clipFile, paidClip)
})

test('el saldo se compara con el costo del tramo nuevo: alcanza para 6 s y no para 9, así que pausa sin subir ni pedir nada', async (t) => {
  const project = await videoProject(t, projectScenes())
  const before = await readFile(scenesFileOf(project.projectDir), 'utf8')
  // Avatar III con foto: 6 s cuestan 0,099 US$ y 9 s, 0,1485.
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 2,
    me: wallet(0.12),
  })
  await assert.rejects(
    renderScenes(project.root, {
      projectId: PROJECT_ID,
      sceneIds: [2],
      durations: [{ sceneId: 2, seconds: 9 }],
    }),
    { code: 'avatar_insufficient_credits' },
  )
  assert.deepEqual(fake.uploads(), [])
  assert.deepEqual(fake.posts(), [])
  assert.equal(await readFile(scenesFileOf(project.projectDir), 'utf8'), before)
})

test('avatar-trim-scene: sin proveedor ni clave, ajusta el crudo del clip actual al tramo nuevo en un archivo nuevo (sin retimar) y guarda la escena, su vecina y el video desactualizado; el clip anterior queda', async (t) => {
  const project = await videoProject(
    t,
    projectScenes({ avatarPatch: readyAvatar() }),
    { readyClip: true, raw: true },
  )
  const original = await readScenesJson(project.projectDir)
  // Un HeyGen simulado que anota todo: el recorte no lo llama nunca.
  const fake = fakeHeyGen(t, {})
  assert.deepEqual(
    await trimScene(
      project.root,
      { projectId: PROJECT_ID, sceneId: 2, seconds: 5 },
      { apiKeys: {} },
    ),
    { sceneId: 2, startSeconds: 4, endSeconds: 9 },
  )
  assert.deepEqual(fake.calls, [])

  const scenes = await readScenesJson(project.projectDir)
  const boundaries = [0, 4, 9, 14, 18, 22, 26, 30]
  const trimmed = sceneOf(scenes, 2)
  assert.deepEqual(spanOf(trimmed), [4, 9])
  assert.equal(trimmed.text, textBetween(WORDS, boundaries, 4))
  const renderHash = renderHashOf(4, 9)
  assert.deepEqual(trimmed.avatar, {
    ...sceneOf(original, 2).avatar,
    clipFile: avatarClipFileName(2, renderHash),
    renderHash,
    normalizedSeconds: 5,
  })
  const next = sceneOf(scenes, 3)
  assert.deepEqual(spanOf(next), [9, 14])
  assert.equal(next.text, textBetween(WORDS, boundaries, 9))
  for (const id of [1, 4, 5, 6, 7])
    assert.deepEqual(sceneOf(scenes, id), sceneOf(original, id), `escena ${id}`)
  assert.equal((await readMetadata(project.projectDir)).videoOutdated, true)

  // El clip nuevo: 125 cuadros, sin audio, del crudo (rojo hasta los 0,48 s y
  // azul después, en el mismo cuadro: no se retimó); el anterior, en disco.
  const clipPath = join(project.projectDir, 'avatar', trimmed.avatar.clipFile)
  const inspected = await inspectAnimationFile(FFMPEG, clipPath)
  assert.equal(inspected.frames, 125)
  assert.equal(inspected.audioStreams, 0)
  assert.ok(isRed(pixelAt(clipPath, 11, 960, 540)))
  assert.ok(isBlue(pixelAt(clipPath, 12, 960, 540)))
  assert.ok(await exists(join(project.projectDir, 'avatar', READY_CLIP)))
  // La vista: lista y al día.
  const context = await buildCreateVideoContext(
    baseContext(project.root, []),
    PROJECT_ID,
  )
  const [view] = await toSceneSummaries(context.paths, [trimmed], {
    narrationVersion: 0,
  })
  assert.equal(view.avatar.status, 'ready')
  assert.equal(view.avatar.stale, undefined)
})

test('avatar-trim-scene: sin el crudo del proveedor, recorta el clip normalizado', async (t) => {
  const project = await videoProject(
    t,
    projectScenes({ avatarPatch: readyAvatar() }),
    { readyClip: true },
  )
  fakeHeyGen(t, {})
  await trimScene(project.root, {
    projectId: PROJECT_ID,
    sceneId: 2,
    seconds: 5,
  })
  const trimmed = sceneOf(await readScenesJson(project.projectDir), 2)
  const clipPath = join(project.projectDir, 'avatar', trimmed.avatar.clipFile)
  assert.equal((await inspectAnimationFile(FFMPEG, clipPath)).frames, 125)
  assert.ok(isGreen(pixelAt(clipPath, 20, 960, 540)))
})

test('avatar-trim-scene y el piso (R-2g-21): un recorte que dejaría la aparición en menos de 4,5 s sale avatar_resize_out_of_range antes de ajustar el clip, sin escribir nada ni dejar un archivo nuevo; la apertura de la sonda de la revisión, que carga una pausa de 3 s, se recorta a 7,92 con 8 s (con la regla de 2 s, a 2,88)', async (t) => {
  fakeHeyGen(t, {})
  // De los 5 a los 8 no hay palabras: la regla de 2 s cortaría a los 6,92 y la
  // escena 2 (que no abre el video) quedaría de 2,92 s.
  const gapped = narration(0, AUDIO_SECONDS, { gaps: [[5, 8]] })
  const project = await videoProject(
    t,
    projectScenes({ words: gapped, avatarPatch: readyAvatar() }),
    { words: gapped, readyClip: true, raw: true },
  )
  const avatarDirectory = join(project.projectDir, 'avatar')
  const before = await readFile(scenesFileOf(project.projectDir), 'utf8')
  const filesBefore = await readdir(avatarDirectory)
  await assert.rejects(
    trimScene(project.root, { projectId: PROJECT_ID, sceneId: 2, seconds: 5 }),
    { code: 'avatar_resize_out_of_range' },
  )
  assert.equal(await readFile(scenesFileOf(project.projectDir), 'utf8'), before)
  assert.deepEqual(await readdir(avatarDirectory), filesBefore)

  // La apertura de la sonda, de 0 a 9,92 con su clip listo y al día.
  const clipFile = 'scene_1.ab12cd34.mp4'
  const opening = await videoProject(
    t,
    projectScenes({
      words: PAUSED_WORDS,
      boundaries: [0, 9.92, 20, 30, PAUSED_AUDIO_END],
      avatarId: 1,
      avatarPatch: readyAvatar({
        clipFile,
        normalizedSeconds: 9.92,
        renderHash: renderHashOf(0, 9.92),
      }),
    }),
    { words: PAUSED_WORDS },
  )
  solidClip(join(opening.projectDir, 'avatar', clipFile), 'green', 10)
  assert.deepEqual(
    await trimScene(
      opening.root,
      { projectId: PROJECT_ID, sceneId: 1, seconds: 8 },
      { apiKeys: {} },
    ),
    { sceneId: 1, startSeconds: 0, endSeconds: 7.92 },
  )
  const scenes = await readScenesJson(opening.projectDir)
  assert.deepEqual(spanOf(sceneOf(scenes, 1)), [0, 7.92])
  assert.deepEqual(spanOf(sceneOf(scenes, 2)), [7.92, 20])
  const trimmedClip = join(
    opening.projectDir,
    'avatar',
    sceneOf(scenes, 1).avatar.clipFile,
  )
  assert.equal((await inspectAnimationFile(FFMPEG, trimmedClip)).frames, 198)
})

test('avatar-trim-scene: avatar_trim_unavailable sin un clip listo y al día (desactualizado, de otra narración, sin su archivo, planeado o fallido), sin escribir nada', async (t) => {
  const cases = [
    ['desactualizada', { renderHash: 'de-otro-tramo' }, {}],
    ['otra narración', {}, { narrationVersion: 2 }],
    ['sin su archivo', { clipFile: 'scene_2.ffffffff.mp4' }, {}],
    ['planeada', { status: 'planned' }, {}],
    // Fallida pero con el clip y la huella de un render anterior en disco.
    ['fallida', { status: 'failed', errorCode: 'avatar_render_failed' }, {}],
  ]
  fakeHeyGen(t, {})
  for (const [label, patch, metadata] of cases) {
    const project = await videoProject(
      t,
      projectScenes({ avatarPatch: readyAvatar(patch) }),
      { readyClip: true, raw: true, metadata },
    )
    const before = await readFile(scenesFileOf(project.projectDir), 'utf8')
    await assert.rejects(
      trimScene(project.root, {
        projectId: PROJECT_ID,
        sceneId: 2,
        seconds: 5,
      }),
      { code: 'avatar_trim_unavailable' },
      label,
    )
    assert.equal(
      await readFile(scenesFileOf(project.projectDir), 'utf8'),
      before,
      label,
    )
  }
})

test('avatar-trim-scene: si no achica (la duración de hoy o una mayor, también si una palabra larga hiciera caer el corte antes, o menos pero con el corte en el fin de hoy o después) sale avatar_resize_out_of_range, el código del render para el mismo caso (m-1 de la revisión final: el clip está listo), sin escribir nada', async (t) => {
  fakeHeyGen(t, {})
  const project = await videoProject(
    t,
    projectScenes({ avatarPatch: readyAvatar() }),
    { readyClip: true, raw: true },
  )
  const before = await readFile(scenesFileOf(project.projectDir), 'utf8')
  for (const seconds of [6, 8])
    await assert.rejects(
      trimScene(project.root, { projectId: PROJECT_ID, sceneId: 2, seconds }),
      { code: 'avatar_resize_out_of_range' },
      `${seconds} s`,
    )
  assert.equal(await readFile(scenesFileOf(project.projectDir), 'utf8'), before)

  // Más segundos que los de hoy aunque el corte cayera antes (m1 de la
  // revisión): una palabra larga de 9,8 a 12,5 deja con 7 s el hueco de los 9,8
  // como el más cercano. Pidió más larga: no es un recorte.
  const held = [
    ...narration(0, 9.8),
    { word: 'larga', start: 9.8, end: 12.5 },
    ...narration(12.55, AUDIO_SECONDS),
  ]
  const heldProject = await videoProject(
    t,
    projectScenes({ words: held, avatarPatch: readyAvatar() }),
    { words: held, readyClip: true, raw: true },
  )
  const heldBefore = await readFile(
    scenesFileOf(heldProject.projectDir),
    'utf8',
  )
  await assert.rejects(
    trimScene(heldProject.root, {
      projectId: PROJECT_ID,
      sceneId: 2,
      seconds: 7,
    }),
    { code: 'avatar_resize_out_of_range' },
  )
  assert.equal(
    await readFile(scenesFileOf(heldProject.projectDir), 'utf8'),
    heldBefore,
  )

  // Menos segundos, pero el corte no cae antes del fin de hoy: con una palabra
  // larga de 7,8 a 9,95 el hueco más cercano a los 9 es el de los 10 (el mismo
  // fin), y con una de 6,4 a 10,2, el de los 10,24 (después). Ninguno achica, y
  // el clip está listo: «no tiene un clip listo para recortar» sería falso.
  const sameEnd = [
    ...narration(0, 7.8),
    { word: 'larga', start: 7.8, end: 9.95 },
    ...narration(10, AUDIO_SECONDS),
  ]
  const pastEnd = [
    ...narration(0, 6.4),
    { word: 'larga', start: 6.4, end: 10.2 },
    ...narration(10.25, AUDIO_SECONDS),
  ]
  for (const words of [sameEnd, pastEnd]) {
    const notShorter = await videoProject(
      t,
      projectScenes({ words, avatarPatch: readyAvatar() }),
      { words, readyClip: true, raw: true },
    )
    const notShorterBefore = await readFile(
      scenesFileOf(notShorter.projectDir),
      'utf8',
    )
    await assert.rejects(
      trimScene(notShorter.root, {
        projectId: PROJECT_ID,
        sceneId: 2,
        seconds: 5,
      }),
      { code: 'avatar_resize_out_of_range' },
    )
    assert.equal(
      await readFile(scenesFileOf(notShorter.projectDir), 'utf8'),
      notShorterBefore,
    )
  }
})

// Espera a que exista `path` (un archivo que otro proceso escribe con un
// renombre atómico, entero de una vez).
async function waitForFile(path) {
  for (let attempt = 0; attempt < 1200; attempt++) {
    if (await exists(path)) return

    await new Promise((done) => setTimeout(done, 50))
  }
  throw new Error(`${path} no apareció`)
}

test('avatar-trim-scene: si la escena cambia mientras se ajusta el clip, el rechazo bajo el lease borra el clip nuevo (m-3 de la revisión final): con otro clip en la escena (avatar_trim_unavailable) o con la escena que sigue bloqueada (avatar_resize_locked), avatar/ queda como estaba', async (t) => {
  fakeHeyGen(t, {})
  // El clip que el recorte a 5 s (de 4 a 9) escribe antes de tomar el lease.
  const trimmedClip = avatarClipFileName(2, renderHashOf(4, 9))
  const changes = [
    [
      'otro clip en la escena',
      async (projectDir) => {
        const scenes = await readScenesJson(projectDir)
        sceneOf(scenes, 2).avatar.clipFile = 'scene_2.0000beef.mp4'
        await writeFile(
          scenesFileOf(projectDir),
          JSON.stringify(scenes, null, 2),
        )
      },
      'avatar_trim_unavailable',
    ],
    [
      'la que sigue bloqueada',
      (projectDir) => lockScene(projectDir, 3),
      'avatar_resize_locked',
    ],
  ]
  for (const [label, change, code] of changes) {
    const project = await videoProject(
      t,
      projectScenes({ avatarPatch: readyAvatar() }),
      { readyClip: true, raw: true },
    )
    const avatarDirectory = join(project.projectDir, 'avatar')
    const filesBefore = await readdir(avatarDirectory)
    // La prueba tiene el lease de los recibos: el recorte ajusta el clip nuevo
    // y espera ahí, mientras la escena cambia en disco.
    let outcome
    await withAnimationCheckpointLease(
      project.projectDir,
      new AbortController().signal,
      async () => {
        outcome = trimScene(project.root, {
          projectId: PROJECT_ID,
          sceneId: 2,
          seconds: 5,
        }).then(
          () => undefined,
          (error) => error,
        )
        await waitForFile(join(avatarDirectory, trimmedClip))
        await change(project.projectDir)
      },
    )
    assert.equal((await outcome)?.code, code, label)
    assert.deepEqual(await readdir(avatarDirectory), filesBefore, label)
  }
})

test('avatar-trim-scene: el payload se valida (proyecto, escena de avatar, segundos enteros de 5 a 60); la escena que sigue bloqueada da avatar_resize_locked y la última del video no se achica', async (t) => {
  const project = await videoProject(
    t,
    projectScenes({ avatarPatch: readyAvatar() }),
    { readyClip: true },
  )
  fakeHeyGen(t, {})
  for (const payload of [
    { sceneId: 2, seconds: 5 },
    { projectId: PROJECT_ID, seconds: 5 },
    { projectId: PROJECT_ID, sceneId: '2', seconds: 5 },
    { projectId: PROJECT_ID, sceneId: 2.5, seconds: 5 },
    { projectId: PROJECT_ID, sceneId: 2 },
    { projectId: PROJECT_ID, sceneId: 2, seconds: 4 },
    { projectId: PROJECT_ID, sceneId: 2, seconds: 61 },
    { projectId: PROJECT_ID, sceneId: 2, seconds: 5.5 },
    { projectId: PROJECT_ID, sceneId: 2, seconds: '5' },
    { projectId: PROJECT_ID, sceneId: 1, seconds: 5 },
    { projectId: PROJECT_ID, sceneId: 99, seconds: 5 },
  ])
    await assert.rejects(
      trimScene(project.root, payload),
      { code: 'invalid_payload' },
      JSON.stringify(payload),
    )

  await lockScene(project.projectDir, 3)
  await assert.rejects(
    trimScene(project.root, { projectId: PROJECT_ID, sceneId: 2, seconds: 5 }),
    { code: 'avatar_resize_locked' },
  )

  // La escena de avatar es la última (de 24 a 30 s): lo que deja no tendría
  // imagen.
  const last = await videoProject(
    t,
    projectScenes({
      boundaries: [0, 4, 10, 14, 18, 24, 30],
      avatarId: 6,
      avatarPatch: readyAvatar({ renderHash: renderHashOf(24, 30) }),
    }),
    { readyClip: true },
  )
  await assert.rejects(
    trimScene(last.root, { projectId: PROJECT_ID, sceneId: 6, seconds: 5 }),
    { code: 'avatar_resize_out_of_range' },
  )
})

test('avatar-trim-scene corre con el lease exclusivo del proyecto: con un generador trabajando, no entra', async (t) => {
  const project = await videoProject(
    t,
    projectScenes({ avatarPatch: readyAvatar() }),
    { readyClip: true },
  )
  fakeHeyGen(t, {})
  const signal = new AbortController().signal
  await withProjectAnimationLease(project.projectDir, signal, async () => {
    await assert.rejects(
      trimScene(project.root, {
        projectId: PROJECT_ID,
        sceneId: 2,
        seconds: 5,
      }),
      { code: 'animation_project_busy' },
    )
  })
})

test('centinela: al terminar, fetch vuelve a ser el real', () => {
  assert.equal(globalThis.fetch, ORIGINAL_FETCH)
})
