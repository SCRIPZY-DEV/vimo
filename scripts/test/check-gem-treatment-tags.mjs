// La etiqueta de tratamiento de las gemas con dinamismo (spec §5.3): el
// parser la lee y la quita después del id `((n))`, guarda un tratamiento
// válido en `scene.treatment` y, si falta o no es válida, el prompt igual
// vale sin reintento. Al cerrar la fase de prompts un `log` cuenta el
// reparto. Una gema sin dinamismo o una gema vieja no ven nada de esto.
// El juez de correspondencia (ADR-0043) revisa los prompts ya sin la
// etiqueta: el fetch simulado le contesta una aprobación y guarda lo que vio.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'
import { readScenes, writeScenes } from '../../pipeline/project/scenes-file.ts'
import { PipelineFailure } from '../../pipeline/runner/failure.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { scenePromptsStage } from '../../pipeline/stages/scene-prompts/scene-prompts.ts'
import { readTreatmentTag } from '../../pipeline/stages/scene-prompts/verbatim/parser.ts'
import {
  describeTreatmentMix,
  withTreatment,
} from '../../pipeline/stages/scene-prompts/verbatim/treatments.ts'
import { runVerbatimLane } from '../../pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts'
import { createVerbatimPromptPersistence } from '../../pipeline/stages/scene-prompts/verbatim/verbatim-persistence.ts'
import {
  generateVerbatimPrompts,
  readBatchPrompts,
} from '../../pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts'

const tail = 'Style: simple stickman drawing, colorful background.'
const batch = [1, 2, 3].map((n) => ({ n, text: 'Fragment ' + n + '.' }))
const scene = (id, body) => `((${id})) ${body} ${tail}`
const body = {
  1: '[T:action] [subject] runs across a bright park with a kite.',
  2: '[T:Metaphor] A giant clock melting over a quiet city at dawn.',
  3: '[T:close-up] A red kite caught in the branches of an old tree.',
}
const sections = {
  visualStyle: 'Simple stickman drawings on colorful backgrounds.',
  dynamism:
    'Show the protagonist in half of the scenes; metaphors in the rest.',
}

// ── La etiqueta ──

test('the tag is read and removed; an unknown one is removed without a treatment', () => {
  assert.deepEqual(readTreatmentTag('[T:action] Wide shot.'), {
    text: 'Wide shot.',
    treatment: 'action',
  })
  assert.deepEqual(readTreatmentTag('[ t : Place ]  Wide shot.'), {
    text: 'Wide shot.',
    treatment: 'place',
  })
  assert.deepEqual(readTreatmentTag('[T:close-up] Wide shot.'), {
    text: 'Wide shot.',
  })
  assert.deepEqual(readTreatmentTag('Wide shot. [T:action]'), {
    text: 'Wide shot. [T:action]',
  })
  assert.deepEqual(readTreatmentTag('[SUBJECT] Wide shot.'), {
    text: '[SUBJECT] Wide shot.',
  })
})

test('the tag tolerates capitals, a missing space and invented or misspelled values', () => {
  assert.deepEqual(readTreatmentTag('[T:ACTION] Wide shot.'), {
    text: 'Wide shot.',
    treatment: 'action',
  })
  assert.deepEqual(readTreatmentTag('[t:object]Wide shot.'), {
    text: 'Wide shot.',
    treatment: 'object',
  })
  for (const invented of [
    '[T:dream]',
    '[T:acton]',
    '[T:]',
    '[T: action, place]',
  ])
    assert.deepEqual(readTreatmentTag(`${invented} Wide shot.`), {
      text: 'Wide shot.',
    })
  // La etiqueta sola deja el texto vacío: quien lee el lote decide que falta.
  assert.deepEqual(readTreatmentTag('[T:object]'), {
    text: '',
    treatment: 'object',
  })
  assert.deepEqual(readTreatmentTag('[subject] walks in.'), {
    text: '[subject] walks in.',
  })
})

test('with tags on, a batch keeps every prompt and records the valid treatments', () => {
  const answer = [1, 2, 3].map((id) => scene(id, body[id])).join('\n\n')
  const reading = readBatchPrompts(answer, batch, { treatmentTags: true })
  assert.deepEqual(reading.defective, [])
  assert.deepEqual(
    reading.good.map((entry) => [entry.n, entry.treatment]),
    [
      [1, 'action'],
      [2, 'metaphor'],
      [3, undefined],
    ],
  )
  for (const entry of reading.good) assert.doesNotMatch(entry.prompt, /\[T:/)

  // Sin ids (lectura por orden) y en JSON también.
  const byOrder = readBatchPrompts(
    [1, 2, 3].map((id) => body[id] + ' ' + tail).join('\n\n'),
    batch,
    { treatmentTags: true },
  )
  assert.deepEqual(
    byOrder.good.map((entry) => entry.treatment),
    ['action', 'metaphor', undefined],
  )
  const fromJson = readBatchPrompts(
    JSON.stringify({
      prompts: [1, 2, 3].map((id) => ({ id, prompt: body[id] + ' ' + tail })),
    }),
    batch,
    { treatmentTags: true },
  )
  assert.deepEqual(
    fromJson.good.map((entry) => entry.treatment),
    ['action', 'metaphor', undefined],
  )
})

test('a piece with only its id and its tag is missing, not an empty prompt', () => {
  const reading = readBatchPrompts(
    [scene(1, body[1]), '((2)) [T:object]', scene(3, body[3])].join('\n\n'),
    batch,
    { treatmentTags: true },
  )
  assert.deepEqual(
    reading.good.map((entry) => entry.n),
    [1, 3],
  )
  assert.deepEqual(
    reading.defective.map((entry) => entry.n),
    [2],
  )
})

test('with scene ids required, a tag alone is missing too — never an empty prompt nor another language', () => {
  // Los intervalos de narración (ADR-0043) exigen ids: se conservan los
  // sanos y se re-pide solo la escena que falta.
  const reading = readBatchPrompts(
    [scene(1, body[1]), '((2)) [T:object]', scene(3, body[3])].join('\n\n'),
    batch,
    { requireIds: true, treatmentTags: true },
  )
  assert.deepEqual(
    reading.good.map((entry) => [entry.n, entry.treatment]),
    [
      [1, 'action'],
      [3, undefined],
    ],
  )
  assert.deepEqual(reading.defective, [
    { n: 2, reason: 'missing from the answer (identified by id)' },
  ])

  // Un lote de etiquetas solas no es «otro idioma» (cortaría la corrida con
  // llm_prompt_language) ni un lote vacío: son escenas faltantes.
  for (const options of [
    { treatmentTags: true },
    { requireIds: true, treatmentTags: true },
  ]) {
    const onlyTags = readBatchPrompts(
      '((1)) [T:action]\n\n((2)) [T:object]\n\n((3)) [T:place]',
      batch,
      options,
    )
    assert.deepEqual(onlyTags.good, [])
    assert.deepEqual(
      onlyTags.defective.map((entry) => entry.n),
      [1, 2, 3],
    )
  }

  // En JSON, igual.
  const fromJson = readBatchPrompts(
    JSON.stringify({
      prompts: [
        { id: 1, prompt: body[1] + ' ' + tail },
        { id: 2, prompt: '[T:object]' },
      ],
    }),
    batch.slice(0, 2),
    { treatmentTags: true },
  )
  assert.deepEqual(
    fromJson.good.map((entry) => [entry.n, entry.treatment]),
    [[1, 'action']],
  )
  assert.deepEqual(
    fromJson.defective.map((entry) => entry.n),
    [2],
  )

  // Un id pelado, sin etiqueta, se sigue leyendo como siempre: sin ids
  // exigidos es formato roto y el lote se re-pide; con ids exigidos, falta.
  const bareMarker = [scene(1, body[1]), '((2))'].join('\n\n')
  assert.throws(
    () =>
      readBatchPrompts(bareMarker, batch.slice(0, 2), { treatmentTags: true }),
    /came empty/,
  )
  assert.deepEqual(
    readBatchPrompts(bareMarker, batch.slice(0, 2), {
      requireIds: true,
      treatmentTags: true,
    }).defective.map((entry) => entry.n),
    [2],
  )
})

test('with tags off, the reading is the one of always (the tag looks like a template slot)', () => {
  const reading = readBatchPrompts(scene(1, body[1]), batch.slice(0, 1))
  assert.deepEqual(reading.good, [])
  assert.match(
    reading.defective[0].reason,
    /unfilled template slot: \[T:action\]/,
  )
})

// ── El escritor ──

function fragmentsOf(request) {
  return [...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm)].map(
    (match) => Number(match[1]),
  )
}

function fakeClient(answer) {
  const requests = []
  return {
    requests,
    async call(request) {
      requests.push(request)
      const ids = [...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm)]
      return {
        content: ids.map((match) => answer(Number(match[1]))).join('\n\n'),
        inputTokens: 1,
        outputTokens: 1,
      }
    },
  }
}

test('a template gem with dynamism keeps its treatments and never re-asks for a bad tag', async () => {
  const client = fakeClient((id) => scene(id, body[id]))
  const result = await generateVerbatimPrompts(batch, 'A short story.', {
    gem: 'unused',
    sections,
    client,
    character: { mode: 'none' },
  })
  assert.equal(client.requests.length, 1, 'una etiqueta inválida no se re-pide')
  assert.deepEqual(
    [...result.treatments],
    [
      [1, 'action'],
      [2, 'metaphor'],
    ],
  )
  for (const prompt of result.prompts.values())
    assert.doesNotMatch(prompt, /\[T:/)
})

test('without dynamism the writer reads as always: a tag is a template slot and its scene is re-asked', async () => {
  // Una gema vieja, una de plantilla sin dinamismo y una con el dinamismo en
  // blanco: el marco no pide la etiqueta y el lector tampoco la lee.
  const withoutTag = (id) => scene(id, body[id].replace(/^\[T:[^\]]*\] /, ''))
  for (const gemSections of [
    undefined,
    { visualStyle: sections.visualStyle },
    { visualStyle: sections.visualStyle, dynamism: '   ' },
  ]) {
    const asked = []
    const client = {
      async call(request) {
        const ids = fragmentsOf(request)
        asked.push(ids)
        const answer =
          asked.length === 1 ? (id) => scene(id, body[id]) : withoutTag
        return {
          content: ids.map(answer).join('\n\n'),
          inputTokens: 1,
          outputTokens: 1,
        }
      },
    }
    const result = await generateVerbatimPrompts(batch, 'A short story.', {
      gem: 'Simple stickman drawings.',
      sections: gemSections,
      client,
      character: { mode: 'none' },
    })
    assert.deepEqual(asked, [
      [1, 2, 3],
      [1, 2, 3],
    ])
    assert.equal(result.treatments.size, 0)
    assert.equal(result.prompts.size, 3)
  }
})

test('an interrupted answer keeps the treatments of its finished prompts and re-asks only the rest', async () => {
  // El stream se corta mientras escribe la escena 3: el rescate del PR #91
  // conserva las dos cerradas (con su etiqueta leída) y re-pide solo la 3.
  const asked = []
  const client = {
    async call(request) {
      const ids = fragmentsOf(request)
      asked.push(ids)
      if (asked.length === 1) {
        request.onProgress?.(
          `${scene(1, body[1])}\n\n${scene(2, body[2])}\n\n((3)) [T:close-up] A red`,
        )
        throw new PipelineFailure('llm_timeout', 'the provider stopped')
      }
      return {
        content: ids.map((id) => scene(id, body[id])).join('\n\n'),
        inputTokens: 1,
        outputTokens: 1,
      }
    },
  }
  const result = await generateVerbatimPrompts(batch, 'A short story.', {
    gem: 'unused',
    sections,
    client,
    character: { mode: 'none' },
  })
  assert.deepEqual(asked, [[1, 2, 3], [3]])
  assert.deepEqual(
    [...result.treatments],
    [
      [1, 'action'],
      [2, 'metaphor'],
    ],
  )
  assert.equal(result.prompts.size, 3)
  for (const prompt of result.prompts.values())
    assert.doesNotMatch(prompt, /\[T:/)
})

// ── La escena y el log ──

test('the scene carries the new treatment and loses a stale one', () => {
  const base = { id: 1, text: 'x' }
  assert.deepEqual(withTreatment(base, 'object'), {
    ...base,
    treatment: 'object',
  })
  assert.deepEqual(
    withTreatment({ ...base, treatment: 'place' }, undefined),
    base,
  )
  assert.equal(
    withTreatment(base, undefined),
    base,
    'sin campo, la misma escena',
  )
})

test('the mix counts each treatment, the untagged ones and the protagonist share', () => {
  const scenes = [
    { id: 1, text: '', treatment: 'action' },
    { id: 2, text: '', treatment: 'metaphor' },
    { id: 3, text: '' },
    { id: 4, text: '', treatment: 'action' },
    { id: 5, text: '', treatment: 'place' },
  ]
  assert.equal(
    describeTreatmentMix(scenes, new Set([1, 2, 3, 4]), [1, 4, 5]),
    'treatment mix of the 4 written scene(s): action 2, metaphor 1, untagged 1 — protagonist in 50% (2 of 4)',
  )
})

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
// El juez de correspondencia temporal (ADR-0043) revisa cada lote antes de
// persistirlo: se le contesta una aprobación, como narrativeReviewResponse
// en check-verbatim-prompt-persistence, y queda fuera de la conversación del
// redactor.
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
function reviewedPrompts(reviews) {
  return reviews.flatMap((review) =>
    JSON.parse(review.messages.at(-1).content).candidates.map(
      (candidate) => candidate.prompt,
    ),
  )
}
async function fixture(
  t,
  customStyle,
  answer = (id) => scene(id, body[id]),
  seeds = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-tags-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
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
        customStyle,
      },
      state: 'draft',
      completedStages: [],
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    }),
  )
  await writeFile(paths.scriptFile, 'A short story in three moments.')
  await writeScenes(
    paths,
    batch.map((fragment, index) => ({
      id: fragment.n,
      text: fragment.text,
      startSeconds: index * 4,
      endSeconds: (index + 1) * 4,
      ...seeds[fragment.n],
    })),
  )
  const events = []
  const base = {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fixture' },
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
  const asked = []
  const reviews = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body)
    if (isNarrativeReview(request)) {
      reviews.push(request)
      return narrativeApproval(request)
    }
    const ids = fragmentsOf(request)
    asked.push(ids)
    return stream(ids.map(answer).join('\n\n'))
  })
  return { paths, base, events, asked, reviews }
}
const mixLogs = (events) =>
  events.filter(
    (event) =>
      event.type === 'log' && event.message.startsWith('treatment mix'),
  )
const templateGem = {
  styleId: 'st-template',
  name: 'Stickman',
  sections,
  templateVersion: 1,
  character: { mode: 'none' },
}

test('scene-prompts stores the treatments and logs the mix once, with the allowed keys only', async (t) => {
  const { paths, base, events, asked, reviews } = await fixture(t, templateGem)
  await scenePromptsStage.run(await buildCreateVideoContext(base, 'fixture'))

  const scenes = await readScenes(paths)
  assert.deepEqual(
    scenes.map((item) => item.treatment),
    ['action', 'metaphor', undefined],
  )
  for (const item of scenes) assert.doesNotMatch(item.imagePrompt, /\[T:/)
  // Una etiqueta inválida (close-up) no se re-pide, y el juez nunca la ve.
  assert.deepEqual(asked, [[1, 2, 3]])
  const judged = reviewedPrompts(reviews)
  assert.equal(judged.length, 3)
  for (const prompt of judged) assert.doesNotMatch(prompt, /\[T:/)
  const logs = mixLogs(events)
  assert.equal(logs.length, 1)
  assert.equal(
    logs[0].message,
    'treatment mix of the 3 written scene(s): action 1, metaphor 1, untagged 1 — protagonist in 33% (1 of 3)',
  )
  // El log de soporte sube type, level y message (ADR-0038): nada nuevo.
  assert.deepEqual(Object.keys(logs[0]).sort(), ['level', 'message', 'type'])
})

test('each batch hands its treatments to the disk and drops a stale one', async (t) => {
  // Solo la persistencia lote a lote, sin la escritura final de la fase: lo
  // que queda en disco si el job muere después del lote.
  const { paths, base } = await fixture(t, templateGem, undefined, {
    2: { treatment: 'place' },
    3: { treatment: 'object' },
  })
  const context = await buildCreateVideoContext(base, 'fixture')
  const scenes = await readScenes(paths)
  const persistence = createVerbatimPromptPersistence(context, scenes)
  const handed = []
  await runVerbatimLane(context, scenes, 'A short story in three moments.', {
    async onPrompts(prompts) {
      handed.push(...prompts)
      await persistence.onPrompts(prompts)
    },
  })
  await persistence.flush()

  assert.deepEqual(
    handed.map((prompt) => [prompt.id, prompt.treatment]),
    [
      [1, 'action'],
      [2, 'metaphor'],
      [3, undefined],
    ],
  )
  assert.equal('treatment' in handed[2], false)
  assert.deepEqual(
    (await readScenes(paths)).map((item) => item.treatment),
    ['action', 'metaphor', undefined],
  )
})

test('a resumed pass keeps the treatment of a written scene and counts only what it writes', async (t) => {
  const { paths, base, events, asked } = await fixture(
    t,
    templateGem,
    undefined,
    {
      1: {
        imagePrompt: `A stickman runs across a bright park with a kite. ${tail}`,
        treatment: 'place',
      },
      3: { treatment: 'object' },
    },
  )
  await scenePromptsStage.run(await buildCreateVideoContext(base, 'fixture'))

  assert.deepEqual(asked, [[2, 3]], 'la escena ya escrita no se re-pide')
  assert.deepEqual(
    (await readScenes(paths)).map((item) => item.treatment),
    ['place', 'metaphor', undefined],
  )
  const logs = mixLogs(events)
  assert.equal(logs.length, 1)
  assert.equal(
    logs[0].message,
    'treatment mix of the 2 written scene(s): metaphor 1, untagged 1 — protagonist in 0% (0 of 2)',
  )
})

test('without dynamism, and with an old gem, there is no treatment and no mix', async (t) => {
  // Sin dinamismo el marco no pide la etiqueta y el modelo no la escribe.
  const untagged = (id) => scene(id, body[id].replace(/^\[T:[^\]]*\] /, ''))
  for (const customStyle of [
    {
      styleId: 'st-static',
      name: 'Static',
      sections: { visualStyle: sections.visualStyle },
      templateVersion: 1,
      character: { mode: 'none' },
    },
    {
      styleId: 'st-legacy',
      name: 'Legacy',
      systemPrompt: 'Simple stickman drawings.',
      character: { mode: 'none' },
    },
  ]) {
    const { paths, base, events } = await fixture(t, customStyle, untagged)
    await scenePromptsStage.run(await buildCreateVideoContext(base, 'fixture'))
    assert.equal(mixLogs(events).length, 0)
    for (const item of await readScenes(paths)) {
      assert.ok(item.imagePrompt)
      assert.equal('treatment' in item, false)
    }
    t.mock.restoreAll()
  }
})
