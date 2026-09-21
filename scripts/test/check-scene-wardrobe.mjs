// Vestuario por escena en «Mi estilo» (detrás de VERBATIM_SCENE_WARDROBE):
// con la constante apagada todo es byte-idéntico a antes; encendida, la ropa
// de la escena reemplaza a la ropa base y el resto de la identidad no cambia.
// Sin HTTP: el escritor recibe un cliente LLM simulado.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  composeFinalPrompt,
  generateVerbatimPrompts,
} from '../../pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts'
import {
  extractWardrobe,
  splitOutfit,
  weaveSubject,
} from '../../pipeline/stages/scene-prompts/verbatim/subject-weaver.ts'
import {
  BATCH_WARDROBE_ADDENDUM,
  buildCharacterDesignMessage,
  buildFragmentsMessage,
  buildVerbatimSystem,
  CHARACTER_DESIGN_INSTRUCTION,
  CHARACTER_OUTFIT_SENTENCE_RULE,
  SCENE_WARDROBE_RULE,
  STYLE_CHARACTER_PRECEDENCE_RULE,
  VERBATIM_SCENE_WARDROBE,
} from '../../pipeline/prompts/verbatim-messages.ts'
import {
  DESCRIPTION_HEADER,
  DESCRIPTION_HEADER_WITH_WARDROBE,
  signatureLookNote,
} from '../../pipeline/prompts/verbatim-identity.ts'
import {
  buildCustomStyleReferencePrompt,
  buildCustomStyleReferencePromptMulti,
} from '../../pipeline/prompts/character-reference.ts'

const gem =
  'Render every scene as a hand-drawn watercolor illustration. Keep the story action and setting.'
const tail = 'Style: hand-drawn watercolor illustration.'
const script =
  'Mila swims at the beach. She dries off. She walks home through the snow. She reads by the fire.'
const sheet =
  'A curious red-haired girl, slender build, freckles across the nose, round green glasses. Outfit: a green hoodie, blue jeans and white sneakers.'
const core =
  'A curious red-haired girl, slender build, freckles across the nose, round green glasses.'
const fragments = [
  { n: 1, text: 'Mila swims at the beach.' },
  { n: 2, text: 'She dries off.' },
  { n: 3, text: 'She walks home through the snow.' },
  { n: 4, text: 'She reads by the fire.' },
]

function fragmentsOf(request) {
  return [...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm)].map(
    (match) => Number(match[1]),
  )
}
function isPhaseOne(request) {
  return request.messages.at(-1).content.includes(CHARACTER_DESIGN_INSTRUCTION)
}
// Cliente simulado: la Fase 1 devuelve la ficha; la Fase 2, un prompt por
// fragmento según `scenes` (id → texto con [subject]).
function fakeClient(scenes, { sheetText = sheet } = {}) {
  const requests = []
  return {
    requests,
    async call(request) {
      requests.push(request)
      const content = isPhaseOne(request)
        ? '```text\n' + sheetText + '\n```'
        : fragmentsOf(request)
            .map((id) => '((' + id + ')) ' + scenes[id] + ' ' + tail)
            .join('\n\n')
      return { content, inputTokens: 1, outputTokens: 1 }
    },
  }
}
async function write(scenes, options = {}) {
  const client = fakeClient(scenes, options)
  const logs = []
  const result = await generateVerbatimPrompts(fragments, script, {
    gem,
    client,
    onLog: (message) => logs.push(message),
    onWarn: (message) => logs.push('warn: ' + message),
    ...options,
  })
  return { result, requests: client.requests, logs }
}
const plain = {
  1: '[subject] swims in the sea.',
  2: '[subject] dries off on the sand.',
  3: '[subject] walks through the snow.',
  4: '[subject] reads by the fire.',
}
const withWardrobe = {
  1: '[subject] (wearing: a red swimsuit and sandals) swims in the sea.',
  2: '[subject] (wearing: a red one-piece swimsuit) dries off on the sand.',
  3: '[subject] (wearing: a thick grey winter coat and boots) walks through the snow.',
  4: '[subject] reads by the fire.',
}

// ── La constante ──

test('scene wardrobe is switched on (after the A/B with real keys)', () => {
  assert.equal(VERBATIM_SCENE_WARDROBE, true)
})

test('switched off explicitly, every message is byte-identical to before the wardrobe', () => {
  const off = { sceneWardrobe: false }
  for (const mode of ['generic', 'text', 'reference', 'none']) {
    assert.ok(!buildVerbatimSystem(gem, mode, off).includes('VESTUARIO'))
    assert.ok(!buildFragmentsMessage(fragments, mode, off).includes('wearing'))
  }
  assert.equal(
    buildCharacterDesignMessage(script, off),
    'GUION: \n\n' +
      script +
      '\n\n' +
      STYLE_CHARACTER_PRECEDENCE_RULE +
      '\n\n' +
      CHARACTER_DESIGN_INSTRUCTION,
  )
  assert.match(
    buildCustomStyleReferencePrompt('Elena', 'Scene.', false),
    /same outfit/,
  )
  // Y por defecto (encendida) el system cierra con la regla del vestuario.
  assert.ok(buildVerbatimSystem(gem, 'generic').endsWith(SCENE_WARDROBE_RULE))
})

test('switched on, the rules are declared and added, and the ported texts stay intact', () => {
  const system = buildVerbatimSystem(gem, 'text', { sceneWardrobe: true })
  assert.ok(system.startsWith(gem))
  assert.ok(system.endsWith(SCENE_WARDROBE_RULE))
  assert.ok(
    !buildVerbatimSystem(gem, 'none', { sceneWardrobe: true }).includes(
      SCENE_WARDROBE_RULE,
    ),
    'sin protagonista no hay vestuario',
  )
  assert.ok(
    buildFragmentsMessage(fragments, 'generic', {
      sceneWardrobe: true,
    }).includes(BATCH_WARDROBE_ADDENDUM),
  )
  assert.ok(
    buildCharacterDesignMessage(script, { sceneWardrobe: true }).endsWith(
      STYLE_CHARACTER_PRECEDENCE_RULE +
        '\n\n' +
        CHARACTER_OUTFIT_SENTENCE_RULE +
        '\n\n' +
        CHARACTER_DESIGN_INSTRUCTION,
    ),
  )
})

// ── El tejido ──

test('the marker leaves the prompt, the clothing joins the role and the base outfit is dropped', () => {
  assert.deepEqual(
    extractWardrobe(
      'Wide shot of [subject] (wearing: a red swimsuit) running; [subject] laughs.',
    ),
    {
      scene: 'Wide shot of [subject] running; [subject] laughs.',
      wardrobe: 'a red swimsuit',
      rejected: undefined,
    },
  )
  assert.deepEqual(splitOutfit(sheet), {
    core,
    outfit: 'a green hoodie, blue jeans and white sneakers',
  })
  assert.equal(
    weaveSubject(
      'Wide shot of [subject] running.',
      sheet,
      undefined,
      'a red swimsuit',
    ),
    'Wide shot of the curious red-haired girl, wearing a red swimsuit, running. ' +
      DESCRIPTION_HEADER +
      ' ' +
      core +
      ' ' +
      signatureLookNote('a green hoodie, blue jeans and white sneakers'),
  )
  assert.match(
    signatureLookNote('a fedora and a badge'),
    /signature look stays with them on top of this scene's clothing/,
  )
})

test('a marker may swap an accessory the scene makes impossible, never the face or the hair', () => {
  assert.equal(
    extractWardrobe(
      '[subject] (wearing: a white space suit and a helmet instead of the fedora) floats.',
    ).wardrobe,
    'a white space suit and a helmet instead of the fedora',
  )
  assert.equal(
    extractWardrobe('[subject] (wearing: sunglasses and a straw hat) rests.')
      .wardrobe,
    'sunglasses and a straw hat',
  )
  for (const bad of [
    'a red swimsuit, long blonde hair',
    'a suit, older face',
    'a coat, bald head',
  ])
    assert.equal(
      extractWardrobe(`[subject] (wearing: ${bad}) runs.`).wardrobe,
      undefined,
      bad,
    )
})

test('a sheet without an Outfit sentence is split at its wearing clause', () => {
  const detective =
    'a slim minimalist character with a small round white head, dot eyes, and a simple curved smile. He is wearing a classic dark brown private investigator outfit, including a trench coat with a badge on the left chest, a fedora, and dark tie, holding a small notepad and pen.'
  assert.deepEqual(splitOutfit(detective), {
    core: 'a slim minimalist character with a small round white head, dot eyes, and a simple curved smile.',
    outfit:
      'a classic dark brown private investigator outfit, including a trench coat with a badge on the left chest, a fedora, and dark tie, holding a small notepad and pen',
  })
  assert.deepEqual(
    splitOutfit(
      'Lucia, a curious 8-year-old girl with curly brown hair, dressed in a yellow raincoat and green boots. Round face and freckles.',
    ),
    {
      core: 'Lucia, a curious 8-year-old girl with curly brown hair. Round face and freckles.',
      outfit: 'a yellow raincoat and green boots',
    },
  )
  // Sin identidad antes de la ropa no hay corte.
  assert.deepEqual(splitOutfit('Wearing a red coat.'), {
    core: 'Wearing a red coat.',
  })
})

test('the wardrobe rule gives no copyable example, no repeat instruction, and keeps the signature look', () => {
  assert.doesNotMatch(SCENE_WARDROBE_RULE, /red swimsuit|repite EXACTAMENTE/)
  assert.match(
    SCENE_WARDROBE_RULE,
    /nunca la de un fragmento anterior ni una de ejemplo/,
  )
  assert.match(
    SCENE_WARDROBE_RULE,
    /Lo que CARACTERIZA al personaje .* se queda con el encima/,
  )
  assert.match(SCENE_WARDROBE_RULE, /un casco en lugar del sombrero/)
  assert.match(
    CHARACTER_OUTFIT_SENTENCE_RULE,
    /TODO lo que el personaje lleva puesto o en la mano/,
  )
})

test('a marker with anything but clothing is discarded, and the base outfit stays', async () => {
  assert.equal(
    extractWardrobe(
      '[subject] (wearing: a red swimsuit, long blonde hair) runs.',
    ).wardrobe,
    undefined,
  )
  const { result, logs } = await write(
    {
      ...plain,
      1: '[subject] (wearing: a red swimsuit, long blonde hair) swims.',
    },
    { sceneWardrobe: true },
  )
  assert.match(result.prompts.get(1), /green hoodie/)
  assert.doesNotMatch(result.prompts.get(1), /blonde|wearing:/)
  assert.ok(logs.some((line) => line.includes('discarded')))
})

test('without a split, the whole description travels under the wardrobe header', () => {
  const description = 'A tall woman with silver hair and a red scarf.'
  const woven = weaveSubject(
    '[subject] runs.',
    description,
    undefined,
    'a red swimsuit',
  )
  assert.ok(
    woven.includes(DESCRIPTION_HEADER_WITH_WARDROBE + ' ' + description),
  )
  assert.match(woven, /, wearing a red swimsuit,/)
})

// ── El escritor completo ──

test('switched on: contiguous scenes share the first wardrobe, others keep the base outfit', async (t) => {
  const { result, requests, logs } = await write(withWardrobe, {
    sceneWardrobe: true,
  })
  const prompt = (id) => result.prompts.get(id)
  // Escenas 1 y 2 son contiguas con marcador: la 2 hereda la ropa de la 1.
  assert.match(prompt(1), /wearing a red swimsuit and sandals,/)
  assert.match(prompt(2), /wearing a red swimsuit and sandals,/)
  assert.doesNotMatch(prompt(2), /one-piece/)
  assert.match(prompt(3), /wearing a thick grey winter coat and boots,/)
  // Con ropa de escena la identidad fija viaja igual y la ropa base pasa a
  // ser la MARCA que se queda encima de la ropa de la escena.
  for (const id of [1, 2, 3]) {
    assert.ok(prompt(id).includes(DESCRIPTION_HEADER + ' ' + core), String(id))
    assert.match(prompt(id), /signature look stays with them .* green hoodie/)
    assert.doesNotMatch(prompt(id), /wearing:|\(wearing/)
  }
  // Sin marcador: idéntico a la salida de siempre, ropa base incluida.
  assert.equal(
    prompt(4),
    composeFinalPrompt(plain[4] + ' ' + tail, {
      mode: 'generic',
      description: sheet,
    }),
  )
  assert.match(prompt(4), /green hoodie/)
  assert.ok(
    requests.some((request) =>
      request.messages[0].content.includes(SCENE_WARDROBE_RULE),
    ),
  )
  assert.ok(
    logs.some((line) => line.includes('carry their own wardrobe: 1, 2, 3')),
  )
  assert.ok(logs.some((line) => line.includes('separates its base outfit')))
  t.diagnostic(prompt(1))
})

test('switched off: the same answers produce the same prompts as always, marker or not', async () => {
  const off = await write(plain, { sceneWardrobe: false })
  for (const [id, scene] of Object.entries(plain))
    assert.equal(
      off.result.prompts.get(Number(id)),
      composeFinalPrompt(scene + ' ' + tail, {
        mode: 'generic',
        description: sheet,
      }),
    )
  assert.ok(
    !off.requests.some((request) =>
      request.messages[0].content.includes('VESTUARIO'),
    ),
  )
})

test('with a reference photo the clothing joins the anchored name', async () => {
  const { result } = await write(withWardrobe, {
    sceneWardrobe: true,
    character: { mode: 'reference', name: 'Mila' },
  })
  assert.match(
    result.prompts.get(1),
    /^Mila \(the person from the attached reference image\), wearing a red swimsuit and sandals, swims/,
  )
  assert.equal(
    result.prompts.get(4),
    'Mila (the person from the attached reference image) reads by the fire. ' +
      tail,
  )
})

test('the reference lock frees the clothing only when switched on, for one and two names', () => {
  const on = buildCustomStyleReferencePrompt('Elena', 'Scene.', true)
  assert.match(
    on,
    /same face, same skin tone, same hair; when this scene describes other clothing, that clothing replaces the reference's, and the reference's signature hat, badge, coat and accessories stay on top/,
  )
  assert.doesNotMatch(on, /same outfit/)
  assert.match(
    buildCustomStyleReferencePromptMulti(['Elena', 'Bruno'], 'Scene.', true),
    /signature hat, badge, coat and accessories stay on top/,
  )
  assert.match(
    buildCustomStyleReferencePromptMulti(['Elena', 'Bruno'], 'Scene.', false),
    /same outfit/,
  )
})
