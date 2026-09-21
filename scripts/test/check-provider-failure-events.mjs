// Los fallos de proveedor tienen que quedar en el log de diagnóstico
// (ADR-0038) aunque el pipeline los absorba: cada reintento o fallback emite
// `provider-failure`, y el fallo terminal viaja con proveedor y status HTTP.
// Proveedores HTTP simulados, proyectos temporales; nada gasta créditos.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'
import { writeScenes } from '../../pipeline/project/scenes-file.ts'
import { generateText } from '../../pipeline/providers/llm/generate.ts'
import { PipelineFailure } from '../../pipeline/runner/failure.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { imagesStage } from '../../pipeline/stages/images/images.ts'
import { synthesizeNarration } from '../../pipeline/stages/voice/narration.ts'

const FAL_IMAGE = 'https://fal.run/fal-ai/gpt-image-2'
const FAL_BILLING = 'https://api.fal.ai/v1/account/billing'
const FIXTURE_IMAGE = 'https://fixture/image/1'
const DUBVOICE_HOST = 'https://www.dubvoice.ai'
const ELEVENLABS_HOST = 'https://api.elevenlabs.io'

const gem =
  'Render every scene as a hand-drawn watercolor illustration with indigo washes and rough paper.'
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const audioBytes = Buffer.from('ID3 fixture audio')

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function providerFailures(events) {
  return events.filter((event) => event.type === 'provider-failure')
}

async function imageFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-provider-failure-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  await mkdir(paths.charactersDirectory, { recursive: true })
  await writeFile(
    paths.metadataFile,
    JSON.stringify({
      id: 'fixture',
      name: 'Fixture',
      options: {
        styleId: 'normal',
        imageProvider: 'fal',
        imageQuality: 'low',
        videoFormat: '16:9',
        customStyle: {
          id: 'fixture',
          name: 'Watercolor',
          systemPrompt: gem,
          character: { mode: 'none' },
        },
      },
      state: 'generating',
      completedStages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  )
  await writeFile(paths.scriptFile, 'Elena repairs a red antenna.')
  await writeScenes(paths, [
    {
      id: 1,
      text: 'Elena repairs antenna number 1.',
      startSeconds: 0,
      endSeconds: 4,
      imagePrompt:
        'Elena repairs red antenna number 1 beside a greenhouse. Style: watercolor.',
    },
  ])

  const events = []
  const base = {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fixture', fal: 'fixture' },
      binaryPaths: {},
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: {
      emit(event) {
        events.push(event)
      },
    },
  }
  const context = await buildCreateVideoContext(base, 'fixture')
  return { context, events }
}

test('fal: a 503 that the retry absorbs leaves a recovered provider-failure and the job completes', async (t) => {
  const { context, events } = await imageFixture(t)
  let falCalls = 0
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input)
    if (url === FAL_IMAGE) {
      falCalls++
      if (falCalls === 1) return json(503, { detail: 'upstream unavailable' })
      return json(200, { images: [{ url: FIXTURE_IMAGE }] })
    }
    if (url === FIXTURE_IMAGE)
      return new Response(pngBytes, {
        headers: { 'content-type': 'image/png' },
      })
    assert.fail(`unexpected request to ${url}`)
  })

  await imagesStage.run(context)

  const recovered = providerFailures(events).filter((event) => event.recovered)
  assert.equal(falCalls, 2)
  assert.ok(recovered.length >= 1, 'el reintento dejó rastro')
  const [failure] = recovered
  assert.equal(failure.provider, 'fal')
  assert.equal(failure.httpStatus, 503)
  assert.equal(failure.code, 'image_provider_error')
  assert.equal(failure.stageId, 'images')
  assert.equal(failure.sceneId, 1)
  assert.equal(failure.attempt, 1)
  assert.equal(
    events.filter((event) => event.type === 'scene-image-ready').length,
    1,
    'la escena salió igual',
  )
})

test('fal: a rejected key is terminal and the failure names the provider and the status', async (t) => {
  const { context, events } = await imageFixture(t)
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input)
    if (url === FAL_IMAGE) return json(401, { detail: 'Invalid key' })
    if (url.startsWith(FAL_BILLING)) return json(401, { detail: 'Invalid key' })
    assert.fail(`unexpected request to ${url}`)
  })

  await assert.rejects(imagesStage.run(context), (error) => {
    assert.ok(error instanceof PipelineFailure)
    assert.equal(error.code, 'image_invalid_api_key')
    assert.equal(error.provider, 'fal')
    assert.equal(error.httpStatus, 401)
    return true
  })
  assert.ok(
    providerFailures(events).every((event) => event.recovered === false),
    'un rechazo de cuenta nunca se reporta como recuperado',
  )
})

test('tts: a lane rejected by its key leaves a provider-failure and the fallback lane finishes the job', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-provider-failure-voice-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const events = []
  const context = {
    job: { apiKeys: { dubvoice: 'fake', elevenlabs: 'fake' }, binaryPaths: {} },
    paths: { narrationFile: join(root, 'narration.mp3') },
    options: {
      voiceProvider: 'elevenlabs',
      voiceId: 'fixture-voice',
      voiceSettings: { speed: 1 },
    },
    signal: new AbortController().signal,
    emitter: {
      emit(event) {
        events.push(event)
      },
    },
  }
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input)
    if (url.startsWith(DUBVOICE_HOST)) return json(401, { error: 'bad key' })
    if (url.startsWith(`${ELEVENLABS_HOST}/v1/text-to-speech/`))
      return new Response(audioBytes, {
        headers: { 'content-type': 'audio/mpeg' },
      })
    assert.fail(`unexpected request to ${url}`)
  })

  await synthesizeNarration(
    context,
    'The narration that the fallback lane pays for.',
  )

  const failures = providerFailures(events)
  assert.equal(failures.length, 1)
  const [failure] = failures
  assert.equal(failure.provider, 'elevenlabs')
  assert.equal(failure.code, 'voice_invalid_api_key')
  assert.equal(failure.httpStatus, 401)
  assert.equal(failure.stageId, 'voice')
  assert.equal(failure.recovered, true)
  assert.equal(failure.attempt, 1)
  assert.equal(failure.maxAttempts, 2)
})

test('llm: a rate limit absorbed by the backoff is reported with its provider and attempt', async () => {
  const rateLimited = () =>
    new PipelineFailure('llm_rate_limited', 'DeepInfra rate limit hit', {
      provider: 'deepinfra',
      httpStatus: 429,
    })
  let calls = 0
  const provider = {
    name: 'deepinfra',
    async generate() {
      calls++
      if (calls === 1) throw rateLimited()
      return 'ok'
    },
  }
  const reports = []
  const config = resolvePipelineConfig().llm

  const text = await generateText(
    provider,
    { system: 's', user: 'u' },
    config,
    { onFailure: (report) => reports.push(report) },
  )

  assert.equal(text, 'ok')
  assert.equal(reports.length, 1)
  assert.deepEqual(
    { ...reports[0], detail: undefined },
    {
      provider: 'deepinfra',
      code: 'llm_rate_limited',
      httpStatus: 429,
      attempt: 1,
      maxAttempts: 4,
      recovered: true,
      detail: undefined,
    },
  )
})
