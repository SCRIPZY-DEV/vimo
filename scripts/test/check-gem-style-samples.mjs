// Las muestras de una gema de plantilla (spec §5.6): los 4 momentos fijos
// salen como UN lote del carril verbatim, con el mismo marco y el mismo modo
// de personaje que el video, el modelo de Ajustes y las frases fijas pegadas
// por código. Una gema vieja sigue por el lote JSON de siempre. LLM y
// proveedor de imágenes simulados; galería en una carpeta temporal.
//
// Sobre dev (PR #91, ADR-0044) el modelo de Ajustes se resuelve contra la
// oferta validada: uno oculto, retirado o desconocido escribe con el de la
// casa y lo avisa. Las muestras no traen intervalos de narración, así que no
// pasan por el juez de correspondencia (ADR-0043): el simulador igual le
// contesta una aprobación, como narrativeReviewResponse en
// check-verbatim-prompt-persistence, y lo registra aparte para probar que
// nadie lo llama.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { generateStyleSamples } from '../../pipeline/commands/styles/generate-style-samples.ts'
import { INTERACTIVE_MODEL_IDS } from '../../pipeline/providers/llm/interactive.ts'
import {
  DEFAULT_LLM_MODEL_ID,
  MODEL_CATALOG,
  offeredModels,
} from '../../pipeline/providers/llm/model-catalog.ts'
import { SAMPLE_FRAGMENTS } from '../../pipeline/prompts/style-samples.ts'
import {
  buildTemplateSystem,
  composeGemText,
} from '../../pipeline/prompts/template-frame.ts'
import {
  buildAssistantCharacterTurn,
  CHARACTER_DESIGN_INSTRUCTION,
} from '../../pipeline/prompts/verbatim-messages.ts'
import { DESCRIPTION_HEADER } from '../../pipeline/prompts/verbatim-identity.ts'

const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const sectionCharacter =
  'A stickman doll with a round white head, two black dot eyes and thin black line limbs. Outfit: white gloves and white rounded shoes.'
const promptStart = 'A simple stickman doll drawing:'
const promptEnd = 'Clean black lines on a colorful, softly shaded background.'
const sections = {
  visualStyle: 'Simple stickman drawings on colorful backgrounds.',
  character: sectionCharacter,
  dynamism: 'Show the protagonist in half of the scenes; objects in the rest.',
  promptStart,
  promptEnd,
}
const sheet =
  'A curious red-haired girl, slender build, freckles across the nose, round green glasses. Outfit: a green hoodie and blue jeans.'
const libraryDescription = 'A woman with curly red hair and a mustard raincoat.'
// El modelo de Ajustes: uno de la oferta validada que no sea el de la casa
// (ADR-0044). El plan usaba DeepSeek V4 Flash, que dev sacó de la oferta.
const CHOSEN_MODEL = offeredModels().find(
  (model) => model.id !== DEFAULT_LLM_MODEL_ID,
)?.id
const NOT_AVAILABLE_WARNING = 'not available for scene writing'

async function gallery(t, style, library = []) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-samples-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, '_styles', 'st-fixture')
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'style.json'),
    JSON.stringify({
      name: 'Stickman',
      shots: [],
      createdAt: '2026-09-30T00:00:00.000Z',
      ...style,
    }),
  )
  for (const entry of library) {
    const folder = join(root, 'characters', entry.id)
    const photo = entry.photo ?? true
    await mkdir(folder, { recursive: true })
    if (photo) await writeFile(join(folder, 'photo.png'), bytes)
    await writeFile(
      join(folder, 'metadata.json'),
      JSON.stringify({
        name: entry.name,
        description: libraryDescription,
        createdAt: '2026-09-30T00:00:00.000Z',
        previews: [],
        ...(photo ? { photoFile: 'photo.png' } : {}),
      }),
    )
  }
  return root
}
function context(root, payload, events = []) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fixture', fal: 'fixture', evolink: 'fixture' },
      binaryPaths: {},
      payload: { styleId: 'st-fixture', imageProvider: 'fal', ...payload },
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit: (event) => events.push(event) },
  }
}
function stream(content) {
  return new Response(
    'data: ' +
      JSON.stringify({
        choices: [{ delta: { content }, finish_reason: 'stop' }],
      }) +
      '\n\ndata: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
function isPhaseOne(request) {
  return request.messages.at(-1).content.includes(CHARACTER_DESIGN_INSTRUCTION)
}
function isNarrativeReview(request) {
  return request.messages[0].content.startsWith(
    'You audit the FULL narrative meaning',
  )
}
function narrativeApproval(request) {
  const { candidates } = JSON.parse(request.messages.at(-1).content)
  return Response.json({
    choices: [
      {
        message: {
          content: JSON.stringify({
            scenes: candidates.map((candidate) => ({
              sceneId: candidate.sceneId,
              checks: {
                focus: true,
                events: true,
                setting: true,
                causality: true,
              },
              aligned: true,
              sourceEvidenceId: candidate.sourceEvidence[0]?.id ?? null,
              promptEvidenceId: candidate.promptEvidence[0].id,
              reason: 'Explicit approval fixture.',
            })),
          }),
        },
      },
    ],
  })
}
// Un momento sin protagonista: ni `[subject]` ni el nombre del personaje.
const objectMoment = (id) =>
  `((${id})) [T:object] Close-up of an old brass compass on a wooden table, moment ${id}.`
function momentOf(image) {
  return Number(image.prompt.match(/moment (\d+)/)[1])
}
function providers(t, { llmStatus, referenceFails, withoutSubject = [] } = {}) {
  const calls = { text: [], images: [], reviews: [], uploads: 0 }
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = String(url)
    if (target.includes('chat/completions')) {
      const request = JSON.parse(init.body)
      if (isNarrativeReview(request)) {
        calls.reviews.push(request)
        return narrativeApproval(request)
      }
      calls.text.push(request)
      if (llmStatus) return new Response('', { status: llmStatus })
      if (isPhaseOne(request)) return stream('```text\n' + sheet + '\n```')
      const ids = [
        ...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm),
      ].map((match) => Number(match[1]))
      return stream(
        ids
          .map((id) =>
            withoutSubject.includes(id)
              ? objectMoment(id)
              : `((${id})) [T:action] Wide shot of [subject] exploring a bright forest, moment ${id}.`,
          )
          .join('\n\n'),
      )
    }
    if (target.includes('/files/upload/base64')) {
      calls.uploads++
      return Response.json({
        data: { file_url: 'https://fixture.invalid/reference.jpg' },
      })
    }
    if (target.endsWith('/v1/images/generations')) {
      calls.images.push({ url: target, ...JSON.parse(init.body) })
      return Response.json({ id: String(calls.images.length) })
    }
    if (target.includes('/v1/tasks/'))
      return Response.json({
        status: 'completed',
        results: ['https://fixture.invalid/' + target.split('/').at(-1)],
      })
    if (target.startsWith('https://fal.run/')) {
      calls.images.push({ url: target, ...JSON.parse(init.body) })
      // Rechazo terminal: Fal no lo reintenta con el mismo pedido.
      if (referenceFails && target.endsWith('/edit'))
        return Response.json(
          { type: 'content_policy_violation', detail: 'flagged' },
          { status: 400 },
        )
      return Response.json({
        images: [{ url: 'https://fixture.invalid/' + calls.images.length }],
      })
    }
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  return calls
}
const template = (mode, extra = {}) => ({
  sections,
  templateVersion: 1,
  character: { mode },
  ...extra,
})
const ownLucia = { character: { mode: 'own', defaultCharacterId: 'lucia' } }
function warned(events, text) {
  return events.some(
    (event) =>
      event.type === 'log' &&
      event.level === 'warn' &&
      event.message.includes(text),
  )
}

test('generic with a character section: one batch with the frame, the chosen model and the fixed phrases', async (t) => {
  assert.ok(CHOSEN_MODEL, 'la oferta trae otro modelo además del de la casa')
  const root = await gallery(t, template('generic'))
  const calls = providers(t)
  const result = await generateStyleSamples(
    context(root, { promptModel: CHOSEN_MODEL }),
  )

  assert.equal(result.samples.length, 4)
  assert.equal(
    calls.text.length,
    1,
    'sin Fase 1: el protagonista es la sección',
  )
  assert.equal(calls.reviews.length, 0, 'sin intervalos de narración, sin juez')
  const [request] = calls.text
  assert.equal(request.model, CHOSEN_MODEL)
  assert.equal(
    request.messages[0].content,
    buildTemplateSystem(sections, 'generic'),
  )
  assert.equal(
    request.messages[2].content,
    buildAssistantCharacterTurn(sectionCharacter),
  )
  for (const fragment of SAMPLE_FRAGMENTS)
    assert.ok(
      request.messages
        .at(-1)
        .content.includes(`${fragment.id}. ${fragment.text}`),
    )
  assert.ok(!JSON.stringify(request).includes('PREVIEW BATCH OUTPUT FORMAT'))

  assert.equal(calls.images.length, 4)
  for (const image of calls.images) {
    assert.ok(image.prompt.startsWith(promptStart + ' '))
    assert.ok(image.prompt.endsWith(' ' + promptEnd))
    assert.ok(image.prompt.includes(DESCRIPTION_HEADER + ' A stickman doll'))
    assert.doesNotMatch(image.prompt, /\[subject\]|\[T:/)
  }
})

test('without a model in the payload the house model writes', async (t) => {
  const root = await gallery(t, template('generic'))
  const calls = providers(t)
  const events = []
  await generateStyleSamples(context(root, {}, events))
  assert.equal(calls.text[0].model, DEFAULT_LLM_MODEL_ID)
  assert.ok(!warned(events, NOT_AVAILABLE_WARNING), 'nada que avisar')
})

// La oferta validada manda también en las muestras (ADR-0044): lo mismo que
// el carril hace con el modelo guardado en un proyecto.
for (const [kind, requested] of [
  [
    'a hidden model',
    MODEL_CATALOG.find(
      (model) => model.inCatalog && !model.inUi && !model.retired,
    )?.id,
  ],
  ['a retired model', MODEL_CATALOG.find((model) => model.retired)?.id],
  ['an unknown model', 'acme/unknown-writer'],
]) {
  test(`${kind} in the payload writes with the house model, and says so`, async (t) => {
    assert.ok(requested)
    const root = await gallery(t, template('generic'))
    const calls = providers(t)
    const events = []
    const result = await generateStyleSamples(
      context(root, { promptModel: requested }, events),
    )
    assert.equal(result.samples.length, 4)
    assert.ok(calls.text.length > 0)
    for (const request of calls.text)
      assert.equal(request.model, DEFAULT_LLM_MODEL_ID)
    assert.ok(warned(events, NOT_AVAILABLE_WARNING))
  })
}

test('generic without a section: phase 1 designs from the gem text, then the same batch', async (t) => {
  const withoutCharacter = { ...sections, character: undefined }
  const root = await gallery(
    t,
    template('generic', { sections: withoutCharacter }),
  )
  const calls = providers(t)
  await generateStyleSamples(context(root, { promptModel: CHOSEN_MODEL }))
  assert.equal(calls.text.length, 2)
  assert.ok(isPhaseOne(calls.text[0]))
  // Como en el video, la Fase 1 corre con el redactor de Ajustes y recibe la
  // gema como texto SIN las frases fijas: el retrato no es un prompt de
  // escena y una frase copiada ahí se tejería en cada muestra.
  for (const request of calls.text) assert.equal(request.model, CHOSEN_MODEL)
  const phaseOneSystem = calls.text[0].messages[0].content
  assert.equal(
    phaseOneSystem,
    composeGemText(withoutCharacter, { fixedPhrases: false }),
  )
  assert.ok(!phaseOneSystem.includes(promptStart))
  assert.ok(!phaseOneSystem.includes(promptEnd))
  assert.equal(
    calls.text[1].messages[0].content,
    buildTemplateSystem(withoutCharacter, 'generic'),
  )
  for (const image of calls.images) {
    assert.match(image.prompt, /green hoodie/)
    assert.equal(image.prompt.split(promptStart).length, 2, 'un solo inicio')
    assert.equal(image.prompt.split(promptEnd).length, 2, 'un solo final')
  }
})

test('my character without a default: phase 1 from the gem text, never the section', async (t) => {
  const root = await gallery(t, template('own'))
  const calls = providers(t)
  await generateStyleSamples(context(root))
  assert.equal(calls.text.length, 2)
  assert.ok(isPhaseOne(calls.text[0]))
  assert.equal(
    calls.text[0].messages[0].content,
    composeGemText(sections, { fixedPhrases: false }),
  )
  assert.equal(
    calls.text[1].messages[0].content,
    buildTemplateSystem(sections, 'generic'),
  )
  assert.ok(
    !JSON.stringify(calls.text).includes(
      'stickman doll with a round white head',
    ),
  )
  for (const image of calls.images) assert.match(image.prompt, /green hoodie/)
})

test('cinematic: the none frame, no portrait and never the character section', async (t) => {
  const root = await gallery(t, template('none'))
  const calls = providers(t)
  await generateStyleSamples(context(root))
  assert.equal(calls.text.length, 1)
  const [request] = calls.text
  assert.equal(
    request.messages[0].content,
    buildTemplateSystem(sections, 'none'),
  )
  assert.ok(!request.messages.some((message) => message.role === 'assistant'))
  assert.ok(
    !JSON.stringify(request).includes('stickman doll with a round white head'),
  )
  assert.equal(calls.images.length, 4)
  for (const image of calls.images) {
    assert.ok(!image.prompt.includes(DESCRIPTION_HEADER))
    assert.ok(image.prompt.startsWith(promptStart))
    // El simulador escribe `[subject]` y la etiqueta igual: ninguna de las
    // dos llega al generador.
    assert.doesNotMatch(image.prompt, /\[subject\]|\[T:/)
  }
})

test('my character with a photo: the reference frame, the photo attached and the phrases inside the lock', async (t) => {
  const root = await gallery(t, template('own', ownLucia), [
    { id: 'lucia', name: 'Lucía' },
  ])
  const calls = providers(t)
  await generateStyleSamples(context(root))
  assert.equal(
    calls.text[0].messages[0].content,
    buildTemplateSystem(sections, 'reference'),
  )
  assert.ok(
    !JSON.stringify(calls.text[0]).includes(
      'stickman doll with a round white head',
    ),
  )
  for (const image of calls.images) {
    assert.ok(image.url.endsWith('/edit'))
    assert.ok(image.image_urls[0].startsWith('data:image/png'))
    assert.ok(image.prompt.startsWith('REFERENCE:'))
    assert.ok(
      image.prompt.includes(
        promptStart +
          ' Wide shot of Lucía (the person from the attached reference image)',
      ),
    )
    assert.match(image.prompt, /APPEARANCE LOCK/)
  }
})

test('my character with a photo: a failed reference order is redone once as text, the library description before the fixed end', async (t) => {
  // El mismo rescate que el video (spec §5.4): inicio → escena → identidad
  // de biblioteca → final; pegada después del final, la identidad cerraba el
  // prompt en lugar del final fijo.
  const root = await gallery(t, template('own', ownLucia), [
    { id: 'lucia', name: 'Lucía' },
  ])
  const calls = providers(t, { referenceFails: true })
  const result = await generateStyleSamples(context(root))
  assert.equal(result.samples.length, 4)
  const withReference = calls.images.filter((image) => image.image_urls)
  const asText = calls.images.filter((image) => !image.image_urls)
  assert.equal(withReference.length, 4)
  assert.equal(asText.length, 4, 'cada una, una sola vez como texto')
  for (const image of asText) {
    assert.ok(!image.url.endsWith('/edit'))
    assert.ok(
      image.prompt.startsWith(promptStart + ' Wide shot of Lucía exploring'),
    )
    assert.ok(image.prompt.endsWith(' ' + promptEnd))
    assert.ok(
      image.prompt.includes(
        DESCRIPTION_HEADER + ' Lucía: ' + libraryDescription,
      ),
    )
    assert.ok(
      image.prompt.indexOf(DESCRIPTION_HEADER) <
        image.prompt.indexOf(promptEnd),
    )
    assert.doesNotMatch(image.prompt, /attached reference image|\[subject\]/)
    assert.equal(image.prompt.split(promptStart).length, 2, 'un solo inicio')
    assert.equal(image.prompt.split(promptEnd).length, 2, 'un solo final')
  }
})

test('my character with a photo: a moment without the protagonist goes without the photo, the lock or the library identity, as in the video', async (t) => {
  // El video reparte la foto por `scenesWithSubject`: una escena que no nombra
  // al protagonista va por el carril normal, sin referencia. Las muestras de
  // plantilla no llevan la regla que obligaba al protagonista en las cuatro.
  const root = await gallery(t, template('own', ownLucia), [
    { id: 'lucia', name: 'Lucía' },
  ])
  for (const referenceFails of [false, true]) {
    const calls = providers(t, { withoutSubject: [3], referenceFails })
    const result = await generateStyleSamples(context(root))
    assert.equal(result.samples.length, 4)

    const object = calls.images.filter((image) => momentOf(image) === 3)
    assert.equal(object.length, 1, 'una sola vez: no hay referencia que caiga')
    assert.ok(!object[0].url.endsWith('/edit'))
    assert.equal(object[0].image_urls, undefined)
    assert.ok(
      object[0].prompt.startsWith(
        promptStart + ' Close-up of an old brass compass',
      ),
    )
    assert.ok(object[0].prompt.endsWith(' ' + promptEnd))
    assert.doesNotMatch(
      object[0].prompt,
      /REFERENCE:|APPEARANCE LOCK|Lucía|curly red hair|\[T:/,
    )
    assert.ok(!object[0].prompt.includes(DESCRIPTION_HEADER))

    const withPhoto = calls.images.filter((image) => image.image_urls)
    assert.deepEqual(withPhoto.map(momentOf).sort(), [1, 2, 4])
    for (const image of withPhoto) {
      assert.ok(image.url.endsWith('/edit'))
      assert.ok(image.prompt.startsWith('REFERENCE:'))
      assert.match(image.prompt, /APPEARANCE LOCK/)
    }
    t.mock.restoreAll()
  }
})

test('my character with a photo on Evolink: the photo is uploaded only when some moment names the protagonist', async (t) => {
  const root = await gallery(t, template('own', ownLucia), [
    { id: 'lucia', name: 'Lucía' },
  ])
  for (const [withoutSubject, uploads, withPhoto] of [
    [[3], 1, 3],
    [[1, 2, 3, 4], 0, 0],
  ]) {
    const calls = providers(t, { withoutSubject })
    const events = []
    const result = await generateStyleSamples(
      context(root, { imageProvider: 'evolink' }, events),
    )
    assert.equal(result.samples.length, 4)
    // Sin ningún momento con el protagonista, el log explica por qué la foto
    // no se usó; con alguno, no hay nada que explicar.
    assert.equal(
      events.some(
        (event) =>
          event.type === 'log' &&
          event.level === 'info' &&
          event.message.includes('no sample moment shows the protagonist'),
      ),
      withPhoto === 0,
    )
    assert.equal(calls.uploads, uploads)
    assert.equal(calls.images.length, 4)
    const referenced = calls.images.filter((image) => image.image_urls)
    assert.equal(referenced.length, withPhoto)
    for (const image of referenced)
      assert.deepEqual(image.image_urls, [
        'https://fixture.invalid/reference.jpg',
      ])
    for (const image of calls.images.filter((image) => !image.image_urls))
      assert.doesNotMatch(image.prompt, /REFERENCE:|APPEARANCE LOCK|Lucía/)
    t.mock.restoreAll()
  }
})

test('my character without a photo: the text frame and the library description woven in', async (t) => {
  const root = await gallery(t, template('own', ownLucia), [
    { id: 'lucia', name: 'Lucía', photo: false },
  ])
  const calls = providers(t)
  await generateStyleSamples(context(root))
  assert.equal(calls.text.length, 1)
  const [request] = calls.text
  assert.equal(
    request.messages[0].content,
    buildTemplateSystem(sections, 'text'),
  )
  assert.equal(
    request.messages[2].content,
    buildAssistantCharacterTurn(libraryDescription),
  )
  assert.ok(
    !JSON.stringify(request).includes('stickman doll with a round white head'),
  )
  assert.equal(calls.images.length, 4)
  for (const image of calls.images) {
    assert.ok(!image.url.endsWith('/edit'))
    assert.equal(image.image_urls, undefined)
    assert.ok(image.prompt.startsWith(promptStart + ' '))
    assert.ok(image.prompt.endsWith(' ' + promptEnd))
    assert.ok(image.prompt.includes('curly red hair'))
    assert.ok(
      image.prompt.indexOf(DESCRIPTION_HEADER) <
        image.prompt.indexOf(promptEnd),
    )
  }
})

test('a rejected key stops before paying any image', async (t) => {
  const root = await gallery(t, template('generic'))
  const calls = providers(t, { llmStatus: 401 })
  await assert.rejects(generateStyleSamples(context(root)), {
    code: 'llm_auth',
  })
  assert.equal(calls.images.length, 0)
})

test('a malformed model in the payload is rejected before any request', async (t) => {
  const root = await gallery(t, template('generic'))
  const calls = providers(t)
  for (const promptModel of [42, 'x'.repeat(201)])
    await assert.rejects(generateStyleSamples(context(root, { promptModel })), {
      code: 'invalid_payload',
    })
  assert.equal(calls.text.length + calls.images.length, 0)
})

function oldGemProviders(t) {
  const calls = { batches: 0, models: [] }
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = String(url)
    if (target.includes('chat/completions')) {
      const request = JSON.parse(init.body)
      assert.ok(
        request.messages[0].content.includes('# PREVIEW BATCH OUTPUT FORMAT'),
      )
      calls.batches++
      calls.models.push(request.model)
      return stream(
        JSON.stringify({
          samples: SAMPLE_FRAGMENTS.map((fragment) => ({
            sampleId: fragment.id,
            prompt: 'A watercolor forest in the morning, scene ' + fragment.id,
          })),
        }),
      )
    }
    if (target.startsWith('https://fal.run/'))
      return Response.json({ images: [{ url: 'https://fixture.invalid/x' }] })
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  return calls
}
const oldGem = {
  systemPrompt: 'Illustrate the scene as a watercolor.',
  character: { mode: 'none' },
}

test('an old gem keeps the preview batch of always', async (t) => {
  const root = await gallery(t, oldGem)
  const calls = oldGemProviders(t)
  const result = await generateStyleSamples(context(root))
  assert.equal(result.samples.length, 4)
  assert.equal(calls.batches, 1)
})

test('an old gem never reads the Settings model, not even a malformed one', async (t) => {
  // La app no lo manda para una gema vieja; si llegara, el lote de siempre
  // sigue con sus modelos internos, sin validarlo ni usarlo.
  const root = await gallery(t, oldGem)
  for (const promptModel of [CHOSEN_MODEL, 42]) {
    const calls = oldGemProviders(t)
    const result = await generateStyleSamples(context(root, { promptModel }))
    assert.equal(result.samples.length, 4)
    assert.deepEqual(calls.models, [INTERACTIVE_MODEL_IDS[0]])
    t.mock.restoreAll()
  }
})
