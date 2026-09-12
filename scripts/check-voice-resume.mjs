// Pruebas de reanudación: cuenta POSTs en los providers reales con fetch
// interceptado. Todo audio/recibo vive en un tmpdir exclusivo.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { targetTriple, executableSuffix } from './target-triple.mjs'
import { synthesizeInParts } from '../pipeline/providers/tts/chunked-synthesis.ts'
import { elevenLabsProvider } from '../pipeline/providers/tts/elevenlabs.ts'
import { minimaxProvider } from '../pipeline/providers/tts/minimax.ts'
import { synthesizeNarration } from '../pipeline/stages/voice/narration.ts'
import { voiceRequestFile } from '../pipeline/providers/tts/request-checkpoint.ts'

const audio = Buffer.from('ID3 fixture audio')
async function fixture(t, provider = elevenLabsProvider) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-voice-regression-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return {
    provider,
    payload: {
      provider: provider.id,
      voiceId: 'fixture-voice',
      settings: { speed: 1 },
    },
    text: 'This is the exact narration that must only be paid once.',
    apiKey: 'fake',
    signal: new AbortController().signal,
    outputFile: join(root, 'narration.mp3'),
    emitter: { emit() {} },
  }
}
function receipt(input) {
  return voiceRequestFile(input.outputFile, 0)
}
function mockCompleted(t, counts, download = () => new Response(audio)) {
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    if (init.method === 'POST') {
      counts.posts++
      return Response.json({ task_id: 'paid-task' })
    }
    if (url.includes('/api/v1/tts?task_id=')) {
      counts.polls++
      assert.equal(new URL(url).searchParams.get('task_id'), 'paid-task')
      return Response.json({
        status: 'completed',
        progress: 100,
        result: 'https://fixture/audio',
      })
    }
    assert.equal(url, 'https://fixture/audio')
    return download()
  })
}

test('cancel during submit persists late task id; resume does zero new POSTs', async (t) => {
  const input = await fixture(t)
  const controller = new AbortController()
  input.signal = controller.signal
  let posts = 0
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.method, 'POST')
    posts++
    controller.abort()
    return Response.json({ task_id: 'paid-task' })
  })
  await assert.rejects(synthesizeInParts(input))
  const saved = JSON.parse(await readFile(receipt(input), 'utf8'))
  assert.equal(saved.taskId, 'paid-task')
  assert.equal(saved.state, 'pending')
  const counts = { posts, polls: 0 }
  mockCompleted(t, counts)
  await synthesizeInParts({ ...input, signal: new AbortController().signal })
  assert.equal(counts.posts, 1)
  assert.equal(counts.polls, 1)
  assert.deepEqual(await readFile(input.outputFile), audio)
  await assert.rejects(access(receipt(input)))
})

test('download failure resumes same task and never falls back to another provider', async (t) => {
  const input = await fixture(t)
  const counts = { posts: 0, polls: 0 }
  mockCompleted(t, counts, () => new Response('', { status: 503 }))
  // Ejercita también la cascada REAL de narración: hay clave para el fallback.
  const context = {
    job: { apiKeys: { dubvoice: 'fake', elevenlabs: 'fake' }, binaryPaths: {} },
    paths: { narrationFile: input.outputFile },
    options: {
      voiceProvider: 'elevenlabs',
      voiceId: 'fixture-voice',
      voiceSettings: { speed: 1 },
    },
    signal: input.signal,
    emitter: input.emitter,
  }
  await assert.rejects(synthesizeNarration(context, input.text), {
    code: 'voice_request_pending',
  })
  assert.equal(counts.posts, 1)
  const saved = JSON.parse(await readFile(receipt(input), 'utf8'))
  assert.equal(saved.resultUrl, 'https://fixture/audio')
  mockCompleted(t, counts)
  await synthesizeNarration(context, input.text)
  assert.equal(counts.posts, 1)
  assert.equal(counts.polls, 2)
})

test('unknown submission is not resent on retry', async (t) => {
  const input = await fixture(t)
  let posts = 0
  t.mock.method(globalThis, 'fetch', async () => {
    posts++
    throw new TypeError('connection reset after send')
  })
  await assert.rejects(synthesizeInParts(input), {
    code: 'voice_request_unresolved',
  })
  await assert.rejects(synthesizeInParts(input), {
    code: 'voice_request_unresolved',
  })
  assert.equal(posts, 1)
})

test('pending receipt rejects changed voice settings without submitting', async (t) => {
  const input = await fixture(t)
  const counts = { posts: 0, polls: 0 }
  mockCompleted(t, counts, () => new Response('', { status: 503 }))
  await assert.rejects(synthesizeInParts(input), {
    code: 'voice_request_pending',
  })
  await assert.rejects(
    synthesizeInParts({
      ...input,
      payload: { ...input.payload, settings: { speed: 2 } },
    }),
    { code: 'voice_request_unresolved' },
  )
  assert.equal(counts.posts, 1)
})

test('confirmed failed task permits a new submission', async (t) => {
  const input = await fixture(t)
  let posts = 0
  t.mock.method(globalThis, 'fetch', async (_url, init = {}) => {
    if (init.method === 'POST') {
      posts++
      return Response.json({ task_id: 'failed-task' })
    }
    return Response.json({
      status: 'failed',
      error: 'provider confirmed failure',
    })
  })
  await assert.rejects(synthesizeInParts(input), {
    code: 'voice_generation_failed',
  })
  const counts = { posts, polls: 0 }
  mockCompleted(t, counts)
  await synthesizeInParts(input)
  assert.equal(counts.posts, 2)
})

test('synchronous cancellation still harvests the submitted audio', async (t) => {
  const input = await fixture(t, minimaxProvider)
  const controller = new AbortController()
  input.signal = controller.signal
  let posts = 0
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.method, 'POST')
    posts++
    controller.abort()
    assert.equal(init.signal.aborted, false)
    return new Response(audio, { headers: { 'content-type': 'audio/mpeg' } })
  })
  await synthesizeInParts(input)
  assert.deepEqual(await readFile(input.outputFile), audio)
  assert.equal(posts, 1)
})

test('Minimax CDN failure reuses its persisted URL without another POST', async (t) => {
  const input = await fixture(t, minimaxProvider)
  let posts = 0
  let failed = true
  t.mock.method(globalThis, 'fetch', async (_url, init = {}) => {
    if (init.method === 'POST') {
      posts++
      return Response.json({ audio_url: 'https://fixture/audio' })
    }
    return failed ? new Response('', { status: 503 }) : new Response(audio)
  })
  await assert.rejects(synthesizeInParts(input), {
    code: 'voice_request_pending',
  })
  failed = false
  await synthesizeInParts(input)
  assert.equal(posts, 1)
})

test('corrupt receipt fails closed without a POST', async (t) => {
  const input = await fixture(t)
  await writeFile(receipt(input), '{broken')
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('HTTP must not be called')
  })
  await assert.rejects(synthesizeInParts(input), {
    code: 'voice_request_unresolved',
  })
})

test('resumed provider progress includes original elapsed time and last percent', async (t) => {
  const input = await fixture(t)
  const counts = { posts: 0, polls: 0 }
  mockCompleted(t, counts, () => new Response('', { status: 503 }))
  await assert.rejects(synthesizeInParts(input))
  const saved = JSON.parse(await readFile(receipt(input), 'utf8'))
  await writeFile(
    receipt(input),
    JSON.stringify({ ...saved, startedAt: Date.now() - 60_000, percent: 43 }),
  )
  const progress = []
  mockCompleted(t, counts)
  await synthesizeInParts({
    ...input,
    onProgress: (event) => progress.push(event),
  })
  assert.ok(
    progress.some(
      (event) => event.percent === 43 && event.elapsedSeconds >= 60,
    ),
  )
  assert.equal(counts.posts, 1)
})

test('multipart cancellation reuses paid part, and real FFmpeg publishes only complete output', async (t) => {
  const input = await fixture(t, minimaxProvider)
  const triple = targetTriple()
  const ffmpeg = fileURLToPath(
    new URL(
      `../src-tauri/binaries/ffmpeg-${triple}${executableSuffix(triple)}`,
      import.meta.url,
    ),
  )
  const source = input.outputFile + '.fixture.mp3'
  execFileSync(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=0.15',
    '-c:a',
    'libmp3lame',
    source,
  ])
  const validAudio = await readFile(source)
  const controller = new AbortController()
  input.signal = controller.signal
  input.text = 'A long sentence for the audio fixture. '.repeat(160).trim()
  let posts = 0
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.method, 'POST')
    posts++
    if (posts === 1) controller.abort()
    return new Response(validAudio, {
      headers: { 'content-type': 'audio/mpeg' },
    })
  })
  await assert.rejects(synthesizeInParts(input))
  await assert.rejects(access(input.outputFile))
  assert.equal(posts, 1)
  const manifest = JSON.parse(
    await readFile(input.outputFile + '.parts.json', 'utf8'),
  )
  assert.ok(manifest.identityHash)
  // Fallar el ensamblado DESPUÉS de pagar las partes tampoco debe re-pedirlas.
  const retry = {
    ...input,
    signal: new AbortController().signal,
    ffmpegPath: '/missing/ffmpeg',
  }
  await assert.rejects(synthesizeInParts(retry))
  const paid = posts
  await assert.rejects(access(input.outputFile))
  await synthesizeInParts({ ...retry, ffmpegPath: ffmpeg })
  assert.equal(posts, paid)
  execFileSync(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    input.outputFile,
    '-f',
    'null',
    '-',
  ])
  assert.ok((await readFile(input.outputFile)).length > 0)
})

test('resume follows the pending fallback lane instead of retrying the primary', async (t) => {
  const input = await fixture(t)
  const context = {
    job: { apiKeys: { dubvoice: 'fake', elevenlabs: 'fake' }, binaryPaths: {} },
    paths: { narrationFile: input.outputFile },
    options: {
      voiceProvider: 'elevenlabs-direct',
      voiceId: 'fixture-voice',
      voiceSettings: { speed: 1 },
    },
    signal: input.signal,
    emitter: input.emitter,
  }
  let primaryPosts = 0
  let fallbackPosts = 0
  let polls = 0
  let failDownload = true
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    if (init.method === 'POST' && url.includes('api.elevenlabs.io')) {
      primaryPosts++
      return Response.json(
        { detail: { status: 'invalid_api_key', message: 'fixture rejection' } },
        { status: 401 },
      )
    }
    if (init.method === 'POST') {
      fallbackPosts++
      return Response.json({ task_id: 'fallback-paid-task' })
    }
    if (url.includes('/api/v1/tts?task_id=')) {
      polls++
      assert.equal(
        new URL(url).searchParams.get('task_id'),
        'fallback-paid-task',
      )
      return Response.json({
        status: 'completed',
        progress: 100,
        result: 'https://fixture/fallback-audio',
      })
    }
    assert.equal(url, 'https://fixture/fallback-audio')
    return failDownload
      ? new Response('', { status: 503 })
      : new Response(audio)
  })
  await assert.rejects(synthesizeNarration(context, input.text), {
    code: 'voice_request_pending',
  })
  assert.equal(
    JSON.parse(await readFile(receipt(input), 'utf8')).providerId,
    'elevenlabs',
  )
  failDownload = false
  await synthesizeNarration(context, input.text)
  assert.deepEqual(
    { primaryPosts, fallbackPosts, polls },
    { primaryPosts: 1, fallbackPosts: 1, polls: 2 },
  )
  assert.deepEqual(await readFile(input.outputFile), audio)
})

test('missing key for a pending fallback blocks any new paid lane', async (t) => {
  const input = await fixture(t)
  await writeFile(
    voiceRequestFile(input.outputFile, 3),
    JSON.stringify({
      providerId: 'elevenlabs',
      fingerprint: 'fixture',
      startedAt: Date.now(),
      state: 'pending',
      taskId: 'paid-later-part',
    }),
  )
  let requests = 0
  t.mock.method(globalThis, 'fetch', async () => {
    requests++
    throw new Error('must never send')
  })
  const context = {
    job: { apiKeys: { elevenlabs: 'fake' }, binaryPaths: {} },
    paths: { narrationFile: input.outputFile },
    options: { voiceProvider: 'elevenlabs-direct', voiceId: 'fixture-voice' },
    signal: input.signal,
    emitter: input.emitter,
  }
  await assert.rejects(synthesizeNarration(context, input.text), {
    code: 'voice_request_unresolved',
  })
  assert.equal(requests, 0)
})
