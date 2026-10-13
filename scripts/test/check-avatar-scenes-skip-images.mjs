// Una escena de avatar no lleva prompt ni imagen (ADR-0057, decisión del dueño
// del 2026-10-10): su video lo hace HeyGen con el look tal cual, con su propio
// fondo. Las fases de prompts (los dos carriles) e imágenes la saltean —sin
// clasificador, director, juez, rescate por política de contenido ni
// respaldo—, sus `skip()` no la esperan, queda en `scenes.json` como la dejó
// el corte y su narración sigue siendo la ventana de época de su vecina. El
// editor no le regenera imagen: en un pedido mixto la saltea con un aviso y
// regenera las demás; un pedido solo de escenas de avatar se rechaza. Y desde
// la entrega 2h (diseño §24.1), con el avatar corriendo a la vez: un recibo
// que el avatar guarda mientras se generan las imágenes sobrevive a cada
// escritura de la fase (la primera, la de los prompts reescritos y la del
// reintento) y a la escritura por lote del carril verbatim. Stages
// y comandos reales; el LLM y Fal simulados (un solo `fetch` simulado vivo
// por test); todo en carpetas temporales, sin red ni claves.
import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { withAnimationCheckpointLease } from '../../pipeline/animation/coordination.ts'
import { regenerateSceneImages } from '../../pipeline/commands/videos/regenerate-scene-images.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { SUBJECT_CLASSIFIER_SYSTEM_PROMPT } from '../../pipeline/prompts/reference-characters.ts'
import {
  resolveProjectPaths,
  sceneImageFile,
} from '../../pipeline/project/paths.ts'
import { readScenes, writeScenes } from '../../pipeline/project/scenes-file.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { imagesStage } from '../../pipeline/stages/images/images.ts'
import { scenePromptsStage } from '../../pipeline/stages/scene-prompts/scene-prompts.ts'
import { createVerbatimPromptPersistence } from '../../pipeline/stages/scene-prompts/verbatim/verbatim-persistence.ts'
import {
  isNarrativeReviewRequest,
  narrativeReviewAnswer,
} from './narrative-review-fixture.mjs'

const IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const BIBLE =
  'ERA: contemporary. An orbital station with an antenna module and a greenhouse module full of green plants.'
const ELENA = {
  name: 'Elena',
  description: 'adult astronaut in a white and blue spacesuit',
}
const AVATAR = {
  lookId: 'look-1',
  lookName: 'Ana en la cocina',
  lookType: 'photo_avatar',
  engine: 'avatar_iii',
  origin: 'auto',
  status: 'planned',
}
const TEXTS = {
  1: 'Elena repara la antena roja de la estación.',
  2: 'Hoy les cuento cómo se cultiva comida en el espacio, paso a paso.',
  3: 'Elena riega las plantas del invernadero.',
}
const SCRIPT = Object.values(TEXTS).join(' ')
// Escenas recién cortadas: la 2 es una aparición del avatar (tarea 4: sin
// prompt, sin `direction` y sin marca de animación).
const FRESH = [
  { id: 1, text: TEXTS[1], startSeconds: 0, endSeconds: 6 },
  { id: 2, text: TEXTS[2], startSeconds: 6, endSeconds: 16, avatar: AVATAR },
  { id: 3, text: TEXTS[3], startSeconds: 16, endSeconds: 22 },
]
const REGULAR = {
  1: 'Elena repairs a red antenna outside the orbital station with a silver wrench, Earth behind her, a wide shot.',
  3: 'Elena waters green plants inside the station greenhouse, translucent leaves and irrigation pipes, a close-up.',
}
// Un proyecto con los prompts de las escenas de imagen ya escritos.
function prompted() {
  return [
    {
      ...FRESH[0],
      imagePrompt: REGULAR[1],
      promptIsFallback: false,
      charactersPresent: [0],
    },
    { ...FRESH[1] },
    {
      ...FRESH[2],
      imagePrompt: REGULAR[3],
      promptIsFallback: false,
      charactersPresent: [0],
    },
  ]
}

function fragmentOf(userPrompt) {
  return (
    userPrompt.match(
      /--- FRAGMENT[^\n]*---\n([\s\S]*?)\n--- END FRAGMENT ---/,
    )?.[1] ?? ''
  )
}
function sceneOfRequest(userPrompt) {
  const fragment = fragmentOf(userPrompt)
  return Number(Object.keys(TEXTS).find((id) => fragment.includes(TEXTS[id])))
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
function imageResponse() {
  return Response.json({
    images: [{ url: 'https://fixture.invalid/image.png' }],
  })
}
function contentPolicyRejection() {
  return new Response(
    JSON.stringify({
      type: 'content_policy_violation',
      detail: 'flagged by the content checker',
    }),
    { status: 422, headers: { 'content-type': 'application/json' } },
  )
}
function directorReply(user) {
  const ids = [...user.matchAll(/^(\d+) \[character:/gm)].map((match) =>
    Number(match[1]),
  )
  return JSON.stringify({
    escenas: ids.map((id) => ({
      id,
      tratamiento: 'objeto',
      lugar: 'station module ' + id,
      emocion: 'hopeful',
    })),
  })
}

// ─── Carril de la casa (contexto armado a mano, como check-catalog-prompts) ───

async function houseProject(t, scenes, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-skip-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(root, 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  await writeScenes(paths, structuredClone(scenes))
  await writeFile(paths.scriptFile, SCRIPT)
  const events = []
  return {
    job: {
      jobId: 'avatar-skip-fixture',
      apiKeys: { deepinfra: 'fake', fal: 'fake', evolink: 'fake' },
      binaryPaths: {},
    },
    config: resolvePipelineConfig({ llm: { timeoutMs: 1000 } }),
    signal: new AbortController().signal,
    emitter: {
      emit(event) {
        events.push(event)
      },
    },
    events,
    paths,
    options: {
      styleId: 'cartoon',
      imageProvider: 'fal',
      characters: [{ ...ELENA, mode: 'text' }],
      ...options,
    },
    visualBible: Promise.resolve(BIBLE),
  }
}
// LLM y Fal simulados en un solo `fetch`: el clasificador, el director, el
// juez y el redactor se distinguen por su system prompt; Fal, por su URL; el
// resto es la descarga de la imagen.
function mockProviders(t, { fal = () => imageResponse() } = {}) {
  const seen = {
    classifier: [],
    director: [],
    reviewed: [],
    writer: [],
    fal: [],
  }
  globalThis.fetch.mock?.restore()
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url)
    if (target.includes('chat/completions')) {
      const request = JSON.parse(init.body)
      if (isNarrativeReviewRequest(request)) {
        seen.reviewed.push(
          ...JSON.parse(request.messages.at(-1).content).candidates.map(
            (candidate) => candidate.sceneId,
          ),
        )
        return narrativeReviewAnswer(request)
      }
      const system = request.messages[0].content
      const user = request.messages.at(-1).content
      if (system === SUBJECT_CLASSIFIER_SYSTEM_PROMPT) {
        seen.classifier.push(
          ...[...user.matchAll(/^(\d+): /gm)].map((match) => Number(match[1])),
        )
        return stream('{"ids":[1,3]}')
      }
      if (system.includes('VISUAL DIRECTOR')) {
        seen.director.push(
          ...[...user.matchAll(/^(\d+) \[character:/gm)].map((match) =>
            Number(match[1]),
          ),
        )
        return stream(directorReply(user))
      }
      seen.writer.push(sceneOfRequest(user))
      return stream(
        JSON.stringify({ prompt_imagen: REGULAR[sceneOfRequest(user)] }),
      )
    }
    if (target.startsWith('https://fal.run/')) {
      const prompt = JSON.parse(init.body).prompt
      seen.fal.push(prompt)
      return fal(prompt)
    }
    return new Response(IMAGE, { headers: { 'content-type': 'image/png' } })
  })
  return seen
}
function byId(scenes, id) {
  return scenes.find((scene) => scene.id === id)
}

test('prompts (casa): la escena de avatar no se clasifica, no se dirige ni se redacta, y no frena el cache-hit', async (t) => {
  const context = await houseProject(t, FRESH)
  const seen = mockProviders(t)
  await scenePromptsStage.run(context)

  assert.deepEqual(seen.classifier, [1, 3])
  assert.deepEqual(
    [...seen.director].sort((a, b) => a - b),
    [1, 3],
  )
  assert.deepEqual(
    [...seen.writer].sort((a, b) => a - b),
    [1, 3],
  )
  assert.ok(!seen.reviewed.includes(2))
  assert.deepEqual(byId(await readScenes(context.paths), 2), FRESH[1])
  assert.equal(await scenePromptsStage.skip(context), true)
})

test('prompts (casa): con frecuencia «siempre», el personaje entra en todas menos en la de avatar', async (t) => {
  const context = await houseProject(t, FRESH, { characterFrequency: 'always' })
  const seen = mockProviders(t)
  await scenePromptsStage.run(context)

  assert.deepEqual(seen.classifier, [])
  assert.deepEqual(
    (await readScenes(context.paths)).map((scene) => scene.charactersPresent),
    [[0], undefined, [0]],
  )
})

test('prompts (casa): al reanudar con la presencia ya guardada, la escena de avatar sigue sin presencia', async (t) => {
  // Las escenas de imagen ya pasaron por el clasificador (la fase se cortó
  // antes de redactar): la presencia guardada se reusa y la escena de avatar
  // no gana `charactersPresent`, ni siquiera vacío.
  const resumed = FRESH.map((scene) =>
    scene.avatar ? scene : { ...scene, charactersPresent: [0] },
  )
  const context = await houseProject(t, resumed)
  const seen = mockProviders(t)
  await scenePromptsStage.run(context)

  assert.deepEqual(seen.classifier, [])
  assert.deepEqual(
    [...seen.writer].sort((a, b) => a - b),
    [1, 3],
  )
  const scenes = await readScenes(context.paths)
  assert.deepEqual(byId(scenes, 2), FRESH[1])
  assert.deepEqual(
    scenes.map((scene) => scene.charactersPresent),
    [[0], undefined, [0]],
  )
})

test('imágenes (casa): la escena de avatar no se genera ni frena la fase, y queda como estaba', async (t) => {
  const context = await houseProject(t, prompted())
  const seen = mockProviders(t)
  await imagesStage.run(context)

  assert.equal(seen.fal.length, 2)
  assert.deepEqual(seen.writer, [])
  assert.ok(
    !context.events.some((event) => event.type === 'images-recovery-pass'),
  )
  assert.deepEqual(byId(await readScenes(context.paths), 2), FRESH[1])
  assert.equal(await imagesStage.skip(context), true)
})

test('imágenes (casa): el rescate por política de contenido reescribe solo escenas de imagen, nunca la de avatar', async (t) => {
  const context = await houseProject(t, prompted())
  let rejectedOnce = false
  const seen = mockProviders(t, {
    fal(prompt) {
      if (!prompt.includes('red antenna') || rejectedOnce)
        return imageResponse()
      rejectedOnce = true
      return contentPolicyRejection()
    },
  })
  await imagesStage.run(context)

  assert.deepEqual(seen.writer, [1])
  assert.equal(seen.fal.length, 3)
  assert.deepEqual(
    context.events
      .filter((event) => event.type === 'images-recovery-pass')
      .map((event) => [event.kind, event.sceneIds]),
    [
      ['rewrite', [1]],
      ['retry', [1]],
    ],
  )
  assert.deepEqual(byId(await readScenes(context.paths), 2), FRESH[1])
})

// ─── El avatar corre junto con las imágenes (entrega 2h, diseño §24.1) ───

// Lo que hace el carril del avatar al guardar un recibo (render-scenes.ts):
// bajo el lease de checkpoint relee scenes.json y reemplaza SOLO el `avatar`
// de su escena.
async function saveAvatarReceipt(paths, sceneId, avatar) {
  await withAnimationCheckpointLease(
    paths.root,
    new AbortController().signal,
    async () => {
      const current = await readScenes(paths)
      await writeScenes(
        paths,
        current.map((scene) =>
          scene.id === sceneId ? { ...scene, avatar } : scene,
        ),
      )
    },
  )
}
// Un recibo del render de la escena 2, pagado o en vuelo.
const avatarWithReceipt = (state) => ({
  ...AVATAR,
  usdEstimated: 0.099,
  attempts: [
    {
      hash: 'a'.repeat(64),
      state,
      engine: 'avatar_iii',
      lookId: 'look-1',
      audioAssetId: 'asset-audio',
      createdAt: '2026-10-13T15:00:00.000Z',
      videoId: 'video-2-1',
    },
  ],
})

test('imágenes (2h): un recibo del avatar guardado mientras se generan las imágenes sobrevive a cada escritura de la fase, también las de la pasada de recuperación', async (t) => {
  const context = await houseProject(t, prompted())
  const pending = avatarWithReceipt('pending')
  const succeeded = avatarWithReceipt('succeeded')
  const onDiskAtRetry = []
  let antennaCalls = 0
  const seen = mockProviders(t, {
    async fal(prompt) {
      if (!prompt.includes('red antenna')) return imageResponse()

      antennaCalls++
      if (antennaCalls === 1) {
        // El avatar guarda su `pending` mientras las imágenes esperan a Fal,
        // que rechaza la escena 1: hay pasada de recuperación.
        await saveAvatarReceipt(context.paths, 2, pending)
        return contentPolicyRejection()
      }
      // El reintento: ya pasaron la escritura de la primera pasada y la de
      // los prompts reescritos. El avatar guarda que su render terminó.
      onDiskAtRetry.push(byId(await readScenes(context.paths), 2).avatar)
      await saveAvatarReceipt(context.paths, 2, succeeded)
      return imageResponse()
    },
  })
  await imagesStage.run(context)

  assert.deepEqual(seen.writer, [1])
  assert.deepEqual(onDiskAtRetry, [pending])
  const stored = await readScenes(context.paths)
  assert.deepEqual(byId(stored, 2), { ...FRESH[1], avatar: succeeded })
  // Lo de las imágenes también quedó: modelo y calidad en las de imagen.
  assert.ok(byId(stored, 1).imageModel)
  assert.ok(byId(stored, 3).imageModel)
  assert.equal(await imagesStage.skip(context), true)
})

test('imágenes (2h): si el avatar está guardando un recibo (con el lease tomado) cuando las imágenes escriben, la escritura espera y quedan las dos cosas', async (t) => {
  const context = await houseProject(t, prompted())
  const pending = avatarWithReceipt('pending')
  let avatarWrite
  mockProviders(t, {
    async fal() {
      if (avatarWrite) return imageResponse()

      // El avatar toma el lease, relee scenes.json (todavía sin lo de las
      // imágenes), tarda en escribir y escribe su recibo sobre lo que leyó,
      // como persistAvatars. Fal responde recién con el lease tomado.
      let holding
      const held = new Promise((resolve) => {
        holding = resolve
      })
      avatarWrite = withAnimationCheckpointLease(
        context.paths.root,
        new AbortController().signal,
        async () => {
          const current = await readScenes(context.paths)
          holding()
          await new Promise((done) => setTimeout(done, 300))
          await writeScenes(
            context.paths,
            current.map((scene) =>
              scene.id === 2 ? { ...scene, avatar: pending } : scene,
            ),
          )
        },
      )
      await held
      return imageResponse()
    },
  })
  await imagesStage.run(context)
  await avatarWrite

  const stored = await readScenes(context.paths)
  assert.deepEqual(byId(stored, 2), { ...FRESH[1], avatar: pending })
  // La escritura de las imágenes fue después y no se perdió.
  assert.ok(byId(stored, 1).imageModel)
  assert.ok(byId(stored, 3).imageModel)
})

test('verbatim (2h): la escritura por lote de los prompts conserva el recibo del avatar que está en disco y escribe el prompt nuevo', async (t) => {
  const context = await verbatimProject(t, prompted())
  // La fase arrancó con la escena 2 sin recibos (su copia); el avatar guarda
  // uno después.
  const persistence = createVerbatimPromptPersistence(
    context,
    await readScenes(context.paths),
  )
  const pending = avatarWithReceipt('pending')
  await saveAvatarReceipt(context.paths, 2, pending)
  const prompt =
    'Elena tightens the bolts of a red antenna on the station hull, Earth glowing below, a medium shot.'
  await persistence.onPrompts([{ id: 1, imagePrompt: prompt }])
  await persistence.flush()

  const stored = await readScenes(context.paths)
  assert.deepEqual(byId(stored, 2), { ...FRESH[1], avatar: pending })
  assert.equal(byId(stored, 1).imagePrompt, prompt)
  assert.equal(byId(stored, 3).imagePrompt, REGULAR[3])
})

test('imágenes (casa): la narración del avatar sigue siendo la ventana de época de la escena siguiente, como en la redacción', async (t) => {
  // La biblia fija 1912 y el avatar dice «Hoy en día…»: la escena 3 queda
  // fuera del candado de época. La fase de prompts la cerró con esa ventana
  // (arma las ventanas con todas las escenas, también la de avatar); la
  // compra tiene que cerrarla igual, o le agrega un candado de 1912 que la
  // redacción no puso.
  const scenes = [
    {
      id: 1,
      text: 'En 1912 el barco zarpó de Southampton.',
      startSeconds: 0,
      endSeconds: 6,
      imagePrompt:
        'A steamship leaves the port of Southampton at dawn, crowds waving from the dock, a wide shot.',
      promptIsFallback: false,
      charactersPresent: [],
    },
    {
      id: 2,
      text: 'Hoy en día, sus restos descansan en el fondo del mar.',
      startSeconds: 6,
      endSeconds: 16,
      avatar: AVATAR,
    },
    {
      id: 3,
      text: 'Los buzos exploran el casco con linternas.',
      startSeconds: 16,
      endSeconds: 22,
      imagePrompt:
        'Divers explore the rusted hull of a sunken ship on the ocean floor with flashlights, a close-up.',
      promptIsFallback: false,
      charactersPresent: [],
    },
  ]
  const context = await houseProject(t, scenes)
  context.visualBible = Promise.resolve(
    'ERA: 1912\nA transatlantic steamship, its crew and the ocean floor.',
  )
  await writeFile(
    context.paths.scriptFile,
    scenes.map((scene) => scene.text).join(' '),
  )
  const seen = mockProviders(t)
  await imagesStage.run(context)

  const ship = seen.fal.find((prompt) => prompt.includes('steamship leaves'))
  const divers = seen.fal.find((prompt) => prompt.includes('Divers explore'))
  assert.equal(seen.fal.length, 2)
  assert.ok(ship.includes('PERIOD LOCK'), 'la escena 1 sigue en 1912')
  assert.ok(
    !divers.includes('PERIOD LOCK'),
    'la escena 3 sale del candado por la narración del avatar',
  )
})

// ─── Carril verbatim (Mi estilo / catálogo nuevo) ───

const GEM = {
  visualStyle:
    'Flat vintage travel poster illustration with bold shapes and a limited palette.',
  promptStart: 'Vintage travel poster.',
  promptEnd: 'Bold flat colors, paper grain texture.',
}
async function verbatimProject(t, scenes) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-skip-verbatim-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  await writeFile(
    paths.metadataFile,
    JSON.stringify({
      id: 'fixture',
      name: 'Fixture',
      state: 'draft',
      completedStages: [],
      createdAt: '2026-10-10T00:00:00.000Z',
      updatedAt: '2026-10-10T00:00:00.000Z',
      options: {
        styleId: 'normal',
        sceneCount: 0,
        narrationMode: 'tts',
        imageProvider: 'fal',
        imageQuality: 'low',
        videoFormat: '16:9',
        useBgm: false,
        useOverlay: false,
        confirmScenes: false,
        customStyle: {
          styleId: 'st-fixture',
          name: 'Poster',
          sections: GEM,
          character: { mode: 'none' },
        },
      },
    }),
  )
  await writeFile(paths.scriptFile, SCRIPT)
  await writeScenes(paths, structuredClone(scenes))
  const base = {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fixture', fal: 'fixture' },
      binaryPaths: {},
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit() {} },
  }
  return buildCreateVideoContext(base, 'fixture')
}
function lastUser(request) {
  return request.messages.at(-1).content
}
function fragmentIds(request) {
  return [...lastUser(request).matchAll(/^(\d+)\. /gm)].map((match) =>
    Number(match[1]),
  )
}
function mockVerbatim(t) {
  const seen = { requests: [], reviewed: [] }
  globalThis.fetch.mock?.restore()
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (!String(url).includes('chat/completions'))
      throw new Error('unexpected call to ' + url)
    const request = JSON.parse(init.body)
    if (isNarrativeReviewRequest(request)) {
      seen.reviewed.push(
        ...JSON.parse(lastUser(request)).candidates.map(
          (candidate) => candidate.sceneId,
        ),
      )
      return narrativeReviewAnswer(request)
    }
    seen.requests.push(request)
    return stream(
      fragmentIds(request)
        .map(
          (id) =>
            `((${id})) A red antenna on the orbital station under bright light, number ${id}.`,
        )
        .join('\n\n'),
    )
  })
  return seen
}

test('prompts (Mi estilo): la escena de avatar no viaja al redactor ni al juez y no frena el cache-hit', async (t) => {
  const context = await verbatimProject(t, FRESH)
  const seen = mockVerbatim(t)
  await scenePromptsStage.run(context)

  assert.ok(seen.requests.length > 0)
  for (const request of seen.requests)
    assert.ok(!fragmentIds(request).includes(2))
  assert.ok(!seen.reviewed.includes(2))
  assert.deepEqual(byId(await readScenes(context.paths), 2), FRESH[1])
  assert.equal(await scenePromptsStage.skip(context), true)
})

test('imágenes (Mi estilo): la escena de avatar no cae al respaldo determinístico', async (t) => {
  const context = await verbatimProject(t, prompted())
  const seen = mockProviders(t)
  await imagesStage.run(context)

  assert.equal(seen.fal.length, 2)
  assert.deepEqual(byId(await readScenes(context.paths), 2), FRESH[1])
})

test('imágenes (Mi estilo): el respaldo de una escena corta lleva la narración del avatar en su ventana', async (t) => {
  // La escena 3 no tiene prompt y su texto tiene menos de 40 caracteres: el
  // respaldo determinístico la ilustra con la ventana de sus vecinas, que
  // incluye lo que dice el avatar (la misma ventana que usó la redacción).
  const scenes = [
    prompted()[0],
    { ...FRESH[1] },
    { id: 3, text: 'Y luego, nada.', startSeconds: 16, endSeconds: 22 },
  ]
  const context = await verbatimProject(t, scenes)
  const seen = mockProviders(t)
  await imagesStage.run(context)

  assert.equal(seen.fal.length, 2)
  const fallback = seen.fal.find((prompt) => !prompt.includes('red antenna'))
  assert.ok(fallback.includes('cultiva comida en el espacio'), fallback)
  assert.deepEqual(byId(await readScenes(context.paths), 2), FRESH[1])
})

// ─── Editor ───

// Una segunda aparición del avatar, para el pedido que solo trae escenas de
// avatar.
const SECOND_AVATAR = {
  id: 4,
  text: 'Y ahora, a cosechar lo que plantamos.',
  startSeconds: 22,
  endSeconds: 32,
  avatar: AVATAR,
}
function regenerate(context, scenes, emitter = context.emitter) {
  return regenerateSceneImages({
    ...context,
    emitter,
    job: { ...context.job, payload: { projectId: 'fixture', scenes } },
  })
}

test('editor: un pedido que solo trae escenas de avatar se rechaza sin llamar a nadie ni tocar el disco', async (t) => {
  const context = await verbatimProject(t, [...prompted(), SECOND_AVATAR])
  const calls = []
  globalThis.fetch.mock?.restore()
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url))
    throw new Error('no provider may be called')
  })
  const before = await readFile(context.paths.scenesFile, 'utf8')
  for (const scenes of [
    [{ id: 2, rewritePrompt: true }],
    [
      { id: 2, rewritePrompt: false },
      { id: 4, rewritePrompt: true },
    ],
  ])
    await assert.rejects(regenerate(context, scenes), {
      code: 'avatar_scene_without_image',
    })

  assert.deepEqual(calls, [])
  assert.equal(await readFile(context.paths.scenesFile, 'utf8'), before)
})

test('editor: en un pedido mixto las escenas de avatar se saltean con un aviso y la de imagen se regenera', async (t) => {
  const context = await verbatimProject(t, [...prompted(), SECOND_AVATAR])
  // Las dos escenas de imagen ya tienen la suya, con fecha vieja para que la
  // nueva se note: solo la pedida pasa por Fal.
  const past = new Date('2026-01-01T00:00:00.000Z')
  for (const id of [1, 3]) {
    await writeFile(sceneImageFile(context.paths, id), IMAGE)
    await utimes(sceneImageFile(context.paths, id), past, past)
  }
  const seen = mockProviders(t)
  const events = []
  // Dos escenas de avatar, desordenadas y una repetida: el aviso las nombra
  // una vez y en orden.
  const result = await regenerate(
    context,
    [
      { id: 4, rewritePrompt: true },
      { id: 1, rewritePrompt: false },
      { id: 2, rewritePrompt: true },
      { id: 4, rewritePrompt: false },
    ],
    { emit: (event) => events.push(event) },
  )

  assert.deepEqual(result, { regenerated: [1], failed: [] })
  assert.equal(seen.fal.length, 1)
  assert.ok(seen.fal[0].includes('red antenna'))
  assert.deepEqual(seen.writer, [])
  assert.deepEqual(byId(await readScenes(context.paths), 2), FRESH[1])
  assert.deepEqual(
    events
      .filter((event) => event.type === 'log' && event.level === 'warn')
      .map((event) => event.message)
      .filter((message) => message.includes('avatar_scene_without_image')),
    [
      'avatar scene(s) 2, 4 skipped: avatar_scene_without_image — HeyGen renders the look as it is',
    ],
  )
  assert.ok(
    !events.some(
      (event) =>
        event.type === 'scene-image-started' &&
        (event.sceneId === 2 || event.sceneId === 4),
    ),
  )
})

test('editor: si el pedido mixto se rechaza por otra causa, no avisa que salteó las escenas de avatar', async (t) => {
  // Una escena que no existe, o una imagen que una animación lista bloquea:
  // el pedido entero se rechaza antes de regenerar nada, y el log no puede
  // decir que la escena de avatar «se salteó».
  const locked = prompted().map((scene) =>
    scene.id === 1
      ? { ...scene, animations: [{ status: 'ready', sceneIds: [1] }] }
      : scene,
  )
  for (const [scenes, request, code] of [
    [prompted(), [{ id: 2 }, { id: 99 }], 'invalid_payload'],
    [locked, [{ id: 2 }, { id: 1 }], 'animation_image_locked'],
  ]) {
    const context = await verbatimProject(t, scenes)
    globalThis.fetch.mock?.restore()
    t.mock.method(globalThis, 'fetch', async (url) => {
      throw new Error('no provider may be called: ' + url)
    })
    const events = []
    await assert.rejects(
      regenerate(
        context,
        request.map((scene) => ({ ...scene, rewritePrompt: false })),
        { emit: (event) => events.push(event) },
      ),
      { code },
    )
    assert.deepEqual(
      events.filter((event) => event.type === 'log'),
      [],
      code,
    )
  }
})
