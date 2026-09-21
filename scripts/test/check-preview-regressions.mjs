// Regresiones deterministas: solo HTTP interceptado y fixtures en tmpdir.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { generateStyleSamples } from '../../pipeline/commands/styles/generate-style-samples.ts'
import {
  createInteractiveLlm,
  INTERACTIVE_MODEL_IDS,
} from '../../pipeline/providers/llm/interactive.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { SAMPLE_FRAGMENTS } from '../../pipeline/prompts/style-samples.ts'
import {
  CHARACTER_DESIGN_INSTRUCTION,
  STYLE_CHARACTER_PRECEDENCE_RULE,
} from '../../pipeline/prompts/verbatim-messages.ts'
import { PROTAGONIST_DESIGN_REQUEST } from '../../pipeline/prompts/protagonist-request.ts'

const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const prompt =
  'A traveler explores a bright forest in a wide shot, with vivid colors and soft natural light.'

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

function context(events = [], timeoutMs = 25_000) {
  return {
    job: {
      jobId: 'fixture',
      apiKeys: { deepinfra: 'fake', fal: 'fake', evolink: 'fake' },
      binaryPaths: {},
    },
    config: resolvePipelineConfig({ llm: { timeoutMs } }),
    signal: new AbortController().signal,
    emitter: {
      emit(event) {
        events.push(event)
      },
    },
  }
}

for (const failure of ['429', '503', 'timeout', 'invalid']) {
  test('interactive fallback after ' + failure, async (t) => {
    const calls = []
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      const model = JSON.parse(init.body).model
      calls.push(model)
      if (model === INTERACTIVE_MODEL_IDS[0]) {
        if (failure === 'timeout')
          await delay(1000, null, { signal: init.signal })
        if (failure === 'invalid') return stream('unusable')
        return new Response('', { status: Number(failure) })
      }
      return stream(prompt)
    })
    const client = createInteractiveLlm(context([], 30))
    const request = {
      messages: [],
      parse: (content) => (content === prompt ? content : null),
    }
    assert.equal(await client.generate(request), prompt)
    assert.equal(await client.generate(request), prompt)
    assert.deepEqual(calls, [
      INTERACTIVE_MODEL_IDS[0],
      INTERACTIVE_MODEL_IDS[1],
      INTERACTIVE_MODEL_IDS[1],
    ])
  })
}

for (const status of [401, 402]) {
  test('interactive does not rotate account errors ' + status, async (t) => {
    let calls = 0
    t.mock.method(globalThis, 'fetch', async () => {
      calls++
      return new Response('insufficient balance', { status })
    })
    await assert.rejects(
      createInteractiveLlm(context()).generate({
        messages: [],
        parse: () => null,
      }),
    )
    assert.equal(calls, 1)
  })
}

for (const provider of ['fal', 'evolink']) {
  test(
    provider + ': four concurrent POSTs and immediate individual files',
    async (t) => {
      const root = await mkdtemp(join(tmpdir(), 'vimo-preview-regression-'))
      const directory = join(root, '_styles', 'fixture')
      await mkdir(directory, { recursive: true })
      await writeFile(
        join(directory, 'style.json'),
        JSON.stringify({
          name: 'Fixture',
          systemPrompt: 'Illustrate the scene as a watercolor.',
          // Estos casos prueban lote y concurrencia, no al protagonista.
          character: { mode: 'none' },
        }),
      )
      const events = []
      const ctx = context(events)
      ctx.job.projectsRoot = root
      ctx.job.payload = { styleId: 'fixture', imageProvider: provider }
      let imagePosts = 0
      let promptCalls = 0
      let releaseImages
      const allSubmitted = new Promise((resolve) => {
        releaseImages = resolve
      })
      let releaseLast
      const lastImage = new Promise((resolve) => {
        releaseLast = resolve
      })
      let firstSaved
      const saved = new Promise((resolve) => {
        firstSaved = resolve
      })
      ctx.emitter.emit = (event) => {
        events.push(event)
        if (event.detail?.path && event.detail.sampleId !== 4)
          firstSaved(event.detail.path)
      }
      t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
        if (url.includes('/chat/completions')) {
          promptCalls++
          await delay(550)
          return stream(
            JSON.stringify({
              samples: [4, 2, 1, 3].map((sampleId) => ({
                sampleId,
                prompt: prompt + ' Scene ' + sampleId,
              })),
            }),
          )
        }
        if (init.method === 'POST') {
          const id = ++imagePosts
          if (imagePosts === 4) releaseImages()
          // Secuencial rompería por timeout: el primer POST no termina hasta
          // que los otros tres también llegaron al proveedor.
          await Promise.race([
            allSubmitted,
            delay(2000).then(() => {
              throw new Error('POSTs were serialized')
            }),
          ])
          if (provider === 'evolink') return Response.json({ id: String(id) })
          return Response.json({
            images: [{ url: 'https://fixture/image/' + id }],
          })
        }
        if (url.includes('/v1/tasks/')) {
          return Response.json({
            status: 'completed',
            results: ['https://fixture/image/' + url.split('/').at(-1)],
          })
        }
        if (url.startsWith('https://fixture/image/')) {
          if (url.endsWith('/4')) await lastImage
          return new Response(imageBytes, {
            headers: { 'content-type': 'image/png' },
          })
        }
        throw new Error('Unexpected HTTP: ' + url)
      })
      try {
        const running = generateStyleSamples(ctx)
        const path = await saved
        assert.deepEqual(await readFile(path), imageBytes)
        assert.equal(imagePosts, 4)
        assert.equal(promptCalls, 1)
        assert.ok(
          events.some(
            (event) =>
              event.detail?.phase === 'prompts' &&
              event.percent > 0 &&
              event.percent < 100,
          ),
        )
        releaseLast()
        const result = await running
        assert.equal(result.samples.length, 4)
        assert.equal(events.filter((event) => event.detail?.path).length, 4)
      } finally {
        releaseLast()
        await rm(root, { recursive: true, force: true })
      }
    },
  )
}

for (const scenario of [
  'partial',
  'invalid',
  'duplicate',
  '429',
  'timeout',
  '401',
  '402',
  'cancel',
  'individual-failure',
]) {
  test('preview batch recovery: ' + scenario, async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'vimo-batch-regression-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const directory = join(root, '_styles', 'fixture')
    await mkdir(directory, { recursive: true })
    await writeFile(
      join(directory, 'style.json'),
      JSON.stringify({
        name: 'Fixture',
        systemPrompt: 'Watercolor illustration.',
        // Estos casos prueban el rescate del lote, no al protagonista.
        character: { mode: 'none' },
      }),
    )
    const events = []
    const ctx = context(events, scenario === 'timeout' ? 60 : 25000)
    const controller = new AbortController()
    ctx.signal = controller.signal
    ctx.job.projectsRoot = root
    ctx.job.payload = { styleId: 'fixture', imageProvider: 'fal' }
    let batchCalls = 0
    let individualCalls = 0
    let imagePosts = 0
    const individualIds = []
    const models = []
    const expected =
      scenario === 'partial' ? 2 : scenario === 'duplicate' ? 1 : 4
    let releaseIndividuals
    const allIndividuals = new Promise((resolve) => {
      releaseIndividuals = resolve
    })
    t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
      if (url.includes('/chat/completions')) {
        const body = JSON.parse(init.body)
        models.push(body.model)
        const isBatch = body.messages.some((message) =>
          message.content.includes('# PREVIEW BATCH OUTPUT FORMAT'),
        )
        if (isBatch) {
          batchCalls++
          assert.ok(
            body.max_tokens > 900,
            'batch needs a budget for four prompts',
          )
          if (scenario === 'cancel') {
            controller.abort()
            throw controller.signal.reason
          }
          if (scenario === 'timeout')
            await delay(1000, null, { signal: init.signal })
          if (['429', '401', '402'].includes(scenario))
            return new Response('', { status: Number(scenario) })
          if (scenario === 'invalid' || scenario === 'individual-failure')
            return stream('not a batch')
          const ids = scenario === 'partial' ? [2, 1] : [4, 2, 1, 1, 3]
          return stream(
            JSON.stringify({
              samples: ids.map((sampleId) => ({
                sampleId,
                prompt: prompt + ' Scene ' + sampleId,
              })),
            }),
          )
        }
        individualCalls++
        const fragment = SAMPLE_FRAGMENTS.find((fragment) =>
          body.messages.some((message) =>
            message.content.includes('SCENE TO ILLUSTRATE: ' + fragment.text),
          ),
        )
        assert.ok(fragment, 'individual request identifies its scene')
        individualIds.push(fragment.id)
        if (individualCalls >= expected) releaseIndividuals()
        // Se detecta serialización por señal externa (no un timeout del modelo).
        await allIndividuals
        if (scenario === 'individual-failure')
          return new Response('', { status: 401 })
        return stream(
          JSON.stringify({ prompt_imagen: prompt + ' Scene ' + fragment.id }),
        )
      }
      if (init.method === 'POST') {
        imagePosts++
        const body = JSON.parse(init.body)
        assert.ok(
          body.prompt.endsWith('Scene ' + imagePosts),
          'prompts map to scene IDs, not batch position',
        )
        return Response.json({
          images: [{ url: 'https://fixture/image/' + imagePosts }],
        })
      }
      return new Response(imageBytes, {
        headers: { 'content-type': 'image/png' },
      })
    })
    // Un fallback serial no alcanza la barrera; cancelarlo hace fallar la prueba
    // y evita dejar el runner colgado.
    const timer = setTimeout(() => {
      controller.abort()
      releaseIndividuals()
    }, 2000)
    try {
      if (['401', '402', 'cancel', 'individual-failure'].includes(scenario)) {
        await assert.rejects(generateStyleSamples(ctx))
        assert.equal(imagePosts, 0)
        if (scenario !== 'individual-failure') assert.equal(individualCalls, 0)
      } else {
        const result = await generateStyleSamples(ctx)
        assert.equal(result.samples.length, 4)
        assert.equal(imagePosts, 4)
        assert.equal(individualCalls, expected)
        assert.deepEqual(
          individualIds.sort(),
          scenario === 'partial'
            ? [3, 4]
            : scenario === 'duplicate'
              ? [1]
              : [1, 2, 3, 4],
        )
        if (scenario === '429' || scenario === 'timeout') {
          assert.equal(models[0], INTERACTIVE_MODEL_IDS[0])
          assert.ok(
            models
              .slice(1)
              .every((model) => model === INTERACTIVE_MODEL_IDS[1]),
          )
        }
        for (const fragment of SAMPLE_FRAGMENTS) {
          const percents = events
            .filter(
              (event) =>
                event.detail?.phase === 'prompts' &&
                event.detail.sampleId === fragment.id,
            )
            .map((event) => event.percent)
          assert.deepEqual(
            percents,
            [...percents].sort((a, b) => a - b),
            'prompt progress never goes backwards',
          )
        }
      }
      assert.equal(batchCalls, 1)
    } finally {
      clearTimeout(timer)
      releaseIndividuals()
    }
  })
}

// ─── El protagonista de las muestras ───
const CHARACTER_DESCRIPTION =
  'A woman in her thirties with curly red hair, green eyes, freckles across her nose and a mustard yellow raincoat.'
const DESIGNED_DESCRIPTION =
  'A cartoon man with a round white head, simple dot eyes and short spiky white hair, wearing a chunky maroon cable-knit sweater, dark grey pants and brown shoes.'

// Deja una gema y (opcional) un personaje de biblioteca en un tmpdir.
async function characterFixture(root, character, library) {
  const directory = join(root, '_styles', 'fixture')
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'style.json'),
    JSON.stringify({
      name: 'Fixture',
      systemPrompt: 'Illustrate the scene as a watercolor.',
      ...(character ? { character } : {}),
    }),
  )
  for (const entry of library) {
    const folder = join(root, 'characters', entry.id)
    await mkdir(folder, { recursive: true })
    if (entry.photo) await writeFile(join(folder, 'photo.png'), imageBytes)
    if (entry.preview) await writeFile(join(folder, 'preview.png'), imageBytes)
    await writeFile(
      join(folder, 'metadata.json'),
      JSON.stringify({
        name: entry.name,
        description: CHARACTER_DESCRIPTION,
        createdAt: '2026-09-18T00:00:00.000Z',
        previews: entry.preview
          ? [{ styleId: entry.preview, file: 'preview.png' }]
          : [],
        ...(entry.photo ? { photoFile: 'photo.png' } : {}),
      }),
    )
  }
}

// HTTP simulado del job completo. `calls` separa el pedido de diseño del
// protagonista de la redacción de los prompts. El diseño es la MISMA Fase 1
// del video (gema cruda como system, consigna portada con la precedencia del
// personaje del estilo) y, si no deja nada, el pedido JSON de último recurso.
function mockSampleHttp(t, scenario, calls) {
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    if (url.includes('/chat/completions')) {
      const messages = JSON.parse(init.body).messages
      const isPhaseOne = messages[1].content.includes(
        CHARACTER_DESIGN_INSTRUCTION,
      )
      const isFallback = messages[1].content.includes(
        PROTAGONIST_DESIGN_REQUEST,
      )
      if (isPhaseOne || isFallback) {
        calls.design++
        if (isPhaseOne) {
          calls.phaseOne++
          assert.equal(
            messages[0].content,
            'Illustrate the scene as a watercolor.',
            'la gema cruda como system, sin planos ni reglas de la casa',
          )
          assert.ok(
            messages[1].content.includes(STYLE_CHARACTER_PRECEDENCE_RULE),
            'la precedencia del personaje del estilo',
          )
        }
        if (scenario.designFails) return stream('unusable')
        return stream(
          isPhaseOne
            ? '```text\n' + DESIGNED_DESCRIPTION + '\n```'
            : JSON.stringify({ description: DESIGNED_DESCRIPTION }),
        )
      }
      calls.prompts.push(messages)
      // Formato propio de la gema, medido: un objeto por escena, sin cerrar.
      if (scenario.gemFormat)
        return stream(
          SAMPLE_FRAGMENTS.map(
            (fragment) =>
              '{"prompts":[' +
              JSON.stringify({
                id: fragment.id,
                prompt: 'Wide shot. [subject] explores. Scene ' + fragment.id,
              }) +
              '] ',
          ).join('\n\n'),
        )
      return stream(
        JSON.stringify({
          samples: SAMPLE_FRAGMENTS.map((fragment) => ({
            sampleId: fragment.id,
            prompt:
              'Wide shot. [subject] explores a bright forest. Scene ' +
              fragment.id,
          })),
        }),
      )
    }
    if (url.includes('/files/upload/base64')) {
      calls.uploads++
      if (scenario.uploadFails) return new Response('', { status: 500 })
      return Response.json({
        data: { file_url: 'https://fixture/reference.jpg' },
      })
    }
    if (init.method === 'POST') {
      const body = JSON.parse(init.body)
      calls.images.push({ url, body })
      if (scenario.referenceFails && body.image_urls)
        return Response.json(
          // Rechazo terminal: Fal no lo reintenta con el mismo pedido.
          { type: 'content_policy_violation', detail: 'flagged' },
          { status: 400 },
        )
      if (scenario.provider === 'evolink')
        return Response.json({ id: String(calls.images.length) })
      return Response.json({
        images: [{ url: 'https://fixture/image/' + calls.images.length }],
      })
    }
    if (url.includes('/v1/tasks/'))
      return Response.json({
        status: 'completed',
        results: ['https://fixture/image/' + url.split('/').at(-1)],
      })
    if (url.startsWith('https://fixture/image/'))
      return new Response(imageBytes, {
        headers: { 'content-type': 'image/png' },
      })
    throw new Error('Unexpected HTTP: ' + url)
  })
}

function newCalls() {
  return { design: 0, phaseOne: 0, prompts: [], images: [], uploads: 0 }
}

const OWN = { mode: 'own', defaultCharacterId: 'lucia' }
const LUCIA = { id: 'lucia', name: 'Lucía' }

for (const scenario of [
  // Personaje predeterminado de la biblioteca.
  { name: 'own, text only', character: OWN, library: [LUCIA], expect: 'text' },
  {
    name: 'own, photo',
    character: OWN,
    library: [{ ...LUCIA, photo: true }],
    expect: 'reference',
  },
  {
    name: 'own, preview of this style',
    provider: 'evolink',
    character: OWN,
    library: [{ ...LUCIA, preview: 'fixture' }],
    expect: 'reference',
  },
  {
    name: 'own, preview of another style',
    character: OWN,
    library: [{ ...LUCIA, preview: 'other-style' }],
    expect: 'text',
  },
  {
    name: 'own, reference upload fails',
    provider: 'evolink',
    character: OWN,
    library: [{ ...LUCIA, photo: true }],
    uploadFails: true,
    expect: 'text',
  },
  {
    name: 'own, reference order fails',
    character: OWN,
    library: [{ ...LUCIA, photo: true }],
    referenceFails: true,
    expect: 'fallback',
  },
  {
    name: 'own, style batch format',
    character: OWN,
    library: [{ ...LUCIA, photo: true }],
    gemFormat: true,
    expect: 'reference',
  },
  // Sin personaje del usuario: lo define la gema, el mismo en las cuatro.
  { name: 'generic', character: { mode: 'generic' }, expect: 'designed' },
  { name: 'no character block', expect: 'designed' },
  {
    name: 'own without default',
    character: { mode: 'own' },
    expect: 'designed',
  },
  { name: 'own, missing character', character: OWN, expect: 'designed' },
  {
    name: 'generic, design fails',
    character: { mode: 'generic' },
    designFails: true,
    expect: 'none',
  },
  { name: 'none', character: { mode: 'none' }, expect: 'none' },
]) {
  test('style samples protagonist: ' + scenario.name, async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'vimo-preview-character-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    scenario.provider ??= 'fal'
    await characterFixture(root, scenario.character, scenario.library ?? [])

    const events = []
    const ctx = context(events)
    ctx.job.projectsRoot = root
    ctx.job.payload = { styleId: 'fixture', imageProvider: scenario.provider }
    const calls = newCalls()
    mockSampleHttp(t, scenario, calls)

    const result = await generateStyleSamples(ctx)
    assert.equal(result.samples.length, 4)
    // El lote (también en el formato de la gema) se resuelve en UN pedido.
    assert.equal(calls.prompts.length, 1)

    const [system, user] = calls.prompts[0]
    const carriesRule = system.content.includes('PROTAGONIST OF THESE SCENES')
    const withReference = calls.images.filter((image) => image.body.image_urls)
    const withoutReference = calls.images.filter(
      (image) => !image.body.image_urls,
    )
    for (const image of calls.images)
      assert.ok(!image.body.prompt.includes('[subject]'), 'the tag is woven')

    if (scenario.expect === 'none') {
      // Diseño fallido: la Fase 1 agota sus intentos y el último recurso
      // tampoco sale; sin diseño no hay ningún pedido.
      if (scenario.designFails) assert.ok(calls.design > calls.phaseOne)
      else assert.equal(calls.design, 0)
      assert.equal(carriesRule, false)
      assert.ok(!user.content.includes('PROTAGONIST'))
      assert.equal(calls.images.length, 4)
      assert.equal(withReference.length, 0)
      for (const image of calls.images)
        assert.ok(!image.body.prompt.includes('must look exactly like'))
      return
    }

    // La regla cierra el system prompt y se repite junto a las escenas.
    assert.ok(carriesRule)
    assert.ok(
      system.content
        .trimEnd()
        .endsWith('style tail your style defines intact.'),
    )
    assert.ok(
      user.content.includes('PROTAGONIST: the protagonist of every scene'),
    )

    if (scenario.expect === 'designed') {
      assert.equal(calls.design, 1)
      assert.equal(calls.phaseOne, 1, 'lo diseña la Fase 1, sin último recurso')
      assert.equal(calls.images.length, 4)
      assert.equal(withReference.length, 0)
      for (const image of calls.images) {
        assert.ok(image.body.prompt.includes('must look exactly like this:'))
        assert.ok(
          image.body.prompt.includes('chunky maroon cable-knit sweater'),
        )
      }
      if (scenario.name === 'own, missing character')
        assert.ok(
          events.some(
            (event) =>
              event.level === 'warn' &&
              event.message.includes('not in the library'),
          ),
        )
      return
    }

    // Con personaje de la biblioteca la gema no diseña nada.
    assert.equal(calls.design, 0)

    if (scenario.expect === 'text') {
      assert.equal(calls.images.length, 4)
      assert.equal(withReference.length, 0)
      for (const image of calls.images) {
        assert.ok(!image.url.includes('/edit'))
        assert.ok(image.body.prompt.includes('must look exactly like this:'))
        assert.ok(image.body.prompt.includes('curly red hair'))
      }
      assert.equal(calls.uploads, scenario.uploadFails ? 1 : 0)
      return
    }

    if (scenario.expect === 'reference') {
      assert.equal(calls.images.length, 4)
      assert.equal(withReference.length, 4)
      // Evolink sube la referencia UNA vez para las cuatro muestras.
      assert.equal(calls.uploads, scenario.provider === 'evolink' ? 1 : 0)
      for (const image of withReference) {
        assert.ok(image.body.prompt.startsWith('REFERENCE:'))
        assert.ok(image.body.prompt.includes('APPEARANCE LOCK'))
        assert.ok(
          image.body.prompt.includes(
            'Lucía (the person from the attached reference image)',
          ),
        )
        assert.ok(!image.body.prompt.includes('curly red hair'))
        if (scenario.provider === 'fal') {
          assert.ok(image.url.endsWith('/openai/gpt-image-2/edit'))
          assert.ok(image.body.image_urls[0].startsWith('data:image/png'))
        } else
          assert.deepEqual(image.body.image_urls, [
            'https://fixture/reference.jpg',
          ])
      }
      return
    }

    // fallback: cada encargo con referencia falla y se rehace como texto.
    assert.equal(withReference.length, 4)
    assert.equal(withoutReference.length, 4)
    for (const image of withoutReference)
      assert.ok(image.body.prompt.includes('curly red hair'))
  })
}

// Cambiar el predeterminado y regenerar: las muestras salen con el NUEVO.
test('style samples protagonist: changing the default character', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-preview-character-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const library = [
    { ...LUCIA, photo: true },
    { id: 'marta', name: 'Marta', photo: true },
  ]
  const scenario = { provider: 'fal' }

  const generateWith = async (characterId) => {
    await characterFixture(
      root,
      { mode: 'own', defaultCharacterId: characterId },
      library,
    )
    const ctx = context()
    ctx.job.projectsRoot = root
    ctx.job.payload = { styleId: 'fixture', imageProvider: 'fal' }
    const calls = newCalls()
    mockSampleHttp(t, scenario, calls)
    await generateStyleSamples(ctx)
    t.mock.restoreAll()
    return calls.images.map((image) => image.body.prompt)
  }

  for (const prompt of await generateWith('lucia')) {
    assert.ok(prompt.includes('"Lucía"'))
    assert.ok(!prompt.includes('Marta'))
  }
  for (const prompt of await generateWith('marta')) {
    assert.ok(prompt.includes('"Marta"'))
    assert.ok(!prompt.includes('Lucía'))
  }
})

// La URL pública de Evolink sale del nombre del archivo y el CDN la cachea:
// con un nombre fijo, todos los personajes compartían UNA referencia.
test('evolink reference upload: one file name per image content', async (t) => {
  const { uploadEvolinkReference } =
    await import('../../pipeline/providers/image/evolink.ts')
  const fileNames = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const fileName = JSON.parse(init.body).file_name
    fileNames.push(fileName)
    return Response.json({
      data: { file_url: 'https://fixture/' + fileName },
    })
  })

  const juan =
    'data:image/jpeg;base64,' + Buffer.from('juan').toString('base64')
  const tomas =
    'data:image/jpeg;base64,' + Buffer.from('tomas').toString('base64')
  const urls = []
  for (const dataUri of [juan, tomas, juan])
    urls.push(await uploadEvolinkReference(dataUri, 'fake'))

  assert.notEqual(fileNames[0], fileNames[1])
  assert.equal(fileNames[0], fileNames[2])
  assert.equal(urls[0], urls[2])
  for (const fileName of fileNames)
    assert.match(fileName, /^character_reference_[0-9a-f]{16}\.jpg$/)
})
