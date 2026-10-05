// Los prompts del carril verbatim se pagan en DeepInfra por token: lo que un
// lote ya cosechó tiene que quedar en disco ANTES de que la corrida pueda
// morir. Antes de este guard, cualquier fallo posterior (un 401, un grupo que
// arrastra a los otros, la cancelación de la UI por un modelo con errores)
// tiraba todo y el reintento lo volvía a comprar entero.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import {
  resolveProjectPaths,
  sceneImageFile,
} from '../../pipeline/project/paths.ts'
import { readScenes, writeScenes } from '../../pipeline/project/scenes-file.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { scenePromptsStage } from '../../pipeline/stages/scene-prompts/scene-prompts.ts'
import { CHARACTER_DESIGN_INSTRUCTION } from '../../pipeline/prompts/verbatim-messages.ts'
import { runVerbatimLane } from '../../pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts'
import { VERBATIM_BATCH_SIZE } from '../../pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts'
import { createVerbatimPromptPersistence } from '../../pipeline/stages/scene-prompts/verbatim/verbatim-persistence.ts'

const SCENE_COUNT = VERBATIM_BATCH_SIZE + 5
// Una primera tanda completa y cinco pendientes: sigue probando la misma
// frontera de persistencia cuando cambia el tamaño de lote del producto.
const FIRST_BATCH = Array.from(
  { length: VERBATIM_BATCH_SIZE },
  (_, index) => index + 1,
)
const SECOND_BATCH = Array.from(
  { length: 5 },
  (_, index) => VERBATIM_BATCH_SIZE + index + 1,
)

const gem =
  'Render every scene as a hand-drawn watercolor illustration with indigo washes and rough paper. ' +
  'The recurring character is Mila, a red-haired girl with freckles and round green glasses. ' +
  'Keep the story action and setting.'
const tail =
  'Style: hand-drawn watercolor illustration, indigo washes on rough paper.'
const sheet =
  'A curious red-haired girl, slender build, freckles across the nose, round green glasses. Outfit: a green hoodie, blue jeans and white sneakers.'
const body = '[subject] repairs a red antenna beside an orbital greenhouse'
const script = 'Mila repairs the antenna. The greenhouse glows. She smiles.'
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)

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
function lastUserMessage(request) {
  return request.messages.at(-1).content
}
function isPhaseOne(request) {
  return lastUserMessage(request).includes(CHARACTER_DESIGN_INSTRUCTION)
}
function fragmentsOf(request) {
  return [...lastUserMessage(request).matchAll(/^(\d+)\. /gm)].map((match) =>
    Number(match[1]),
  )
}
function scenesResponse(request) {
  return stream(
    fragmentsOf(request)
      .map((id) => '((' + id + ')) ' + body + ' number ' + id + '. ' + tail)
      .join('\n\n'),
  )
}
// Este guard mide persistencia, no calidad semántica. La revisión usa JSON
// no-streaming: no se le devuelve el SSE reservado al redactor de escenas.
// `rejectedIds`: escenas que el revisor objeta siempre.
const REVIEW_SYSTEM_START = 'You audit the FULL narrative meaning'
const REVIEWER_OBJECTION =
  'The prompt shows the greenhouse instead of the antenna being repaired.'
function isReviewRequest(request) {
  return request.messages[0].content.startsWith(REVIEW_SYSTEM_START)
}
function narrativeReviewResponse(request, rejectedIds = new Set()) {
  if (!isReviewRequest(request)) return
  const { candidates } = JSON.parse(lastUserMessage(request))
  assert.ok(Array.isArray(candidates) && candidates.length > 0)
  return Response.json({
    choices: [
      {
        message: {
          content: JSON.stringify({
            scenes: candidates.map((candidate) => {
              const aligned = !rejectedIds.has(candidate.sceneId)
              return {
                sceneId: candidate.sceneId,
                checks: {
                  focus: aligned,
                  events: aligned,
                  setting: aligned,
                  causality: aligned,
                },
                aligned,
                sourceEvidenceId: candidate.sourceEvidence[0]?.id ?? null,
                promptEvidenceId: candidate.promptEvidence[0].id,
                reason: aligned
                  ? 'Explicit approval fixture for prompt persistence regression only.'
                  : REVIEWER_OBJECTION,
              }
            }),
          }),
        },
      },
    ],
  })
}

function unauthorized() {
  return new Response(JSON.stringify({ error: 'invalid api key' }), {
    status: 401,
  })
}
function promptsOnDisk(scenes) {
  return scenes
    .filter((scene) => (scene.imagePrompt ?? '').trim().length > 0)
    .map((scene) => scene.id)
}

async function fixture(
  t,
  { characters, styleCharacterMode = 'generic', prompts, images = false } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-verbatim-persistence-'))
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
        ...(characters ? { characters } : {}),
        customStyle: {
          id: 'fixture',
          name: 'Watercolor',
          systemPrompt: gem,
          character: { mode: styleCharacterMode },
        },
      },
      state: 'draft',
      completedStages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  )
  await writeFile(paths.scriptFile, script)
  await writeScenes(
    paths,
    Array.from({ length: SCENE_COUNT }, (_, index) => ({
      id: index + 1,
      text: 'Scene number ' + (index + 1) + ' of the story.',
      startSeconds: index * 4,
      endSeconds: (index + 1) * 4,
      ...(prompts ? { imagePrompt: prompts(index + 1) } : {}),
    })),
  )
  if (images)
    for (let id = 1; id <= SCENE_COUNT; id++)
      await writeFile(sceneImageFile(paths, id), bytes)
  const events = []
  const controller = new AbortController()
  const base = {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fixture', fal: 'fixture' },
      binaryPaths: {},
    },
    config: resolvePipelineConfig(),
    signal: controller.signal,
    emitter: {
      emit(event) {
        events.push(event)
      },
    },
  }
  return { paths, base, events, controller }
}

function llm(t, handler) {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).includes('chat/completions'))
      throw new Error('unexpected call to ' + url)
    const request = JSON.parse(init.body)
    const review = narrativeReviewResponse(request)
    if (review) return review
    requests.push(request)
    if (isPhaseOne(request)) return stream('```text\n' + sheet + '\n```')
    return handler(request, fragmentsOf(request))
  })
  return requests
}

test('Mi estilo rewrites a scene the reviewer rejects once and keeps it', async (t) => {
  const { paths, base } = await fixture(t)
  const writerRequests = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).includes('chat/completions'))
      throw new Error('unexpected call to ' + url)
    const request = JSON.parse(init.body)
    const review = narrativeReviewResponse(request, new Set([2]))
    if (review) return review
    if (isPhaseOne(request)) return stream('```text\n' + sheet + '\n```')
    writerRequests.push(request)
    return scenesResponse(request)
  })

  await scenePromptsStage.run(await buildCreateVideoContext(base, 'fixture'))

  assert.equal(promptsOnDisk(await readScenes(paths)).length, SCENE_COUNT)
  const rewrites = writerRequests.filter((request) =>
    lastUserMessage(request).includes(REVIEWER_OBJECTION),
  )
  assert.equal(rewrites.length, 1, 'one rewrite, with the objection')
  assert.deepEqual(fragmentsOf(rewrites[0]), [2])
})

test('a reviewer objection is not blamed on the chosen writer, even when another scene falls with the network', async (t) => {
  const { base, events } = await fixture(t)
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).includes('chat/completions'))
      throw new Error('unexpected call to ' + url)
    const request = JSON.parse(init.body)
    const review = narrativeReviewResponse(request, new Set([2]))
    if (review) return review
    if (isPhaseOne(request)) return stream('```text\n' + sheet + '\n```')
    // La escena 5 nunca llega: la conexión de la persona se cae en cada pedido.
    if (fragmentsOf(request).includes(5)) throw new TypeError('fetch failed')
    return scenesResponse(request)
  })

  await assert.rejects(
    scenePromptsStage.run(await buildCreateVideoContext(base, 'fixture')),
  )

  assert.ok(
    !events.some(
      (event) =>
        event.type === 'prompt-model-trouble' &&
        event.code === 'llm_rescue_needed',
    ),
    'neither the network nor the reviewer is the writer failing',
  )
})

test('an objected scene whose rewrite never comes back keeps its original prompt and the run goes on', async (t) => {
  const { paths, base } = await fixture(t)
  let writerRequests = 0
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).includes('chat/completions'))
      throw new Error('unexpected call to ' + url)
    const request = JSON.parse(init.body)
    const review = narrativeReviewResponse(request, new Set([2]))
    if (review) return review
    if (isPhaseOne(request)) return stream('```text\n' + sheet + '\n```')
    writerRequests++
    // Después del primer lote, la escena 2 no vuelve: la conexión se cae en
    // cada reescritura que la incluye.
    if (writerRequests > 1 && fragmentsOf(request).includes(2))
      throw new TypeError('fetch failed')
    return scenesResponse(request)
  })

  await scenePromptsStage.run(await buildCreateVideoContext(base, 'fixture'))

  const stored = await readScenes(paths)
  assert.equal(promptsOnDisk(stored).length, SCENE_COUNT)
  assert.match(
    stored.find((scene) => scene.id === 2).imagePrompt,
    /number 2\./,
    'the original prompt of scene 2 stays',
  )
})

test('when every narrative judge echoes its input, Mi estilo still writes every prompt', async (t) => {
  const { paths, base } = await fixture(t)
  let reviewRequests = 0
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).includes('chat/completions'))
      throw new Error('unexpected call to ' + url)
    const request = JSON.parse(init.body)
    if (isReviewRequest(request)) {
      reviewRequests++
      // Lo que devolvía el juez caído el 2026-10-04: su propia entrada.
      return Response.json({
        choices: [{ message: { content: lastUserMessage(request) } }],
      })
    }
    if (isPhaseOne(request)) return stream('```text\n' + sheet + '\n```')
    return scenesResponse(request)
  })

  await scenePromptsStage.run(await buildCreateVideoContext(base, 'fixture'))

  assert.ok(reviewRequests > 0)
  assert.equal(promptsOnDisk(await readScenes(paths)).length, SCENE_COUNT)
})

test('a batch that dies does not burn the ones already harvested', async (t) => {
  const { paths, base } = await fixture(t)
  llm(t, (request, ids) =>
    ids.includes(SECOND_BATCH[0]) ? unauthorized() : scenesResponse(request),
  )
  const context = await buildCreateVideoContext(base, 'fixture')

  await assert.rejects(scenePromptsStage.run(context), { code: 'llm_auth' })

  // Lo que el primer lote ya pagó quedó escrito; lo del lote muerto, no.
  assert.deepEqual(promptsOnDisk(await readScenes(paths)), FIRST_BATCH)
})

test('resuming after that death only re-asks the scenes that are missing', async (t) => {
  const { paths, base } = await fixture(t)
  llm(t, (request, ids) =>
    ids.includes(SECOND_BATCH[0]) ? unauthorized() : scenesResponse(request),
  )
  await assert.rejects(
    scenePromptsStage.run(await buildCreateVideoContext(base, 'fixture')),
  )

  const second = llm(t, (request) => scenesResponse(request))
  await scenePromptsStage.run(await buildCreateVideoContext(base, 'fixture'))

  // LA aserción del dinero: ningún pedido vuelve a nombrar una escena pagada.
  for (const request of second) {
    if (isPhaseOne(request)) continue
    for (const id of fragmentsOf(request))
      assert.ok(
        SECOND_BATCH.includes(id),
        'la escena ' + id + ' ya estaba escrita y se volvió a pedir',
      )
  }
  assert.deepEqual(promptsOnDisk(await readScenes(paths)), [
    ...FIRST_BATCH,
    ...SECOND_BATCH,
  ])
})

test('an answer that lands after the cancellation is not written', async (t) => {
  const { paths, base, controller } = await fixture(t)
  llm(t, (request) => {
    // Cancelar ANTES de contestar: la respuesta llega tarde y no puede tocar
    // el disco (mismo contrato que el editor, donde cancelar deja la escena
    // como estaba).
    controller.abort()
    return scenesResponse(request)
  })
  const context = await buildCreateVideoContext(base, 'fixture')

  await assert.rejects(scenePromptsStage.run(context))

  assert.deepEqual(promptsOnDisk(await readScenes(paths)), [])
})

test('the successful run leaves on disk exactly what it always left', async (t) => {
  const { paths, base, events } = await fixture(t)
  llm(t, (request) => scenesResponse(request))
  const context = await buildCreateVideoContext(base, 'fixture')

  await scenePromptsStage.run(context)

  const scenes = await readScenes(paths)
  assert.deepEqual(promptsOnDisk(scenes), [...FIRST_BATCH, ...SECOND_BATCH])
  // El prompt final es el tejido, no el crudo: la identidad viaja pegada.
  for (const scene of scenes)
    assert.ok(
      scene.imagePrompt.includes('red-haired girl'),
      'la escena ' + scene.id + ' se persistió sin el tejido del sujeto',
    )
  // La barra nunca retrocede, aunque ahora haya dos fuentes de eventos.
  const progress = events
    .filter((event) => event.type === 'scene-prompts-progress')
    .map((event) => event.ready)
  for (let index = 1; index < progress.length; index++)
    assert.ok(progress[index] >= progress[index - 1], 'el progreso retrocedió')
  // Toda escena escrita se anunció al menos una vez.
  const announced = new Set(
    events
      .filter((event) => event.type === 'scene-prompt-ready')
      .map((event) => event.scene.id),
  )
  assert.equal(announced.size, SCENE_COUNT)
})

test('the partial write carries the character presence, not just the text', async (t) => {
  const { paths, base } = await fixture(t, {
    styleCharacterMode: 'own',
    characters: [
      {
        name: 'Mila',
        description: 'A red-haired girl with round green glasses.',
      },
    ],
  })
  llm(t, (request, ids) =>
    ids.includes(SECOND_BATCH[0]) ? unauthorized() : scenesResponse(request),
  )
  await assert.rejects(
    scenePromptsStage.run(await buildCreateVideoContext(base, 'fixture')),
  )

  const scenes = await readScenes(paths)
  for (const scene of scenes.filter((item) => FIRST_BATCH.includes(item.id)))
    assert.deepEqual(
      scene.charactersPresent,
      [0],
      'la escena ' + scene.id + ' se persistió sin su reparto',
    )
})

// La fase de imágenes le pasa a la lane un array con los prompts A REESCRIBIR
// en blanco. Ese blanco existe solo para decirle qué re-pedir: si llegara al
// disco, una pasada cortada a mitad BORRARÍA prompts buenos — peor que el bug
// que este guard protege. Por eso la persistencia se siembra con las escenas
// de verdad y solo reemplaza los ids que el motor entregó.
test('a cut recovery pass never leaves an emptied prompt on disk', async (t) => {
  const old = (id) => 'the previous prompt of scene ' + id + '. ' + tail
  const { paths, base } = await fixture(t, { prompts: old, images: true })
  llm(t, (request, ids) =>
    ids.includes(SECOND_BATCH[0]) ? unauthorized() : scenesResponse(request),
  )
  const context = await buildCreateVideoContext(base, 'fixture')
  const scenes = await readScenes(paths)
  const cleared = scenes.map((scene) => ({
    ...scene,
    imagePrompt: '',
    promptIsFallback: false,
  }))
  const persistence = createVerbatimPromptPersistence(context, scenes)

  await assert.rejects(
    runVerbatimLane(context, cleared, script, {
      onPrompts: persistence.onPrompts,
    }).finally(() => persistence.flush()),
  )

  const onDisk = await readScenes(paths)
  for (const scene of onDisk)
    assert.ok(
      (scene.imagePrompt ?? '').trim().length > 0,
      'la escena ' + scene.id + ' quedó con el prompt vaciado',
    )
  // Las que no se alcanzaron a reescribir conservan EL VIEJO, no uno nuevo.
  for (const scene of onDisk.filter((item) => SECOND_BATCH.includes(item.id)))
    assert.equal(scene.imagePrompt, old(scene.id))
})
