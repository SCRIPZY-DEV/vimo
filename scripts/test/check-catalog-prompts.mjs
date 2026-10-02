// Regresiones herméticas de Catálogo: comandos/stages reales, HTTP simulado.
// Todos los artefactos viven en un mkdtemp; nunca usa cuentas ni proyectos reales.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { VISUAL_STYLES } from '../../pipeline/prompts/visual-styles.ts'
import {
  resolveProjectPaths,
  sceneImageFile,
} from '../../pipeline/project/paths.ts'
import { readScenes, writeScenes } from '../../pipeline/project/scenes-file.ts'
import { runStages } from '../../pipeline/runner/run-stages.ts'
import { scenePromptsStage } from '../../pipeline/stages/scene-prompts/scene-prompts.ts'
import { imagesStage } from '../../pipeline/stages/images/images.ts'
import { directScenes } from '../../pipeline/stages/scene-prompts/scene-director.ts'
import { guaranteePrompts } from '../../pipeline/stages/scene-prompts/prompt-writer.ts'
import { bodyWithoutFinalClauses } from '../../pipeline/stages/shared/prompt-safety.ts'
import { hasCatalogPrompt } from '../../pipeline/stages/shared/catalog-prompt.ts'
import {
  createCatalogSceneLlm,
  CATALOG_MODEL_IDS,
  CATALOG_LLM_CONCURRENCY,
} from '../../pipeline/stages/shared/catalog-llm.ts'

const fragments = [
  'Elena repara la antena roja en el exterior de la estación espacial.',
  'Elena cultiva plantas verdes dentro del invernadero de la estación.',
  'Elena observa el océano azul de la Tierra desde una ventana circular.',
  'Elena aterriza en un desierto naranja junto a una cápsula plateada.',
]
const descriptions = [
  'Elena repairs a red antenna outside an orbital station, using a silver wrench, Earth behind her, a wide shot.',
  'Elena waters green plants inside the station greenhouse, translucent leaves and irrigation pipes, a close-up.',
  'Elena watches the blue ocean of Earth through a round window inside the observation module, seen from behind.',
  'Elena lands beside a silver capsule in an orange desert, dust settling around her boots, a low-angle shot.',
]
const scenes = fragments.map((text, index) => ({
  id: index + 1,
  text,
  startSeconds: index * 4,
  endSeconds: (index + 1) * 4,
  direction: {
    treatment: 'action',
    place: ['antenna', 'greenhouse', 'observation module', 'desert'][index],
    emotion: 'focused',
  },
  charactersPresent: [0],
}))
const bible =
  'ERA: contemporary. An orbital station with separate antenna, greenhouse and observation modules; the journey ends in a desert.'

function stream(content, finish = 'stop') {
  return new Response(
    'data: ' +
      JSON.stringify({
        choices: [{ delta: { content }, finish_reason: finish }],
      }) +
      '\n\ndata: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
function baseContext(timeoutMs = 1000, controller = new AbortController()) {
  const events = []
  return {
    job: {
      jobId: 'catalog-fixture',
      apiKeys: { deepinfra: 'fake', fal: 'fake', evolink: 'fake' },
      binaryPaths: {},
    },
    config: resolvePipelineConfig({ llm: { timeoutMs } }),
    signal: controller.signal,
    emitter: {
      emit(event) {
        events.push(event)
      },
    },
    events,
  }
}
async function fixture(t, initial = scenes, styleId = 'cartoon', controller) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-catalog-regression-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(root, 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  await writeScenes(paths, structuredClone(initial))
  await writeFile(paths.scriptFile, fragments.join(' '))
  return {
    ...baseContext(1000, controller),
    paths,
    options: {
      styleId,
      imageProvider: 'fal',
      characters: [
        {
          name: 'Elena',
          description: 'adult astronaut in a white and blue spacesuit',
          mode: 'text',
        },
      ],
      characterFrequency: 'always',
    },
    visualBible: Promise.resolve(bible),
  }
}
function writerOptions(context, overrides = {}) {
  return {
    llm: createCatalogSceneLlm(context),
    style: VISUAL_STYLES.cartoon,
    fullScript: fragments.join(' '),
    visualBible: bible,
    characters: [
      {
        name: 'Elena',
        description: 'adult astronaut in a white and blue spacesuit',
      },
    ],
    imageTextLanguage: 'Spanish',
    signal: context.signal,
    ...overrides,
  }
}
function requestScene(request) {
  const user = request.messages.at(-1).content
  const fragment =
    user.match(
      /--- FRAGMENT[^\n]*---\n([\s\S]*?)\n--- END FRAGMENT ---/,
    )?.[1] ?? ''
  return fragments.findIndex((text) => fragment.includes(text))
}
// La suite valida transporte, checkpoints y mapeo, no calidad del revisor.
// Las llamadas reales de revisión se simulan aparte del stream del redactor:
// aprobar acá nunca cuenta como otro intento del modelo de Catálogo.
function narrativeReviewResponse(request) {
  if (
    !request.messages[0].content.startsWith(
      'You audit the FULL narrative meaning',
    )
  )
    return
  const { candidates } = JSON.parse(request.messages.at(-1).content)
  assert.ok(Array.isArray(candidates) && candidates.length > 0)
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
              reason:
                'Explicit approval fixture for catalog transport regression only.',
            })),
          }),
        },
      },
    ],
  })
}
function promptResponse(request) {
  const review = narrativeReviewResponse(request)
  if (review) return review
  const index = requestScene(request)
  assert.ok(
    index >= 0,
    'the exact current narrative fragment must reach the writer',
  )
  return stream(JSON.stringify({ prompt_imagen: descriptions[index] }))
}

for (const fault of [
  '429',
  '503',
  'timeout',
  'stream-error',
  'truncated',
  'empty',
  'bad-json',
]) {
  test('catalog rotates on ' + fault + ' with the same context', async (t) => {
    const calls = []
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      const request = JSON.parse(init.body)
      calls.push(request)
      assert.equal(request.stream, true)
      if (request.model === CATALOG_MODEL_IDS[0]) {
        if (fault === 'timeout') await delay(500, null, { signal: init.signal })
        if (fault === 'stream-error')
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error('cut'))
              },
            }),
          )
        if (fault === 'truncated') return stream('partial', 'length')
        if (fault === 'empty') return stream('')
        if (fault === 'bad-json') return stream('{}')
        return new Response('', { status: Number(fault) })
      }
      return stream('{"ok":true}')
    })
    const llm = createCatalogSceneLlm(baseContext(25))
    const request = {
      systemPrompt: 'Keep watercolor art.',
      userPrompt: fragments.join(' '),
      validate: (content) => content === '{"ok":true}',
    }
    assert.equal(await llm.generate(request), '{"ok":true}')
    assert.deepEqual(
      calls.map((call) => call.model),
      CATALOG_MODEL_IDS.slice(0, 2),
    )
    assert.deepEqual(calls[0].messages, calls[1].messages)
  })
}
for (const status of [401, 402, 403]) {
  test('catalog does not rotate account error ' + status, async (t) => {
    let calls = 0
    t.mock.method(globalThis, 'fetch', async () => {
      calls++
      return new Response(
        status === 402 ? 'insufficient balance' : 'invalid key',
        { status },
      )
    })
    const llm = createCatalogSceneLlm(baseContext())
    await assert.rejects(llm.generate({ systemPrompt: '', userPrompt: '' }))
    await assert.rejects(llm.generate({ systemPrompt: '', userPrompt: '' }))
    assert.equal(calls, 1)
  })
}
test('catalog shares unavailable models and limits concurrency across requests', async (t) => {
  let active = 0
  let maximum = 0
  const calls = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body)
    calls.push(request.model)
    if (request.model === CATALOG_MODEL_IDS[0])
      return new Response('', { status: 503 })
    active++
    maximum = Math.max(maximum, active)
    await delay(10)
    active--
    return stream('usable narrative response')
  })
  const context = baseContext()
  const llm = createCatalogSceneLlm(context)
  assert.equal(llm, createCatalogSceneLlm(context))
  await llm.generate({ systemPrompt: '', userPrompt: '' })
  await Promise.all(
    Array.from({ length: 16 }, () =>
      llm.generate({ systemPrompt: '', userPrompt: '' }),
    ),
  )
  assert.equal(
    calls.filter((model) => model === CATALOG_MODEL_IDS[0]).length,
    1,
  )
  assert.ok(maximum > 1 && maximum <= CATALOG_LLM_CONCURRENCY)
})
test('a brief network outage on every model retries instead of exhausting the catalog', async (t) => {
  let outage = true
  const calls = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls.push(JSON.parse(init.body).model)
    if (outage) {
      outage = calls.length < CATALOG_MODEL_IDS.length
      throw new TypeError('fetch failed')
    }
    return stream('{"ok":true}')
  })
  const context = baseContext()
  const pending = createCatalogSceneLlm(context).generate({
    systemPrompt: '',
    userPrompt: 'story',
    validate: (content) => content === '{"ok":true}',
  })
  assert.equal(await pending, '{"ok":true}')
  // Espera real de 2 s. Tras el parpadeo vuelve a probar desde el primero: nadie quedó descartado.
  assert.deepEqual(calls, [...CATALOG_MODEL_IDS, CATALOG_MODEL_IDS[0]])
  assert.ok(
    context.events.some((event) =>
      /transient failures; retrying/.test(event.message ?? ''),
    ),
  )
})
test('persistent network failure still exhausts the catalog after bounded retries', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls.push(JSON.parse(init.body).model)
    throw new TypeError('fetch failed')
  })
  const pending = createCatalogSceneLlm(baseContext()).generate({
    systemPrompt: '',
    userPrompt: 'story',
  })
  await assert.rejects(pending, { code: 'catalog_prompts_incomplete' })
  // Esperas reales de 2 s + 5 s. Tres barridos y cada modelo cae tras sus tres strikes: no hay un cuarto.
  assert.equal(calls.length, CATALOG_MODEL_IDS.length * 3)
})
test('already cancelled writer never saves filler (original repro)', async () => {
  const controller = new AbortController()
  controller.abort()
  const context = baseContext(100, controller)
  let saved = 0
  await assert.rejects(
    guaranteePrompts(
      scenes,
      writerOptions(context, {
        llm: {
          generate() {
            assert.fail('must not call')
          },
        },
        onSceneProcessed() {
          saved++
        },
      }),
    ),
  )
  assert.equal(saved, 0)
})
test('empty response cannot become a realism-only prompt', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return stream('{"prompt_imagen":""}')
  })
  const context = baseContext()
  let saved = 0
  await assert.rejects(
    guaranteePrompts(
      [scenes[0]],
      writerOptions(context, {
        style: VISUAL_STYLES.normal,
        onSceneProcessed() {
          saved++
        },
      }),
    ),
    { code: 'catalog_prompts_incomplete' },
  )
  assert.equal(calls, 3)
  assert.equal(saved, 0)
})
test('style suffix alone is not a reusable catalog checkpoint', () => {
  assert.equal(
    hasCatalogPrompt(
      { ...scenes[0], imagePrompt: VISUAL_STYLES.normal.template.styleSuffix },
      VISUAL_STYLES.normal,
    ),
    false,
  )
})

function directorReply(request) {
  const ids = [
    ...request.messages.at(-1).content.matchAll(/^(\d+) \[character:/gm),
  ].map((match) => Number(match[1]))
  return JSON.stringify({
    escenas: ids.map((id) => ({
      id,
      tratamiento: 'objeto',
      lugar: 'station module ' + id,
      emocion: 'hopeful',
    })),
  })
}
const directorOptions = () => ({
  styleId: 'cartoon',
  isStickmanStyle: false,
  characters: [],
  imageTextLanguage: 'Spanish',
  signal: new AbortController().signal,
})
for (const fault of ['503', 'partial', 'invalid']) {
  test(
    'director rotates for ' + fault + ' instead of inventing a plan',
    async (t) => {
      const models = []
      t.mock.method(globalThis, 'fetch', async (_url, init) => {
        const request = JSON.parse(init.body)
        models.push(request.model)
        if (request.model === CATALOG_MODEL_IDS[0]) {
          if (fault === '503') return new Response('', { status: 503 })
          return stream(
            fault === 'partial'
              ? '{"escenas":[{"id":1,"tratamiento":"objeto","lugar":"module","emocion":"hopeful"}]}'
              : '{}',
          )
        }
        return stream(directorReply(request))
      })
      const result = await directScenes(
        createCatalogSceneLlm(baseContext()),
        scenes.slice(0, 2).map((scene) => ({ ...scene, direction: undefined })),
        fragments.join(' '),
        directorOptions(),
      )
      assert.deepEqual(models, CATALOG_MODEL_IDS.slice(0, 2))
      assert.ok(
        result.every(
          (scene) => scene.direction?.place && !scene.direction.provisional,
        ),
      )
    },
  )
}
test('director uses concurrent small batches for normal-sized videos', async (t) => {
  let active = 0
  let maximum = 0
  let largest = 0
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body)
    const reply = directorReply(request)
    largest = Math.max(largest, JSON.parse(reply).escenas.length)
    active++
    maximum = Math.max(maximum, active)
    await delay(15)
    active--
    return stream(reply)
  })
  const input = Array.from({ length: 24 }, (_, index) => ({
    id: index + 1,
    text: 'Unique story moment ' + index,
  }))
  const result = await directScenes(
    createCatalogSceneLlm(baseContext()),
    input,
    'Full story',
    directorOptions(),
  )
  assert.equal(result.length, 24)
  assert.ok(maximum >= 2)
  assert.ok(largest <= 12)
})
test('all director models fail: no provisional plan returned', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('', { status: 503 }),
  )
  await assert.rejects(
    directScenes(
      createCatalogSceneLlm(baseContext()),
      [{ ...scenes[0], direction: undefined }],
      fragments.join(' '),
      directorOptions(),
    ),
    { code: 'catalog_prompts_incomplete' },
  )
})

test('cancel mid-writing then resume: valid checkpoints only, correct scene mapping', async (t) => {
  const controller = new AbortController()
  const context = await fixture(t, scenes, 'cartoon', controller)
  let resumed = false
  const calls = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body)
    const review = narrativeReviewResponse(request)
    if (review) return review
    const index = requestScene(request)
    calls.push({ index, resumed })
    if (!resumed && index > 0) await delay(5000, null, { signal: init.signal })
    return promptResponse(request)
  })
  const running = scenePromptsStage.run(context)
  for (
    let attempt = 0;
    attempt < 100 &&
    !context.events.some((event) => event.type === 'scene-prompt-ready');
    attempt++
  )
    await delay(5)
  controller.abort()
  await assert.rejects(running)
  const partial = await readScenes(context.paths)
  assert.equal(partial.filter((scene) => scene.imagePrompt).length, 1)
  assert.ok(partial.every((scene) => scene.promptIsFallback !== true))
  const before = await readFile(context.paths.scenesFile, 'utf8')
  await delay(20)
  assert.equal(
    await readFile(context.paths.scenesFile, 'utf8'),
    before,
    'no late checkpoint writes',
  )
  resumed = true
  const next = {
    ...context,
    ...baseContext(),
    visualBible: Promise.resolve(bible),
  }
  assert.equal(await scenePromptsStage.skip(next), false)
  await scenePromptsStage.run(next)
  const completed = await readScenes(next.paths)
  assert.equal(
    calls.filter((call) => call.resumed && call.index === 0).length,
    0,
  )
  assert.equal(
    new Set(completed.map((scene) => scene.imagePrompt)).size,
    scenes.length,
  )
  for (let index = 0; index < completed.length; index++)
    assert.equal(
      bodyWithoutFinalClauses(completed[index].imagePrompt),
      descriptions[index],
    )
  assert.equal(await scenePromptsStage.skip(next), true)
  const progress = next.events.filter(
    (event) => event.type === 'scene-prompts-progress',
  )
  assert.equal(progress.at(-1).ready, 4)
})

for (const fault of ['503', 'empty', 'suffix']) {
  test('prompts → images gate: zero image calls after ' + fault, async (t) => {
    const context = await fixture(t, scenes, 'normal')
    let imageCalls = 0
    t.mock.method(globalThis, 'fetch', async (url) => {
      if (!String(url).includes('chat/completions')) {
        imageCalls++
        assert.fail('must not reach image provider')
      }
      if (fault === '503') return new Response('', { status: 503 })
      return stream(
        JSON.stringify({
          prompt_imagen:
            fault === 'suffix' ? VISUAL_STYLES.normal.template.styleSuffix : '',
        }),
      )
    })
    await assert.rejects(runStages([scenePromptsStage, imagesStage], context), {
      code: 'catalog_prompts_incomplete',
    })
    assert.equal(imageCalls, 0)
    assert.ok(
      !context.events.some(
        (event) =>
          event.type === 'stage-completed' && event.stageId === 'scene-prompts',
      ),
    )
    assert.ok(
      (await readScenes(context.paths)).every(
        (scene) => !scene.imagePrompt && scene.promptIsFallback !== true,
      ),
    )
  })
}
test('image stage independently rejects legacy filler without sending an image', async (t) => {
  const context = await fixture(t, [
    { ...scenes[0], imagePrompt: descriptions[0], promptIsFallback: true },
  ])
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    assert.fail('no image requests')
  })
  await assert.rejects(imagesStage.run(context), {
    code: 'catalog_prompts_incomplete',
  })
  assert.equal(calls, 0)
})
test('resume repairs old filler while preserving valid prompts', async (t) => {
  const input = [
    { ...scenes[0], imagePrompt: descriptions[0], promptIsFallback: false },
    {
      ...scenes[1],
      imagePrompt: 'An astronaut in a generic room with the same background.',
      promptIsFallback: true,
    },
  ]
  const context = await fixture(t, input)
  const ids = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body)
    const review = narrativeReviewResponse(request)
    if (review) return review
    if (request.messages[0].content.includes('VISUAL DIRECTOR'))
      return stream(directorReply(request))
    ids.push(requestScene(request) + 1)
    assert.equal(
      request.messages[0].content,
      VISUAL_STYLES.cartoon.systemPrompt,
    )
    assert.match(request.messages[1].content, /Elena/)
    return promptResponse(request)
  })
  assert.equal(await scenePromptsStage.skip(context), false)
  await scenePromptsStage.run(context)
  assert.deepEqual(ids, [2])
  const completed = await readScenes(context.paths)
  assert.equal(completed[0].imagePrompt, descriptions[0])
  assert.equal(
    bodyWithoutFinalClauses(completed[1].imagePrompt),
    descriptions[1],
  )
  assert.equal(completed[1].promptIsFallback, false)
})
test('paid images remain untouched; legacy pending tasks block rewriting', async (t) => {
  const bad = {
    ...scenes[0],
    imagePrompt: 'An astronaut in a generic room.',
    promptIsFallback: true,
  }
  const context = await fixture(t, [bad])
  await writeFile(sceneImageFile(context.paths, 1), 'existing paid image')
  assert.equal(await scenePromptsStage.skip(context), true)
  assert.equal(
    await readFile(sceneImageFile(context.paths, 1), 'utf8'),
    'existing paid image',
  )
  const pending = await fixture(t, [
    {
      ...bad,
      imageTask: {
        provider: 'evolink',
        taskId: 'paid-fixture',
        hash: 'fixture',
      },
    },
  ])
  await assert.rejects(scenePromptsStage.skip(pending), {
    code: 'catalog_prompt_pending_image',
  })
  assert.deepEqual((await readScenes(pending.paths))[0].imageTask, {
    provider: 'evolink',
    taskId: 'paid-fixture',
    hash: 'fixture',
  })
})
test('selective regeneration writes only requested ids', async (t) => {
  const context = await fixture(t, scenes.slice(0, 2))
  context.regenerateSceneIds = new Set([2])
  t.mock.method(globalThis, 'fetch', async (_url, init) =>
    promptResponse(JSON.parse(init.body)),
  )
  await scenePromptsStage.run(context)
  const stored = await readScenes(context.paths)
  assert.deepEqual(stored[0], scenes[0])
  assert.equal(bodyWithoutFinalClauses(stored[1].imagePrompt), descriptions[1])
})

test('a silent SSE EOF is retried on another model, never accepted as a prompt', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body)
    calls.push(request.model)
    return request.model === CATALOG_MODEL_IDS[0]
      ? stream(descriptions[0], null)
      : stream(descriptions[0])
  })
  assert.equal(
    await createCatalogSceneLlm(baseContext()).generate({
      systemPrompt: '',
      userPrompt: fragments[0],
    }),
    descriptions[0],
  )
  assert.deepEqual(calls, CATALOG_MODEL_IDS.slice(0, 2))
})
test('director → prompts → Fal preserves each narrative and style after model failure', async (t) => {
  const context = await fixture(
    t,
    scenes.map((scene) => ({ ...scene, direction: undefined })),
  )
  const imagePrompts = []
  let firstFailed = false
  const imageBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
    'base64',
  )
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('chat/completions')) {
      const request = JSON.parse(init.body)
      const review = narrativeReviewResponse(request)
      if (review) return review
      if (request.model === CATALOG_MODEL_IDS[0]) {
        firstFailed = true
        return new Response('', { status: 503 })
      }
      if (request.messages[0].content.includes('VISUAL DIRECTOR'))
        return stream(directorReply(request))
      assert.equal(
        request.messages[0].content,
        VISUAL_STYLES.cartoon.systemPrompt,
      )
      assert.match(request.messages[1].content, /Elena/)
      return promptResponse(request)
    }
    if (String(url).startsWith('https://fal.run/')) {
      const request = JSON.parse(init.body)
      imagePrompts.push(request.prompt)
      assert.equal(
        context.events.filter((event) => event.type === 'scene-prompt-ready')
          .length,
        4,
        'all prompts must precede the first paid image request',
      )
      return Response.json({
        images: [{ url: 'https://fixture.invalid/image.png' }],
      })
    }
    assert.equal(String(url), 'https://fixture.invalid/image.png')
    return new Response(imageBytes, {
      headers: { 'content-type': 'image/png' },
    })
  })
  await runStages([scenePromptsStage, imagesStage], context)
  assert.equal(firstFailed, true)
  assert.equal(imagePrompts.length, 4)
  assert.equal(new Set(imagePrompts).size, 4)
  for (const description of descriptions)
    assert.ok(imagePrompts.some((prompt) => prompt.includes(description)))
  for (const scene of scenes)
    assert.deepEqual(
      await readFile(sceneImageFile(context.paths, scene.id)),
      imageBytes,
    )
})
test('late text response after cancellation cannot persist a checkpoint', async (t) => {
  const controller = new AbortController()
  const context = await fixture(t, scenes.slice(0, 1), 'cartoon', controller)
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    controller.abort()
    // A misbehaving adapter resolves even after abort.
    return promptResponse(JSON.parse(init.body))
  })
  await assert.rejects(scenePromptsStage.run(context))
  assert.equal((await readScenes(context.paths))[0].imagePrompt, '')
  assert.ok(
    !context.events.some((event) => event.type === 'scene-prompt-ready'),
  )
})

test('identical prompts for different fragments rotate instead of repeating the same scene', async (t) => {
  const context = await fixture(t)
  let switches = 0
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body)
    const review = narrativeReviewResponse(request)
    if (review) return review
    if (request.model === CATALOG_MODEL_IDS[0])
      return stream(
        JSON.stringify({
          prompt_imagen: descriptions[0].replaceAll(
            ' ',
            ' '.repeat(requestScene(request) + 1),
          ),
        }),
      )
    switches++
    return promptResponse(request)
  })
  await scenePromptsStage.run(context)
  const stored = await readScenes(context.paths)
  assert.equal(new Set(stored.map((scene) => scene.imagePrompt)).size, 4)
  assert.equal(switches, 3)
})
test('classifier failure cannot persist invented character presence', async (t) => {
  const context = await fixture(t, [
    { ...scenes[0], charactersPresent: undefined },
  ])
  delete context.options.characterFrequency
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('', { status: 503 }),
  )
  await assert.rejects(scenePromptsStage.run(context), {
    code: 'catalog_prompts_incomplete',
  })
  assert.equal(
    (await readScenes(context.paths))[0].charactersPresent,
    undefined,
  )
})
test('exhausted timeouts are bounded to one attempt per model', async (t) => {
  const context = baseContext(20)
  const calls = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls.push(JSON.parse(init.body).model)
    await delay(5000, null, { signal: init.signal })
    assert.fail('deadline must abort')
  })
  const start = Date.now()
  await assert.rejects(
    createCatalogSceneLlm(context).generate({
      systemPrompt: '',
      userPrompt: 'story',
    }),
    { code: 'catalog_prompts_incomplete' },
  )
  assert.deepEqual(calls, CATALOG_MODEL_IDS)
  assert.ok(Date.now() - start < 500)
})

test('content-policy rewrite failure never sends a generic second image', async (t) => {
  const context = await fixture(t, [
    { ...scenes[0], imagePrompt: descriptions[0] },
  ])
  let imageCalls = 0
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('chat/completions'))
      return new Response('', { status: 503 })
    assert.ok(String(url).startsWith('https://fal.run/'))
    imageCalls++
    return Response.json(
      { type: 'content_policy_violation', detail: 'content rejected' },
      { status: 422 },
    )
  })
  await assert.rejects(imagesStage.run(context), {
    code: 'catalog_prompts_incomplete',
  })
  assert.equal(imageCalls, 1)
  assert.ok(
    (await readScenes(context.paths)).every((scene) => !scene.promptIsFallback),
  )
})
test('cancel during director planning never persists a blind plan', async (t) => {
  const controller = new AbortController()
  const context = await fixture(
    t,
    [{ ...scenes[0], direction: undefined }],
    'cartoon',
    controller,
  )
  t.mock.method(globalThis, 'fetch', async () => {
    controller.abort()
    return stream('{}')
  })
  await assert.rejects(scenePromptsStage.run(context))
  const stored = await readScenes(context.paths)
  assert.equal(stored[0].direction, undefined)
  assert.equal(stored[0].imagePrompt, '')
})
