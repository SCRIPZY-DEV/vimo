// La fase `avatar` (ADR-0057, entrega 2, diseño §8) sobre un proyecto en una
// carpeta temporal, con HeyGen simulado por ruta y el ffmpeg del repo
// (escenas de 1 s para que el guard sea rápido; no dependen del mínimo real
// por aparición): el registro (entre `images` y `animation`), `skip` (sin
// escenas de avatar, todo listo, listo pero desactualizado —no se paga solo,
// tampoco sin su clip: entrega 2d—, demo, regeneración de imágenes; uno al día
// sin su clip sí es pendiente; con la fase ya terminada, nada: ronda 1 de
// WP-P), la desactualizada que reanudar no paga ni anuncia mientras cosecha la
// al día y paga la planeada (desde el editor, sí se paga), el costo de
// reanudar de la UI, que cuenta exactamente las escenas que la fase va a
// trabajar (y nada con la fase terminada), el saldo contra el estimado ANTES
// de subir
// nada y otra vez antes de pagar cada escena (diseño §8: si deja de alcanzar a
// mitad de corrida, las que faltan no se piden y las pedidas se cosechan; solo
// en dólares y en millonésimas, así un saldo igual al estimado alcanza; uno
// ilegible avisa una vez y deja seguir; una clave rechazada o ausente corta),
// la concurrencia de 3, la cosecha de recibos antes del saldo (`pending`,
// `creating` y `ambiguous`), la relectura de scenes.json bajo el lease de
// escena, una escena anunciada una sola vez
// aunque el carril entre dos veces, una aparición que falla que no frena la
// fase (entrega 2d, con el pipeline real: la completa con un aviso en el log,
// el render muestra esa escena con la imagen fija del look, reanudar ya no la
// reintenta y el editor la paga; una pausa de la cuenta —saldo o clave— no la
// completa y reanudar retoma lo pendiente; un render moderado no se vuelve a
// pedir solo —desde el editor, sí—; un plazo vencido deja el recibo `pending`
// y el «Regenerar» del editor lo cosecha sin pagar), el código de la cuenta
// cuando la clave dejó de servir (también
// si otra escena fue un rechazo para siempre, en cualquier orden), la pausa
// por saldo que ningún otro fallo tapa, los eventos `avatar-scene-*` y
// `avatar-provider-trouble`, el mp4 desactualizado solo con un clip nuevo
// (no con los recibos de una regeneración que falla) y el aislamiento de Kie
// (ningún recibo de HeyGen en los campos de la animación); y el comando del
// editor `avatar-render-scenes`: el payload validado antes de hablar con
// HeyGen (un id que no es de avatar no deja pagar a ninguno), solo las escenas
// pedidas, una escena lista que no se vuelve a pagar,
// y el lease de animación (lecturas y otros generadores disponibles,
// escrituras exclusivas frenadas). Y el título de cada render (entrega 2c,
// diseño §7.1, con las rondas 1 y 2): la fase y el comando abren el título con
// el nombre de project.json (sin espacios de más, cortado en 80 grafemas; sin
// nombre, la marca sola) y el recibo de scenes.json lo guarda; un renombre
// entre el POST y la recuperación no impide adoptar, sin pagar, el render con
// el título que salió; un recibo de antes de la 2c se repite con la marca sola
// y no gana título; y sin avatar la fase no habla con HeyGen ni toca
// scenes.json.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

import {
  avatarAudioCutHash,
  avatarRenderHash,
  avatarRequestHash,
  avatarRequestKey,
  avatarVideoTitle,
} from '../../pipeline/avatar/fingerprint.ts'
import {
  pendingAvatarScenes,
  renderAvatarScenes,
} from '../../pipeline/avatar/render-scenes.ts'
import { videosSubcommands } from '../../pipeline/commands/videos/subcommands.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { toSceneSummaries } from '../../pipeline/project/scenes-file.ts'
import { STAGE_IDS } from '../../pipeline/runner/stage-id.ts'
import { avatarStage } from '../../pipeline/stages/avatar/avatar.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { CREATE_VIDEO_STAGES } from '../../pipeline/stages/registry.ts'
import { collectRenderScenes } from '../../pipeline/stages/render/animated-scenes.ts'
import { AVATAR_RENDER_DEADLINE_MS } from '../../pipeline/types/avatar.ts'
import { isInsufficientCreditsCode } from '../../pipeline/utils/insufficient-credits.ts'
import {
  FFMPEG,
  ORIGINAL_FETCH,
  fakeHeyGen,
  json,
  writeHeyGenClip,
  writeNarration,
} from './avatar-fixture.mjs'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PROJECT_ID = 'mi-video'
const OPTIONS = {
  styleId: 'normal',
  sceneCount: 0,
  narrationMode: 'tts',
  imageProvider: 'evolink',
  useBgm: false,
  useOverlay: false,
  confirmScenes: false,
  videoFormat: '16:9',
}

const plainScene = (id, startSeconds) => ({
  id,
  text: `Escena ${id}`,
  startSeconds,
  endSeconds: startSeconds + 1,
})
const avatarScene = (id, startSeconds, avatar = {}) => ({
  ...plainScene(id, startSeconds),
  avatar: {
    lookId: 'look-1',
    lookName: 'Ana',
    lookType: 'photo_avatar',
    engine: 'avatar_iii',
    origin: 'auto',
    status: 'planned',
    ...avatar,
  },
})

// Proyecto en disco con narración de 6 s y, si se pide, un mp4 ya
// renderizado; devuelve también los bytes del mp4 de HeyGen (1 s).
async function videoProject(t, scenes, { metadata = {}, video = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-stage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const projectDir = join(root, PROJECT_ID)
  await mkdir(projectDir, { recursive: true })
  writeNarration(join(projectDir, 'narration.mp3'), 6)
  await writeFile(
    join(projectDir, 'scenes.json'),
    JSON.stringify(scenes, null, 2),
  )
  await writeFile(
    join(projectDir, 'project.json'),
    JSON.stringify(
      {
        id: PROJECT_ID,
        name: 'Mi video',
        createdAt: '2026-10-10T15:00:00.000Z',
        updatedAt: '2026-10-10T15:00:00.000Z',
        state: 'generating',
        options: OPTIONS,
        completedStages: [
          'voice',
          'transcription',
          'scene-cuts',
          'scene-prompts',
          'images',
        ],
        audioDurationSeconds: 6,
        ...metadata,
      },
      null,
      2,
    ),
  )
  if (video)
    await writeFile(
      join(projectDir, `${PROJECT_ID}.mp4`),
      Buffer.from('previous render'),
    )
  const clipPath = join(root, 'heygen-source.mp4')
  writeHeyGenClip(clipPath, { seconds: 1, switchSeconds: 0.48 })
  return { root, projectDir, clip: await readFile(clipPath) }
}

function baseContext(
  root,
  events,
  { apiKeys = { heygen: 'key-123' }, payload } = {},
) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys,
      binaryPaths: { ffmpeg: FFMPEG },
      payload,
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit: (event) => events.push(event) },
  }
}

const stageContext = (root, events, options) =>
  buildCreateVideoContext(baseContext(root, events, options), PROJECT_ID)
const readScenesJson = async (projectDir) =>
  JSON.parse(await readFile(join(projectDir, 'scenes.json'), 'utf8'))
const ofType = (events, type) => events.filter((event) => event.type === type)
const wallet = (remaining_balance, currency = 'usd') => ({
  status: 200,
  body: { data: { wallet: { currency, remaining_balance } } },
})
const isBalanceRead = (call) => call.path === '/v3/users/me'
const isUpload = (call) => call.method === 'POST' && call.path === '/v3/assets'
const isRenderRequest = (call) =>
  call.method === 'POST' && call.path === '/v3/videos'

// Cuántas lecturas del saldo hubo antes de cada llamada que cumple `matches`
// (diseño §8: cada escena que paga lee el saldo antes de subir su audio y
// pedir).
function balanceReadsBefore(calls, matches) {
  let reads = 0
  const counts = []
  for (const call of calls) {
    if (isBalanceRead(call)) reads++
    else if (matches(call)) counts.push(reads)
  }
  return counts
}

// La huella del pedido actual de una escena de este proyecto, como el carril
// (con la versión de la narración del proyecto; ausente = 0).
async function currentHash(projectDir, scene, narrationVersion = 0) {
  const narration = await readFile(join(projectDir, 'narration.mp3'))
  return avatarRequestHash({
    lookId: scene.avatar.lookId,
    engine: scene.avatar.engine,
    aspectRatio: '16:9',
    resolution: '1080p',
    audioCutHash: avatarAudioCutHash({
      narrationSha256: createHash('sha256').update(narration).digest('hex'),
      startFrame: Math.round(scene.startSeconds * 25),
      endFrame: Math.round(scene.endSeconds * 25),
    }),
    narrationVersion,
  })
}

// La huella del render de una escena (su tramo en cuadros, el look, el motor y
// la versión de la narración), la que deja el carril en `renderHash`: con la
// del tramo de hoy y la narración vigente, la escena lista no está
// desactualizada.
const renderHashOf = (scene, narrationVersion) =>
  avatarRenderHash({
    lookId: scene.avatar.lookId,
    engine: scene.avatar.engine,
    startFrame: Math.round(scene.startSeconds * 25),
    endFrame: Math.round(scene.endSeconds * 25),
    narrationVersion,
  })

// El costo de reanudar de la UI (src/, con los alias de tsconfig.app.json),
// empaquetado con esbuild como en check-app-avatar-create.mjs.
async function loadResumeCost(t) {
  const output = await build({
    stdin: {
      contents: [
        "export { estimateResumeCost } from './src/modules/videos/utilities/estimateResumeCost.ts'",
        "export { avatarSpansCostEstimate } from './src/modules/videos/utilities/avatarCostEstimate.ts'",
      ].join('\n'),
      resolveDir: REPO_ROOT,
      sourcefile: 'resume-cost-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    tsconfig: join(REPO_ROOT, 'tsconfig.app.json'),
  })
  const directory = await mkdtemp(join(tmpdir(), 'vimo-resume-cost-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = join(directory, 'resume-cost.mjs')
  await writeFile(file, output.outputFiles[0].contents)
  return import(pathToFileURL(file).href)
}

// El pipeline real (`run-video-pipeline`, con su lease) hasta la fase
// `avatar`: es el que anota la fase en `completedStages` de project.json, y
// solo si su `run` terminó. Las cinco fases anteriores se saltean solas con lo
// que deja `pipelineProject` en disco.
const runPipelineToAvatar = (root, events = []) =>
  videosSubcommands['run-video-pipeline'](
    baseContext(root, events, {
      payload: { projectId: PROJECT_ID, untilStage: 'avatar' },
    }),
  )

// Un proyecto que el pipeline lleva directo a la fase `avatar`: la narración y
// `words.json` (voz y transcripción listas), un corte con tantas escenas como
// pide `sceneCount` (el corte se saltea) y solo escenas de avatar, que no
// llevan prompt ni imagen (prompts e imágenes se saltean).
async function pipelineProject(t, scenes) {
  const project = await videoProject(t, scenes, {
    metadata: { options: { ...OPTIONS, sceneCount: scenes.length } },
  })
  await writeFile(
    join(project.projectDir, 'words.json'),
    JSON.stringify([{ word: 'hola', start: 0, end: 0.5 }]),
  )
  return project
}

const readMetadata = async (projectDir) =>
  JSON.parse(await readFile(join(projectDir, 'project.json'), 'utf8'))
const BEFORE_AVATAR = [
  'voice',
  'transcription',
  'scene-cuts',
  'scene-prompts',
  'images',
]

test('registro: la fase avatar va entre images y animation', () => {
  assert.deepEqual(
    [...STAGE_IDS],
    [
      'voice',
      'transcription',
      'scene-cuts',
      'scene-prompts',
      'images',
      'avatar',
      'animation',
      'render',
    ],
  )
  assert.deepEqual(
    CREATE_VIDEO_STAGES.map((stage) => stage.id),
    [...STAGE_IDS],
  )
})

test('skip: sin escenas de avatar, con todo listo (aunque desactualizado, también sin su clip: entrega 2d), en la demo y al regenerar imágenes no hay nada que pagar; una lista y al día sin su clip, sí', async (t) => {
  const plain = await videoProject(t, [plainScene(1, 0), plainScene(2, 1)])
  assert.equal(await avatarStage.skip(await stageContext(plain.root, [])), true)

  const pending = await videoProject(t, [plainScene(1, 0), avatarScene(2, 1)])
  const context = await stageContext(pending.root, [])
  assert.equal(await avatarStage.skip(context), false)
  assert.equal(
    await avatarStage.skip({ ...context, regenerateSceneIds: new Set([1]) }),
    true,
  )
  assert.equal(
    await avatarStage.skip({
      ...context,
      options: { ...context.options, demo: true },
    }),
    true,
  )

  // Lista con su clip en disco: nada que hacer, aunque la narración cambió
  // después (desactualizada: regenerarla cuesta y lo decide la persona).
  const ready = await videoProject(
    t,
    [
      avatarScene(1, 0, {
        status: 'ready',
        clipFile: 'scene_1.ab12cd34.mp4',
        renderHash: 'del-render-anterior',
        narrationVersion: 0,
      }),
    ],
    { metadata: { narrationVersion: 2 } },
  )
  await mkdir(join(ready.projectDir, 'avatar'), { recursive: true })
  const clipPath = join(ready.projectDir, 'avatar', 'scene_1.ab12cd34.mp4')
  await writeFile(clipPath, ready.clip)
  assert.equal(await avatarStage.skip(await stageContext(ready.root, [])), true)
  // Desactualizada y además sin su archivo: tampoco (entrega 2d). Reanudar no
  // la paga; el render la muestra estática y se regenera desde el editor.
  await rm(clipPath)
  assert.equal(await avatarStage.skip(await stageContext(ready.root, [])), true)
  // Lista y al día, pero sin su archivo: pendiente (se cosecha su recibo).
  const scene = avatarScene(1, 0)
  const current = await videoProject(
    t,
    [
      avatarScene(1, 0, {
        status: 'ready',
        clipFile: 'scene_1.ab12cd34.mp4',
        renderHash: renderHashOf(scene, 2),
        narrationVersion: 2,
      }),
    ],
    { metadata: { narrationVersion: 2 } },
  )
  assert.equal(
    await avatarStage.skip(await stageContext(current.root, [])),
    false,
  )
})

test('skip (ronda 1 de WP-P): con la fase ya terminada no hay nada que hacer aunque queden apariciones fallidas, planeadas o con un render pagado pendiente; sin terminar, sí', async (t) => {
  const scenes = [
    avatarScene(1, 0, { status: 'failed', errorCode: 'avatar_render_failed' }),
    avatarScene(2, 1),
    avatarScene(3, 2, {
      status: 'failed',
      errorCode: 'avatar_timeout',
      attempts: [
        {
          hash: 'pedido-de-la-escena-3',
          state: 'pending',
          engine: 'avatar_iii',
          lookId: 'look-1',
          audioAssetId: 'asset-3',
          videoId: 'video-pagado',
          createdAt: '2026-10-10T15:00:00.000Z',
        },
      ],
    }),
  ]
  const open = await videoProject(t, scenes)
  assert.equal(await avatarStage.skip(await stageContext(open.root, [])), false)

  // Terminada: lo que quedó con la imagen fija se regenera desde el editor.
  const done = await videoProject(t, scenes, {
    metadata: { completedStages: [...BEFORE_AVATAR, 'avatar'] },
  })
  assert.equal(await avatarStage.skip(await stageContext(done.root, [])), true)
})

test('run: genera las escenas de avatar pendientes con el saldo leído antes de pagar cada una, publica cada una y desactualiza el mp4', async (t) => {
  const project = await videoProject(
    t,
    [avatarScene(1, 0), plainScene(2, 1), avatarScene(3, 2)],
    { video: true },
  )
  const events = []
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const context = await stageContext(project.root, events)
  await avatarStage.run(context)

  const scenes = await readScenesJson(project.projectDir)
  for (const id of [1, 3]) {
    const avatar = scenes.find((scene) => scene.id === id).avatar
    assert.equal(avatar.status, 'ready', `escena ${id}`)
    assert.equal(avatar.normalizedSeconds, 1)
    assert.equal(avatar.usdEstimated, 0.0165)
    assert.match(avatar.clipFile, /^scene_\d+\.[0-9a-f]{8}\.mp4$/)
  }
  // Kie no se entera: ni un recibo en los campos de la animación.
  for (const scene of scenes)
    for (const key of [
      'animation',
      'animations',
      'animationPending',
      'animationHistory',
    ])
      assert.equal(key in scene, false, `${scene.id}.${key}`)
  assert.equal('avatar' in scenes.find((scene) => scene.id === 2), false)
  // El saldo se leyó antes de la primera subida y una vez por escena que
  // paga (diseño §8): la k-ésima subida y el k-ésimo pedido tienen al menos k
  // lecturas antes. Solo se sube audio.
  const meIndex = fake.calls.findIndex(isBalanceRead)
  const firstUpload = fake.calls.findIndex(isUpload)
  assert.ok(meIndex >= 0 && meIndex < firstUpload)
  assert.equal(fake.calls.filter(isBalanceRead).length, 2)
  for (const matches of [isUpload, isRenderRequest])
    balanceReadsBefore(fake.calls, matches).forEach((reads, index) =>
      assert.ok(reads >= index + 1, `${index + 1}.ª llamada: ${reads}`),
    )
  assert.deepEqual(
    fake.uploads().map((call) => call.fileType),
    ['audio/wav', 'audio/wav'],
  )
  assert.equal(fake.posts().length, 2)
  // Empezó, avanzó y quedó lista cada una; el evento de lista lleva su id.
  assert.deepEqual(
    ofType(events, 'avatar-scene-started')
      .map((event) => event.sceneId)
      .sort(),
    [1, 3],
  )
  const ready = ofType(events, 'avatar-scene-ready')
  assert.deepEqual(ready.map((event) => event.sceneId).sort(), [1, 3])
  assert.ok(ready.every((event) => event.scene.id === event.sceneId))
  assert.ok(
    ofType(events, 'avatar-scene-progress').every(
      (event) => typeof event.elapsedSeconds === 'number',
    ),
  )
  assert.deepEqual(ofType(events, 'avatar-scene-failed'), [])
  // El mp4 anterior quedó atrás, en disco y en la copia del pipeline (que la
  // guarda entera al cerrar la fase: sin esto revertiría la marca).
  const metadata = JSON.parse(
    await readFile(join(project.projectDir, 'project.json'), 'utf8'),
  )
  assert.equal(metadata.videoOutdated, true)
  assert.equal(context.metadata.videoOutdated, true)
  assert.deepEqual(fake.unexpected, [])
})

test('saldo: si la billetera en dólares no alcanza, pausa con avatar_insufficient_credits antes de subir nada', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0), avatarScene(2, 1)])
  // Dos escenas de 1 s de foto con Avatar III: 0,033 USD; hay 0,02.
  const fake = fakeHeyGen(t, { clip: project.clip, me: wallet(0.02) })
  const before = await readFile(join(project.projectDir, 'scenes.json'), 'utf8')
  await assert.rejects(avatarStage.run(await stageContext(project.root, [])), {
    code: 'avatar_insufficient_credits',
  })
  // Es el código que run-video-pipeline pausa con pauseReason insufficient-credits.
  assert.ok(isInsufficientCreditsCode('avatar_insufficient_credits'))
  assert.deepEqual(fake.uploads(), [])
  assert.deepEqual(fake.posts(), [])
  // La primera lectura ya no alcanzaba para las dos: la segunda escena no
  // vuelve a preguntar ni paga sola los 0,0165 que sí cubriría.
  assert.equal(fake.calls.filter(isBalanceRead).length, 1)
  assert.equal(
    await readFile(join(project.projectDir, 'scenes.json'), 'utf8'),
    before,
  )
})

test('saldo: se vuelve a mirar antes de pagar cada escena; si deja de alcanzar a mitad de corrida, las que faltan no se piden, las pedidas se cosechan y la fase pausa', async (t) => {
  const project = await videoProject(t, [
    avatarScene(1, 0),
    avatarScene(2, 1),
    avatarScene(3, 2),
    avatarScene(4, 3),
  ])
  const events = []
  let reads = 0
  // Alcanza para las cuatro en las tres primeras lecturas (las tres escenas
  // que arrancan a la vez); en la cuarta, otro gasto dejó la cuenta en cero.
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    get me() {
      reads++
      return wallet(reads <= 3 ? 10 : 0)
    },
  })
  await assert.rejects(
    avatarStage.run(await stageContext(project.root, events)),
    { code: 'avatar_insufficient_credits' },
  )
  assert.equal(reads, 4)
  assert.equal(fake.posts().length, 3)
  assert.equal(fake.uploads().length, 3)
  assert.ok(
    fake.posts().every((call) => !/:scene-4:/.test(call.body.title)),
    'la escena 4 no se pidió',
  )
  const scenes = await readScenesJson(project.projectDir)
  assert.deepEqual(
    scenes.map((scene) => scene.avatar.status),
    ['ready', 'ready', 'ready', 'planned'],
  )
  assert.equal('attempts' in scenes[3].avatar, false)
  assert.deepEqual(
    ofType(events, 'avatar-scene-ready')
      .map((event) => event.sceneId)
      .sort(),
    [1, 2, 3],
  )
  // La que no se pagó no se anunció.
  assert.ok(
    ofType(events, 'avatar-scene-started').every(
      (event) => event.sceneId !== 4,
    ),
  )
})

test('saldo: un 402 de HeyGen al pedir corta los pagos que faltan; las que ya estaban en vuelo terminan y la fase pausa', async (t) => {
  const project = await videoProject(t, [
    avatarScene(1, 0),
    avatarScene(2, 1),
    avatarScene(3, 2),
    avatarScene(4, 3),
  ])
  // La billetera dice que alcanza, pero HeyGen rechaza cada pedido por saldo.
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    create: () =>
      new Response(
        JSON.stringify({
          error: { code: 'insufficient_credit', message: 'Not enough credit' },
        }),
        { status: 402, headers: { 'content-type': 'application/json' } },
      ),
  })
  await assert.rejects(avatarStage.run(await stageContext(project.root, [])), {
    code: 'avatar_insufficient_credits',
  })
  // Las tres primeras ya habían pasado el saldo; la cuarta ni lo mira. Qué
  // deja el carril en los recibos de las rechazadas lo fija su guard
  // (check-avatar-lane.mjs): acá se cuenta lo que se pagó.
  assert.equal(fake.posts().length, 3)
  assert.equal(fake.calls.filter(isBalanceRead).length, 3)
  assert.ok(fake.posts().every((call) => !/:scene-4:/.test(call.body.title)))
  const scenes = await readScenesJson(project.projectDir)
  assert.equal('attempts' in scenes[3].avatar, false)
  assert.ok(scenes.every((scene) => scene.avatar.status !== 'ready'))
})

test('saldo: un 5xx de HeyGen que habla del saldo vuelve del carril como escena fallida y pausa igual que un 402', async (t) => {
  const project = await videoProject(t, [
    avatarScene(1, 0),
    avatarScene(2, 1),
    avatarScene(3, 2),
    avatarScene(4, 3),
  ])
  const events = []
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    create: () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'internal_error',
            message: 'Insufficient balance to process this request',
          },
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ),
  })
  await assert.rejects(
    avatarStage.run(await stageContext(project.root, events)),
    { code: 'avatar_insufficient_credits' },
  )
  // La que esperaba turno no paga, y ninguna queda como «fallida» para
  // reintentar suelta: es una pausa por saldo, como el 402.
  assert.equal(fake.posts().length, 3)
  assert.ok(fake.posts().every((call) => !/:scene-4:/.test(call.body.title)))
  assert.deepEqual(ofType(events, 'avatar-scene-failed'), [])
  assert.deepEqual(ofType(events, 'avatar-provider-trouble'), [])
})

test('saldo: una billetera exactamente igual al estimado alcanza (se compara en millonésimas de dólar: la suma en coma flotante se pasa por una fracción ínfima); una millonésima menos, no', async (t) => {
  // Cuatro apariciones de 50 s de foto con Avatar III: 0,825 USD cada una,
  // 3,3 en total; sumadas en coma flotante dan 3,3000000000000003.
  const scenes = [1, 2, 3, 4].map((id) => ({
    ...avatarScene(id, (id - 1) * 50),
    endSeconds: id * 50,
  }))
  const fake = fakeHeyGen(t, {})
  for (const [remaining, code, reads, posts] of [
    // Alcanza: las cuatro salen a pedir; HeyGen las rechaza y la fase
    // termina igual, sin clips (entrega 2d: no es la cuenta).
    [3.3, undefined, 4, 4],
    [3.299999, 'avatar_insufficient_credits', 1, 0],
  ]) {
    const project = await videoProject(t, scenes)
    writeNarration(join(project.projectDir, 'narration.mp3'), 200)
    // Admitida, cada escena sale a pedir y HeyGen la rechaza al instante (un
    // 400 que no es del look): así se cuenta quién pasó el saldo sin bajar
    // ni normalizar cuatro clips de 50 s.
    fake.reset({
      me: wallet(remaining),
      create: () =>
        json(
          {
            error: {
              code: 'invalid_parameter',
              message: 'title too long',
              param: 'title',
            },
          },
          400,
        ),
    })
    const run = avatarStage.run(await stageContext(project.root, []))
    if (code) await assert.rejects(run, { code }, `${remaining}`)
    else assert.equal(await run, undefined, `${remaining}`)
    assert.equal(fake.calls.filter(isBalanceRead).length, reads, `${remaining}`)
    assert.equal(fake.posts().length, posts, `${remaining}`)
  }
})

test('saldo ilegible (HeyGen caído al leerlo): se avisa una sola vez y se genera igual', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0), avatarScene(2, 1)])
  const events = []
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    me: {
      status: 503,
      body: { error: { code: 'unavailable', message: 'Service Unavailable' } },
    },
  })
  await avatarStage.run(await stageContext(project.root, events))
  assert.equal(fake.posts().length, 2)
  assert.deepEqual(
    ofType(events, 'log')
      .filter((event) => event.level === 'warn')
      .map((event) => event.message),
    [
      'HeyGen balance unavailable (avatar_network): rendering without a balance check',
    ],
  )
  assert.deepEqual(
    ofType(events, 'avatar-scene-ready')
      .map((event) => event.sceneId)
      .sort(),
    [1, 2],
  )
})

test('saldo: una billetera en créditos no se compara con dólares: se informa y se genera igual', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0)])
  const events = []
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    me: wallet(0.001, 'credits'),
  })
  await avatarStage.run(await stageContext(project.root, events))
  assert.equal(fake.posts().length, 1)
  assert.ok(
    ofType(events, 'log').some(
      (event) => event.level === 'info' && /credits/.test(event.message),
    ),
  )
})

test('saldo: una clave rechazada o ausente corta antes de subir nada', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0)])
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    me: {
      status: 401,
      body: {
        error: { code: 'unauthorized', message: 'Invalid or expired API key.' },
      },
    },
  })
  await assert.rejects(avatarStage.run(await stageContext(project.root, [])), {
    code: 'avatar_invalid_key',
  })
  assert.deepEqual(fake.uploads(), [])
  await assert.rejects(
    avatarStage.run(await stageContext(project.root, [], { apiKeys: {} })),
    { code: 'missing_api_key' },
  )
})

test('concurrencia: de cuatro escenas pendientes, nunca más de tres a la vez', async (t) => {
  const project = await videoProject(t, [
    avatarScene(1, 0),
    avatarScene(2, 1),
    avatarScene(3, 2),
    avatarScene(4, 3),
  ])
  const events = []
  fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  let active = 0
  let peak = 0
  const context = await stageContext(project.root, events)
  context.emitter = {
    emit(event) {
      events.push(event)
      if (event.type === 'avatar-scene-started') peak = Math.max(peak, ++active)
      if (
        event.type === 'avatar-scene-ready' ||
        event.type === 'avatar-scene-failed'
      )
        active--
    },
  }
  await avatarStage.run(context)
  assert.equal(peak, 3)
  assert.equal(ofType(events, 'avatar-scene-ready').length, 4)
})

test('cosecha antes que saldo: un render ya pago se baja y publica aunque el saldo no alcance para el resto', async (t) => {
  const paid = avatarScene(1, 0)
  const project = await videoProject(t, [paid, avatarScene(2, 1)])
  const scenes = await readScenesJson(project.projectDir)
  scenes[0].avatar.attempts = [
    {
      hash: await currentHash(project.projectDir, paid),
      state: 'pending',
      engine: 'avatar_iii',
      lookId: 'look-1',
      audioAssetId: 'asset-a',
      videoId: 'video-pagado',
      createdAt: '2026-10-10T15:00:00.000Z',
    },
  ]
  await writeFile(
    join(project.projectDir, 'scenes.json'),
    JSON.stringify(scenes),
  )
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    me: wallet(0),
  })
  await assert.rejects(avatarStage.run(await stageContext(project.root, [])), {
    code: 'avatar_insufficient_credits',
  })
  const after = await readScenesJson(project.projectDir)
  assert.equal(after[0].avatar.status, 'ready')
  assert.equal(after[0].avatar.attempts[0].videoId, 'video-pagado')
  assert.equal(after[1].avatar.status, 'planned')
  assert.deepEqual(fake.posts(), [])
  // El saldo se miró después de cosechar.
  const firstPoll = fake.calls.findIndex(
    (call) => call.path === '/v3/videos/video-pagado',
  )
  const meIndex = fake.calls.findIndex(isBalanceRead)
  assert.ok(firstPoll >= 0 && firstPoll < meIndex)
})

test('cosecha antes que saldo también con un recibo `creating` o `ambiguous`: se adopta por título sin POST aunque el saldo esté en cero, y la búsqueda va antes que la lectura del saldo', async (t) => {
  const fake = fakeHeyGen(t, {})
  for (const state of ['creating', 'ambiguous']) {
    const paid = avatarScene(1, 0)
    const project = await videoProject(t, [paid, avatarScene(2, 1)])
    const hash = await currentHash(project.projectDir, paid)
    const scenes = await readScenesJson(project.projectDir)
    scenes[0].avatar.attempts = [
      {
        hash,
        state,
        engine: 'avatar_iii',
        lookId: 'look-1',
        audioAssetId: 'asset-a',
        createdAt: '2026-10-10T15:00:00.000Z',
      },
    ]
    await writeFile(
      join(project.projectDir, 'scenes.json'),
      JSON.stringify(scenes),
    )
    // El render del intento sin respuesta ya existe en HeyGen con su título.
    fake.reset({
      clip: project.clip,
      clipSeconds: 1,
      me: wallet(0),
      listed: [
        {
          id: 'video-pagado',
          title: avatarVideoTitle(PROJECT_ID, 1, avatarRequestKey(hash, 0)),
          status: 'completed',
        },
      ],
    })
    await assert.rejects(
      avatarStage.run(await stageContext(project.root, [])),
      { code: 'avatar_insufficient_credits' },
      state,
    )
    const after = await readScenesJson(project.projectDir)
    assert.equal(after[0].avatar.status, 'ready', state)
    assert.deepEqual(
      after[0].avatar.attempts.map((attempt) => [
        attempt.state,
        attempt.videoId,
      ]),
      [['succeeded', 'video-pagado']],
      state,
    )
    assert.equal(after[1].avatar.status, 'planned', state)
    assert.deepEqual(fake.posts(), [], state)
    const firstList = fake.calls.findIndex(
      (call) => call.method === 'GET' && call.path === '/v3/videos',
    )
    const firstBalanceRead = fake.calls.findIndex(isBalanceRead)
    assert.ok(firstList >= 0 && firstList < firstBalanceRead, state)
  }
})

test('una escena que pasa por la cosecha y después pide un render nuevo se anuncia una sola vez', async (t) => {
  // Un intento de un pedido VIEJO (otra narración): el carril lo ignora, en
  // la cosecha devuelve `needs-request` (y ya avisó que empezó) y en la
  // segunda pasada pide el render actual (y vuelve a avisar).
  const project = await videoProject(t, [
    avatarScene(1, 0, {
      attempts: [
        {
          hash: 'pedido-de-otra-narracion',
          state: 'pending',
          engine: 'avatar_iii',
          lookId: 'look-1',
          audioAssetId: 'asset-viejo',
          videoId: 'video-viejo',
          createdAt: '2026-10-09T15:00:00.000Z',
        },
      ],
    }),
  ])
  const events = []
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  await avatarStage.run(await stageContext(project.root, events))
  assert.deepEqual(
    ofType(events, 'avatar-scene-started').map((event) => event.sceneId),
    [1],
  )
  assert.deepEqual(
    ofType(events, 'avatar-scene-ready').map((event) => event.sceneId),
    [1],
  )
  assert.equal(fake.posts().length, 1)
  // La cosecha no paga: el pedido nuevo salió después de mirar el saldo.
  assert.ok(balanceReadsBefore(fake.calls, isRenderRequest)[0] >= 1)
  assert.equal(
    fake.calls.some((call) => call.path === '/v3/videos/video-viejo'),
    false,
  )
})

test('selección (el comando del editor): solo las escenas pedidas, una vez cada una; una lista pero desactualizada se regenera y una que no es de avatar se rechaza', async (t) => {
  const project = await videoProject(t, [
    avatarScene(1, 0, {
      status: 'ready',
      clipFile: 'scene_1.ab12cd34.mp4',
      renderHash: 'del-render-anterior',
      narrationVersion: 0,
      attempts: [
        {
          hash: 'pedido-anterior',
          state: 'succeeded',
          engine: 'avatar_iii',
          lookId: 'look-1',
          audioAssetId: 'asset-anterior',
          videoId: 'video-anterior',
          videoUrl: 'https://cdn.example/video-anterior.mp4',
          createdAt: '2026-10-09T15:00:00.000Z',
        },
      ],
    }),
    avatarScene(2, 1),
    plainScene(3, 2),
  ])
  await mkdir(join(project.projectDir, 'avatar'), { recursive: true })
  await writeFile(
    join(project.projectDir, 'avatar', 'scene_1.ab12cd34.mp4'),
    project.clip,
  )
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const context = await stageContext(project.root, [])
  await assert.rejects(renderAvatarScenes(context, { sceneIds: [3] }), {
    code: 'invalid_payload',
  })
  assert.deepEqual(fake.calls, [])

  // Un id repetido no corre dos carriles de la misma escena.
  const outcome = await renderAvatarScenes(context, { sceneIds: [1, 1] })
  assert.deepEqual(outcome, { rendered: [1], failed: [] })
  assert.equal(fake.posts().length, 1)
  assert.match(fake.posts()[0].body.title, /:scene-1:/)
  const scenes = await readScenesJson(project.projectDir)
  assert.equal(scenes[0].avatar.status, 'ready')
  assert.notEqual(scenes[0].avatar.clipFile, 'scene_1.ab12cd34.mp4')
  // La pedida no arrastra a la otra pendiente.
  assert.equal(scenes[1].avatar.status, 'planned')
})

test('el mp4 se marca desactualizado solo cuando una escena recibe un clip nuevo: regenerar una escena lista que HeyGen después rechaza no lo marca; la regeneración que sale bien, sí', async (t) => {
  // Lista pero desactualizada (otra narración), con su clip y un mp4 hecho.
  const project = await videoProject(
    t,
    [
      avatarScene(1, 0, {
        status: 'ready',
        clipFile: 'scene_1.ab12cd34.mp4',
        renderHash: 'del-render-anterior',
        narrationVersion: 0,
      }),
    ],
    { video: true },
  )
  await mkdir(join(project.projectDir, 'avatar'), { recursive: true })
  await writeFile(
    join(project.projectDir, 'avatar', 'scene_1.ab12cd34.mp4'),
    project.clip,
  )
  const metadata = async () =>
    JSON.parse(await readFile(join(project.projectDir, 'project.json'), 'utf8'))
  // Los recibos intermedios (`creating`, `pending`) se guardan con la escena
  // todavía `ready`: no son un clip nuevo.
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    poll: () => ({
      status: 'failed',
      extra: {
        failure_code: 'rendering_failed',
        failure_message: 'Avatar rendering timed out',
      },
    }),
  })
  const failing = await stageContext(project.root, [])
  assert.deepEqual(await renderAvatarScenes(failing, { sceneIds: [1] }), {
    rendered: [],
    failed: [1],
    dominantCode: 'avatar_render_failed',
  })
  assert.equal(fake.posts().length, 1)
  assert.notEqual((await metadata()).videoOutdated, true)
  assert.notEqual(failing.metadata.videoOutdated, true)

  fake.reset({ clip: project.clip, clipSeconds: 1 })
  const succeeding = await stageContext(project.root, [])
  assert.deepEqual(await renderAvatarScenes(succeeding, { sceneIds: [1] }), {
    rendered: [1],
    failed: [],
  })
  assert.equal((await metadata()).videoOutdated, true)
  assert.equal(succeeding.metadata.videoOutdated, true)
})

test('cancelar con renders en vuelo: sale como cancelación, el pedido en vuelo queda guardado sin resolver y la que espera turno no arranca', async (t) => {
  const project = await videoProject(t, [
    avatarScene(1, 0),
    avatarScene(2, 1),
    avatarScene(3, 2),
    avatarScene(4, 3),
  ])
  const controller = new AbortController()
  // La persona cancela mientras el primer pedido de render está en vuelo.
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    onRequest: (call) => {
      if (isRenderRequest(call)) controller.abort()
    },
  })
  const context = await stageContext(project.root, [])
  context.signal = controller.signal
  await assert.rejects(avatarStage.run(context), { name: 'AbortError' })

  const scenes = await readScenesJson(project.projectDir)
  const posted = fake.posts()
  assert.ok(posted.length >= 1)
  // Todo pedido que salió quedó guardado sin resolver (la próxima corrida lo
  // busca por su título): la escritura del recibo no usa la señal del job.
  for (const call of posted) {
    const sceneId = Number(/:scene-(\d+):/.exec(call.body.title)[1])
    const attempts = scenes.find((scene) => scene.id === sceneId).avatar
      .attempts
    assert.deepEqual(
      attempts.map((attempt) => attempt.state),
      ['ambiguous'],
      `escena ${sceneId}`,
    )
    assert.ok(attempts[0].audioAssetId)
  }
  // La cuarta esperaba turno: ni saldo, ni audio, ni recibo.
  assert.equal('attempts' in scenes[3].avatar, false)
  assert.equal(scenes[3].avatar.status, 'planned')
})

test('lease: con las escenas tomadas se relee scenes.json; lo que otro job dejó listo entre la primera lectura y el lease no se vuelve a pagar ni se pisa', async (t) => {
  const project = await videoProject(t, [
    avatarScene(1, 0, { status: 'failed', errorCode: 'avatar_render_failed' }),
  ])
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  // Lo que deja el otro job (el comando del editor, por ejemplo): la escena
  // lista con su recibo y su clip en disco.
  await mkdir(join(project.projectDir, 'avatar'), { recursive: true })
  await writeFile(
    join(project.projectDir, 'avatar', 'scene_1.ab12cd34.mp4'),
    project.clip,
  )
  const finished = avatarScene(1, 0, {
    status: 'ready',
    clipFile: 'scene_1.ab12cd34.mp4',
    attempts: [
      {
        hash: 'pedido-del-otro-job',
        state: 'succeeded',
        engine: 'avatar_iii',
        lookId: 'look-1',
        audioAssetId: 'asset-del-otro-job',
        videoId: 'video-del-otro-job',
        createdAt: '2026-10-10T15:00:00.000Z',
      },
    ],
  })
  // La escritura del otro job cae entre la primera lectura de scenes.json y el
  // lease: la fase toca la narración por primera vez en ese hueco. Aterriza
  // recién cuando ya hubo una lectura: si la fase validara la narración antes
  // de leer las escenas, caería tarde, el carril pagaría y el caso fallaría
  // en voz alta (en vez de pasar sin probar la relectura).
  const context = await stageContext(project.root, [])
  const { narrationFile, scenesFile } = context.paths
  let scenesReads = 0
  let landed = false
  context.paths = Object.defineProperties(
    { ...context.paths },
    {
      scenesFile: {
        get() {
          scenesReads++
          return scenesFile
        },
      },
      narrationFile: {
        get() {
          if (!landed && scenesReads > 0) {
            landed = true
            writeFileSync(
              join(project.projectDir, 'scenes.json'),
              JSON.stringify([finished]),
            )
          }
          return narrationFile
        },
      },
    },
  )
  await avatarStage.run(context)
  assert.ok(landed)
  assert.deepEqual(fake.calls, [])
  const [scene] = await readScenesJson(project.projectDir)
  assert.equal(scene.avatar.status, 'ready')
  assert.deepEqual(
    scene.avatar.attempts.map((attempt) => attempt.videoId),
    ['video-del-otro-job'],
  )
})

test('una aparición que falla no frena la fase (entrega 2d): el pipeline la completa con un aviso en el log, el render muestra esa escena con la imagen fija del look, reanudar ya no la reintenta (ronda 1 de WP-P) y el editor la paga', async (t) => {
  const project = await pipelineProject(t, [
    avatarScene(1, 0),
    avatarScene(2, 1),
  ])
  // La copia de la vista previa del look: la imagen fija de las escenas de
  // avatar en el render (diseño §6.2).
  await mkdir(join(project.projectDir, 'avatar'), { recursive: true })
  await writeFile(
    join(project.projectDir, 'avatar', 'look.png'),
    Buffer.from('png'),
  )
  const events = []
  // Un render fallido por algo que repetir puede arreglar (no moderación ni
  // un look que no sirve).
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    poll: (videoId) =>
      videoId === 'video-2-1'
        ? {
            status: 'failed',
            extra: {
              failure_code: 'rendering_failed',
              failure_message: 'Avatar rendering timed out',
            },
          }
        : { status: 'completed' },
  })
  assert.deepEqual(await runPipelineToAvatar(project.root, events), {
    status: 'completed',
  })
  assert.ok(
    ofType(events, 'stage-completed').some(
      (event) => event.stageId === 'avatar',
    ),
  )
  assert.ok(
    (await readMetadata(project.projectDir)).completedStages.includes('avatar'),
  )
  assert.deepEqual(ofType(events, 'avatar-scene-failed'), [
    {
      type: 'avatar-scene-failed',
      sceneId: 2,
      code: 'avatar_render_failed',
    },
  ])
  assert.deepEqual(
    ofType(events, 'log')
      .filter((event) => event.level === 'warn')
      .map((event) => event.message),
    [
      "avatar scenes without a clip: 2 (most frequent failure: avatar_render_failed): the video shows the look's still image there",
    ],
  )
  const afterFirst = await readScenesJson(project.projectDir)
  assert.equal(afterFirst[0].avatar.status, 'ready')
  assert.equal(afterFirst[1].avatar.status, 'failed')
  assert.equal(afterFirst[1].avatar.errorCode, 'avatar_render_failed')

  // El render (diseño §10.1, ya existía): la lista entra con su clip y la
  // fallida, estática con la vista previa del look; no falta ninguna imagen.
  const first = await stageContext(project.root, [])
  const warnings = []
  const collected = await collectRenderScenes(
    first.paths,
    FFMPEG,
    afterFirst,
    first.metadata,
    (message) => warnings.push(message),
  )
  assert.deepEqual(collected.missingImages, [])
  assert.deepEqual(collected.missingAvatarLooks, [])
  assert.deepEqual(
    collected.renderScenes.map((scene) => [
      scene.id,
      scene.clipPath ? 'clip' : basename(scene.imagePath),
    ]),
    [
      [1, 'clip'],
      [2, 'look.png'],
    ],
  )
  assert.deepEqual(warnings, [
    'scene 2: rendering the avatar look static (avatar clip failed: avatar_render_failed)',
  ])

  // Reanudar (otra fase se cayó después, por ejemplo), con el MISMO fetch
  // simulado: la fase terminada no vuelve a correr, ni habla con HeyGen.
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  const resumed = []
  await runPipelineToAvatar(project.root, resumed)
  assert.deepEqual(fake.calls, [])
  assert.ok(
    ofType(resumed, 'stage-skipped').some(
      (event) => event.stageId === 'avatar',
    ),
  )
  assert.equal(
    (await readScenesJson(project.projectDir))[1].avatar.status,
    'failed',
  )

  // El «Regenerar» del editor la paga: un render nuevo, con la clave
  // siguiente y sin volver a subir el audio.
  assert.deepEqual(
    await renderScenes(project.root, { projectId: PROJECT_ID, sceneIds: [2] }),
    { rendered: [2], failed: [] },
  )
  assert.equal(fake.posts().length, 1)
  assert.match(fake.posts()[0].body.title, /:scene-2:/)
  assert.equal(fake.uploads().length, 0)
  assert.equal(
    (await readScenesJson(project.projectDir))[1].avatar.status,
    'ready',
  )
})

test('una pausa de la cuenta no completa la fase (ronda 1 de WP-P): sin saldo, el pipeline pausa sin anotarla y reanudar paga lo pendiente; con la clave que deja de servir a mitad, sale con su código sin anotarla y reanudar cosecha los renders pagados', async (t) => {
  // Saldo: dos escenas de 0,0165 USD y 0,02 en la billetera.
  const project = await pipelineProject(t, [
    avatarScene(1, 0),
    avatarScene(2, 1),
  ])
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    me: wallet(0.02),
  })
  await assert.rejects(runPipelineToAvatar(project.root), {
    code: 'avatar_insufficient_credits',
  })
  const paused = await readMetadata(project.projectDir)
  assert.equal(paused.state, 'paused')
  assert.equal(paused.pauseReason, 'insufficient-credits')
  assert.equal(paused.errorCode, 'avatar_insufficient_credits')
  assert.deepEqual(paused.completedStages, BEFORE_AVATAR)
  assert.deepEqual(fake.posts(), [])
  // Recargó: reanudar retoma las dos y las paga.
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  assert.deepEqual(await runPipelineToAvatar(project.root), {
    status: 'completed',
  })
  assert.equal(fake.posts().length, 2)
  assert.deepEqual((await readMetadata(project.projectDir)).completedStages, [
    ...BEFORE_AVATAR,
    'avatar',
  ])
  assert.deepEqual(
    (await readScenesJson(project.projectDir)).map(
      (scene) => scene.avatar.status,
    ),
    ['ready', 'ready'],
  )

  // Clave: los dos renders salieron y HeyGen rechaza la clave al consultarlos.
  const keyed = await pipelineProject(t, [avatarScene(1, 0), avatarScene(2, 1)])
  fake.reset({ clip: keyed.clip, poll: () => ({ httpStatus: 401 }) })
  await assert.rejects(runPipelineToAvatar(keyed.root), {
    code: 'avatar_invalid_key',
  })
  const stopped = await readMetadata(keyed.projectDir)
  assert.equal(stopped.state, 'error')
  assert.equal(stopped.errorCode, 'avatar_invalid_key')
  assert.deepEqual(stopped.completedStages, BEFORE_AVATAR)
  assert.equal(fake.posts().length, 2)
  // Con la clave arreglada, reanudar cosecha los dos renders pagados: ningún
  // POST nuevo.
  fake.reset({ clip: keyed.clip, clipSeconds: 1 })
  assert.deepEqual(await runPipelineToAvatar(keyed.root), {
    status: 'completed',
  })
  assert.deepEqual(fake.posts(), [])
  assert.deepEqual(
    (await readScenesJson(keyed.projectDir)).map(
      (scene) => scene.avatar.status,
    ),
    ['ready', 'ready'],
  )
  assert.deepEqual((await readMetadata(keyed.projectDir)).completedStages, [
    ...BEFORE_AVATAR,
    'avatar',
  ])
})

test('un render moderado no se vuelve a pedir solo: si la fase corre otra vez sin haberse completado, la escena sigue fallida con su código, sin saldo ni POST, se avisa y la fase termina igual; pedido desde el editor, sí se paga otra vez', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0), avatarScene(2, 1)])
  const moderated = {
    status: 'failed',
    extra: {
      failure_code: 'content_policy_violation',
      failure_message: 'Content rejected',
    },
  }
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    poll: (videoId) =>
      videoId === 'video-2-1' ? moderated : { status: 'completed' },
  })
  assert.equal(
    await avatarStage.run(await stageContext(project.root, [])),
    undefined,
  )

  // La fase vuelve a correr sin haberse completado (así queda tras una pausa
  // de la cuenta en otra escena; completada, reanudar ni la corre: ronda 1 de
  // WP-P). La moderada no se vuelve a pedir (volvería a fallar igual): ni
  // saldo, ni audio, ni POST; la fase termina sin clip para ella y el código
  // dominante, en el aviso del log, es el de la moderación.
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  const events = []
  const context = await stageContext(project.root, events)
  assert.equal(await avatarStage.skip(context), false)
  assert.equal(await avatarStage.run(context), undefined)
  assert.ok(
    ofType(events, 'log').some(
      (event) =>
        event.level === 'warn' &&
        /^avatar scenes without a clip: 2 \(most frequent failure: avatar_moderation_rejected\)/.test(
          event.message,
        ),
    ),
  )
  assert.deepEqual(fake.calls, [])
  assert.deepEqual(ofType(events, 'avatar-scene-failed'), [
    {
      type: 'avatar-scene-failed',
      sceneId: 2,
      code: 'avatar_moderation_rejected',
    },
  ])
  assert.ok(
    ofType(events, 'log').some(
      (event) =>
        event.level === 'warn' &&
        /Avatar scene 2: HeyGen rejected this request for good/.test(
          event.message,
        ),
    ),
  )
  const stored = (await readScenesJson(project.projectDir))[1].avatar
  assert.equal(stored.status, 'failed')
  assert.equal(stored.errorCode, 'avatar_moderation_rejected')
  assert.deepEqual(
    stored.attempts.map((attempt) => attempt.state),
    ['failed'],
  )

  // La persona lo pide desde el editor: se paga otro render, con otra clave y
  // el audio ya subido, después de mirar el saldo.
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  const outcome = await renderAvatarScenes(
    await stageContext(project.root, []),
    { sceneIds: [2] },
  )
  assert.deepEqual(outcome, { rendered: [2], failed: [] })
  assert.equal(fake.posts().length, 1)
  assert.match(fake.posts()[0].body.title, /:scene-2:/)
  assert.equal(fake.uploads().length, 0)
  assert.ok(balanceReadsBefore(fake.calls, isRenderRequest)[0] >= 1)
})

test('la cuenta sigue frenando la fase (entrega 2d): la clave que deja de servir a mitad de corrida (401 al consultar el render) la deja con avatar_invalid_key, no termina con la imagen fija', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0), avatarScene(2, 1)])
  const events = []
  // El saldo se leyó bien y los dos pedidos salieron; después HeyGen rechaza
  // la clave al consultar cada render.
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    poll: () => ({ httpStatus: 401 }),
  })
  await assert.rejects(
    avatarStage.run(await stageContext(project.root, events)),
    (error) => {
      assert.equal(error.code, 'avatar_invalid_key')
      assert.equal(error.provider, 'heygen')
      assert.match(error.message, /without a clip: 1, 2 /)
      return true
    },
  )
  assert.equal(fake.posts().length, 2)
  assert.deepEqual(
    ofType(events, 'avatar-scene-failed').map((event) => event.code),
    ['avatar_invalid_key', 'avatar_invalid_key'],
  )
  // Los recibos pagos siguen pendientes: con la clave arreglada se cosechan.
  const scenes = await readScenesJson(project.projectDir)
  assert.deepEqual(
    scenes.map((scene) =>
      scene.avatar.attempts.map((attempt) => attempt.state),
    ),
    [['pending'], ['pending']],
  )
})

test('un código de la cuenta gana sobre el rechazo para siempre de otra escena, en los dos órdenes: la fase sale con avatar_invalid_key y el render pagado sigue esperando la clave', async (t) => {
  const fake = fakeHeyGen(t, {})
  for (const [moderatedId, paidId] of [
    [1, 2],
    [2, 1],
  ]) {
    const label = `moderada ${moderatedId}, pagada ${paidId}`
    const project = await videoProject(t, [
      avatarScene(1, 0),
      avatarScene(2, 1),
    ])
    const scenes = await readScenesJson(project.projectDir)
    for (const scene of scenes) {
      const receipt = {
        hash: await currentHash(project.projectDir, scene),
        engine: 'avatar_iii',
        lookId: 'look-1',
        audioAssetId: `asset-${scene.id}`,
        createdAt: '2026-10-10T15:00:00.000Z',
      }
      if (scene.id === paidId) {
        scene.avatar.attempts = [
          { ...receipt, state: 'pending', videoId: 'video-pagado' },
        ]
        continue
      }

      // Moderada en una corrida anterior: la fase no la vuelve a pedir.
      scene.avatar.status = 'failed'
      scene.avatar.errorCode = 'avatar_moderation_rejected'
      scene.avatar.attempts = [
        {
          ...receipt,
          state: 'failed',
          errorCode: 'avatar_moderation_rejected',
        },
      ]
    }
    await writeFile(
      join(project.projectDir, 'scenes.json'),
      JSON.stringify(scenes),
    )
    // La clave dejó de servir: HeyGen la rechaza al consultar el render pagado.
    fake.reset({ clip: project.clip, poll: () => ({ httpStatus: 401 }) })
    await assert.rejects(
      avatarStage.run(await stageContext(project.root, [])),
      { code: 'avatar_invalid_key' },
      label,
    )
    const paid = (await readScenesJson(project.projectDir)).find(
      (scene) => scene.id === paidId,
    ).avatar
    assert.deepEqual(
      paid.attempts.map((attempt) => [attempt.state, attempt.videoId]),
      [['pending', 'video-pagado']],
      label,
    )
    assert.deepEqual(fake.posts(), [], label)
  }
})

test('un fallo de otra escena no tapa la pausa por saldo: si una falla al guardar y otra recibe un 402, la fase pausa', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0), avatarScene(2, 1)])
  fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    create: (call) =>
      /:scene-2:/.test(call.body.title)
        ? json(
            {
              error: {
                code: 'insufficient_credit',
                message: 'Not enough credit',
              },
            },
            402,
          )
        : undefined,
  })
  const context = await stageContext(project.root, [])
  // project.json se rompe después de armar el contexto: la escena 1 llega a
  // lista y falla al marcar el mp4 desactualizado (un error que no es de
  // saldo), mientras la 2 recibe el 402. La 1 va primero en el lote.
  await writeFile(join(project.projectDir, 'project.json'), '{ roto')
  await assert.rejects(avatarStage.run(context), {
    code: 'avatar_insufficient_credits',
  })
})

test('HeyGen caído: cada escena falla con avatar_network, el aviso de proveedor sale una vez, el intento queda sin resolver y la fase termina igual (entrega 2d)', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0), avatarScene(2, 1)])
  const events = []
  fakeHeyGen(t, {
    clip: project.clip,
    create: () =>
      new Response('<html>Service Unavailable</html>', { status: 503 }),
  })
  assert.equal(
    await avatarStage.run(await stageContext(project.root, events)),
    undefined,
  )
  assert.deepEqual(ofType(events, 'avatar-provider-trouble'), [
    {
      type: 'avatar-provider-trouble',
      code: 'avatar_network',
      httpStatus: 503,
    },
  ])
  const failures = ofType(events, 'provider-failure')
  assert.equal(failures.length, 2)
  assert.ok(
    failures.every(
      (event) =>
        event.provider === 'heygen' &&
        event.stageId === 'avatar' &&
        event.recovered === false,
    ),
  )
  const scenes = await readScenesJson(project.projectDir)
  assert.deepEqual(
    scenes.map((scene) =>
      scene.avatar.attempts.map((attempt) => attempt.state),
    ),
    [['ambiguous'], ['ambiguous']],
  )
})

test('plazo vencido (entrega 2d): el pipeline completa la fase con el render pagado `pending`; reanudar ya no la corre (ronda 1 de WP-P) y el «Regenerar» del editor lo cosecha sin pagar otra vez', async (t) => {
  const project = await pipelineProject(t, [avatarScene(1, 0)])
  const events = []
  // HeyGen nunca termina el render. La fase usa el reloj del sistema: en la
  // primera consulta del render, el reloj salta más allá del plazo.
  const realNow = Date.now
  let skew = 0
  t.mock.method(Date, 'now', () => realNow() + skew)
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    poll: () => ({ status: 'processing' }),
    onRequest: (call) => {
      if (call.method === 'GET' && call.path === '/v3/videos/video-1-1')
        skew = AVATAR_RENDER_DEADLINE_MS + 1000
    },
  })
  assert.deepEqual(await runPipelineToAvatar(project.root, events), {
    status: 'completed',
  })
  assert.equal(fake.posts().length, 1)
  assert.deepEqual(ofType(events, 'avatar-scene-failed'), [
    { type: 'avatar-scene-failed', sceneId: 1, code: 'avatar_timeout' },
  ])
  const [timedOut] = await readScenesJson(project.projectDir)
  assert.equal(timedOut.avatar.status, 'failed')
  assert.equal(timedOut.avatar.errorCode, 'avatar_timeout')
  assert.deepEqual(
    timedOut.avatar.attempts.map((attempt) => [attempt.state, attempt.videoId]),
    [['pending', 'video-1-1']],
  )
  assert.ok(
    (await readMetadata(project.projectDir)).completedStages.includes('avatar'),
  )

  // Reanudar: la fase terminada no vuelve a correr ni consulta HeyGen.
  skew = 0
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  await runPipelineToAvatar(project.root)
  assert.deepEqual(fake.calls, [])
  assert.equal(
    (await readScenesJson(project.projectDir))[0].avatar.status,
    'failed',
  )

  // El «Regenerar» del editor: HeyGen ya lo terminó y se cosecha el render
  // pagado. Ni saldo, ni audio, ni POST.
  assert.deepEqual(
    await renderScenes(project.root, { projectId: PROJECT_ID, sceneIds: [1] }),
    { rendered: [1], failed: [] },
  )
  assert.deepEqual(fake.posts(), [])
  assert.deepEqual(fake.uploads(), [])
  assert.equal(fake.calls.filter(isBalanceRead).length, 0)
  const [harvested] = await readScenesJson(project.projectDir)
  assert.equal(harvested.avatar.status, 'ready')
  assert.deepEqual(
    harvested.avatar.attempts.map((attempt) => [
      attempt.state,
      attempt.videoId,
    ]),
    [['succeeded', 'video-1-1']],
  )
})

// El comando del editor (`avatar-render-scenes`, diseño §8): se llama por el
// registro de subcomandos de `videos`, con el lease que le pone ese envoltorio.
const renderScenes = (root, payload, events = []) =>
  videosSubcommands['avatar-render-scenes'](
    baseContext(root, events, { payload }),
  )

test('avatar-render-scenes: un payload inválido o una escena que no es de avatar se rechaza sin hablar con HeyGen, también mezclada con una que sí lo es', async (t) => {
  const project = await videoProject(t, [plainScene(1, 0), avatarScene(2, 1)])
  const fake = fakeHeyGen(t, { clip: project.clip })
  for (const payload of [
    undefined,
    { sceneIds: [2] },
    // Sin escenas el comando no es «todas las pendientes» (eso es la fase).
    { projectId: PROJECT_ID },
    { projectId: PROJECT_ID, sceneIds: null },
    { projectId: PROJECT_ID, sceneIds: [] },
    { projectId: PROJECT_ID, sceneIds: 2 },
    { projectId: PROJECT_ID, sceneIds: [-1] },
    { projectId: PROJECT_ID, sceneIds: [1.5] },
    { projectId: PROJECT_ID, sceneIds: [1] },
    { projectId: PROJECT_ID, sceneIds: [9] },
    // La 2 sí es de avatar, la 1 no: no se paga ninguna.
    { projectId: PROJECT_ID, sceneIds: [2, 1] },
  ])
    await assert.rejects(
      renderScenes(project.root, payload),
      { code: 'invalid_payload' },
      JSON.stringify(payload),
    )
  assert.deepEqual(fake.calls, [])
})

test('avatar-render-scenes: genera solo las escenas pedidas, una escena lista no se vuelve a pagar y una que HeyGen rechaza vuelve como fallida sin lanzar', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0), avatarScene(2, 1)])
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  assert.deepEqual(
    await renderScenes(project.root, {
      projectId: PROJECT_ID,
      sceneIds: [2, 2],
    }),
    { rendered: [2], failed: [] },
  )
  assert.equal(fake.posts().length, 1)
  const scenes = await readScenesJson(project.projectDir)
  assert.equal(scenes[0].avatar.status, 'planned')
  assert.equal(scenes[1].avatar.status, 'ready')
  // Otra vez la misma escena, con el mismo pedido: lista, sin pagar ni mirar el saldo.
  const before = fake.calls.length
  assert.deepEqual(
    await renderScenes(project.root, { projectId: PROJECT_ID, sceneIds: [2] }),
    { rendered: [2], failed: [] },
  )
  assert.equal(fake.posts().length, 1)
  assert.equal(
    fake.calls.slice(before).some((call) => call.path === '/v3/users/me'),
    false,
  )
  // Pedidas juntas, la lista y otra que HeyGen rechaza: el comando no lanza,
  // devuelve cada escena en su lista y solo paga la que faltaba.
  fake.reset({
    clip: project.clip,
    clipSeconds: 1,
    poll: () => ({
      status: 'failed',
      extra: {
        failure_code: 'content_policy_violation',
        failure_message: 'Content rejected',
      },
    }),
  })
  assert.deepEqual(
    await renderScenes(project.root, {
      projectId: PROJECT_ID,
      sceneIds: [2, 1],
    }),
    { rendered: [2], failed: [1] },
  )
  assert.equal(fake.posts().length, 1)
  const afterRejection = await readScenesJson(project.projectDir)
  assert.equal(afterRejection[0].avatar.status, 'failed')
  assert.equal(afterRejection[1].avatar.status, 'ready')
})

test('avatar-render-scenes: corre con el lease de animación: las lecturas y otros generadores siguen disponibles y una escritura exclusiva no entra', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0)])
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  let rendering
  const renderingStarted = new Promise((resolve) => {
    rendering = resolve
  })
  fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    async onRequest(call) {
      if (call.method !== 'GET' || call.path !== '/v3/videos/video-1-1') return
      rendering()
      await held
    },
  })
  const job = renderScenes(project.root, {
    projectId: PROJECT_ID,
    sceneIds: [1],
  })
  try {
    // Si el comando falla antes de llegar a HeyGen sale su error, no un cuelgue.
    await Promise.race([renderingStarted, job])
    // Mientras HeyGen renderiza, el estado del proyecto se lee…
    const status = await videosSubcommands['video-project-status'](
      baseContext(project.root, [], { payload: { projectId: PROJECT_ID } }),
    )
    assert.equal(status.scenes.length, 1)
    // …otro generador entra al proyecto (el lease es compartido: su propio
    // handler rechaza el payload vacío, ya adentro)…
    await assert.rejects(
      videosSubcommands['animate-scenes'](
        baseContext(project.root, [], {
          payload: { projectId: PROJECT_ID, sceneIds: [] },
        }),
      ),
      { code: 'invalid_payload' },
    )
    // …y una escritura exclusiva (mover escenas) falla sin esperar.
    await assert.rejects(
      videosSubcommands['update-scenes'](
        baseContext(project.root, [], {
          payload: { projectId: PROJECT_ID, changes: [] },
        }),
      ),
      { code: 'animation_project_busy' },
    )
  } finally {
    // Aunque una aserción falle, el render retenido se suelta y se espera.
    release()
    await job.catch(() => undefined)
  }
  assert.deepEqual(await job, { rendered: [1], failed: [] })
})

// ─── La escena desactualizada no se paga sola (entrega 2d, diseño §8) ───

// Un recibo pagado de una escena (su render ya terminó en HeyGen).
const paidReceipt = (hash, videoId) => ({
  hash,
  state: 'succeeded',
  engine: 'avatar_iii',
  lookId: 'look-1',
  audioAssetId: `asset-${videoId}`,
  videoId,
  videoUrl: `https://cdn.example/${videoId}.mp4`,
  createdAt: '2026-10-10T15:00:00.000Z',
})

test('la desactualizada no se paga sola (entrega 2d): reanudar deja afuera una escena lista y desactualizada aunque le falte el clip —ni anuncio, ni saldo, ni POST, ni un byte de su escena—, cosecha sin pagar la al día que perdió el suyo y paga la planeada; pedida desde el editor, la desactualizada sí se paga', async (t) => {
  // La narración va por la versión 1. La escena 1 se hizo con la 0
  // (desactualizada) y la 2 con la 1 (al día); a ninguna le queda su clip.
  const stale = avatarScene(1, 0)
  const current = avatarScene(2, 1)
  const project = await videoProject(t, [stale, current, avatarScene(3, 2)], {
    metadata: { narrationVersion: 1 },
  })
  const scenes = await readScenesJson(project.projectDir)
  scenes[0].avatar = {
    ...scenes[0].avatar,
    status: 'ready',
    clipFile: 'scene_1.ab12cd34.mp4',
    renderHash: renderHashOf(stale, 0),
    narrationVersion: 0,
    attempts: [
      paidReceipt(await currentHash(project.projectDir, stale, 0), 'video-v0'),
    ],
  }
  scenes[1].avatar = {
    ...scenes[1].avatar,
    status: 'ready',
    clipFile: 'scene_2.ab12cd34.mp4',
    renderHash: renderHashOf(current, 1),
    narrationVersion: 1,
    attempts: [
      paidReceipt(
        await currentHash(project.projectDir, current, 1),
        'video-pagado',
      ),
    ],
  }
  await writeFile(
    join(project.projectDir, 'scenes.json'),
    JSON.stringify(scenes),
  )
  const events = []
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const context = await stageContext(project.root, events)
  assert.equal(await avatarStage.skip(context), false)
  assert.equal(await avatarStage.run(context), undefined)

  // Solo se pagó la planeada, con una sola lectura del saldo.
  assert.deepEqual(
    fake.posts().map((call) => /:scene-(\d+):/.exec(call.body.title)[1]),
    ['3'],
  )
  assert.equal(fake.calls.filter(isBalanceRead).length, 1)
  assert.equal(fake.uploads().length, 1)
  // La desactualizada, intacta: ni anunciada ni tocada en scenes.json.
  assert.deepEqual(
    ofType(events, 'avatar-scene-started')
      .map((event) => event.sceneId)
      .sort(),
    [2, 3],
  )
  const after = await readScenesJson(project.projectDir)
  assert.deepEqual(after[0], scenes[0])
  assert.equal(
    fake.calls.some((call) => call.path === '/v3/videos/video-v0'),
    false,
  )
  // La al día que perdió su clip se cosechó: su mismo video, sin pagar.
  assert.equal(after[1].avatar.status, 'ready')
  assert.deepEqual(
    after[1].avatar.attempts.map((attempt) => [attempt.state, attempt.videoId]),
    [['succeeded', 'video-pagado']],
  )
  assert.equal(after[2].avatar.status, 'ready')
  // Sigue sin ser pendiente: otra corrida no tiene nada que hacer.
  assert.equal(
    await avatarStage.skip(await stageContext(project.root, [])),
    true,
  )

  // Pedida desde el editor (`avatar-render-scenes`), la desactualizada sí se
  // paga: un render nuevo con la narración de hoy, después de mirar el saldo.
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  assert.deepEqual(
    await renderScenes(project.root, { projectId: PROJECT_ID, sceneIds: [1] }),
    { rendered: [1], failed: [] },
  )
  assert.equal(fake.posts().length, 1)
  assert.match(fake.posts()[0].body.title, /:scene-1:/)
  assert.ok(balanceReadsBefore(fake.calls, isRenderRequest)[0] >= 1)
  const regenerated = (await readScenesJson(project.projectDir))[0].avatar
  assert.equal(regenerated.status, 'ready')
  assert.equal(regenerated.narrationVersion, 1)
  assert.equal(regenerated.renderHash, renderHashOf(stale, 1))
})

test('el costo de reanudar cuenta exactamente las escenas que la fase va a trabajar (entrega 2d): la regla de la UI sobre la vista coincide con la de la fase sobre scenes.json, y con la fase terminada las dos dicen que nada (ronda 1 de WP-P)', async (t) => {
  // Un largo distinto por escena (1, 2, 4… 128 s): la suma de segundos dice
  // qué escenas entraron en la cuenta. La narración va por la versión 1.
  const LENGTHS = [1, 2, 4, 8, 16, 32, 64, 128]
  let start = 0
  const spans = LENGTHS.map((length) => {
    const span = { startSeconds: start, endSeconds: start + length }
    start += length
    return span
  })
  const base = spans.map((span, index) => ({
    ...avatarScene(index + 1, span.startSeconds),
    endSeconds: span.endSeconds,
  }))
  const ready = (scene, narrationVersion, extra = {}) => ({
    ...scene,
    avatar: {
      ...scene.avatar,
      status: 'ready',
      clipFile: `scene_${scene.id}.ab12cd34.mp4`,
      renderHash: renderHashOf(scene, narrationVersion),
      narrationVersion,
      ...extra,
    },
  })
  const moved = { ...base[6], endSeconds: base[6].endSeconds - 1 }
  const scenes = [
    // 1: planeada → pendiente.
    base[0],
    // 2: fallida → pendiente.
    {
      ...base[1],
      avatar: {
        ...base[1].avatar,
        status: 'failed',
        errorCode: 'avatar_render_failed',
      },
    },
    // 3: lista y al día, con su clip → no.
    ready(base[2], 1),
    // 4: lista y al día, sin su clip → pendiente (se cosecha).
    ready(base[3], 1),
    // 5: desactualizada (otra narración), con su clip → no.
    ready(base[4], 0),
    // 6: desactualizada (otra narración), sin su clip → no (entrega 2d).
    ready(base[5], 0),
    // 7: desactualizada (otro tramo, misma narración), sin su clip → no.
    { ...ready(moved, 1), endSeconds: base[6].endSeconds },
    // 8: lista con un clip que no es de Vimo → pendiente.
    ready(base[7], 1, { clipFile: '../scene_8.ab12cd34.mp4' }),
  ]
  const project = await videoProject(t, scenes, {
    metadata: { narrationVersion: 1 },
  })
  await mkdir(join(project.projectDir, 'avatar'), { recursive: true })
  for (const id of [3, 5])
    await writeFile(
      join(project.projectDir, 'avatar', `scene_${id}.ab12cd34.mp4`),
      project.clip,
    )
  const context = await stageContext(project.root, [])

  const pending = await pendingAvatarScenes(
    context.paths,
    scenes,
    context.metadata,
  )
  assert.deepEqual(
    pending.map((scene) => scene.id),
    [1, 2, 4, 8],
  )
  const ui = await loadResumeCost(t)
  const views = await toSceneSummaries(context.paths, scenes, context.metadata)
  const resumeCost = (metadata) =>
    ui.estimateResumeCost({
      metadata: {
        ...metadata,
        options: {
          ...OPTIONS,
          avatar: {
            avatarId: 'ana-1',
            lookId: 'look-1',
            lookName: 'Ana',
            lookType: 'photo_avatar',
            engine: 'avatar_iii',
            appearances: 8,
            secondsPerAppearance: 10,
            startWithAvatar: true,
            placement: 'auto',
          },
        },
      },
      scenes: views,
    })
  // Sin terminar (una pausa de la cuenta): 1 + 2 + 8 + 128 = 139 s a 0,99 US$
  // por minuto, como techo.
  assert.equal(await avatarStage.skip(context), false)
  const lines = resumeCost(context.metadata)
  assert.deepEqual(lines, [
    {
      ...ui.avatarSpansCostEstimate('photo_avatar', pending),
      upperBound: true,
    },
  ])
  assert.equal(lines[0].estimated, 2.2935)

  // Terminada (ronda 1 de WP-P), reanudar no corre la fase y no hay nada que
  // cobrar: las mismas escenas se regeneran desde el editor.
  const done = {
    ...context.metadata,
    completedStages: [...BEFORE_AVATAR, 'avatar'],
  }
  assert.equal(await avatarStage.skip({ ...context, metadata: done }), true)
  assert.deepEqual(resumeCost(done), [])
})

// ─── El título del video en cada render (entrega 2c, diseño §7.1) ───

// La marca del primer intento del pedido actual de una escena de este proyecto.
async function markerOf(projectDir, scene) {
  const hash = await currentHash(projectDir, scene)
  return avatarVideoTitle(PROJECT_ID, scene.id, avatarRequestKey(hash, 0))
}

test('título: la fase manda `<nombre del video> · <marca>` con el nombre de project.json (sin espacios de más y cortado en 80; sin nombre, la marca sola) y el recibo de scenes.json lo guarda', async (t) => {
  const fake = fakeHeyGen(t, {})
  for (const [name, titleName] of [
    ['Mi video', 'Mi video'],
    ['  Mi   video  ', 'Mi video'],
    ['', ''],
    ['   ', ''],
    ['x'.repeat(100), 'x'.repeat(80)],
  ]) {
    const scene = avatarScene(1, 0)
    const project = await videoProject(t, [scene], { metadata: { name } })
    fake.reset({ clip: project.clip, clipSeconds: 1 })
    await avatarStage.run(await stageContext(project.root, []))
    const marker = await markerOf(project.projectDir, scene)
    const title = titleName ? `${titleName} · ${marker}` : marker
    const label = JSON.stringify(name)
    assert.deepEqual(
      fake.posts().map((call) => call.body.title),
      [title],
      label,
    )
    const [saved] = await readScenesJson(project.projectDir)
    assert.deepEqual(
      saved.avatar.attempts.map((attempt) => [attempt.state, attempt.title]),
      [['succeeded', title]],
      label,
    )
  }
})

test('título: el comando del editor (`avatar-render-scenes`) también abre el título con el nombre del video', async (t) => {
  const scene = avatarScene(2, 1)
  const project = await videoProject(t, [avatarScene(1, 0), scene], {
    metadata: { name: 'Video del editor' },
  })
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  assert.deepEqual(
    await renderScenes(project.root, { projectId: PROJECT_ID, sceneIds: [2] }),
    { rendered: [2], failed: [] },
  )
  const title = `Video del editor · ${await markerOf(project.projectDir, scene)}`
  assert.deepEqual(
    fake.posts().map((call) => call.body.title),
    [title],
  )
  const scenes = await readScenesJson(project.projectDir)
  assert.equal(scenes[1].avatar.attempts[0].title, title)
})

test('título: renombrar el video entre el POST y la recuperación no impide recuperar: la fase adopta el render por su marca, sin pagar, y scenes.json conserva el título que salió', async (t) => {
  const scene = avatarScene(1, 0)
  const project = await videoProject(t, [scene], {
    metadata: { name: 'Nombre viejo' },
  })
  // La red se cae en el POST: el recibo queda sin resolver, con su título, y
  // la fase termina igual (entrega 2d).
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    create: () => 'network',
  })
  assert.equal(
    await avatarStage.run(await stageContext(project.root, [])),
    undefined,
  )
  const marker = await markerOf(project.projectDir, scene)
  const sent = `Nombre viejo · ${marker}`
  const [unresolved] = await readScenesJson(project.projectDir)
  assert.deepEqual(
    unresolved.avatar.attempts.map((attempt) => [attempt.state, attempt.title]),
    [['ambiguous', sent]],
  )

  // La persona renombra el video. HeyGen tiene el render con el título que
  // salió, y una copia con la marca al medio que no es nuestra.
  const metadataFile = join(project.projectDir, 'project.json')
  const metadata = JSON.parse(await readFile(metadataFile, 'utf8'))
  await writeFile(
    metadataFile,
    JSON.stringify({ ...metadata, name: 'Nombre nuevo' }),
  )
  fake.reset({
    clip: project.clip,
    clipSeconds: 1,
    listed: [
      {
        id: 'video-copia',
        title: `${marker} · Nombre viejo`,
        status: 'completed',
      },
      { id: 'video-pagado', title: sent, status: 'completed' },
    ],
  })
  await avatarStage.run(await stageContext(project.root, []))
  assert.deepEqual(fake.posts(), [])
  const [recovered] = await readScenesJson(project.projectDir)
  assert.equal(recovered.avatar.status, 'ready')
  assert.deepEqual(
    recovered.avatar.attempts.map((attempt) => [
      attempt.state,
      attempt.videoId,
      attempt.title,
    ]),
    [['succeeded', 'video-pagado', sent]],
  )
})

test('título: un recibo de antes de la 2c se repite con la marca sola, como su POST original, aunque el video tenga nombre, y scenes.json no le agrega título', async (t) => {
  const scene = avatarScene(1, 0)
  const project = await videoProject(t, [scene])
  const scenes = await readScenesJson(project.projectDir)
  scenes[0].avatar.attempts = [
    {
      hash: await currentHash(project.projectDir, scene),
      state: 'creating',
      engine: 'avatar_iii',
      lookId: 'look-1',
      audioAssetId: 'asset-a',
      createdAt: '2026-10-10T15:00:00.000Z',
    },
  ]
  await writeFile(
    join(project.projectDir, 'scenes.json'),
    JSON.stringify(scenes),
  )
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    listed: [],
  })
  await avatarStage.run(await stageContext(project.root, []))
  assert.deepEqual(
    fake.posts().map((call) => call.body.title),
    [await markerOf(project.projectDir, scene)],
  )
  const [saved] = await readScenesJson(project.projectDir)
  assert.equal(saved.avatar.status, 'ready')
  assert.deepEqual(
    saved.avatar.attempts.map((attempt) => [attempt.state, 'title' in attempt]),
    [['succeeded', false]],
  )
})

test('sin avatar, nada cambia: la fase no habla con HeyGen ni toca un byte de scenes.json', async (t) => {
  const project = await videoProject(t, [plainScene(1, 0), plainScene(2, 1)])
  const scenesFile = join(project.projectDir, 'scenes.json')
  const before = await readFile(scenesFile)
  const fake = fakeHeyGen(t, {})
  const context = await stageContext(project.root, [])
  assert.equal(await avatarStage.skip(context), true)
  await avatarStage.run(context)
  assert.deepEqual(fake.calls, [])
  assert.deepEqual(await readFile(scenesFile), before)
})

// Centinela (registro `node-test-doble-mock-del-mismo-metodo-deja-el-global-sucio`):
// va SIEMPRE último; un test nuevo va antes que este.
test('centinela: al terminar, fetch vuelve a ser el real', () => {
  assert.equal(globalThis.fetch, ORIGINAL_FETCH)
})
