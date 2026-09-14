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
