// Regeneración real del editor; proveedores HTTP simulados, proyectos temporales.

for (const photo of [false, true]) {
  test(
    'explicit name without subject tag preserves selected identity: ' + photo,
    async (t) => {
      const { base, paths } = await fixture(t, { photo })
      const requests = providers(t, (request) =>
        responseFor(request, withSubject.replace('[subject]', 'Elena')),
      )
      await regenerateSceneImages(
        command(base, { scenes: [{ id: 1, rewritePrompt: true }] }),
      )
      const stored = (await readScenes(paths))[0]
      assert.deepEqual(stored.charactersPresent, [0])
      assert.match(
        stored.imagePrompt,
        photo ? /attached reference image/ : /blue jacket/,
      )
      assert.equal(requests.image.length, 1)
    },
  )
}
test('same selection keeps multiple scene prompts in one batch', async (t) => {
  const { base } = await fixture(t)
  const requests = providers(t, (request) => responseFor(request, withSubject))
  await regenerateSceneImages(
    command(base, {
      scenes: [
        { id: 1, rewritePrompt: true },
        { id: 2, rewritePrompt: true },
      ],
    }),
  )
  assert.equal(requests.text.length, 1)
  assert.deepEqual(fragmentsOf(requests.text[0]), [1, 2])
  assert.equal(requests.image.length, 2)
})
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../pipeline/config/pipeline-config.ts'
import {
  resolveProjectPaths,
  sceneImageFile,
} from '../pipeline/project/paths.ts'
import { readScenes, writeScenes } from '../pipeline/project/scenes-file.ts'
import { buildCreateVideoContext } from '../pipeline/stages/context.ts'
import { updateScenes } from '../pipeline/commands/videos/update-scenes.ts'
import { regenerateSceneImages } from '../pipeline/commands/videos/regenerate-scene-images.ts'
import { runVerbatimLane } from '../pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts'
import { scenePromptsStage } from '../pipeline/stages/scene-prompts/scene-prompts.ts'
import { SCENE_WITHOUT_PROTAGONIST_RULE } from '../pipeline/prompts/verbatim-messages.ts'

const gem =
  'Render every scene as a hand-drawn watercolor illustration with indigo washes and rough paper. Keep the story action and setting.'
const tail =
  'Style: hand-drawn watercolor illustration, indigo washes on rough paper.'
const withSubject =
  '[subject] repairs a red antenna beside an orbital greenhouse, silver tools reflect a warm light.'
const withoutSubject =
  'An empty orbital greenhouse surrounds a repaired red antenna, silver tools rest on a bench under warm light.'
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
function fragmentsOf(request) {
  return [...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm)].map(
    (match) => Number(match[1]),
  )
}
function responseFor(request, prompt) {
  return stream(
    fragmentsOf(request)
      .map((id) => '((' + id + ')) ' + prompt + ' ' + tail)
      .join('\n\n'),
  )
}
async function fixture(
  t,
  {
    photo = true,
    custom = true,
    mode = 'own',
    initial = [0],
    second = false,
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-editor-selection-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  await mkdir(paths.charactersDirectory, { recursive: true })
  await writeFile(join(paths.charactersDirectory, 'reference.png'), bytes)
  const characters = [
    {
      name: 'Elena',
      description:
        'a young astronaut with brown hair, green eyes, a blue jacket and silver boots',
      mode: photo ? 'photo' : 'text',
      ...(photo ? { referenceImageFile: 'reference.png' } : {}),
    },
  ]
  if (second)
    characters.push({ ...characters[0], name: 'Bruno', isProtagonist: true })
  const options = {
    styleId: 'normal',
    imageProvider: 'fal',
    imageQuality: 'low',
    videoFormat: '16:9',
    characters,
    ...(custom
      ? {
          customStyle: {
            id: 'fixture',
            name: 'Watercolor',
            systemPrompt: gem,
            character: { mode },
          },
        }
      : {}),
  }
  const metadata = {
    id: 'fixture',
    name: 'Fixture',
    options,
    state: 'draft',
    completedStages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await writeFile(paths.metadataFile, JSON.stringify(metadata))
  await writeFile(
    paths.scriptFile,
    'Elena repairs a red antenna outside the station. The greenhouse glows at night.',
  )
  await writeScenes(
    paths,
    [1, 2].map((id) => ({
      id,
      text:
        id === 1
          ? 'Elena repairs the red antenna.'
          : 'The greenhouse glows at night.',
      startSeconds: (id - 1) * 4,
      endSeconds: id * 4,
      charactersPresent: initial,
      imagePrompt: 'Elena repairs the red antenna near the greenhouse. ' + tail,
    })),
  )
  await writeFile(sceneImageFile(paths, 1), bytes)
  await writeFile(sceneImageFile(paths, 2), bytes)
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
function command(base, payload) {
  return {
    ...base,
    job: { ...base.job, payload: { projectId: 'fixture', ...payload } },
  }
}
function providers(t, llm) {
  const requests = { text: [], image: [] }
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('chat/completions')) {
      const request = JSON.parse(init.body)
      requests.text.push(request)
      assert.ok(request.messages[0].content.startsWith(gem), 'gema intacta')
      return llm(request, requests.text.length)
    }
    if (String(url).startsWith('https://fal.run/')) {
      requests.image.push({ url: String(url), ...JSON.parse(init.body) })
      return Response.json({
        images: [{ url: 'https://fixture.invalid/image.png' }],
      })
    }
    assert.equal(
      String(url),
      'https://fixture.invalid/image.png',
      'sin proveedores reales',
    )
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  return requests
}
for (const photo of [true, false]) {
  for (const include of [false, true]) {
    test(
      'editor ' +
        (include ? 'includes' : 'excludes') +
        ' character ' +
        (photo ? 'photo' : 'text') +
        ' through the paid-image boundary',
      async (t) => {
        const { base, paths } = await fixture(t, {
          photo,
          initial: include ? [] : [0],
        })
        const sibling = (await readScenes(paths))[1]
        await updateScenes(
          command(base, {
            changes: [{ id: 1, charactersPresent: include ? [0] : [] }],
          }),
        )
        assert.equal(
          (await readScenes(paths))[0].imagePrompt,
          undefined,
          'prompt viejo invalidado',
        )
        assert.deepEqual(
          await readFile(sceneImageFile(paths, 1)),
          bytes,
          'imagen pagada conservada',
        )
        const requests = providers(t, (request) => {
          assert.deepEqual(fragmentsOf(request), [1], 'solo id objetivo')
          assert.equal(
            request.messages[0].content.includes(
              SCENE_WITHOUT_PROTAGONIST_RULE,
            ),
            !include,
          )
          assert.equal(
            request.messages.some((message) => message.role === 'assistant'),
            include && !photo,
          )
          return responseFor(request, include ? withSubject : withoutSubject)
        })
        await regenerateSceneImages(
          command(base, { scenes: [{ id: 1, rewritePrompt: false }] }),
        )
        const stored = await readScenes(paths)
        assert.deepEqual(stored[0].charactersPresent, include ? [0] : [])
        assert.deepEqual(stored[1], sibling, 'escena ajena intacta')
        assert.equal(
          requests.text.length,
          1,
          'un lote sin diseño extra de identidad',
        )
        assert.equal(requests.image.length, 1)
        const image = requests.image[0]
        assert.match(image.prompt, /indigo washes on rough paper/)
        if (include && photo) {
          assert.match(image.url, /\/edit$/)
          assert.equal(image.image_urls.length, 1)
          assert.match(image.prompt, /Elena/)
        } else {
          assert.equal(image.image_urls, undefined)
          assert.ok(!image.url.endsWith('/edit'))
        }
        if (!include)
          assert.doesNotMatch(
            image.prompt,
            /Elena|attached reference|main character|\[subject\]/i,
          )
        if (include && !photo) assert.match(image.prompt, /blue jacket/)
      },
    )
  }
}
test('equivalent selection preserves prompt and reroll does not spend text tokens', async (t) => {
  const { base, paths } = await fixture(t)
  const before = await readScenes(paths)
  await updateScenes(
    command(base, { changes: [{ id: 1, charactersPresent: [0] }] }),
  )
  assert.deepEqual(await readScenes(paths), before)
  const requests = providers(t, () => assert.fail('re-roll must reuse prompt'))
  await regenerateSceneImages(
    command(base, { scenes: [{ id: 1, rewritePrompt: false }] }),
  )
  assert.equal(requests.text.length, 0)
  assert.equal(requests.image.length, 1)
})
test('catalog selection persistence is unchanged', async (t) => {
  const { base, paths } = await fixture(t, { custom: false })
  const prompt = (await readScenes(paths))[0].imagePrompt
  await updateScenes(
    command(base, { changes: [{ id: 1, charactersPresent: [] }] }),
  )
  assert.equal((await readScenes(paths))[0].imagePrompt, prompt)
})
test('mixed selection batches remain separate and preserve both checkboxes', async (t) => {
  const { base, paths } = await fixture(t)
  await updateScenes(
    command(base, { changes: [{ id: 1, charactersPresent: [] }] }),
  )
  const requests = providers(t, (request) => {
    const absent = request.messages[0].content.includes(
      SCENE_WITHOUT_PROTAGONIST_RULE,
    )
    assert.deepEqual(fragmentsOf(request), absent ? [1] : [2])
    return responseFor(request, absent ? withoutSubject : withSubject)
  })
  await regenerateSceneImages(
    command(base, {
      scenes: [
        { id: 1, rewritePrompt: true },
        { id: 2, rewritePrompt: true },
      ],
    }),
  )
  assert.equal(requests.text.length, 2)
  assert.deepEqual(
    (await readScenes(paths)).map((scene) => scene.charactersPresent),
    [[], [0]],
  )
  assert.equal(
    requests.image.filter((request) => request.image_urls?.length).length,
    1,
  )
})
test('targeted rewrite does not request another invalidated scene', async (t) => {
  const { base, paths } = await fixture(t)
  await updateScenes(
    command(base, {
      changes: [1, 2].map((id) => ({ id, charactersPresent: [] })),
    }),
  )
  const requests = providers(t, (request) =>
    responseFor(request, withoutSubject),
  )
  await regenerateSceneImages(
    command(base, { scenes: [{ id: 1, rewritePrompt: false }] }),
  )
  assert.deepEqual(requests.text.flatMap(fragmentsOf), [1])
  assert.equal((await readScenes(paths))[1].imagePrompt, undefined)
  assert.deepEqual(await readFile(sceneImageFile(paths, 2)), bytes)
})
for (const include of [false, true]) {
  test(
    'contradictory ' +
      (include ? 'missing' : 'unwanted') +
      ' character retries before any image',
    async (t) => {
      const { base, paths } = await fixture(t, { initial: include ? [0] : [] })
      let attempts = 0
      const requests = providers(t, (request) => {
        attempts++
        const correct = include ? withSubject : withoutSubject
        return responseFor(
          request,
          attempts === 1 ? (include ? withoutSubject : withSubject) : correct,
        )
      })
      await regenerateSceneImages(
        command(base, { scenes: [{ id: 1, rewritePrompt: true }] }),
      )
      assert.equal(attempts, 2)
      assert.equal(requests.image.length, 1)
      assert.deepEqual(
        (await readScenes(paths))[0].charactersPresent,
        include ? [0] : [],
      )
    },
  )
  test(
    'persistent contradiction exhausts rescue with zero images and old asset intact: ' +
      include,
    async (t) => {
      const { base, paths } = await fixture(t, { initial: include ? [0] : [] })
      const requests = providers(t, (request) =>
        responseFor(request, include ? withoutSubject : withSubject),
      )
      await assert.rejects(
        regenerateSceneImages(
          command(base, { scenes: [{ id: 1, rewritePrompt: true }] }),
        ),
        { code: 'llm_empty_response' },
      )
      assert.equal(requests.image.length, 0)
      assert.ok(
        new Set(requests.text.map((request) => request.model)).size > 1,
        'rescata con otro modelo',
      )
      assert.deepEqual(await readFile(sceneImageFile(paths, 1)), bytes)
      assert.equal((await readScenes(paths))[0].imagePrompt, undefined)
    },
  )
}
test('late response after cancellation cannot persist or dispatch an image', async (t) => {
  const { base, paths, controller } = await fixture(t, { initial: [] })
  const requests = providers(t, (request) => {
    controller.abort()
    return responseFor(request, withoutSubject)
  })
  await assert.rejects(
    regenerateSceneImages(
      command(base, { scenes: [{ id: 1, rewritePrompt: true }] }),
    ),
  )
  assert.equal(requests.image.length, 0)
  assert.equal((await readScenes(paths))[0].imagePrompt, undefined)
})
test('editor selecting the non-protagonist keeps its real index and identity', async (t) => {
  const { base, paths } = await fixture(t, { second: true, initial: [1] })
  await updateScenes(
    command(base, { changes: [{ id: 1, charactersPresent: [0] }] }),
  )
  const requests = providers(t, (request) => responseFor(request, withSubject))
  await regenerateSceneImages(
    command(base, { scenes: [{ id: 1, rewritePrompt: false }] }),
  )
  assert.deepEqual((await readScenes(paths))[0].charactersPresent, [0])
  assert.match(requests.image[0].prompt, /Elena/)
  assert.doesNotMatch(requests.image[0].prompt, /Bruno/)
})
test('two selected references stay attached as a single cast', async (t) => {
  const { base, paths } = await fixture(t, { second: true })
  await updateScenes(
    command(base, { changes: [{ id: 1, charactersPresent: [0, 1] }] }),
  )
  const requests = providers(t, (request) => responseFor(request, withSubject))
  await regenerateSceneImages(
    command(base, { scenes: [{ id: 1, rewritePrompt: false }] }),
  )
  assert.deepEqual((await readScenes(paths))[0].charactersPresent, [0, 1])
  assert.equal(requests.image[0].image_urls.length, 2)
  assert.match(requests.image[0].prompt, /Elena and Bruno/)
})
test('fresh creation still lets the gem infer presence', async (t) => {
  const { base, paths } = await fixture(t)
  const context = await buildCreateVideoContext(base, 'fixture')
  const scenes = (await readScenes(paths)).map((scene) => ({
    ...scene,
    imagePrompt: undefined,
  }))
  providers(t, (request) =>
    stream(
      '((' +
        fragmentsOf(request)[0] +
        ')) ' +
        withSubject +
        ' ' +
        tail +
        '\n\n((2)) ' +
        withoutSubject +
        ' ' +
        tail,
    ),
  )
  const result = await runVerbatimLane(
    context,
    scenes,
    'Elena repairs an antenna; the greenhouse glows.',
  )
  assert.deepEqual(
    result.scenes.map((scene) => scene.charactersPresent),
    [[0], []],
  )
})
test('generic/none gem declaration does not override the editor explicit selection', async (t) => {
  const { base, paths } = await fixture(t, { mode: 'none', initial: [0] })
  const requests = providers(t, (request) => responseFor(request, withSubject))
  await regenerateSceneImages(
    command(base, { scenes: [{ id: 1, rewritePrompt: true }] }),
  )
  assert.deepEqual((await readScenes(paths))[0].charactersPresent, [0])
  assert.equal(requests.image[0].image_urls.length, 1)
})
test('stage skips without spending when target is valid even if another prompt is pending', async (t) => {
  const { base, paths } = await fixture(t)
  const stored = await readScenes(paths)
  delete stored[1].imagePrompt
  await writeScenes(paths, stored)
  const context = await buildCreateVideoContext(base, 'fixture')
  context.regenerateSceneIds = new Set([1])
  providers(t, () => assert.fail('no missing target'))
  await scenePromptsStage.run(context)
  assert.deepEqual(await readScenes(paths), stored)
})
