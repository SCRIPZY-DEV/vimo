// ai33 como motor de voz (ADR-0053): síntesis por tarea, reintentos que no
// crean tarea, recuperación de un envío cortado y SIN respaldo automático (si
// falla, la UI ofrece reintentar o cambiar de voz con set-project-voice). HTTP
// simulado; todo audio, recibo y proyecto vive en un tmpdir exclusivo.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listAi33Voices } from '../../pipeline/providers/tts/ai33.ts'
import { setProjectVoice } from '../../pipeline/commands/videos/set-project-voice.ts'
import { synthesizeNarration } from '../../pipeline/stages/voice/narration.ts'

const audio = Buffer.from('ID3 fixture audio')
const text = 'This is the exact narration that must only be paid once.'

async function narrationContext(t, { voiceId, apiKeys, speed = 1 }) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-ai33-voice-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const events = []
  return {
    events,
    context: {
      job: { apiKeys, binaryPaths: {} },
      paths: { narrationFile: join(root, 'narration.mp3') },
      options: {
        voiceProvider: 'ai33',
        voiceId,
        voiceSettings: { speed },
      },
      signal: new AbortController().signal,
      emitter: {
        emit(event) {
          events.push(event)
        },
      },
    },
  }
}

function isAi33(url) {
  return url.startsWith('https://api.ai33.pro')
}

test('ai33 synthesizes by task with prefixed voice, clamped speed and xi-api-key', async (t) => {
  const { context } = await narrationContext(t, {
    voiceId: 'elevenlabs_fixture',
    apiKeys: { ai33: 'ai33-key' },
    speed: 3,
  })
  const calls = { posts: 0, polls: 0 }
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    if (url === 'https://api.ai33.pro/v3/text-to-speech') {
      calls.posts++
      assert.equal(init.headers['xi-api-key'], 'ai33-key')
      assert.equal(init.body.get('voice_id'), 'elevenlabs_fixture')
      assert.equal(init.body.get('speed'), '1.5')
      assert.match(init.body.get('file_name'), /^vimo-[0-9a-f]{24}$/)
      return Response.json({ success: true, task_id: 'ai33-task' })
    }
    if (url === 'https://api.ai33.pro/v1/task/ai33-task') {
      calls.polls++
      return Response.json({
        status: 'done',
        progress: 100,
        metadata: { audio_url: 'https://cdn.fixture/ai33.mp3' },
      })
    }
    assert.equal(url, 'https://cdn.fixture/ai33.mp3')
    return new Response(audio)
  })

  await synthesizeNarration(context, text)

  assert.deepEqual(calls, { posts: 1, polls: 1 })
  assert.deepEqual(await readFile(context.paths.narrationFile), audio)
})

test('429 and 503 server_busy on submit are retried without a second task', async (t) => {
  const { context } = await narrationContext(t, {
    voiceId: 'edge_es-ES-AlvaroNeural',
    apiKeys: { ai33: 'ai33-key' },
  })
  const answers = [
    () => Response.json({ retry_after: 0 }, { status: 429 }),
    () =>
      Response.json({ code: 'server_busy', retry_after: 0 }, { status: 503 }),
    () => Response.json({ success: true, task_id: 'late-task' }),
  ]
  let posts = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/v3/text-to-speech')) return answers[posts++]()
    if (url.endsWith('/v1/task/late-task'))
      return Response.json({
        status: 'done',
        metadata: { audio_url: 'https://cdn.fixture/late.mp3' },
      })
    return new Response(audio)
  })

  await synthesizeNarration(context, text)

  assert.equal(posts, 3)
  assert.deepEqual(await readFile(context.paths.narrationFile), audio)
})

test('a failed ai33 task stops the narration without paying DubVoice', async (t) => {
  const { context, events } = await narrationContext(t, {
    voiceId: 'minimax_English_Abbess',
    apiKeys: { ai33: 'ai33-key', dubvoice: 'dubvoice-key' },
  })
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(isAi33(url), `unexpected request to ${url}`)
    if (url.endsWith('/v3/text-to-speech'))
      return Response.json({ success: true, task_id: 'doomed-task' })
    return Response.json({
      status: 'error',
      error_message: 'Text-to-speech failed',
      text,
      text_length: text.length,
    })
  })

  await assert.rejects(synthesizeNarration(context, text), {
    code: 'voice_all_lanes_failed',
  })

  const failure = events.find((event) => event.type === 'provider-failure')
  assert.equal(failure.provider, 'ai33')
  assert.equal(failure.code, 'voice_generation_failed')
  assert.equal(failure.recovered, false)
  // La pista del proveedor llega al log; el guion del usuario, no.
  assert.match(failure.detail, /Text-to-speech failed/)
  assert.ok(!failure.detail.includes(text))
})

test('a rejected ai33 key stops the narration before any task exists', async (t) => {
  const { context } = await narrationContext(t, {
    voiceId: 'vbee_fixture-voice',
    apiKeys: { ai33: 'bad-key', dubvoice: 'dubvoice-key' },
  })
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(isAi33(url), `unexpected request to ${url}`)
    return Response.json({}, { status: 401 })
  })

  await assert.rejects(synthesizeNarration(context, text), {
    code: 'voice_all_lanes_failed',
  })
})

test('the voice library lists one catalog with prefixed ids and language names', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const query = new URL(url).searchParams
    assert.equal(query.get('provider'), 'minimax')
    assert.equal(query.get('language'), 'Spanish')
    return Response.json({
      success: true,
      data: [
        { voice_id: 'minimax_Spanish_Reader', name: 'Reader' },
        { voice_id: 'Spanish_Narrator', name: 'Narrator' },
      ],
      pagination: { page: 1, total_pages: 2, total: 61 },
    })
  })

  const result = await listAi33Voices('ai33-key', {
    catalog: 'minimax',
    language: 'es',
  })

  assert.deepEqual(
    result.voices.map((voice) => voice.voiceId),
    ['minimax_Spanish_Reader', 'minimax_Spanish_Narrator'],
  )
  assert.equal(result.hasMore, true)
  assert.equal(result.total, 61)
})

test('a submit cut before the task id finds the task by its mark and pays once', async (t) => {
  const { context } = await narrationContext(t, {
    voiceId: 'elevenlabs_fixture',
    apiKeys: { ai33: 'ai33-key', dubvoice: 'dubvoice-key' },
  })
  let posts = 0
  let fileName
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    assert.ok(isAi33(url) || url.startsWith('https://cdn.fixture'), url)
    if (url.endsWith('/v3/text-to-speech')) {
      posts++
      fileName = init.body.get('file_name')
      throw new TypeError('connection reset after send')
    }
    if (url.includes('/v1/tasks?'))
      return Response.json({
        data: [
          { id: 'other-task', file_name: 'vimo-other' },
          { id: 'lost-task', file_name: fileName },
        ],
      })
    if (url.endsWith('/v1/task/lost-task'))
      return Response.json({
        status: 'done',
        metadata: { audio_url: 'https://cdn.fixture/lost.mp3' },
      })
    return new Response(audio)
  })

  await synthesizeNarration(context, text)

  assert.equal(posts, 1)
  assert.deepEqual(await readFile(context.paths.narrationFile), audio)
})

test('a submit cut with no task at ai33 fails cleanly and frees the receipt', async (t) => {
  const { context, events } = await narrationContext(t, {
    voiceId: 'minimax_English_Abbess',
    apiKeys: { ai33: 'ai33-key', dubvoice: 'dubvoice-key' },
  })
  let posts = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(isAi33(url), `unexpected request to ${url}`)
    if (url.endsWith('/v3/text-to-speech')) {
      posts++
      return Response.json({ error: 'bad gateway' }, { status: 502 })
    }
    return Response.json({ data: [] })
  })

  await assert.rejects(synthesizeNarration(context, text), {
    code: 'voice_all_lanes_failed',
  })
  const failure = events.find((event) => event.type === 'provider-failure')
  assert.equal(failure.code, 'voice_submission_failed')
  // Sin tarea confirmada, «Reintentar» vuelve a enviar sin trabarse.
  await assert.rejects(synthesizeNarration(context, text), {
    code: 'voice_all_lanes_failed',
  })
  assert.equal(posts, 2)
})

test('an unknowable submit stays unresolved and the resume adopts the task without paying again', async (t) => {
  const { context } = await narrationContext(t, {
    voiceId: 'elevenlabs_fixture',
    apiKeys: { ai33: 'ai33-key', dubvoice: 'dubvoice-key' },
  })
  let posts = 0
  let listing = 'down'
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(isAi33(url) || url.startsWith('https://cdn.fixture'), url)
    if (url.endsWith('/v3/text-to-speech')) {
      posts++
      throw new TypeError('connection reset after send')
    }
    if (url.includes('/v1/tasks?')) {
      if (listing === 'down') return new Response('', { status: 500 })
      return Response.json({
        data: [
          {
            id: 'adopted-task',
            created_at: new Date().toISOString(),
            text,
            text_length: text.length,
          },
        ],
      })
    }
    if (url.endsWith('/v1/task/adopted-task'))
      return Response.json({
        status: 'done',
        metadata: { audio_url: 'https://cdn.fixture/adopted.mp3' },
      })
    return new Response(audio)
  })

  await assert.rejects(synthesizeNarration(context, text), {
    code: 'voice_request_unresolved',
  })
  listing = 'up'
  await synthesizeNarration(context, text)

  assert.equal(posts, 1)
  assert.deepEqual(await readFile(context.paths.narrationFile), audio)
})

test('an error body that echoes the narration never carries it to the log', async (t) => {
  const { context, events } = await narrationContext(t, {
    voiceId: 'minimax_English_Abbess',
    apiKeys: { ai33: 'ai33-key' },
  })
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/v3/text-to-speech'))
      return Response.json(
        { message: `invalid text: ${text}` },
        { status: 400 },
      )
    return Response.json({ data: [] })
  })

  await assert.rejects(synthesizeNarration(context, text), {
    code: 'voice_all_lanes_failed',
  })

  const failure = events.find((event) => event.type === 'provider-failure')
  assert.match(failure.detail, /invalid text: \[narration omitted\]/)
  assert.ok(!failure.detail.includes(text.slice(0, 20)))
})

// ─── set-project-voice: «Cambiar voz» tras un fallo de la narración ───

async function failedVoiceProject(t, completedStages = []) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-set-project-voice-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const projectId = 'voice-failed'
  const projectDir = join(root, projectId)
  await mkdir(projectDir)
  const metadata = {
    id: projectId,
    name: 'Fixture',
    state: 'error',
    errorCode: 'voice_request_pending',
    completedStages,
    options: {
      narrationMode: 'tts',
      voiceProvider: 'ai33',
      voiceId: 'minimax_English_Abbess',
      voiceSettings: { speed: 1 },
    },
  }
  await writeFile(join(projectDir, 'project.json'), JSON.stringify(metadata))
  // Lo que la voz anterior dejó a medias: recibo pendiente, parte y manifest.
  for (const name of [
    'narration.mp3.request-0.json',
    'narration.mp3.part_0.mp3',
    'narration.mp3.parts.json',
  ])
    await writeFile(join(projectDir, name), '{}')
  const context = (voice) => ({
    job: { projectsRoot: root, payload: { projectId, voice } },
  })
  return { projectDir, context }
}

test('set-project-voice saves the new voice and discards the old half-done narration', async (t) => {
  const { projectDir, context } = await failedVoiceProject(t)

  await setProjectVoice(
    context({
      provider: 'minimax',
      voiceId: 'English_Abbess',
      voiceName: 'Abbess',
      settings: { speed: 1 },
    }),
  )

  const saved = JSON.parse(await readFile(join(projectDir, 'project.json')))
  assert.equal(saved.options.voiceProvider, 'minimax')
  assert.equal(saved.options.voiceId, 'English_Abbess')
  assert.equal(saved.options.voiceName, 'Abbess')
  assert.deepEqual(await readdir(projectDir), ['project.json'])
})

test('set-project-voice refuses unknown providers and finished narrations', async (t) => {
  const { context } = await failedVoiceProject(t, ['voice'])
  await assert.rejects(
    setProjectVoice(context({ provider: 'nope', voiceId: 'x' })),
    { code: 'invalid_payload' },
  )
  await assert.rejects(
    setProjectVoice(context({ provider: 'minimax', voiceId: 'x' })),
    { code: 'invalid_payload' },
  )
})
