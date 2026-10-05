// Revisor narrativo (ADR-0043, versión del 2026-10-04): un juez barato con
// respaldo que objeta a lo sumo una vez por escena y nunca frena un video.
// El 2026-10-04 el juez fijo (DeepSeek V4 Pro) empezó a devolver una copia de
// su entrada y, como la revisión cortaba la fase cuando no podía verificar,
// ningún video pasó de «Validando prompts». HTTP simulado; sin claves reales.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import {
  createNarrativeReviewLlm,
  reviewNarrativePrompts,
} from '../../pipeline/stages/scene-prompts/narrative-alignment.ts'
import { narrativeReviewAnswer } from './narrative-review-fixture.mjs'

const PRIMARY_JUDGE = 'deepseek-ai/DeepSeek-V4.1-Flash'
const BACKUP_JUDGE = 'deepseek-ai/DeepSeek-V3.2'
const OBJECTION =
  'The prompt shows a football match instead of the empires ruling the region.'

function reviewContext(controller = new AbortController()) {
  const events = []
  return {
    job: {
      jobId: 'narrative-review',
      apiKeys: { deepinfra: 'fake' },
      binaryPaths: {},
    },
    config: resolvePipelineConfig({ llm: { timeoutMs: 1000 } }),
    signal: controller.signal,
    emitter: {
      emit(event) {
        events.push(event)
      },
    },
    events,
  }
}

function candidate(sceneId) {
  return {
    sceneId,
    startSeconds: (sceneId - 1) * 4,
    endSeconds: sceneId * 4,
    source: `Scene ${sceneId}: the empires ruled the whole region for centuries.`,
    sourceKind: 'narration',
    previous: '',
    next: '',
    prompt: `Scene ${sceneId}: ancient rulers stand over a map of the region, a wide shot.`,
  }
}

// Veredicto con el contrato del revisor: objeta las escenas de `rejectedIds`.
function verdict(request, rejectedIds = new Set()) {
  return narrativeReviewAnswer(request, { rejectedIds, objection: OBJECTION })
}
function answer(content) {
  return Response.json({
    choices: [{ message: { content }, finish_reason: 'stop' }],
  })
}
// Lo que devolvía el juez caído el 2026-10-04: una copia de su propia entrada.
function echo(request) {
  return answer(request.messages.at(-1).content)
}
// Cada llamada queda anotada con el modelo y las escenas que se le pidieron.
function judges(t, behaviour) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body)
    const { candidates } = JSON.parse(request.messages.at(-1).content)
    calls.push({
      model: request.model,
      sceneIds: candidates.map(({ sceneId }) => sceneId),
    })
    return behaviour(request)
  })
  return calls
}
function models(calls) {
  return calls.map(({ model }) => model)
}
function review(context, candidates, llm = createNarrativeReviewLlm(context)) {
  return reviewNarrativePrompts(candidates, { llm, signal: context.signal })
}
function warnings(context) {
  return context.events.filter(
    (event) => event.type === 'log' && event.level === 'warn',
  )
}

test('the review asks DeepSeek V4.1 Flash and returns its objection', async (t) => {
  const calls = judges(t, (request) => verdict(request, new Set([2])))
  const context = reviewContext()

  const rejected = await review(context, [candidate(1), candidate(2)])

  assert.deepEqual(models(calls), [PRIMARY_JUDGE])
  assert.deepEqual([...rejected.keys()], [2])
  assert.match(rejected.get(2), /football match/)
})

test('a judge that echoes its input hands the review to DeepSeek V3.2', async (t) => {
  const calls = judges(t, (request) =>
    request.model === PRIMARY_JUDGE
      ? echo(request)
      : verdict(request, new Set([1])),
  )
  const context = reviewContext()

  const rejected = await review(context, [candidate(1), candidate(2)])

  assert.deepEqual(models(calls), [PRIMARY_JUDGE, BACKUP_JUDGE])
  assert.deepEqual([...rejected.keys()], [1])
  assert.ok(
    warnings(context).some((event) => event.message.includes('DeepSeek-V3.2')),
    'the log says which judge took over',
  )
})

test('a judge that fails at the provider hands the review to DeepSeek V3.2', async (t) => {
  const calls = judges(t, (request) =>
    request.model === PRIMARY_JUDGE
      ? new Response('upstream error', { status: 500 })
      : verdict(request),
  )
  const context = reviewContext()

  const rejected = await review(context, [candidate(1)])

  assert.deepEqual(models(calls), [PRIMARY_JUDGE, BACKUP_JUDGE])
  assert.equal(rejected.size, 0)
})

test('when no judge answers, the prompts pass without review and the video goes on', async (t) => {
  judges(t, echo)
  const context = reviewContext()

  const rejected = await review(context, [candidate(1), candidate(2)])

  assert.equal(rejected.size, 0)
  assert.ok(
    warnings(context).some((event) =>
      event.message.includes('without narrative review'),
    ),
    'the log says the prompts were not reviewed',
  )
})

test('neither a missing balance nor a rejected key at the judge stops the video', async (t) => {
  for (const status of [402, 401]) {
    judges(t, () => Response.json({ error: 'account problem' }, { status }))
    const context = reviewContext()

    const rejected = await review(context, [candidate(1)])

    assert.equal(rejected.size, 0, `status ${status}`)
    t.mock.restoreAll()
  }
})

test('a judge that failed twice in the video is not asked again, not even by another client of the same video', async (t) => {
  const calls = judges(t, (request) =>
    request.model === PRIMARY_JUDGE ? echo(request) : verdict(request),
  )
  const context = reviewContext()
  const llm = createNarrativeReviewLlm(context)

  await review(context, [candidate(1)], llm)
  await review(context, [candidate(2)], llm)
  // La fase de imágenes arma su propio cliente para el mismo video.
  await review(context, [candidate(3)])

  assert.deepEqual(models(calls), [
    PRIMARY_JUDGE,
    BACKUP_JUDGE,
    PRIMARY_JUDGE,
    BACKUP_JUDGE,
    BACKUP_JUDGE,
  ])
})

test('when every judge broke in the video, the next prompts pass without calling anyone', async (t) => {
  const calls = judges(t, echo)
  const context = reviewContext()

  await review(context, [candidate(1)])
  const callsAfterFirst = calls.length
  const rejected = await review(context, [candidate(2)])

  assert.ok(callsAfterFirst > 0)
  assert.equal(calls.length, callsAfterFirst, 'no judge is asked again')
  assert.equal(rejected.size, 0)
})

test('a broken judge in another video does not count against this one', async (t) => {
  const calls = judges(t, (request) =>
    request.model === PRIMARY_JUDGE ? echo(request) : verdict(request),
  )
  const first = reviewContext()
  await review(first, [candidate(1)])
  await review(first, [candidate(2)])
  calls.length = 0

  await review(reviewContext(), [candidate(1)])

  assert.equal(models(calls)[0], PRIMARY_JUDGE)
})

test('each scene gets at most one objection per video: its rewritten prompt passes without asking again', async (t) => {
  // Un juez que nunca se conforma con las escenas 1 y 2.
  const calls = judges(t, (request) => verdict(request, new Set([1, 2])))
  const context = reviewContext()
  const llm = createNarrativeReviewLlm(context)

  const first = await review(
    context,
    [candidate(1), candidate(2), candidate(3)],
    llm,
  )
  const second = await review(context, [candidate(1), candidate(3)], llm)
  const third = await review(context, [candidate(2)], llm)

  assert.deepEqual([...first.keys()].sort(), [1, 2])
  assert.equal(second.size, 0)
  assert.equal(third.size, 0)
  assert.deepEqual(
    calls.map(({ sceneIds }) => sceneIds),
    [[1, 2, 3], [3]],
    'the objected scenes are not sent to the judge again',
  )
})

test('cancelling the video during the review stops it instead of letting the prompts pass', async (t) => {
  const controller = new AbortController()
  const context = reviewContext(controller)
  judges(t, async () => {
    controller.abort()
    throw new DOMException('The operation was aborted.', 'AbortError')
  })

  await assert.rejects(review(context, [candidate(1)]), { name: 'AbortError' })
})
