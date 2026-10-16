// La narración citada nunca llega al prompt de video (fix del 2026-10-15).
// Grok Imagine 1.5 (Kie) dibuja como subtítulos las frases que el prompt cita
// entre comillas: el redactor del primer pase escribía «At cue 'hasta lo alto'
// (2.3s), …» y 13 de los 790 clips de la demo v4 salieron con esas frases
// pintadas encima, aunque el prompt prohibía el texto. Corre el redactor real
// (`buildAnimationPrompt`) con un `SceneLlm` falso que hace de redactor y de
// revisor, el escritor del movimiento del avatar y el limpiador
// (`stripNarrationQuotes`) con sus reglas: qué cita es narración, cómo queda
// una referencia a la voz y qué se queda tal cual. Sin red, sin claves y sin
// comprar video.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stripNarrationQuotes } from '../../pipeline/animation/narration-quotes.ts'
import { buildAnimationPrompt } from '../../pipeline/animation/prompt.ts'
import { writeAvatarMotionPrompts } from '../../pipeline/avatar/motion-prompt.ts'

// La narración del clip, como la arma el carril: palabras de la transcripción
// en minúscula y sin puntuación, con sus tiempos en el reloj del clip.
const SCENE_ONE_CUES = [
  ['el', 0.1, 0.3],
  ['grumete', 0.3, 0.8],
  ['trepa', 0.8, 1.2],
  ['por', 1.2, 1.4],
  ['la', 1.4, 1.5],
  ['cuerda', 1.5, 2.0],
  ['hasta', 2.3, 2.5],
  ['lo', 2.5, 2.6],
  ['alto', 2.6, 2.8],
  ['del', 2.8, 2.9],
  ['mástil', 2.9, 3.0],
]
const SCENE_TWO_CUES = [
  ['y', 3.1, 3.2],
  ['desde', 3.2, 3.5],
  ['allí', 3.5, 3.9],
  ['ve', 3.9, 4.1],
  ['una', 4.1, 4.2],
  ['isla', 4.2, 4.6],
  ['diminuta', 4.6, 5.0],
  ['con', 5.0, 5.1],
  ['una', 5.1, 5.2],
  ['sola', 5.2, 5.5],
  ['palmera', 5.5, 5.9],
]
const SCRIPT =
  'Al amanecer, el barco seguía perdido en la niebla. El grumete trepa por la cuerda hasta lo alto del mástil, y desde allí ve una isla diminuta con una sola palmera. Nadie en cubierta le creyó. Años después, el capitán dibujó el horizonte de sucesos dentro de una cámara de cristal.'

function cues(entries) {
  return entries.map(([word, fromSeconds, toSeconds]) => ({
    word,
    fromSeconds,
    toSeconds,
  }))
}

function sceneText(entries) {
  return entries.map(([word]) => word).join(' ')
}

const SEGMENTS = [
  {
    scene: {
      id: 1,
      text: sceneText(SCENE_ONE_CUES),
      imagePrompt:
        'A cabin boy in a striped shirt at the foot of a tall wooden mast on a ship deck, flag with the name SANTA MARÍA.',
    },
    fromSeconds: 0,
    toSeconds: 3,
    narrationCues: cues(SCENE_ONE_CUES),
  },
  {
    scene: {
      id: 2,
      text: sceneText(SCENE_TWO_CUES),
      imagePrompt:
        'The same cabin boy at the top of the mast looking at a tiny island with one palm tree on the horizon.',
    },
    fromSeconds: 3,
    toSeconds: 6,
    narrationCues: cues(SCENE_TWO_CUES),
  },
]

// Un plan limpio, como lo escribe el redactor cuando cumple las reglas.
const CLEAN_ANSWER = {
  visual_style: 'Bright 2D cartoon with clean black outlines and flat colors.',
  segments: [
    {
      scene_id: 1,
      primary_subject: 'the cabin boy at the foot of the mast',
      primary_action:
        'The cabin boy grips the rope and climbs hand over hand up the mast, legs pushing off the rigging.',
      camera: 'Slow tilt up that follows the climb and keeps the boy in frame.',
      secondary_motion: 'The rope sways and the sail ripples in the wind.',
      continuity:
        'The boy in a striped shirt stays on the same mast; deck, sail and rigging persist.',
    },
    {
      scene_id: 2,
      primary_subject: 'the cabin boy at the top of the mast',
      primary_action:
        'The boy shades his eyes with one hand and leans toward the horizon as the island comes into view.',
      camera:
        'Gentle push toward the horizon that keeps the boy at the left edge.',
      secondary_motion: 'Waves roll below and the palm leaves sway far away.',
      continuity:
        'Same ocean and same boy in a striped shirt; the island stays on the horizon.',
    },
  ],
}

// Cada campo de la escena 1 con una cita de la narración, como las que salieron
// en la demo v4: la frase citada, lo que tiene que sobrevivir del campo y, si
// la cita marcaba un tiempo, cómo queda la referencia solo con el tiempo.
const QUOTED_FIELDS = [
  {
    field: 'visual_style',
    text: 'Bright 2D cartoon with clean black outlines and flat colors, like the "horizonte de sucesos" sketches.',
    phrase: 'horizonte de sucesos',
    kept: 'clean black outlines and flat colors, like the sketches.',
  },
  {
    field: 'primary_subject',
    text: "the cabin boy climbing 'hasta lo alto'",
    phrase: 'hasta lo alto',
    kept: 'Primary subject: the cabin boy climbing.',
  },
  {
    field: 'primary_action',
    text: "At cue 'hasta lo alto' (2.3s), the cabin boy grips the rope and climbs hand over hand up the mast.",
    phrase: 'hasta lo alto',
    kept: 'Action: At 2.3s, the cabin boy grips the rope and climbs hand over hand up the mast.',
  },
  {
    field: 'camera',
    text: 'Slow tilt up as “trepa” is spoken, following the climb and keeping the boy in frame.',
    phrase: 'trepa',
    kept: 'Camera: Slow tilt up at 0.8 s, following the climb and keeping the boy in frame.',
  },
  {
    field: 'secondary_motion',
    text: 'On the word ‘cuerda’ the rope sways and the sail ripples in the wind.',
    phrase: 'cuerda',
    kept: 'Supporting motion: At 1.5 s the rope sways and the sail ripples in the wind.',
  },
  {
    field: 'continuity',
    text: 'The banner reading «una isla diminuta con una sola palmera» and the boy in a striped shirt stay on the same mast.',
    phrase: 'una isla diminuta con una sola palmera',
    kept: 'Continuity: The banner and the boy in a striped shirt stay on the same mast.',
  },
]

function normalized(text) {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

// ¿Aparece la frase (sin acentos ni mayúsculas, por palabra completa)?
function mentions(prompt, phrase) {
  return ` ${normalized(prompt)} `.includes(` ${normalized(phrase)} `)
}

function withField(field, text) {
  const answer = structuredClone(CLEAN_ANSWER)
  if (field === 'visual_style') answer.visual_style = text
  else answer.segments[0][field] = text
  return answer
}

// Un revisor que aprueba citando lo que recibió: la cita del candidato y la
// de la imagen son prefijos exactos de esos campos.
function approval(payload) {
  return JSON.stringify({
    source_checks: payload.candidate.segments.map((segment, index) => ({
      scene_id: segment.scene_id,
      candidate_quote: segment.primary_subject.slice(0, 12),
      reference_quote: payload.visual_references[
        index
      ].static_image_prompt.slice(0, 12),
    })),
    approved: true,
    issues: [],
  })
}

// Un rechazo con el contrato del revisor: cita el sujeto de la escena 1.
function rejection(payload) {
  const [segment] = payload.candidate.segments
  return JSON.stringify({
    source_checks: [
      {
        scene_id: segment.scene_id,
        candidate_quote: segment.primary_subject.slice(0, 12),
        reference_quote: payload.visual_references[0].static_image_prompt.slice(
          0,
          12,
        ),
      },
    ],
    approved: false,
    issues: [
      {
        scene_id: segment.scene_id,
        candidate_quote: segment.primary_subject.slice(0, 12),
        reason: 'The climb needs a clearer start.',
        correction: 'Start the climb in the opening frames.',
      },
    ],
  })
}

// El `SceneLlm` falso: el redactor contesta con `answers` (uno por intento, el
// último se repite) y el revisor con `review`. Guarda cada pedido.
function fakeLlm(answers, review = approval) {
  const writer = []
  const reviewer = []
  return {
    writer,
    reviewer,
    async generate(request) {
      const payload = JSON.parse(request.userPrompt)
      if ('visual_references' in payload) {
        reviewer.push({ request, payload })
        return review(payload, reviewer.length)
      }
      writer.push({ request, payload })
      return JSON.stringify(
        answers[Math.min(writer.length, answers.length) - 1],
      )
    },
  }
}

function animationInputs(llm) {
  return {
    llm,
    styleName: 'Cartoon 2D',
    strategy: 'merge',
    segments: SEGMENTS,
    previousText: 'al amanecer el barco seguía perdido en la niebla',
    nextText: 'nadie en cubierta le creyó',
    script: SCRIPT,
    clipSeconds: 6,
    usedSeconds: 6,
    format: '9:16',
    referenceImages: 2,
    maxChars: 4000,
  }
}

for (const quoted of QUOTED_FIELDS) {
  test(`quoted narration in ${quoted.field} never reaches the video prompt`, async () => {
    const llm = fakeLlm([withField(quoted.field, quoted.text)])

    const { prompt } = await buildAnimationPrompt(animationInputs(llm))

    assert.equal(mentions(prompt, quoted.phrase), false, prompt)
    assert.ok(prompt.includes(quoted.kept), prompt)
    // El reloj de las escenas no se toca.
    assert.ok(prompt.includes('Seconds 0–3: '), prompt)
    assert.ok(prompt.includes('Seconds 3–6: '), prompt)
    assert.equal(llm.writer.length, 1)
  })
}

test('a plan full of quoted cues keeps its timing, its lettering and everything else', async () => {
  const answer = {
    visual_style:
      'Bright 2D cartoon with clean black outlines, flat colors and a "Pixel Art" finish.',
    segments: [
      {
        scene_id: 1,
        primary_subject: 'the cabin boy at the foot of the mast',
        primary_action:
          "At cue 'hasta lo alto' (2.3s), the boy’s hands grip the rope and he climbs hand over hand; by 'mástil' he reaches the crow's nest.",
        camera:
          'Slow tilt up as "trepa" is spoken, keeping the sailors\' hats and the boy in frame.',
        secondary_motion:
          'The flag reading ‘SANTA MARÍA’ flutters while the rope sways.',
        continuity:
          'The boy in a striped shirt stays on the same mast; deck, sail and rigging persist.',
      },
      {
        scene_id: 2,
        primary_subject: 'the cabin boy at the top of the mast',
        primary_action:
          'From “desde allí” the boy shades his eyes, and between «una isla» and «palmera» he leans toward the horizon.',
        camera:
          "Gentle push toward the horizon on the word 'isla', keeping the boy at the left edge.",
        secondary_motion:
          "Waves roll below while 'diminuta' lands (4.6–5.0 s) and the palm leaves sway.",
        continuity:
          'Same ocean and same boy in a striped shirt; the island stays on the horizon.',
      },
    ],
  }
  const llm = fakeLlm([answer])

  const { prompt } = await buildAnimationPrompt(animationInputs(llm))

  for (const phrase of [
    'hasta lo alto',
    'mástil',
    'trepa',
    'desde allí',
    'una isla',
    'palmera',
    'isla',
    'diminuta',
  ])
    assert.equal(mentions(prompt, phrase), false, `${phrase}\n${prompt}`)
  // Lo que no es narración queda tal cual: el rótulo de la imagen, el nombre
  // del estilo y los apóstrofos.
  for (const kept of [
    'a "Pixel Art" finish.',
    'The flag reading ‘SANTA MARÍA’ flutters while the rope sways.',
    'the boy’s hands grip the rope',
    "he reaches the crow's nest",
    "keeping the sailors' hats and the boy in frame",
  ])
    assert.ok(prompt.includes(kept), `${kept}\n${prompt}`)
  // Cada cita de tiempo quedó como un tiempo: el escrito o el de la marca.
  for (const timed of [
    'Action: At 2.3s, the boy’s hands grip the rope',
    'by 2.9 s he reaches',
    'Camera: Slow tilt up at 0.8 s, keeping',
    'Action: From 3.2 s the boy shades his eyes, and between 4.1 s and 5.5 s he leans',
    'push toward the horizon at 4.2 s, keeping',
    'Waves roll below at 4.6–5.0 s and the palm leaves sway.',
  ])
    assert.ok(prompt.includes(timed), `${timed}\n${prompt}`)
  assert.ok(prompt.includes('Seconds 0–3: '))
  assert.ok(prompt.includes('Seconds 3–6: '))
})

test('the reviewer and the repair only see the cleaned plan', async () => {
  const quoted = withField(
    'primary_action',
    "At cue 'hasta lo alto' (2.3s), the cabin boy grips the rope and climbs hand over hand up the mast.",
  )
  const llm = fakeLlm([quoted, quoted], (payload, count) =>
    count === 1 ? rejection(payload) : approval(payload),
  )

  const { prompt } = await buildAnimationPrompt(animationInputs(llm))

  assert.equal(llm.writer.length, 2)
  assert.equal(llm.reviewer.length, 2)
  for (const { payload } of llm.reviewer)
    assert.equal(
      mentions(JSON.stringify(payload.candidate), 'hasta lo alto'),
      false,
    )
  const repair = llm.writer[1].payload.candidate_to_repair
  assert.ok(repair, 'the second writer gets the rejected draft to repair')
  assert.equal(mentions(JSON.stringify(repair), 'hasta lo alto'), false)
  assert.ok(
    repair.segments[0].primary_action.startsWith('At 2.3s, the cabin boy'),
  )
  assert.equal(mentions(prompt, 'hasta lo alto'), false)
})

test('a field that was only quoted narration goes back to the writer with a precise repair', async () => {
  const onlyQuoted = withField('primary_subject', "'hasta lo alto'")
  const llm = fakeLlm([onlyQuoted, CLEAN_ANSWER])

  const { prompt } = await buildAnimationPrompt(animationInputs(llm))

  assert.equal(llm.writer.length, 2)
  const feedback = llm.writer[1].payload.repair_feedback
  assert.match(feedback, /Scene 1: primary_subject/)
  assert.match(feedback, /quot/i)
  assert.match(feedback, /narration/i)
  assert.equal(mentions(prompt, 'hasta lo alto'), false)
  assert.ok(prompt.includes('Primary subject: the cabin boy at the foot'))
})

test('a plan that keeps quoting a required field never buys video', async () => {
  // Larga como para pasar el mínimo crudo: solo cita la narración entera.
  const onlyQuoted = withField(
    'primary_action',
    '"el grumete trepa por la cuerda hasta lo alto del mástil"',
  )
  const llm = fakeLlm([onlyQuoted])

  await assert.rejects(buildAnimationPrompt(animationInputs(llm)), {
    code: 'animation_prompt_failed',
  })
  assert.equal(llm.writer.length, 3)
  assert.equal(llm.reviewer.length, 0)
})

test('the writer is told to reference cues by time and never to quote the narration', async () => {
  const llm = fakeLlm([CLEAN_ANSWER])

  await buildAnimationPrompt(animationInputs(llm))

  const { systemPrompt } = llm.writer[0].request
  assert.equal(
    systemPrompt.includes('Spoken-word quotes may anchor timing'),
    false,
  )
  assert.match(
    systemPrompt,
    /refer to a cue only by its time in seconds \(for example at 2\.3 s\)/,
  )
  assert.match(
    systemPrompt,
    /never copy, quote or translate narration words into any field/,
  )
})

test('a clean plan reaches the video prompt unchanged', async () => {
  const llm = fakeLlm([CLEAN_ANSWER])

  const { prompt } = await buildAnimationPrompt(animationInputs(llm))

  for (const segment of CLEAN_ANSWER.segments)
    for (const field of [
      'primary_subject',
      'primary_action',
      'camera',
      'secondary_motion',
      'continuity',
    ])
      assert.ok(prompt.includes(segment[field]), segment[field])
  assert.ok(prompt.startsWith(CLEAN_ANSWER.visual_style + '\n'))
})

test('the avatar motion prompt drops the quoted narration too', async () => {
  const text = 'Hola, bienvenidos a este video.'
  const requests = [1, 2, 3].map((sceneId) => ({
    sceneId,
    text,
    seconds: 6,
    position: 'middle',
    expressive: false,
  }))
  const llm = {
    async generate() {
      return JSON.stringify({
        motions: [
          {
            sceneId: 1,
            prompt:
              "Open-palm gesture on 'bienvenidos', warm smile at the camera.",
          },
          // Todo el prompt es la narración citada: queda la plantilla.
          { sceneId: 2, prompt: '"Hola, bienvenidos a este video."' },
          // Lo que no es narración no se toca.
          { sceneId: 3, prompt: '"Warm smile at the camera, one small wave."' },
        ],
      })
    },
  }

  const prompts = await writeAvatarMotionPrompts(llm, requests)

  assert.equal(prompts.get(1), 'Open-palm gesture, warm smile at the camera.')
  assert.equal(
    prompts.get(2),
    'Composed posture and sincere expression, with a subtle open-hand gesture on the key point.',
  )
  assert.equal(prompts.get(3), 'Warm smile at the camera, one small wave.')
})

// Las reglas del limpiador con la misma narración: todo el guion y las marcas
// de las dos escenas.
const SOURCE = {
  narration: [SCRIPT],
  cues: [...cues(SCENE_ONE_CUES), ...cues(SCENE_TWO_CUES)],
}

test('every quote style around the narration is removed', () => {
  for (const [open, close] of [
    ["'", "'"],
    ['"', '"'],
    ['\u{2018}', '\u{2019}'],
    ['\u{201C}', '\u{201D}'],
    ['\u{201E}', '\u{201C}'],
    ['\u{00AB}', '\u{00BB}'],
    ['\u{00AB} ', ' \u{00BB}'],
    ['\u{2039}', '\u{203A}'],
    ['\u{300C}', '\u{300D}'],
  ]) {
    const text = `The rope sways near the ${open}una isla diminuta${close} sketch.`
    assert.equal(
      stripNarrationQuotes(text, SOURCE),
      'The rope sways near the sketch.',
      text,
    )
  }
})

test('a cue reference keeps only its time: the written one, the cue time or none', () => {
  for (const [text, cleaned] of [
    [
      "At cue 'hasta lo alto' (2.3s), he climbs to the top.",
      'At 2.3s, he climbs to the top.',
    ],
    [
      'He climbs as “trepa” is spoken, hand over hand.',
      'He climbs at 0.8 s, hand over hand.',
    ],
    [
      'The boy waves, and between «desde allí» and «palmera» he leans out.',
      'The boy waves, and between 3.2 s and 5.5 s he leans out.',
    ],
    [
      "The rope sways while 'diminuta' lands (4.6–5.0 s) and the sail ripples.",
      'The rope sways at 4.6–5.0 s and the sail ripples.',
    ],
    // «Nadie le creyó» es del guion pero no tiene marca en este clip.
    [
      "The boy waves; then at the cue 'nadie le creyó' he stops.",
      'The boy waves; then he stops.',
    ],
    // Una marca traducida sigue siendo una marca de la voz.
    ['At the cue "to the top" (2.3 s), he climbs.', 'At 2.3 s, he climbs.'],
    // El redactor a veces escribe en el idioma del guion.
    ['al decir «hasta lo alto» la cuerda vibra', 'a los 2.3 s la cuerda vibra'],
  ])
    assert.equal(stripNarrationQuotes(text, SOURCE), cleaned, text)
})

test('lettering made of narration goes, any other quote and every apostrophe stay', () => {
  for (const [text, cleaned] of [
    [
      "The banner reading 'horizonte de sucesos' flutters.",
      'The banner flutters.',
    ],
    ["The 'cámara de cristal' panel glows.", 'The panel glows.'],
    // El nombre del rótulo detrás manda sobre la preposición de delante.
    [
      "The coins rest on the 'cámara de cristal' board.",
      'The coins rest on the board.',
    ],
    ['A flag with ‘mástil’.', 'A flag.'],
    [
      "the deck with the 'isla' map pinned to the mast",
      'the deck with the map pinned to the mast',
    ],
    // Sin acentos, en mayúsculas o con elipsis sigue siendo narración.
    ['The label reading "DESDE ALLI" glows.', 'The label glows.'],
    [
      "During 'grumete...mástil' the rope sways.",
      'Through 0.3 s the rope sways.',
    ],
    // La narración vecina y el resto del guion también cuentan.
    [
      'The sky darkens behind the "perdido en la niebla" title.',
      'The sky darkens behind the title.',
    ],
  ])
    assert.equal(stripNarrationQuotes(text, SOURCE), cleaned, text)

  for (const text of [
    'The flag reading ‘SANTA MARÍA’ flutters.',
    'A "Pixel Art" finish, the boy’s hands and the sailors\' hats.',
    "Rock 'n' roll posters and the 5\" ruler stay in place.",
    'The «Año 1» panel and the "+10%" arrow.',
    'Nothing quoted here,   with  odd   spacing\n and a line break.',
    '',
  ])
    assert.equal(stripNarrationQuotes(text, SOURCE), text, text)
})

test('a quote inside a kept quote is still checked, and an apostrophe or a closing quote never opens one', () => {
  assert.equal(
    stripNarrationQuotes('He holds «the "trepa" card» up.', SOURCE),
    'He holds «the card» up.',
  )
  // Con narración en inglés, la prosa entre dos comillas tiene palabras de la
  // voz: ni el apóstrofo de «o'clock» ni la comilla que cierra «"hi."» abren
  // una cita hasta la comilla siguiente.
  const english = {
    narration: [
      "Then the boy climbs to the top and waves hello. At five o'clock the bell rings.",
    ],
    cues: cues([
      ['then', 0.1, 0.3],
      ['the', 0.3, 0.5],
      ['boy', 0.5, 0.8],
      ['climbs', 0.8, 1.0],
    ]),
  }
  for (const [text, cleaned] of [
    [
      'The sign "hi.", then "climbs" sounds and the boy waves.',
      'The sign "hi.", then at 0.8 s and the boy waves.',
    ],
    [
      "At five o'clock the 'bell' sign glows.",
      "At five o'clock the sign glows.",
    ],
  ])
    assert.equal(stripNarrationQuotes(text, english), cleaned, text)
})

test('scripts without spaces between words are matched too', () => {
  const japanese = {
    narration: ['今日は富士山に登ります。'],
    cues: [
      { word: '今日', fromSeconds: 0.2, toSeconds: 0.5 },
      { word: 'は', fromSeconds: 0.5, toSeconds: 0.6 },
      { word: '富士山', fromSeconds: 0.6, toSeconds: 1.1 },
      { word: 'に', fromSeconds: 1.1, toSeconds: 1.2 },
    ],
  }

  assert.equal(
    stripNarrationQuotes(
      'At cue 「富士山に」, the climber looks up.',
      japanese,
    ),
    'At 0.6 s, the climber looks up.',
  )
  assert.equal(
    stripNarrationQuotes('The 「今日」 sign glows.', japanese),
    'The sign glows.',
  )
})
