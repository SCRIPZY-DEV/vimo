// El escritor del movimiento del avatar (entrega 2e, diseño §21.2): el
// `motion_prompt` de cada aparición con Avatar V y IV. Fija: las ocho
// plantillas profesionales (abre, medio, cierra y larga, cada una normal y
// expresiva) y su orden de decisión (la larga gana si pasa los 10 s del
// movimiento propio; si no, manda la posición); la validación del prompt
// (recorta, colapsa espacios y saca las comillas que envuelven; rechaza lo
// vacío, lo de menos de 8 caracteres, lo de más de TARGET + 40, los saltos de
// línea y, por palabra completa y sin distinguir mayúsculas, lo que el
// proveedor no controla: cámara, lugar, objetos, pararse o caminar, fondo y
// luz); la huella del texto (sha256 del texto sin espacios de más); la
// posición de cada aparición (la primera abre, la última cierra, el resto va
// en el medio); y `writeAvatarMotionPrompts` con un `SceneLlm` falso: UN solo
// llamado para todas las escenas (JSON, tier `balanced`), el prompt del modelo
// cuando sirve, la plantilla para la escena que falta o no pasa la
// validación, la plantilla para todas si el modelo lanza, responde cualquier
// cosa o no hay cliente (nunca lanza), y la cancelación, que se vuelve a
// lanzar (el AbortError del cliente y la señal abortada). El prompt del
// sistema es el contrato con el modelo: se compara línea por línea. Puro:
// importa el código real, sin disco ni red.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import {
  avatarMotionPositions,
  avatarMotionTextHash,
  templateMotionPrompt,
  validateMotionPrompt,
  writeAvatarMotionPrompts,
} from '../../pipeline/avatar/motion-prompt.ts'
import {
  AVATAR_MOTION_LOOP_SECONDS,
  AVATAR_MOTION_PROMPT_LIMIT,
  AVATAR_MOTION_PROMPT_TARGET,
} from '../../pipeline/types/avatar.ts'

// Lo que dice el diseño, escrito a mano: si alguien cambia una constante o
// un umbral del módulo, el guard lo ve.
const MIN_LENGTH = 8
const MAX_LENGTH = 200
const TEXT_LIMIT = 600

// Las plantillas del diseño (§21.2), [normal, expresiva].
const TEMPLATES = {
  opening: [
    'Warm, confident smile at the camera with a small welcoming nod.',
    'Bright, enthusiastic smile at the camera with an open-palm welcoming gesture.',
  ],
  middle: [
    'Composed posture and sincere expression, with a subtle open-hand gesture on the key point.',
    'Engaged, energetic expression with clear open-hand gestures on the key point.',
  ],
  closing: [
    'Warm smile at the camera with a gentle, reassuring nod.',
    'Confident smile at the camera, nodding firmly with an open-hand gesture.',
  ],
  long: [
    'Composed, open posture and sincere expression, looking at the camera with occasional small nods.',
    'Warm, animated expression, looking at the camera with natural hand movement and occasional nods.',
  ],
}

// Las palabras que el proveedor no controla (lista cerrada del diseño).
const FORBIDDEN_TERMS = [
  'zoom',
  'zooms',
  'zoomed',
  'zooming',
  'pan',
  'pans',
  'panned',
  'panning',
  'dolly',
  'dollies',
  'close-up',
  'walk',
  'walks',
  'walked',
  'walking',
  'stand up',
  'stands up',
  'stood up',
  'standing up',
  'sit down',
  'sits down',
  'sat down',
  'sitting down',
  'turn around',
  'turns around',
  'turned around',
  'turning around',
  'kitchen',
  'outside',
  'coffee',
  'cup',
  'cups',
  'drink',
  'drinks',
  'drinking',
  'phone',
  'phones',
  'cigarette',
  'cigarettes',
  'smoking',
  'pick up',
  'picks up',
  'picked up',
  'picking up',
  'background',
  'lighting',
  'lights',
]

// El prompt del sistema del diseño, línea por línea (con TARGET = 160 y
// LOOP = 10 ya puestos).
const EXPECTED_SYSTEM_PROMPT_LINES = [
  'You direct a professional video presenter. For each avatar appearance, write ONE short motion prompt in English that an AI avatar engine will follow while the presenter says the given text.',
  '',
  'Rules:',
  '- Structure: body part + action + emotion or intensity. One gesture, or two beats at most, in at most two short clauses. Keep it under 160 characters.',
  '- Only control: facial expression (calm, warm, confident, sincere, enthusiastic, serious), hand gestures (open palm, point forward, hand on heart, small wave, count on fingers), body posture (lean in, upright, warm and open, composed), gaze (look at the camera, glance away briefly) and stillness (hands still, barely moves).',
  '- Never mention camera movement (zoom, pan, dolly), changing location or scene, props or actions with objects (coffee, phone, papers), standing up, sitting down or walking, or background and lighting changes.',
  '- Match the meaning and emotion of the text: welcome when it opens the video, emphasis on the key idea in the middle, a warm close when it ends. Natural and professional, never theatrical.',
  '- Appearances longer than 10 seconds: describe a sustained, subtle demeanor (expression, posture, gaze, small natural gestures) instead of a single gesture, because the motion repeats.',
  '- expressive=true: more energy and clearer gestures, still professional. expressive=false: calm, restrained movement.',
  '- Write the prompt in English even if the text is in another language.',
  '',
  'Return only JSON: {"motions":[{"sceneId":<number>,"prompt":"<motion prompt>"}]}',
]

// Un pedido de aparición; lo que el test no nombra queda en un valor llano.
function request(overrides = {}) {
  return {
    sceneId: 1,
    text: 'Hola, bienvenidos a este video.',
    seconds: 8,
    position: 'middle',
    expressive: false,
    ...overrides,
  }
}

// Un SceneLlm falso: guarda cada pedido y responde con lo que dé `answer`
// (un texto, una promesa, o lanza).
function fakeLlm(answer) {
  const calls = []
  return {
    calls,
    generate(llmRequest) {
      calls.push(llmRequest)
      return answer(llmRequest)
    },
  }
}

const replying = (content) => fakeLlm(() => Promise.resolve(content))

const motionsJson = (motions) => JSON.stringify({ motions })

// Cada escena con su plantilla, en el orden de los pedidos.
const templatesOf = (requests) =>
  requests.map((each) => [each.sceneId, templateMotionPrompt(each)])

// Respuestas que no sirven de nada: el resultado es todo plantillas.
const UNUSABLE_ANSWERS = [
  '',
  'Sorry, I cannot do that.',
  '{"motions":',
  '{"motions":"Warm smile at the camera."}',
  '{"motions":{"1":"Warm smile at the camera."}}',
  '{"motions":[]}',
  '{"motion":[{"sceneId":1,"prompt":"Warm smile at the camera."}]}',
  '[{"sceneId":1,"prompt":"Warm smile at the camera."}]',
  'null',
  '{"motions":[{"sceneId":"1","prompt":"Warm smile at the camera."}]}',
  '{"motions":[{"sceneId":1,"prompt":42}]}',
  '{"motions":[null,"x",3]}',
]

test('las constantes del diseño no se movieron', () => {
  assert.equal(AVATAR_MOTION_PROMPT_TARGET, 160)
  assert.equal(AVATAR_MOTION_LOOP_SECONDS, 10)
  assert.equal(AVATAR_MOTION_PROMPT_TARGET + 40, MAX_LENGTH)
  // Un prompt que pasa la validación siempre cabe en el tope del editor.
  assert.ok(MAX_LENGTH < AVATAR_MOTION_PROMPT_LIMIT)
})

test('las ocho plantillas son las del diseño y pasan la validación', () => {
  for (const [kind, [normal, expressive]] of Object.entries(TEMPLATES)) {
    // La larga se pide con segundos de más; las otras, con su posición.
    const shape =
      kind === 'long'
        ? { position: 'middle', seconds: AVATAR_MOTION_LOOP_SECONDS + 2 }
        : { position: kind, seconds: 8 }

    const calm = templateMotionPrompt(request({ ...shape, expressive: false }))
    const energetic = templateMotionPrompt(
      request({ ...shape, expressive: true }),
    )
    assert.equal(calm, normal, `${kind} normal`)
    assert.equal(energetic, expressive, `${kind} expresiva`)

    for (const prompt of [calm, energetic]) {
      assert.equal(validateMotionPrompt(prompt), prompt, prompt)
      assert.ok(prompt.length <= AVATAR_MOTION_PROMPT_TARGET, prompt)
    }
  }
})

test('la plantilla larga gana sobre la posición, y solo pasados los 10 s', () => {
  for (const position of ['opening', 'middle', 'closing']) {
    assert.equal(
      templateMotionPrompt(request({ position, seconds: 12 })),
      TEMPLATES.long[0],
      `${position} de 12 s`,
    )
    assert.equal(
      templateMotionPrompt(
        request({ position, seconds: 12, expressive: true }),
      ),
      TEMPLATES.long[1],
      `${position} de 12 s, expresiva`,
    )
  }

  // Justo 10 s todavía cabe en el movimiento propio: manda la posición.
  assert.equal(
    templateMotionPrompt(
      request({ position: 'closing', seconds: AVATAR_MOTION_LOOP_SECONDS }),
    ),
    TEMPLATES.closing[0],
  )
  assert.equal(
    templateMotionPrompt(
      request({
        position: 'closing',
        seconds: AVATAR_MOTION_LOOP_SECONDS + 0.01,
      }),
    ),
    TEMPLATES.long[0],
  )
  assert.equal(
    templateMotionPrompt(request({ position: 'opening', seconds: 0.5 })),
    TEMPLATES.opening[0],
  )
})

test('una plantilla nunca lanza: sin largo o con una posición rara cae en la del medio', () => {
  assert.equal(
    templateMotionPrompt(request({ seconds: Number.NaN })),
    TEMPLATES.middle[0],
  )
  assert.equal(
    templateMotionPrompt(request({ position: 'sideways', expressive: true })),
    TEMPLATES.middle[1],
  )
})

test('la validación rechaza cada palabra de la lista, en cualquier mayúscula y dentro de una frase', () => {
  assert.equal(FORBIDDEN_TERMS.length, 47)

  for (const term of FORBIDDEN_TERMS) {
    const capitalized = term[0].toUpperCase() + term.slice(1)
    const phrases = [
      `Warm smile at the camera, then ${term} slowly.`,
      `${capitalized} with a warm smile at the camera.`,
      `Warm smile at the camera and ${term.toUpperCase()}`,
      `Warm smile (${term}), hands still.`,
      `Warm smile at the camera,${term},hands still.`,
    ]
    for (const phrase of phrases)
      assert.equal(validateMotionPrompt(phrase), null, phrase)

    // El control: la misma frase sin la palabra sí sirve.
    const control = `Warm smile at the camera, then relax slowly.`
    assert.equal(validateMotionPrompt(control), control)
  }
})

test('la validación es por palabra completa: una palabra que solo contiene una prohibida sirve', () => {
  const accepted = [
    'Calm company presenter, composed posture, steady gaze.',
    'Hands cupped gently, warm and sincere expression.',
    'Sincere expression with warm highlights in the voice.',
    'Composed posture, like an insider, not an outsider.',
    'Sincere and phonetic emphasis with small open-hand gestures.',
    'Relaxed expression, drinkable warmth in the smile, hands still.',
    'Open posture, no panel needed, steady gaze at the camera.',
    // La frontera es de cualquier alfabeto (R-2e-13): «pan» dentro de
    // «Panóptico» y «cup» dentro de «cupé» no cuentan.
    'Panóptico calm, composed posture, steady gaze at the camera.',
    'Warm smile, cupé-style composure, hands still.',
    // «head tilt» es postura: ya no está en la lista.
    'Gentle head tilt with a warm smile at the camera.',
  ]
  for (const prompt of accepted)
    assert.equal(validateMotionPrompt(prompt), prompt, prompt)
})

test('la validación acepta «look at the camera» y «into the lens»', () => {
  for (const prompt of [
    'Warm smile, look at the camera, one small wave.',
    'Confident expression, looking into the lens, hands still.',
    'Composed posture, glance away briefly then look at the camera.',
  ])
    assert.equal(validateMotionPrompt(prompt), prompt, prompt)
})

test('la validación recorta, colapsa los espacios y saca las comillas que envuelven', () => {
  const clean = 'Warm smile at the camera, one small wave.'
  const wrapped = [
    ['  Warm   smile at\tthe camera,  one small    wave.   ', clean],
    [`"${clean}"`, clean],
    [`'${clean}'`, clean],
    [`\`${clean}\``, clean],
    // Las tipográficas y las angulares van con `\u{…}`: ningún editor las
    // confunde con las rectas.
    [`\u{201C}${clean}\u{201D}`, clean],
    [`\u{2018}${clean}\u{2019}`, clean],
    [`\u{00AB}${clean}\u{00BB}`, clean],
    [`  "  ${clean}  "  `, clean],
    // Dos capas: la de afuera y la de adentro.
    [`"\u{201C}${clean}\u{201D}"`, clean],
    // Un salto de línea al principio o al final es un espacio de más.
    [`\n${clean}\n`, clean],
    [`"${clean}"\r\n`, clean],
  ]
  for (const [input, expected] of wrapped)
    assert.equal(validateMotionPrompt(input), expected, JSON.stringify(input))

  // Comillas que NO envuelven se quedan: no es una cita de punta a punta.
  for (const prompt of [
    'Warm smile at the "camera", one small wave.',
    // Empieza y termina con comillas, pero son dos citas, no una envoltura.
    '"Warm smile" at the camera, then "relax"',
    `Warm smile at the camera, one small wave.'`,
    `"Warm smile at the camera, one small wave.`,
  ])
    assert.equal(validateMotionPrompt(prompt), prompt, prompt)
})

test('la validación rechaza lo vacío, lo corto y lo largo, en el borde exacto', () => {
  for (const empty of ['', '   ', '\n\t ', '""', '"  "', '\u{201C}\u{201D}'])
    assert.equal(validateMotionPrompt(empty), null, JSON.stringify(empty))

  const sevenLetters = 'Nod now'
  const eightLetters = 'Nod once'
  assert.equal(sevenLetters.length, MIN_LENGTH - 1)
  assert.equal(eightLetters.length, MIN_LENGTH)
  assert.equal(validateMotionPrompt(sevenLetters), null)
  assert.equal(validateMotionPrompt(eightLetters), eightLetters)

  const limit = `Warm smile${' and nod'.repeat(30)}`.slice(0, MAX_LENGTH)
  assert.equal(limit.length, MAX_LENGTH)
  assert.doesNotMatch(limit, /\s$/)
  assert.equal(validateMotionPrompt(limit), limit)
  assert.equal(validateMotionPrompt(`${limit}.`), null)
  // El largo se mide ya normalizado: ni las comillas ni los espacios de más
  // cuentan, aunque el texto crudo pase de los 200.
  const padded = limit.replace(/ /g, '    ')
  assert.ok(padded.length > MAX_LENGTH)
  assert.equal(validateMotionPrompt(`"  ${limit}  "`), limit)
  assert.equal(validateMotionPrompt(padded), limit)
  assert.equal(validateMotionPrompt('x'.repeat(5000)), null)
})

test('la validación rechaza los saltos de línea de adentro, sean cuales sean', () => {
  const breaks = [
    '\n',
    '\r\n',
    '\r',
    '\u0085',
    '\u2028',
    '\u2029',
    '\u000B',
    '\u000C',
  ]
  for (const lineBreak of breaks) {
    const prompt = `Warm smile at the camera,${lineBreak}one small wave.`
    assert.equal(validateMotionPrompt(prompt), null, JSON.stringify(prompt))
    assert.equal(
      validateMotionPrompt(`"${prompt}"`),
      null,
      `entre comillas: ${JSON.stringify(prompt)}`,
    )
  }
})

test('las posiciones: la primera abre, la última cierra y el resto va en el medio', () => {
  assert.deepEqual([...avatarMotionPositions([])], [])
  // Una sola escena abre (y no cierra).
  assert.deepEqual([...avatarMotionPositions([7])], [[7, 'opening']])
  assert.deepEqual(
    [...avatarMotionPositions([3, 9])],
    [
      [3, 'opening'],
      [9, 'closing'],
    ],
  )
  assert.deepEqual(
    [...avatarMotionPositions([1, 2, 3, 4])],
    [
      [1, 'opening'],
      [2, 'middle'],
      [3, 'middle'],
      [4, 'closing'],
    ],
  )
  // Manda el orden que se da, no el valor de los ids.
  assert.deepEqual(
    [...avatarMotionPositions([10, 4, 25])],
    [
      [10, 'opening'],
      [4, 'middle'],
      [25, 'closing'],
    ],
  )
})

test('la huella del texto es el sha256 del texto sin espacios de más', () => {
  const sha256 = (text) => createHash('sha256').update(text).digest('hex')
  const expected = sha256('Hola a todos, bienvenidos.')

  assert.match(expected, /^[0-9a-f]{64}$/)
  for (const noisy of [
    'Hola a todos, bienvenidos.',
    '  Hola a todos, bienvenidos.  ',
    'Hola   a todos,\tbienvenidos.',
    'Hola a todos,\n\nbienvenidos.',
    '\u{00A0}Hola a  todos, bienvenidos.\u{00A0}',
    'Hola\r\na todos, bienvenidos.',
  ])
    assert.equal(avatarMotionTextHash(noisy), expected, JSON.stringify(noisy))

  // Lo que cambia el sentido sí cambia la huella.
  for (const other of [
    'Hola a todos, bienvenidas.',
    'hola a todos, bienvenidos.',
    'Hola a todos bienvenidos.',
    'Hola a todos, bienvenidos',
    '',
  ])
    assert.notEqual(avatarMotionTextHash(other), expected, other)

  assert.equal(avatarMotionTextHash('   '), sha256(''))
})

test('el camino feliz: un solo llamado en JSON y el prompt del modelo en cada escena', async () => {
  const requests = [
    request({ sceneId: 3, position: 'opening', seconds: 8.4 }),
    request({ sceneId: 7, position: 'middle', expressive: true }),
    request({ sceneId: 9, position: 'closing', seconds: 12 }),
  ]
  const written = {
    3: 'Warm, welcoming smile at the camera with a small wave.',
    7: 'Engaged expression, leaning in with open palms on the key idea.',
    9: 'Calm, sustained smile, upright posture and relaxed hands.',
  }
  const llm = replying(
    motionsJson(
      requests.map(({ sceneId }) => ({ sceneId, prompt: written[sceneId] })),
    ),
  )

  const result = await writeAvatarMotionPrompts(llm, requests)

  assert.equal(llm.calls.length, 1)
  assert.equal(llm.calls[0].jsonOnly, true)
  assert.equal(llm.calls[0].tier, 'balanced')
  assert.equal(typeof llm.calls[0].validate, 'function')
  assert.deepEqual(
    [...result],
    [
      [3, written[3]],
      [7, written[7]],
      [9, written[9]],
    ],
  )
})

test('la respuesta del modelo puede venir en un bloque de código y con comillas de más', async () => {
  const requests = [request({ sceneId: 1 }), request({ sceneId: 2 })]
  const llm = replying(
    [
      'Here you go:',
      '```json',
      motionsJson([
        { sceneId: 1, prompt: '  "Warm   smile at the camera."  ' },
        { sceneId: 2, prompt: 'Sincere expression, hands still.\n' },
      ]),
      '```',
    ].join('\n'),
  )

  const result = await writeAvatarMotionPrompts(llm, requests)

  assert.deepEqual(
    [...result],
    [
      [1, 'Warm smile at the camera.'],
      [2, 'Sincere expression, hands still.'],
    ],
  )
})

test('un prompt malo cae solo en su plantilla: las otras escenas conservan el del modelo', async () => {
  const requests = [
    request({ sceneId: 1, position: 'opening' }),
    request({ sceneId: 2, position: 'middle' }),
    request({ sceneId: 3, position: 'middle', expressive: true }),
    request({ sceneId: 4, position: 'middle' }),
    request({ sceneId: 5, position: 'middle' }),
    request({ sceneId: 6, position: 'middle' }),
    request({ sceneId: 7, position: 'closing' }),
  ]
  const tooLong = 'Warm smile and nod. '.repeat(11).trim()
  assert.ok(tooLong.length > MAX_LENGTH)
  const llm = replying(
    motionsJson([
      { sceneId: 1, prompt: 'Warm smile at the camera, one small wave.' },
      // Pide cámara: la plantilla.
      { sceneId: 2, prompt: 'Slow zoom on the presenter, warm smile.' },
      // Largo de más: la plantilla.
      { sceneId: 3, prompt: tooLong },
      // Sin prompt, sin texto, de otro tipo: la plantilla.
      { sceneId: 4, prompt: '' },
      { sceneId: 5, prompt: 42 },
      { sceneId: 6 },
      // Una escena que no se pidió no entra al resultado.
      { sceneId: 99, prompt: 'Warm smile at the camera, one small wave.' },
      // La escena 7 no viene: la plantilla.
    ]),
  )

  const result = await writeAvatarMotionPrompts(llm, requests)

  assert.equal(llm.calls.length, 1)
  assert.deepEqual(
    [...result],
    [
      [1, 'Warm smile at the camera, one small wave.'],
      [2, templateMotionPrompt(requests[1])],
      [3, templateMotionPrompt(requests[2])],
      [4, templateMotionPrompt(requests[3])],
      [5, templateMotionPrompt(requests[4])],
      [6, templateMotionPrompt(requests[5])],
      [7, TEMPLATES.closing[0]],
    ],
  )
  assert.equal(result.has(99), false)
})

test('si el modelo repite una escena, manda el último prompt que sirve y uno malo no pisa a uno bueno', async () => {
  const requests = [request({ sceneId: 1 }), request({ sceneId: 2 })]
  const llm = replying(
    motionsJson([
      { sceneId: 1, prompt: 'Warm smile at the camera, one small wave.' },
      { sceneId: 1, prompt: 'Sincere expression, hands still, steady gaze.' },
      { sceneId: 1, prompt: 'Slow zoom in on the presenter.' },
      // Dos malos: se queda la plantilla.
      { sceneId: 2, prompt: 'Slow zoom in on the presenter.' },
      { sceneId: 2, prompt: '' },
    ]),
  )

  const result = await writeAvatarMotionPrompts(llm, requests)

  assert.deepEqual(
    [...result],
    [
      [1, 'Sincere expression, hands still, steady gaze.'],
      [2, templateMotionPrompt(requests[1])],
    ],
  )
})

test('un JSON inválido o fuera del contrato deja todas las escenas con su plantilla, sin reintentar', async () => {
  const requests = [
    request({ sceneId: 1, position: 'opening' }),
    request({ sceneId: 2, position: 'closing', expressive: true }),
  ]

  for (const answer of UNUSABLE_ANSWERS) {
    const llm = replying(answer)

    const result = await writeAvatarMotionPrompts(llm, requests)

    assert.equal(llm.calls.length, 1, answer)
    assert.deepEqual([...result], templatesOf(requests), answer)
  }
})

test('si el modelo lanza, todas usan la plantilla y no se propaga nada', async () => {
  const requests = [
    request({ sceneId: 1, position: 'opening' }),
    request({ sceneId: 2, position: 'closing' }),
  ]
  const failure = Object.assign(new Error('rate limited'), {
    code: 'llm_rate_limited',
  })
  const answers = [
    () => Promise.reject(new Error('boom')),
    () => Promise.reject(failure),
    () => Promise.reject(new TypeError('fetch failed')),
    () => Promise.reject('un texto suelto'),
    () => Promise.reject(undefined),
    // El tiempo agotado no es una cancelación del job.
    () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
    () => {
      throw new Error('lanzó sin promesa')
    },
    // Un cliente que responde algo que ni siquiera es un texto.
    () => Promise.resolve(undefined),
    () => Promise.resolve({ motions: [] }),
  ]

  for (const answer of answers) {
    const llm = fakeLlm(answer)

    const result = await writeAvatarMotionPrompts(llm, requests)

    assert.equal(llm.calls.length, 1)
    assert.deepEqual([...result], templatesOf(requests))
  }
})

test('sin cliente (sin clave) todas usan la plantilla y no hay a quién llamar', async () => {
  const requests = [
    request({ sceneId: 4, position: 'opening', expressive: true }),
    request({ sceneId: 5, position: 'middle', seconds: 30 }),
    request({ sceneId: 6, position: 'closing' }),
  ]

  const result = await writeAvatarMotionPrompts(null, requests)

  assert.deepEqual(
    [...result],
    [
      [4, TEMPLATES.opening[1]],
      [5, TEMPLATES.long[0]],
      [6, TEMPLATES.closing[0]],
    ],
  )
})

test('sin escenas no hay llamado: el resultado es vacío', async () => {
  const llm = replying(motionsJson([]))

  const result = await writeAvatarMotionPrompts(llm, [])

  assert.equal(llm.calls.length, 0)
  assert.equal(result.size, 0)
  assert.equal((await writeAvatarMotionPrompts(null, [])).size, 0)
})

test('una cancelación se vuelve a lanzar: el AbortError del cliente tal cual', async () => {
  const requests = [request({ sceneId: 1 })]
  const abort = new DOMException('The operation was aborted.', 'AbortError')
  const named = Object.assign(new Error('cancelled'), { name: 'AbortError' })

  for (const [thrown, how] of [
    [abort, 'DOMException'],
    [named, 'Error con nombre AbortError'],
  ]) {
    await assert.rejects(
      writeAvatarMotionPrompts(
        fakeLlm(() => Promise.reject(thrown)),
        requests,
      ),
      (error) => error === thrown,
      how,
    )
    await assert.rejects(
      writeAvatarMotionPrompts(
        fakeLlm(() => {
          throw thrown
        }),
        requests,
      ),
      (error) => error === thrown,
      `${how}, lanzado sin promesa`,
    )
  }
})

test('una cancelación se vuelve a lanzar: la señal abortada, antes, durante y después del llamado', async () => {
  const requests = [request({ sceneId: 1 })]
  const answer = motionsJson([
    { sceneId: 1, prompt: 'Warm smile at the camera, one small wave.' },
  ])

  // Antes: ni se llama al modelo.
  const early = new AbortController()
  early.abort()
  const idle = replying(answer)
  await assert.rejects(
    writeAvatarMotionPrompts(idle, requests, early.signal),
    (error) => error === early.signal.reason,
  )
  assert.equal(idle.calls.length, 0)
  await assert.rejects(
    writeAvatarMotionPrompts(null, requests, early.signal),
    (error) => error === early.signal.reason,
  )

  // Durante: el cliente falla con un error que no es un AbortError, pero la
  // señal ya está abortada: es la cancelación, no un fallo del modelo.
  const during = new AbortController()
  await assert.rejects(
    writeAvatarMotionPrompts(
      fakeLlm(() => {
        during.abort()
        return Promise.reject(new Error('socket hang up'))
      }),
      requests,
      during.signal,
    ),
    (error) => error === during.signal.reason,
  )

  // Después: el modelo alcanzó a responder, pero el job ya se canceló.
  const late = new AbortController()
  await assert.rejects(
    writeAvatarMotionPrompts(
      fakeLlm(() => {
        late.abort()
        return Promise.resolve(answer)
      }),
      requests,
      late.signal,
    ),
    (error) => error === late.signal.reason,
  )

  // Una señal que no se abortó no cambia nada.
  const live = new AbortController()
  const result = await writeAvatarMotionPrompts(
    replying(answer),
    requests,
    live.signal,
  )
  assert.deepEqual(
    [...result],
    [[1, 'Warm smile at the camera, one small wave.']],
  )
  const failed = await writeAvatarMotionPrompts(
    fakeLlm(() => Promise.reject(new Error('boom'))),
    requests,
    live.signal,
  )
  assert.deepEqual([...failed], templatesOf(requests))
})

test('el prompt del sistema es el del diseño, con los valores puestos', async () => {
  const llm = replying(motionsJson([]))

  await writeAvatarMotionPrompts(llm, [request()])

  const { systemPrompt } = llm.calls[0]
  assert.deepEqual(systemPrompt.split('\n'), EXPECTED_SYSTEM_PROMPT_LINES)
  // Ningún marcador sin reemplazar.
  assert.doesNotMatch(systemPrompt, /\{[A-Z_]+\}|undefined|NaN/)
})

test('el mensaje del usuario lista cada escena con su posición, su largo, si es larga, si es expresiva y su texto', async () => {
  const words = 'palabra '.repeat(200)
  const requests = [
    request({
      sceneId: 2,
      position: 'opening',
      seconds: 8.44,
      expressive: false,
      text: '  Hola   a\n todos  ',
    }),
    request({
      sceneId: 5,
      position: 'closing',
      seconds: 12,
      expressive: true,
      text: words,
    }),
    request({
      sceneId: 8,
      position: 'middle',
      seconds: AVATAR_MOTION_LOOP_SECONDS,
      text: '😀'.repeat(700),
    }),
    request({ sceneId: 9, position: 'middle', seconds: 9.96 }),
    request({ sceneId: 10, position: 'middle', seconds: 10.04 }),
  ]
  const llm = replying(motionsJson([]))

  await writeAvatarMotionPrompts(llm, requests)

  const payload = JSON.parse(llm.calls[0].userPrompt)
  assert.deepEqual(Object.keys(payload), ['scenes'])
  assert.equal(payload.scenes.length, requests.length)
  for (const scene of payload.scenes)
    assert.deepEqual(Object.keys(scene), [
      'sceneId',
      'position',
      'seconds',
      'long',
      'expressive',
      'text',
    ])

  const [short, long, emojis, almostTen, justOverTen] = payload.scenes
  assert.deepEqual(short, {
    sceneId: 2,
    position: 'opening',
    seconds: 8.4,
    long: false,
    expressive: false,
    text: 'Hola a todos',
  })
  assert.equal(long.sceneId, 5)
  assert.equal(long.position, 'closing')
  assert.equal(long.seconds, 12)
  assert.equal(long.long, true)
  assert.equal(long.expressive, true)
  // El texto va normalizado y cortado a 600 caracteres.
  const expectedText = Array.from(words.trim().replace(/\s+/g, ' '))
    .slice(0, TEXT_LIMIT)
    .join('')
  assert.equal(long.text, expectedText)
  assert.equal(long.text.length, TEXT_LIMIT)

  // Justo 10 s no es larga; el corte cuenta caracteres, no mitades de un emoji.
  assert.equal(emojis.seconds, 10)
  assert.equal(emojis.long, false)
  assert.equal(Array.from(emojis.text).length, TEXT_LIMIT)
  assert.equal(emojis.text, '😀'.repeat(TEXT_LIMIT))
  assert.doesNotMatch(emojis.text, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)

  // El largo se redondea a un decimal, pero «larga» mira los segundos reales.
  assert.equal(almostTen.seconds, 10)
  assert.equal(almostTen.long, false)
  assert.equal(justOverTen.seconds, 10)
  assert.equal(justOverTen.long, true)
})

test('el presupuesto de salida alcanza para un prompt del largo máximo por escena y crece con ellas', async () => {
  const budgetFor = async (count) => {
    const requests = Array.from({ length: count }, (_, index) =>
      request({ sceneId: index + 1 }),
    )
    const llm = replying(motionsJson([]))
    await writeAvatarMotionPrompts(llm, requests)
    return llm.calls[0].maxOutputTokens
  }

  const one = await budgetFor(1)
  const ten = await budgetFor(10)
  assert.ok(Number.isInteger(one) && one > 0)
  assert.ok(Number.isInteger(ten))
  assert.ok(ten > one)
  // ~50 tokens por prompt de 200 caracteres, más el JSON de cada entrada.
  assert.ok(one >= 70, String(one))
  assert.ok(ten >= 10 * 70, String(ten))
})

test('el contrato del `validate`: exige el JSON de las motions completas y nada más', async () => {
  const llm = replying(motionsJson([]))
  await writeAvatarMotionPrompts(llm, [request()])
  const { validate } = llm.calls[0]

  const good = motionsJson([
    { sceneId: 1, prompt: 'Warm smile at the camera.' },
    { sceneId: 2, prompt: 'Sincere expression, hands still.' },
  ])
  assert.equal(validate(good), true)
  assert.equal(validate(`\`\`\`json\n${good}\n\`\`\``), true)
  // Valida la forma, no el criterio: ese lo aplica cada escena por separado.
  assert.equal(
    validate(motionsJson([{ sceneId: 99, prompt: 'Slow zoom in.' }])),
    true,
  )

  for (const answer of UNUSABLE_ANSWERS)
    assert.equal(validate(answer), false, answer)
  // Una entrada rota echa a perder el contrato entero.
  assert.equal(
    validate(
      motionsJson([
        { sceneId: 1, prompt: 'Warm smile at the camera.' },
        { sceneId: 2 },
      ]),
    ),
    false,
  )
})

test('el resultado trae una entrada por escena, en el orden de los pedidos, y no toca los pedidos', async () => {
  const requests = [
    request({ sceneId: 30, position: 'opening' }),
    request({ sceneId: 10, position: 'middle' }),
    request({ sceneId: 20, position: 'closing' }),
  ].map((each) => Object.freeze(each))
  Object.freeze(requests)
  const llm = replying(
    motionsJson([
      { sceneId: 20, prompt: 'Warm smile at the camera, one small wave.' },
    ]),
  )

  const result = await writeAvatarMotionPrompts(llm, requests)

  assert.deepEqual([...result.keys()], [30, 10, 20])
  assert.equal(result.get(20), 'Warm smile at the camera, one small wave.')
  assert.equal(result.get(30), TEMPLATES.opening[0])
  assert.equal(result.get(10), TEMPLATES.middle[0])
})
