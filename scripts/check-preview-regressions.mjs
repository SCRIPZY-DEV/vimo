// Regresiones deterministas: solo HTTP interceptado y fixtures en tmpdir.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { generateStyleSamples } from '../pipeline/commands/styles/generate-style-samples.ts'
import {
  createInteractiveLlm,
  INTERACTIVE_MODEL_IDS,
} from '../pipeline/providers/llm/interactive.ts'
import { resolvePipelineConfig } from '../pipeline/config/pipeline-config.ts'

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
          return stream(JSON.stringify({ prompt_imagen: prompt }))
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
        assert.equal(promptCalls, 4)
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
