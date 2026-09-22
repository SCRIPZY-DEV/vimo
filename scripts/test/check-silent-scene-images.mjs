// Regresión: una escena MUDA del corte clásico (texto vacío, el corte cayó en
// una pausa de la narración) recibe prompt e imagen desde la narración vecina.
// Stages y comandos reales con HTTP simulado; todo vive en un mkdtemp — nunca
// usa claves ni proyectos reales.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { SILENT_PAUSE_BLOCK } from '../../pipeline/prompts/scene-prompt-blocks.ts'
import { VISUAL_STYLES } from '../../pipeline/prompts/visual-styles.ts'
import {
  resolveProjectPaths,
  sceneImageFile,
} from '../../pipeline/project/paths.ts'
import { readScenes, writeScenes } from '../../pipeline/project/scenes-file.ts'
import { runStages } from '../../pipeline/runner/run-stages.ts'
import { regenerateSceneImages } from '../../pipeline/commands/videos/regenerate-scene-images.ts'
import { cutScenesByTime } from '../../pipeline/stages/scene-cuts/scene-cuts.ts'
import { scenePromptsStage } from '../../pipeline/stages/scene-prompts/scene-prompts.ts'
import { imagesStage } from '../../pipeline/stages/images/images.ts'
import { hasCatalogPrompt } from '../../pipeline/stages/shared/catalog-prompt.ts'

// El proyecto real que disparó el fix: 327 y 329 completas, 328 muda entre
// ambas (una pausa de la narración más larga que la ventana de escena).
const before = 'La antena roja parpadea en el exterior de la estación espacial.'
const after =
  'El océano azul de la Tierra gira despacio bajo la ventana circular.'
const descriptions = {
  327: 'A red antenna blinks outside an orbital station, Earth behind it, a wide shot.',
  329: 'The blue ocean of Earth turns slowly under a round window of the observation module, seen from inside.',
}
const silentDescription =
  'A quiet close-up of the antenna warning light fading over the station hull, the glow of Earth below, a slow transitional beat.'
const bible =
  'ERA: contemporary. An orbital station with a red antenna and a round observation window over Earth.'
const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const NEIGHBOURS = [327, 329]

function silentScenes() {
  return [
    {
      id: 327,
      text: before,
      startSeconds: 0,
      endSeconds: 4,
      imagePrompt: descriptions[327],
      promptIsFallback: false,
    },
    { id: 328, text: '', startSeconds: 4, endSeconds: 8 },
    {
      id: 329,
      text: after,
      startSeconds: 8,
      endSeconds: 12,
      imagePrompt: descriptions[329],
      promptIsFallback: false,
    },
  ]
}

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
function baseContext(controller = new AbortController()) {
  const events = []
  return {
    job: {
      jobId: 'silent-scene-fixture',
      apiKeys: { deepinfra: 'fake', fal: 'fake', evolink: 'fake' },
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
// Proyecto de Catálogo SIN personajes: el guard es sobre el silencio, no
// sobre la presencia. Las vecinas ya tienen prompt válido e imagen en disco.
async function fixture(t, initial = silentScenes()) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-silent-scene-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(root, 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  await writeScenes(paths, structuredClone(initial))
  await writeFile(paths.scriptFile, `${before} ${after}`)
  for (const id of NEIGHBOURS)
    await writeFile(sceneImageFile(paths, id), imageBytes)
  return {
    ...baseContext(),
    paths,
    options: { styleId: 'cartoon', imageProvider: 'fal', characters: [] },
    visualBible: Promise.resolve(bible),
  }
}
// El mismo proyecto como lo ve el editor: project.json en disco y el comando
// real de regeneración (buildCreateVideoContext lee la carpeta).
async function editorFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-silent-scene-editor-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  const options = {
    styleId: 'cartoon',
    imageProvider: 'fal',
    imageQuality: 'low',
    videoFormat: '16:9',
    characters: [],
  }
  await writeFile(
    paths.metadataFile,
    JSON.stringify({
      id: 'fixture',
      name: 'Fixture',
      options,
      state: 'draft',
      completedStages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  )
  await writeFile(paths.scriptFile, `${before} ${after}`)
  await writeScenes(paths, silentScenes())
  for (const id of NEIGHBOURS)
    await writeFile(sceneImageFile(paths, id), imageBytes)
  const base = {
    ...baseContext(),
    job: {
      jobId: 'silent-scene-editor',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fake', fal: 'fake' },
      binaryPaths: {},
    },
  }
  return { base, paths }
}
function command(base, payload) {
  return {
    ...base,
    job: { ...base.job, payload: { projectId: 'fixture', ...payload } },
  }
}
function userMessage(request) {
  return request.messages.at(-1).content
}
// El pedido del redactor para la escena muda se reconoce por su bloque de
// pausa, no por el fragmento (que es la narración vecina).
function isWriterRequest(request) {
  return userMessage(request).includes(SILENT_PAUSE_BLOCK.trim())
}
function fragmentOf(user) {
  return (
    user.match(
      /--- FRAGMENT[^\n]*---\n([\s\S]*?)\n--- END FRAGMENT ---/,
    )?.[1] ?? ''
  )
}
function writerReply() {
  return stream(JSON.stringify({ prompt_imagen: silentDescription }))
}
function mockProviders(t, { llm, image }) {
  const requests = { text: [], image: [] }
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('chat/completions')) {
      const request = JSON.parse(init.body)
      requests.text.push(request)
      return llm(request)
    }
    if (String(url).startsWith('https://fal.run/')) {
      const request = JSON.parse(init.body)
      requests.image.push(request)
      if (image) return image(request)
      return Response.json({
        images: [{ url: 'https://fixture.invalid/image.png' }],
      })
    }
    assert.equal(
      String(url),
      'https://fixture.invalid/image.png',
      'sin proveedores reales',
    )
    return new Response(imageBytes, {
      headers: { 'content-type': 'image/png' },
    })
  })
  return requests
}
async function neighbourMtimes(paths) {
  const mtimes = {}
  for (const id of NEIGHBOURS)
    mtimes[id] = (await stat(sceneImageFile(paths, id))).mtimeMs
  return mtimes
}
function sceneById(scenes, id) {
  return scenes.find((scene) => scene.id === id)
}
// La narrativa de las vecinas no cambia; la fase de imágenes sí les anexa a
// TODAS las cláusulas finales del scrub (texto-en-imagen, anonimato), como
// siempre, por eso se compara el arranque y no el prompt entero.
function assertNeighboursIntact(stored) {
  for (const id of NEIGHBOURS)
    assert.ok(
      sceneById(stored, id).imagePrompt.startsWith(descriptions[id]),
      `scene ${id} keeps its narrative`,
    )
}

test('the classic cutter leaves a silent window as an empty-text scene (the bug source)', () => {
  const words = [
    { word: 'La', start: 0, end: 0.5 },
    { word: 'antena', start: 0.6, end: 1.2 },
    { word: 'parpadea', start: 1.3, end: 2 },
    { word: 'lejos', start: 2.1, end: 3.5 },
    { word: 'bajo', start: 8.2, end: 8.8 },
    { word: 'la', start: 8.9, end: 9.2 },
    { word: 'ventana', start: 9.3, end: 12 },
  ]
  const scenes = cutScenesByTime(words, 3)
  assert.equal(scenes.length, 3)
  assert.equal(scenes[1].text, '')
  assert.equal(scenes[1].startSeconds, 4)
  assert.equal(scenes[1].endSeconds, 8)
  assert.ok(scenes[0].text.length > 0 && scenes[2].text.length > 0)
})

test('prompts stage writes the silent scene from its neighbours, without the director', async (t) => {
  const context = await fixture(t)
  const requests = mockProviders(t, {
    llm: (request) => {
      assert.ok(isWriterRequest(request), 'the pause block reaches the writer')
      const user = userMessage(request)
      assert.ok(user.includes(before) && user.includes(after))
      assert.equal(fragmentOf(user), `${before} ${after}`)
      return writerReply()
    },
  })
  assert.equal(await scenePromptsStage.skip(context), false)
  await scenePromptsStage.run(context)
  assert.equal(requests.text.length, 1, 'one writer call, no director')
  assert.equal(requests.image.length, 0)
  const stored = await readScenes(context.paths)
  const silent = sceneById(stored, 328)
  assert.ok(silent.imagePrompt.includes(silentDescription))
  assert.equal(silent.promptIsFallback, false)
  assert.equal(silent.direction, undefined)
  assert.ok(hasCatalogPrompt(silent, VISUAL_STYLES.cartoon))
  assertNeighboursIntact(stored)
  const progress = context.events.filter(
    (event) => event.type === 'scene-prompts-progress',
  )
  assert.equal(progress.at(-1).ready, 3)
  assert.equal(progress.at(-1).total, 3)
  assert.equal(await scenePromptsStage.skip(context), true)
})

test('images stage generates the silent scene and leaves its neighbours untouched', async (t) => {
  const scenes = silentScenes()
  scenes[1] = {
    ...scenes[1],
    imagePrompt: silentDescription,
    promptIsFallback: false,
  }
  const context = await fixture(t, scenes)
  const mtimes = await neighbourMtimes(context.paths)
  const requests = mockProviders(t, {
    llm: () => assert.fail('no LLM call expected'),
  })
  assert.equal(await imagesStage.skip(context), false)
  await imagesStage.run(context)
  assert.equal(requests.image.length, 1)
  assert.ok(requests.image[0].prompt.includes(silentDescription))
  assert.deepEqual(
    await readFile(sceneImageFile(context.paths, 328)),
    imageBytes,
  )
  assert.deepEqual(await neighbourMtimes(context.paths), mtimes)
  assert.equal(await imagesStage.skip(context), true)
})

test('final gate lists the silent scene when the provider keeps rejecting it', async (t) => {
  const scenes = silentScenes()
  scenes[1] = {
    ...scenes[1],
    imagePrompt: silentDescription,
    promptIsFallback: false,
  }
  const context = await fixture(t, scenes)
  const mtimes = await neighbourMtimes(context.paths)
  const requests = mockProviders(t, {
    llm: (request) => {
      const user = userMessage(request)
      assert.ok(user.includes('RETRY ATTEMPT'), 'content-policy rewrite')
      assert.ok(isWriterRequest(request), 'the rewrite keeps the pause block')
      return writerReply()
    },
    image: () =>
      Response.json(
        { type: 'content_policy_violation', detail: 'content rejected' },
        { status: 422 },
      ),
  })
  await assert.rejects(imagesStage.run(context), (error) => {
    assert.equal(error.code, 'images_incomplete')
    assert.match(error.message, /\b328\b/)
    return true
  })
  assert.ok(requests.image.length >= 2, 'recovery passes retried the scene')
  assert.ok(requests.text.length >= 1, 'the prompt was rewritten')
  assert.deepEqual(await neighbourMtimes(context.paths), mtimes)
})

test('resume repairs the broken project end to end and is then a full cache-hit', async (t) => {
  const context = await fixture(t)
  const mtimes = await neighbourMtimes(context.paths)
  const requests = mockProviders(t, {
    llm: (request) => {
      assert.ok(isWriterRequest(request))
      return writerReply()
    },
  })
  await runStages([scenePromptsStage, imagesStage], context)
  assert.equal(requests.text.length, 1)
  assert.equal(requests.image.length, 1)
  const stored = await readScenes(context.paths)
  assert.ok(sceneById(stored, 328).imagePrompt.includes(silentDescription))
  assert.deepEqual(
    await readFile(sceneImageFile(context.paths, 328)),
    imageBytes,
  )
  assertNeighboursIntact(stored)
  assert.deepEqual(await neighbourMtimes(context.paths), mtimes)
  for (const stageId of ['scene-prompts', 'images'])
    assert.ok(
      context.events.some(
        (event) =>
          event.type === 'stage-completed' && event.stageId === stageId,
      ),
      `${stageId} completed`,
    )

  // Segunda corrida: todo cache-hit, sin una sola llamada nueva.
  const next = {
    ...context,
    ...baseContext(),
    visualBible: Promise.resolve(bible),
  }
  await runStages([scenePromptsStage, imagesStage], next)
  assert.equal(
    next.events.filter((event) => event.type === 'stage-skipped').length,
    2,
  )
  assert.equal(requests.text.length, 1)
  assert.equal(requests.image.length, 1)
})

test('editor regenerates the silent scene without a user description', async (t) => {
  const { base, paths } = await editorFixture(t)
  const requests = mockProviders(t, {
    // Sin biblia en disco el comando puede pedir una: se le contesta texto
    // plano; lo que se afirma es la llamada del redactor y la de imagen.
    llm: (request) =>
      isWriterRequest(request) ? writerReply() : stream(bible),
  })
  const result = await regenerateSceneImages(
    command(base, { scenes: [{ id: 328, rewritePrompt: false }] }),
  )
  assert.deepEqual(result.regenerated, [328])
  assert.deepEqual(result.failed, [])
  assert.equal(requests.text.filter(isWriterRequest).length, 1)
  assert.equal(requests.image.length, 1)
  assert.deepEqual(await readFile(sceneImageFile(paths, 328)), imageBytes)
  const stored = await readScenes(paths)
  assert.ok(sceneById(stored, 328).imagePrompt.includes(silentDescription))
  assertNeighboursIntact(stored)
})
