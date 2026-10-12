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
// scenes.json. Y la entrega 2e (diseño §21.2 y §21.4): `regenerateSceneIds` y
// `motion` validados antes de hablar con HeyGen; regenerar una lista es un
// render nuevo pagado (la toma siguiente, otra clave, el saldo mirado antes, el
// clip nuevo y el mp4 desactualizado) y, si falla o la cuenta pausa, la escena
// sigue lista con su clip; un recibo en vuelo de la toma se cosecha sin pagar;
// los ajustes del editor se guardan antes de pedir y viajan en el cuerpo
// (R-2e-9, R-2e-14); el movimiento automático, un solo llamado para las
// escenas que lo necesitan (nunca con Avatar III, un prompt de la persona, un
// recibo en vuelo o pagado de su pedido, ni una lista al día), reescrito si
// cambió el texto o «más expresivo» (R-2e-10), con plantillas sin la clave de
// DeepInfra y el cliente de las animaciones con ella; y la cancelación durante
// la escritura, que no paga ni guarda nada.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

import { avatarClipFileName } from '../../pipeline/avatar/clip-path.ts'
import {
  avatarAudioCutHash,
  avatarIdempotencyKey,
  avatarRenderHash,
  avatarRequestHash,
  avatarRequestKey,
  avatarVideoTitle,
} from '../../pipeline/avatar/fingerprint.ts'
import { avatarSceneRequestHash } from '../../pipeline/avatar/lane.ts'
import {
  avatarMotionTextHash,
  templateMotionPrompt,
} from '../../pipeline/avatar/motion-prompt.ts'
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
import {
  AVATAR_EXPRESSIVE_PROMPT_SUFFIX,
  AVATAR_RENDER_DEADLINE_MS,
} from '../../pipeline/types/avatar.ts'
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

// ─── Entrega 2e (diseño §21.2 y §21.4): regenerar una lista y el movimiento ───

// La huella del pedido actual de una escena del proyecto, como el carril: con
// su movimiento y su toma (avatarSceneRequestHash).
async function requestHashOf(projectDir, scene, narrationVersion = 0) {
  const narration = await readFile(join(projectDir, 'narration.mp3'))
  return avatarSceneRequestHash(scene, {
    format: '16:9',
    narrationSha256: createHash('sha256').update(narration).digest('hex'),
    narrationVersion,
  })
}
// La Idempotency-Key del intento `retryIndex` de ese pedido de la escena.
const sceneKey = (sceneId, hash, retryIndex = 0) =>
  avatarIdempotencyKey(PROJECT_ID, sceneId, avatarRequestKey(hash, retryIndex))
const sceneOfPost = (call) => Number(/:scene-(\d+):/.exec(call.body.title)[1])
const postOf = (fake, sceneId) =>
  fake.posts().find((call) => sceneOfPost(call) === sceneId)
// La huella con la que Vimo escribe el movimiento automático (R-2e-10): el
// tono de «más expresivo» y el texto de la escena.
const autoMotionHash = (text, expressive = false) =>
  avatarMotionTextHash(`${expressive ? 'expressive' : 'calm'}\n${text}`)
// Lo que la 2e suma a una escena de avatar: Avatar III sin ajustes no lleva nada.
const MOTION_KEYS = [
  'expressive',
  'motionPrompt',
  'motionSource',
  'autoMotionPrompt',
  'autoMotionTextHash',
  'motionUnsupported',
  'take',
]
const motionKeysOf = (avatar) => MOTION_KEYS.filter((key) => key in avatar)
const rejectedFor = (status, code, message) =>
  json({ error: { code, message, param: null } }, status)

// El escritor del movimiento con un modelo simulado: anota cada llamado y
// responde un prompt válido por escena pedida.
function fakeMotionLlm(
  answer = (sceneId) =>
    `Steady, warm smile at the camera for appearance ${sceneId}.`,
) {
  const calls = []
  return {
    calls,
    answer,
    // Las escenas que vio el modelo en el llamado `index`.
    scenesOf: (index) => JSON.parse(calls[index].userPrompt).scenes,
    async generate(request) {
      calls.push(request)
      const { scenes } = JSON.parse(request.userPrompt)
      return JSON.stringify({
        motions: scenes.map((scene) => ({
          sceneId: scene.sceneId,
          prompt: answer(scene.sceneId),
        })),
      })
    },
  }
}

// Saca la marca de video desactualizado de project.json, para ver si la
// corrida siguiente la vuelve a poner.
async function clearVideoOutdated(projectDir) {
  const metadata = await readMetadata(projectDir)
  delete metadata.videoOutdated
  await writeFile(
    join(projectDir, 'project.json'),
    JSON.stringify(metadata, null, 2),
  )
}

// Reescribe el avatar de esas escenas en scenes.json (`patch(avatar, scene)`).
async function patchAvatars(projectDir, patches) {
  const scenes = await readScenesJson(projectDir)
  for (const scene of scenes) {
    const patch = patches[scene.id]
    if (patch) scene.avatar = { ...scene.avatar, ...(await patch(scene)) }
  }
  await writeFile(join(projectDir, 'scenes.json'), JSON.stringify(scenes))
  return scenes
}

test('avatar-render-scenes (entrega 2e): `regenerateSceneIds` y `motion` que no sirven se rechazan sin hablar con HeyGen ni guardar nada; el tope del prompt cuenta recortado', async (t) => {
  const project = await videoProject(t, [
    plainScene(1, 0),
    avatarScene(2, 1, { engine: 'avatar_v' }),
    avatarScene(3, 2, { engine: 'avatar_v' }),
  ])
  const scenesFile = join(project.projectDir, 'scenes.json')
  const before = await readFile(scenesFile, 'utf8')
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const valid = { sceneId: 2, motionPrompt: 'Smile.', expressive: false }
  const payloads = [
    ...[null, 2, '2', {}, [3], [1], [2, 2], [2.5], ['2'], [null]].map(
      (regenerateSceneIds) => ({ regenerateSceneIds }),
    ),
    ...[
      null,
      {},
      valid,
      [null],
      [[]],
      [{ ...valid, sceneId: 3 }],
      [{ ...valid, sceneId: 1 }],
      [{ ...valid, sceneId: '2' }],
      [{ ...valid, sceneId: 2.5 }],
      [{ ...valid, motionPrompt: 5 }],
      [{ ...valid, motionPrompt: null }],
      [{ ...valid, expressive: 'yes' }],
      [{ ...valid, expressive: 1 }],
      [{ sceneId: 2, motionPrompt: 'Smile.' }],
      [{ sceneId: 2, expressive: true }],
      [{ ...valid, motionPrompt: 'a'.repeat(301) }],
      [valid, { ...valid, expressive: true }],
    ].map((motion) => ({ motion })),
  ]
  for (const extra of payloads)
    await assert.rejects(
      renderScenes(project.root, {
        projectId: PROJECT_ID,
        sceneIds: [2],
        ...extra,
      }),
      { code: 'invalid_payload' },
      JSON.stringify(extra),
    )
  // La fase no regenera ni recibe ajustes: solo el comando, con sus escenas.
  for (const extra of [{ regenerateSceneIds: [2] }, { motion: [valid] }])
    await assert.rejects(
      renderAvatarScenes(await stageContext(project.root, []), extra),
      { code: 'invalid_payload' },
      JSON.stringify(extra),
    )
  assert.deepEqual(fake.calls, [])
  assert.equal(await readFile(scenesFile, 'utf8'), before)

  // 300 caracteres, con espacios en las puntas: entra recortado.
  const longest = 'a'.repeat(300)
  assert.deepEqual(
    await renderScenes(project.root, {
      projectId: PROJECT_ID,
      sceneIds: [2],
      regenerateSceneIds: [],
      motion: [
        { sceneId: 2, motionPrompt: `  ${longest}\n `, expressive: false },
      ],
    }),
    { rendered: [2], failed: [] },
  )
  assert.equal(postOf(fake, 2).body.motion_prompt, longest)
  const saved = (await readScenesJson(project.projectDir))[1].avatar
  assert.equal(saved.motionPrompt, longest)
  assert.equal(saved.motionSource, 'user')
})

test('regenerar una escena lista (entrega 2e): un render nuevo pagado aunque nada cambie —la toma siguiente, otra clave, el saldo mirado antes, el clip nuevo y el mp4 desactualizado—; sin pedirlo, la misma escena no paga ni mira el saldo', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0)], { video: true })
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const request = { projectId: PROJECT_ID, sceneIds: [1] }
  assert.deepEqual(await renderScenes(project.root, request), {
    rendered: [1],
    failed: [],
  })
  const [first] = await readScenesJson(project.projectDir)
  const firstHash = await requestHashOf(project.projectDir, first)
  assert.equal(first.avatar.attempts[0].hash, firstHash)

  // Sin `regenerateSceneIds`: lista con el mismo pedido, sin hablar con HeyGen.
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  assert.deepEqual(await renderScenes(project.root, request), {
    rendered: [1],
    failed: [],
  })
  assert.deepEqual(fake.calls, [])
  assert.deepEqual(await readScenesJson(project.projectDir), [first])

  // Regenerar: la toma 1 es otro pedido, que se paga después de mirar el saldo.
  await clearVideoOutdated(project.projectDir)
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  const events = []
  assert.deepEqual(
    await renderScenes(
      project.root,
      { ...request, regenerateSceneIds: [1] },
      events,
    ),
    { rendered: [1], failed: [] },
  )
  const [retaken] = await readScenesJson(project.projectDir)
  assert.equal(retaken.avatar.take, 1)
  const takeHash = await requestHashOf(project.projectDir, retaken)
  assert.notEqual(takeHash, firstHash)
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [sceneKey(1, takeHash)],
  )
  assert.ok(balanceReadsBefore(fake.calls, isRenderRequest)[0] >= 1)
  assert.equal(retaken.avatar.status, 'ready')
  assert.notEqual(retaken.avatar.clipFile, first.avatar.clipFile)
  assert.deepEqual(
    retaken.avatar.attempts.map((attempt) => [attempt.hash, attempt.state]),
    [
      [firstHash, 'succeeded'],
      [takeHash, 'succeeded'],
    ],
  )
  assert.equal((await readMetadata(project.projectDir)).videoOutdated, true)
  assert.deepEqual(
    ofType(events, 'avatar-scene-ready').map((event) => event.sceneId),
    [1],
  )

  // Otra vez: la toma 2.
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  await renderScenes(project.root, { ...request, regenerateSceneIds: [1] })
  const [again] = await readScenesJson(project.projectDir)
  assert.equal(again.avatar.take, 2)
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [sceneKey(1, await requestHashOf(project.projectDir, again))],
  )

  // La regeneración cuenta para el saldo: si no alcanza, pausa sin pedir nada
  // y la escena sigue lista con su clip. La toma ya quedó guardada antes de
  // pedir (se guarda en la misma escritura que los ajustes).
  fake.reset({ clip: project.clip, clipSeconds: 1, me: wallet(0.001) })
  await assert.rejects(
    renderScenes(project.root, { ...request, regenerateSceneIds: [1] }),
    { code: 'avatar_insufficient_credits' },
  )
  assert.deepEqual(fake.posts(), [])
  assert.deepEqual(fake.uploads(), [])
  const [paused] = await readScenesJson(project.projectDir)
  assert.equal(paused.avatar.status, 'ready')
  assert.equal(paused.avatar.clipFile, again.avatar.clipFile)
  assert.equal(paused.avatar.take, 3)
})

test('regenerar una lista que falla (entrega 2e): la escena sigue lista con el clip anterior y el recibo guardado, sin error y sin desactualizar el mp4, y `avatar-scene-failed` sale igual; reintentar usa la misma toma con la clave siguiente; si la cuenta pausa, el clip también queda', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0)], { video: true })
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const request = { projectId: PROJECT_ID, sceneIds: [1] }
  await renderScenes(project.root, request)
  const [first] = await readScenesJson(project.projectDir)
  const firstHash = first.avatar.attempts[0].hash
  await clearVideoOutdated(project.projectDir)

  fake.reset({
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
  const events = []
  assert.deepEqual(
    await renderScenes(
      project.root,
      { ...request, regenerateSceneIds: [1] },
      events,
    ),
    { rendered: [], failed: [1] },
  )
  assert.equal(fake.posts().length, 1)
  assert.deepEqual(ofType(events, 'avatar-scene-failed'), [
    { type: 'avatar-scene-failed', sceneId: 1, code: 'avatar_render_failed' },
  ])
  const [kept] = await readScenesJson(project.projectDir)
  for (const field of [
    'status',
    'clipFile',
    'normalizedSeconds',
    'renderHash',
    'narrationVersion',
    'usdEstimated',
  ])
    assert.deepEqual(kept.avatar[field], first.avatar[field], field)
  assert.equal('errorCode' in kept.avatar, false)
  assert.equal(kept.avatar.take, 1)
  const takeHash = await requestHashOf(project.projectDir, kept)
  assert.deepEqual(
    kept.avatar.attempts.map((attempt) => [
      attempt.hash,
      attempt.state,
      attempt.errorCode,
    ]),
    [
      [firstHash, 'succeeded', undefined],
      [takeHash, 'failed', 'avatar_render_failed'],
    ],
  )
  assert.notEqual((await readMetadata(project.projectDir)).videoOutdated, true)
  // La vista del editor la sigue mostrando lista, con su clip.
  const { paths } = await stageContext(project.root, [])
  const [view] = await toSceneSummaries(paths, [kept], { narrationVersion: 0 })
  assert.equal(view.avatar.status, 'ready')
  assert.ok(view.avatar.clipPath)

  // Reintentar: la misma toma (su pedido no tiene un clip cobrado), con la
  // clave siguiente; el clip nuevo reemplaza al anterior.
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  assert.deepEqual(
    await renderScenes(project.root, { ...request, regenerateSceneIds: [1] }),
    { rendered: [1], failed: [] },
  )
  const [retried] = await readScenesJson(project.projectDir)
  assert.equal(retried.avatar.take, 1)
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [sceneKey(1, takeHash, 1)],
  )
  assert.notEqual(retried.avatar.clipFile, first.avatar.clipFile)
  assert.equal((await readMetadata(project.projectDir)).videoOutdated, true)

  // La cuenta pausa (HeyGen dice que no hay saldo al pedir): lanza, y la
  // escena queda lista con su clip y el estimado de antes.
  fake.reset({
    clip: project.clip,
    clipSeconds: 1,
    create: () => rejectedFor(402, 'insufficient_credit', 'Not enough credit'),
  })
  await assert.rejects(
    renderScenes(project.root, { ...request, regenerateSceneIds: [1] }),
    { code: 'avatar_insufficient_credits' },
  )
  const [paused] = await readScenesJson(project.projectDir)
  assert.equal(paused.avatar.status, 'ready')
  assert.equal(paused.avatar.clipFile, retried.avatar.clipFile)
  assert.equal(paused.avatar.usdEstimated, retried.avatar.usdEstimated)
  assert.equal('errorCode' in paused.avatar, false)
  assert.deepEqual(
    paused.avatar.attempts.at(-1).errorCode,
    'avatar_insufficient_credits',
  )
})

test('regenerar con un recibo en vuelo de la toma (entrega 2e): se cosecha sin pagar otro —ni POST, ni audio, ni saldo— y la toma no sube', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0)])
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const request = {
    projectId: PROJECT_ID,
    sceneIds: [1],
    regenerateSceneIds: [1],
  }
  await renderScenes(project.root, { projectId: PROJECT_ID, sceneIds: [1] })
  const [first] = await readScenesJson(project.projectDir)

  // El POST de la toma 1 se queda sin respuesta: el recibo queda sin resolver
  // y la escena, lista con su clip.
  fake.reset({ clip: project.clip, clipSeconds: 1, create: () => 'network' })
  assert.deepEqual(await renderScenes(project.root, request), {
    rendered: [],
    failed: [1],
  })
  const [waiting] = await readScenesJson(project.projectDir)
  assert.equal(waiting.avatar.status, 'ready')
  assert.equal(waiting.avatar.clipFile, first.avatar.clipFile)
  assert.equal(waiting.avatar.take, 1)
  assert.deepEqual(
    waiting.avatar.attempts.map((attempt) => attempt.state),
    ['succeeded', 'ambiguous'],
  )
  const sent = fake.posts()[0]

  // HeyGen sí lo había creado: aparece por su título y se adopta.
  fake.reset({
    clip: project.clip,
    clipSeconds: 1,
    listed: [
      { id: 'video-de-la-toma', title: sent.body.title, status: 'completed' },
    ],
  })
  assert.deepEqual(await renderScenes(project.root, request), {
    rendered: [1],
    failed: [],
  })
  assert.deepEqual(fake.posts(), [])
  assert.deepEqual(fake.uploads(), [])
  assert.equal(fake.calls.filter(isBalanceRead).length, 0)
  const [harvested] = await readScenesJson(project.projectDir)
  assert.equal(harvested.avatar.take, 1)
  assert.deepEqual(
    harvested.avatar.attempts.map((attempt) => [
      attempt.state,
      attempt.videoId,
    ]),
    [
      ['succeeded', 'video-1-1'],
      ['succeeded', 'video-de-la-toma'],
    ],
  )
  assert.notEqual(harvested.avatar.clipFile, first.avatar.clipFile)
})

test('regenerar una escena que no está lista (entrega 2e): no hay clip que conservar ni toma que subir; se cosecha el render que ya está pago', async (t) => {
  const scene = avatarScene(1, 0)
  const project = await videoProject(t, [scene])
  const hash = await requestHashOf(project.projectDir, scene)
  await patchAvatars(project.projectDir, {
    1: () => ({
      status: 'failed',
      errorCode: 'avatar_download_failed',
      attempts: [paidReceipt(hash, 'video-pagado')],
    }),
  })
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  assert.deepEqual(
    await renderScenes(project.root, {
      projectId: PROJECT_ID,
      sceneIds: [1],
      regenerateSceneIds: [1],
    }),
    { rendered: [1], failed: [] },
  )
  assert.deepEqual(fake.posts(), [])
  const [harvested] = await readScenesJson(project.projectDir)
  assert.equal(harvested.avatar.status, 'ready')
  assert.equal('take' in harvested.avatar, false)
})

test('los ajustes de movimiento del editor (entrega 2e): se guardan antes de pedir —recortados, de la persona o de Vimo, vacío borra, «más expresivo» solo si sirve— y viajan en el cuerpo; vacío sin automático deja que Vimo escriba el suyo (R-2e-9); con V y un prompt propio, «más expresivo» va al final del prompt (R-2e-14)', async (t) => {
  const automatic2 = 'Calm smile at the camera with a nod.'
  const automatic5 = 'Warm smile at the camera, nodding.'
  const project = await videoProject(t, [
    avatarScene(1, 0, { engine: 'avatar_iv' }),
    avatarScene(2, 1, {
      engine: 'avatar_v',
      status: 'failed',
      errorCode: 'avatar_render_failed',
      expressive: true,
      motionPrompt: automatic2,
      motionSource: 'auto',
      autoMotionPrompt: automatic2,
      autoMotionTextHash: autoMotionHash('Escena 2', true),
    }),
    avatarScene(3, 2, { engine: 'avatar_v' }),
    avatarScene(4, 3, { engine: 'avatar_iv', lookType: 'digital_twin' }),
    // El automático guardado con espacios en las puntas (un scenes.json
    // editado): sigue siendo el de Vimo, como dice la ayuda del editor.
    avatarScene(5, 4, {
      engine: 'avatar_v',
      status: 'failed',
      errorCode: 'avatar_render_failed',
      motionPrompt: automatic5,
      motionSource: 'auto',
      autoMotionPrompt: `  ${automatic5} `,
      autoMotionTextHash: autoMotionHash('Escena 5'),
    }),
    avatarScene(6, 5, { engine: 'avatar_v' }),
  ])
  const own = 'a'.repeat(300)
  let savedAtFirstPost
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    async onRequest(call) {
      if (isRenderRequest(call))
        savedAtFirstPost ??= await readScenesJson(project.projectDir)
    },
  })
  assert.deepEqual(
    await renderScenes(project.root, {
      projectId: PROJECT_ID,
      sceneIds: [1, 2, 3, 4, 5, 6],
      motion: [
        {
          sceneId: 1,
          motionPrompt: '  Lean in with an open palm.  ',
          expressive: true,
        },
        { sceneId: 2, motionPrompt: '', expressive: false },
        { sceneId: 3, motionPrompt: '', expressive: true },
        { sceneId: 4, motionPrompt: 'Smile at the camera.', expressive: true },
        { sceneId: 5, motionPrompt: automatic5, expressive: false },
        { sceneId: 6, motionPrompt: ` ${own} `, expressive: true },
      ],
    }),
    { rendered: [1, 2, 3, 4, 5, 6], failed: [] },
  )
  const scenes = await readScenesJson(project.projectDir)
  const avatarOf = (id) => scenes.find((scene) => scene.id === id).avatar
  // Guardados antes del primer POST, en la misma escritura.
  assert.deepEqual(
    savedAtFirstPost.map((scene) => [scene.id, scene.avatar.motionSource]),
    [
      [1, 'user'],
      [2, 'user'],
      [3, 'auto'],
      [4, undefined],
      [5, 'auto'],
      [6, 'user'],
    ],
  )

  // IV con foto: el de la persona, recortado, y `expressiveness: high`.
  assert.equal(avatarOf(1).motionPrompt, 'Lean in with an open palm.')
  assert.equal(avatarOf(1).motionSource, 'user')
  assert.equal(avatarOf(1).expressive, true)
  assert.equal(postOf(fake, 1).body.motion_prompt, 'Lean in with an open palm.')
  assert.equal(postOf(fake, 1).body.expressiveness, 'high')
  // Borrado a propósito con un automático escrito: de la persona, sin prompt;
  // el automático queda para «Usar el automático»; «más expresivo» apagado se
  // borra.
  assert.equal(avatarOf(2).motionSource, 'user')
  assert.equal('motionPrompt' in avatarOf(2), false)
  assert.equal(avatarOf(2).autoMotionPrompt, automatic2)
  assert.equal('expressive' in avatarOf(2), false)
  assert.equal('motion_prompt' in postOf(fake, 2).body, false)
  // Vacío sin automático (R-2e-9): Vimo escribe el suyo (sin clave de
  // DeepInfra, la plantilla del medio, expresiva).
  const template3 = templateMotionPrompt({
    sceneId: 3,
    text: 'Escena 3',
    seconds: 1,
    position: 'middle',
    expressive: true,
  })
  assert.equal(avatarOf(3).motionSource, 'auto')
  assert.equal(avatarOf(3).motionPrompt, template3)
  assert.equal(avatarOf(3).autoMotionPrompt, template3)
  assert.equal(avatarOf(3).autoMotionTextHash, autoMotionHash('Escena 3', true))
  assert.equal(avatarOf(3).expressive, true)
  assert.equal(postOf(fake, 3).body.motion_prompt, template3)
  assert.equal('expressiveness' in postOf(fake, 3).body, false)
  // IV con un gemelo digital no admite movimiento: no se guarda nada.
  assert.deepEqual(motionKeysOf(avatarOf(4)), [])
  assert.equal('motion_prompt' in postOf(fake, 4).body, false)
  assert.equal('expressiveness' in postOf(fake, 4).body, false)
  // El mismo que escribió Vimo: sigue siendo de Vimo.
  assert.equal(avatarOf(5).motionSource, 'auto')
  assert.equal(postOf(fake, 5).body.motion_prompt, automatic5)
  // V con un prompt propio y «más expresivo» (R-2e-14): la escena guarda el
  // suyo; el pedido lleva la frase al final.
  assert.equal(avatarOf(6).motionPrompt, own)
  assert.equal(avatarOf(6).motionSource, 'user')
  assert.equal(
    postOf(fake, 6).body.motion_prompt,
    `${own} ${AVATAR_EXPRESSIVE_PROMPT_SUFFIX}`,
  )
  assert.equal(
    avatarOf(6).attempts[0].motionPrompt,
    postOf(fake, 6).body.motion_prompt,
  )
  assert.deepEqual(fake.unexpected, [])
})

test('un prompt distinto vuelve a intentar el movimiento rechazado (revisión final de la 2e): la marca se borra y el pedido lleva el prompt nuevo; el mismo prompt la conserva y el pedido va sin movimiento', async (t) => {
  const rejected = {
    engine: 'avatar_v',
    status: 'failed',
    errorCode: 'avatar_render_failed',
    motionSource: 'user',
    motionUnsupported: true,
  }
  const project = await videoProject(t, [
    avatarScene(1, 0, { ...rejected, motionPrompt: 'Old prompt, too long.' }),
    avatarScene(2, 1, {
      ...rejected,
      motionPrompt: 'Warm smile at the camera.',
    }),
  ])
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  assert.deepEqual(
    await renderScenes(project.root, {
      projectId: PROJECT_ID,
      sceneIds: [1, 2],
      motion: [
        {
          sceneId: 1,
          motionPrompt: 'Small nod with a calm smile.',
          expressive: false,
        },
        {
          sceneId: 2,
          motionPrompt: ' Warm smile at the camera. ',
          expressive: false,
        },
      ],
    }),
    { rendered: [1, 2], failed: [] },
  )
  const scenes = await readScenesJson(project.projectDir)
  const avatarOf = (id) => scenes.find((scene) => scene.id === id).avatar
  // Un prompt nuevo: sin la marca, y el pedido lo lleva.
  assert.equal('motionUnsupported' in avatarOf(1), false)
  assert.equal(
    postOf(fake, 1).body.motion_prompt,
    'Small nod with a calm smile.',
  )
  // El mismo prompt (con espacios de más): la marca sigue y va sin movimiento.
  assert.equal(avatarOf(2).motionUnsupported, true)
  assert.equal('motion_prompt' in postOf(fake, 2).body, false)
  assert.deepEqual(fake.unexpected, [])
})

test('el movimiento automático (entrega 2e): un solo llamado al escritor para las escenas que lo necesitan, ubicadas entre todas las del video; nunca con Avatar III, con un prompt de la persona, con un recibo en vuelo de su pedido ni en una lista al día; se guarda, viaja en el cuerpo y no aparece en el log', async (t) => {
  const project = await videoProject(t, [
    avatarScene(1, 0),
    avatarScene(2, 1, { engine: 'avatar_v' }),
    avatarScene(3, 2, {
      engine: 'avatar_iv',
      motionPrompt: 'Own steady gaze at the camera.',
      motionSource: 'user',
    }),
    avatarScene(4, 3, {
      engine: 'avatar_v',
      lookType: 'digital_twin',
      status: 'failed',
      errorCode: 'avatar_timeout',
    }),
    avatarScene(5, 4, {
      engine: 'avatar_v',
      motionPrompt: 'Old calm smile at the camera, nodding.',
      motionSource: 'auto',
      autoMotionPrompt: 'Old calm smile at the camera, nodding.',
      autoMotionTextHash: autoMotionHash('Texto viejo'),
    }),
    avatarScene(6, 5, { engine: 'avatar_iv', expressive: true }),
  ])
  // La 4 tiene un render pagado en vuelo de su pedido actual; la 5 está lista,
  // al día y con su clip (su automático se escribió para otro texto), y su clip
  // salió de un pedido con otro prompt: lo único que frena al escritor es que
  // el carril no va a pedir nada.
  await mkdir(join(project.projectDir, 'avatar'), { recursive: true })
  await writeFile(
    join(project.projectDir, 'avatar', 'scene_5.ab12cd34.mp4'),
    project.clip,
  )
  const scenes = await patchAvatars(project.projectDir, {
    4: async (scene) => ({
      attempts: [
        {
          hash: await requestHashOf(project.projectDir, scene),
          state: 'pending',
          engine: 'avatar_v',
          lookId: 'look-1',
          audioAssetId: 'asset-4',
          videoId: 'video-4-en-vuelo',
          createdAt: '2026-10-12T05:00:00.000Z',
        },
      ],
    }),
    5: async (scene) => ({
      status: 'ready',
      clipFile: 'scene_5.ab12cd34.mp4',
      renderHash: renderHashOf(scene, 0),
      narrationVersion: 0,
      attempts: [
        {
          ...paidReceipt(
            await requestHashOf(project.projectDir, {
              ...scene,
              avatar: {
                ...scene.avatar,
                motionPrompt: 'Earlier calm gaze at the camera.',
              },
            }),
            'video-5',
          ),
          engine: 'avatar_v',
        },
      ],
    }),
  })
  const events = []
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const llm = fakeMotionLlm()
  const context = await stageContext(project.root, events)
  assert.deepEqual(
    await renderAvatarScenes(context, {
      sceneIds: [1, 2, 3, 4, 5, 6],
      motionLlm: llm,
    }),
    { rendered: [1, 2, 3, 4, 5, 6], failed: [] },
  )

  // Un llamado, con la 2 en el medio y la 6 cerrando (entre las seis).
  assert.equal(llm.calls.length, 1)
  assert.deepEqual(llm.scenesOf(0), [
    {
      sceneId: 2,
      position: 'middle',
      seconds: 1,
      long: false,
      expressive: false,
      text: 'Escena 2',
    },
    {
      sceneId: 6,
      position: 'closing',
      seconds: 1,
      long: false,
      expressive: true,
      text: 'Escena 6',
    },
  ])
  const after = await readScenesJson(project.projectDir)
  const avatarOf = (id) => after.find((scene) => scene.id === id).avatar
  for (const [id, expressive] of [
    [2, false],
    [6, true],
  ]) {
    const avatar = avatarOf(id)
    assert.equal(avatar.autoMotionPrompt, llm.answer(id), `escena ${id}`)
    assert.equal(avatar.motionPrompt, llm.answer(id), `escena ${id}`)
    assert.equal(avatar.motionSource, 'auto', `escena ${id}`)
    assert.equal(
      avatar.autoMotionTextHash,
      autoMotionHash(`Escena ${id}`, expressive),
      `escena ${id}`,
    )
    assert.equal(postOf(fake, id).body.motion_prompt, llm.answer(id))
  }
  assert.equal(postOf(fake, 6).body.expressiveness, 'high')
  assert.equal('expressiveness' in postOf(fake, 2).body, false)
  // Avatar III: el cuerpo y la escena de siempre.
  assert.deepEqual(motionKeysOf(avatarOf(1)), [])
  assert.equal('motion_prompt' in postOf(fake, 1).body, false)
  // El de la persona viaja tal cual.
  assert.equal(
    postOf(fake, 3).body.motion_prompt,
    'Own steady gaze at the camera.',
  )
  assert.equal(avatarOf(3).motionSource, 'user')
  // La 4 cosechó su render en vuelo sin pagar otro y sigue sin prompt.
  assert.equal(postOf(fake, 4), undefined)
  assert.equal('motionPrompt' in avatarOf(4), false)
  assert.equal(avatarOf(4).attempts[0].state, 'succeeded')
  // La 5, lista y al día: ni un byte distinto.
  assert.equal(postOf(fake, 5), undefined)
  assert.deepEqual(avatarOf(5), scenes[4].avatar)
  assert.equal(fake.posts().length, 4)
  // El log dice cuántas, nunca qué.
  const logs = ofType(events, 'log').map((event) => event.message)
  assert.ok(
    logs.includes(
      'Avatar motion written for scene(s) 2, 6: 0 from the templates',
    ),
    logs.join('\n'),
  )
  for (const id of [2, 6])
    assert.ok(logs.every((message) => !message.includes(llm.answer(id))))
})

test('el movimiento automático se reescribe si cambió el texto o «más expresivo» (R-2e-10), pero no si el pedido actual ya tiene un render pagado que el carril cosecharía; un recibo en vuelo de un pedido viejo no lo frena', async (t) => {
  const old = (id) => `Composed smile at the camera, scene ${id}.`
  const project = await videoProject(
    t,
    [1, 2, 3, 4, 5].map((id) =>
      avatarScene(id, id - 1, {
        engine: 'avatar_v',
        status: 'failed',
        errorCode: 'avatar_render_failed',
        motionPrompt: old(id),
        motionSource: 'auto',
        autoMotionPrompt: old(id),
        autoMotionTextHash: autoMotionHash(`Escena ${id}`),
      }),
    ),
    { metadata: { narrationVersion: 1 } },
  )
  await patchAvatars(project.projectDir, {
    // 1: la descarga falló con el render pagado; el texto cambió después.
    1: async (scene) => ({
      autoMotionTextHash: autoMotionHash('Texto viejo'),
      attempts: [
        {
          ...paidReceipt(
            await requestHashOf(project.projectDir, scene, 1),
            'video-1-pagado',
          ),
          engine: 'avatar_v',
        },
      ],
    }),
    // 2: el texto cambió.
    2: () => ({ autoMotionTextHash: autoMotionHash('Texto viejo') }),
    // 4: nada cambió.
    // 5: el texto cambió y queda un recibo sin resolver de la narración vieja.
    5: async (scene) => ({
      autoMotionTextHash: autoMotionHash('Texto viejo'),
      attempts: [
        {
          hash: await requestHashOf(project.projectDir, scene, 0),
          state: 'ambiguous',
          engine: 'avatar_v',
          lookId: 'look-1',
          audioAssetId: 'asset-viejo',
          createdAt: '2026-10-10T15:00:00.000Z',
        },
      ],
    }),
  })
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const llm = fakeMotionLlm()
  const context = await stageContext(project.root, [])
  assert.deepEqual(
    await renderAvatarScenes(context, {
      sceneIds: [1, 2, 3, 4, 5],
      // 3: la persona prendió «más expresivo» sin tocar el automático.
      motion: [{ sceneId: 3, motionPrompt: old(3), expressive: true }],
      motionLlm: llm,
    }),
    { rendered: [1, 2, 3, 4, 5], failed: [] },
  )
  assert.equal(llm.calls.length, 1)
  assert.deepEqual(
    llm.scenesOf(0).map((scene) => [scene.sceneId, scene.expressive]),
    [
      [2, false],
      [3, true],
      [5, false],
    ],
  )
  const after = await readScenesJson(project.projectDir)
  const avatarOf = (id) => after.find((scene) => scene.id === id).avatar
  // La 1 cosechó su render pagado: ni prompt nuevo ni POST.
  assert.equal(postOf(fake, 1), undefined)
  assert.equal(avatarOf(1).motionPrompt, old(1))
  for (const id of [2, 3, 5]) {
    assert.equal(avatarOf(id).motionPrompt, llm.answer(id), `escena ${id}`)
    assert.equal(postOf(fake, id).body.motion_prompt, llm.answer(id))
  }
  assert.equal(avatarOf(3).autoMotionTextHash, autoMotionHash('Escena 3', true))
  // La 4, igual que antes.
  assert.equal(postOf(fake, 4).body.motion_prompt, old(4))
  // El recibo viejo de la 5 no se busca ni se repite: queda como estaba.
  assert.equal(fake.lists().length, 0)
  assert.equal(fake.posts().length, 4)
  assert.equal(avatarOf(5).attempts[0].state, 'ambiguous')
})

test('regenerar una lista de V con «más expresivo» recién prendido (entrega 2e): el automático se reescribe expresivo y es otro pedido (sin subir la toma); regenerarla otra vez sin cambios sube la toma', async (t) => {
  const project = await videoProject(t, [
    avatarScene(1, 0, { engine: 'avatar_v' }),
  ])
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const calm = fakeMotionLlm(() => 'Calm, sincere smile at the camera.')
  const lively = fakeMotionLlm(
    () => 'Bright smile at the camera with open hands.',
  )
  const render = async (selection) =>
    renderAvatarScenes(await stageContext(project.root, []), {
      sceneIds: [1],
      ...selection,
    })
  await render({ motionLlm: calm })
  const [first] = await readScenesJson(project.projectDir)
  assert.equal(first.avatar.motionPrompt, 'Calm, sincere smile at the camera.')

  fake.reset({ clip: project.clip, clipSeconds: 1 })
  assert.deepEqual(
    await render({
      regenerateSceneIds: [1],
      motion: [
        {
          sceneId: 1,
          motionPrompt: first.avatar.motionPrompt,
          expressive: true,
        },
      ],
      motionLlm: lively,
    }),
    { rendered: [1], failed: [] },
  )
  assert.equal(lively.calls.length, 1)
  assert.equal(lively.scenesOf(0)[0].expressive, true)
  const [rewritten] = await readScenesJson(project.projectDir)
  assert.equal(
    rewritten.avatar.motionPrompt,
    'Bright smile at the camera with open hands.',
  )
  assert.equal('take' in rewritten.avatar, false)
  const [post] = fake.posts()
  assert.equal(
    post.body.motion_prompt,
    'Bright smile at the camera with open hands.',
  )
  assert.equal(
    post.headers['Idempotency-Key'],
    sceneKey(1, await requestHashOf(project.projectDir, rewritten)),
  )

  // Sin cambios: el escritor no corre y la toma sube.
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  const quiet = fakeMotionLlm()
  await render({ regenerateSceneIds: [1], motionLlm: quiet })
  assert.equal(quiet.calls.length, 0)
  const [again] = await readScenesJson(project.projectDir)
  assert.equal(again.avatar.take, 1)
  assert.equal(
    fake.posts()[0].headers['Idempotency-Key'],
    sceneKey(1, await requestHashOf(project.projectDir, again)),
  )
})

test('el movimiento automático sin clave de DeepInfra sale de las plantillas; con la clave, el escritor usa el cliente de texto de las animaciones (tier balanced) y, si falla, las plantillas', async (t) => {
  const project = await videoProject(t, [
    avatarScene(1, 0, { engine: 'avatar_v' }),
    avatarScene(2, 1, { engine: 'avatar_v' }),
  ])
  const templates = [
    [1, 'opening'],
    [2, 'closing'],
  ].map(([sceneId, position]) =>
    templateMotionPrompt({
      sceneId,
      text: `Escena ${sceneId}`,
      seconds: 1,
      position,
      expressive: false,
    }),
  )
  const scenesFile = join(project.projectDir, 'scenes.json')
  const before = await readFile(scenesFile, 'utf8')
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const events = []
  await renderScenes(
    project.root,
    { projectId: PROJECT_ID, sceneIds: [1, 2] },
    events,
  )
  assert.deepEqual(
    fake
      .posts()
      .map((call) => call.body.motion_prompt)
      .sort(),
    [...templates].sort(),
  )
  assert.deepEqual(fake.unexpected, [])
  assert.ok(
    ofType(events, 'log').some(
      (event) =>
        event.message ===
        'Avatar motion written for scene(s) 1, 2: 2 from the templates',
    ),
  )

  // Con la clave: un pedido al modelo de las animaciones (el simulacro de
  // HeyGen no lo conoce y responde 418) y, sin respuesta, las plantillas.
  await writeFile(scenesFile, before)
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  await videosSubcommands['avatar-render-scenes'](
    baseContext(project.root, [], {
      apiKeys: { heygen: 'key-123', deepinfra: 'clave-de-prueba' },
      payload: { projectId: PROJECT_ID, sceneIds: [1, 2] },
    }),
  )
  assert.equal(fake.unexpected.length, 1)
  const [model] = fake.unexpected
  assert.equal(model.host, 'api.deepinfra.com')
  assert.equal(model.path, '/v1/openai/chat/completions')
  assert.equal(model.body.model, 'anthropic/claude-haiku-4-5')
  assert.match(
    model.body.messages[0].content,
    /^You direct a professional video presenter/,
  )
  assert.deepEqual(
    JSON.parse(model.body.messages[1].content).scenes.map(
      (scene) => scene.sceneId,
    ),
    [1, 2],
  )
  assert.deepEqual(
    fake
      .posts()
      .map((call) => call.body.motion_prompt)
      .sort(),
    [...templates].sort(),
  )
})

test('cancelar mientras se escribe el movimiento (entrega 2e): sale como cancelación —con su motivo, también uno propio—, no paga nada ni guarda plantillas ni ajustes', async (t) => {
  const project = await videoProject(t, [
    avatarScene(1, 0, { engine: 'avatar_v' }),
  ])
  const scenesFile = join(project.projectDir, 'scenes.json')
  const before = await readFile(scenesFile, 'utf8')
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  for (const reason of [undefined, new Error('la persona canceló')]) {
    const controller = new AbortController()
    const context = await stageContext(project.root, [])
    context.signal = controller.signal
    let calls = 0
    // El modelo se corta con la cancelación y lanza un error suyo.
    const llm = {
      async generate() {
        calls++
        controller.abort(reason)
        throw new TypeError('fetch failed')
      },
    }
    await assert.rejects(
      renderAvatarScenes(context, {
        sceneIds: [1],
        motion: [{ sceneId: 1, motionPrompt: '', expressive: true }],
        motionLlm: llm,
      }),
      reason ? (error) => error === reason : { name: 'AbortError' },
    )
    assert.equal(calls, 1)
    assert.deepEqual(fake.calls, [])
    assert.equal(await readFile(scenesFile, 'utf8'), before)
  }
})

// ─── Ronda 1 de WP-U (revisión de la entrega 2e) ───

// El nombre del clip que deja el intento `retryIndex` del pedido actual de la
// escena (como lo arma el carril).
async function clipNameOf(projectDir, scene, retryIndex = 0) {
  const hash = await requestHashOf(projectDir, scene)
  return avatarClipFileName(scene.id, avatarRequestKey(hash, retryIndex))
}

test('regenerar después de un render nuevo cobrado que no se pudo bajar (C1 de la revisión): la escena sigue lista con el clip anterior y la próxima regeneración baja ese render —ni POST, ni audio, ni saldo, ni otra toma—; ya visto, la siguiente sí paga la toma 2', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0)], { video: true })
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const request = {
    projectId: PROJECT_ID,
    sceneIds: [1],
    regenerateSceneIds: [1],
  }
  await renderScenes(project.root, { projectId: PROJECT_ID, sceneIds: [1] })
  const [first] = await readScenesJson(project.projectDir)

  // La toma 1: HeyGen termina (y cobra) el render, pero la CDN no lo entrega
  // (los tres intentos de la descarga).
  fake.reset({ clip: project.clip, clipSeconds: 1, cdnStatus: () => 500 })
  assert.deepEqual(await renderScenes(project.root, request), {
    rendered: [],
    failed: [1],
  })
  assert.equal(fake.posts().length, 1)
  const [kept] = await readScenesJson(project.projectDir)
  assert.equal(kept.avatar.status, 'ready')
  assert.equal(kept.avatar.clipFile, first.avatar.clipFile)
  assert.equal(kept.avatar.take, 1)
  assert.deepEqual(
    kept.avatar.attempts.map((attempt) => attempt.state),
    ['succeeded', 'succeeded'],
  )
  await clearVideoOutdated(project.projectDir)

  // La próxima regeneración baja el render ya pagado de la toma 1.
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  assert.deepEqual(await renderScenes(project.root, request), {
    rendered: [1],
    failed: [],
  })
  assert.deepEqual(fake.posts(), [])
  assert.deepEqual(fake.uploads(), [])
  assert.equal(fake.calls.filter(isBalanceRead).length, 0)
  const [harvested] = await readScenesJson(project.projectDir)
  assert.equal(harvested.avatar.take, 1)
  assert.equal(
    harvested.avatar.clipFile,
    await clipNameOf(project.projectDir, harvested),
  )
  assert.notEqual(harvested.avatar.clipFile, first.avatar.clipFile)
  assert.equal((await readMetadata(project.projectDir)).videoOutdated, true)

  // Ahora es el clip que se ve: regenerar otra vez paga la toma 2.
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  await renderScenes(project.root, request)
  const [again] = await readScenesJson(project.projectDir)
  assert.equal(again.avatar.take, 2)
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [sceneKey(1, await requestHashOf(project.projectDir, again))],
  )
})

test('regenerar y cancelar mientras se baja el render nuevo, ya cobrado (C1 de la revisión): sale como cancelación con la escena lista y su clip; la próxima regeneración baja ese render sin pagar otro', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0)])
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  await renderScenes(project.root, { projectId: PROJECT_ID, sceneIds: [1] })
  const [first] = await readScenesJson(project.projectDir)

  const controller = new AbortController()
  fake.reset({
    clip: project.clip,
    clipSeconds: 1,
    onRequest(call) {
      if (call.host === 'cdn.example') controller.abort()
    },
  })
  const context = await stageContext(project.root, [])
  context.signal = controller.signal
  await assert.rejects(
    renderAvatarScenes(context, { sceneIds: [1], regenerateSceneIds: [1] }),
    { name: 'AbortError' },
  )
  assert.equal(fake.posts().length, 1)
  const [cancelled] = await readScenesJson(project.projectDir)
  assert.equal(cancelled.avatar.status, 'ready')
  assert.equal(cancelled.avatar.clipFile, first.avatar.clipFile)
  assert.equal(cancelled.avatar.take, 1)
  assert.deepEqual(
    cancelled.avatar.attempts.map((attempt) => attempt.state),
    ['succeeded', 'succeeded'],
  )

  fake.reset({ clip: project.clip, clipSeconds: 1 })
  assert.deepEqual(
    await renderScenes(project.root, {
      projectId: PROJECT_ID,
      sceneIds: [1],
      regenerateSceneIds: [1],
    }),
    { rendered: [1], failed: [] },
  )
  assert.deepEqual(fake.posts(), [])
  assert.equal(fake.calls.filter(isBalanceRead).length, 0)
  const [harvested] = await readScenesJson(project.projectDir)
  assert.equal(harvested.avatar.take, 1)
  assert.equal(
    harvested.avatar.clipFile,
    await clipNameOf(project.projectDir, harvested),
  )
})

test('una toma vuelta atrás (scenes.json editado) no paga dos veces: la toma sube una sola vez y el render cobrado y nunca visto de la toma siguiente se baja sin POST', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0)])
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  await renderScenes(project.root, { projectId: PROJECT_ID, sceneIds: [1] })
  // El render de la toma 1 está cobrado y nunca se bajó, pero la escena dice
  // que va por la toma 0.
  await patchAvatars(project.projectDir, {
    1: async (scene) => ({
      attempts: [
        ...scene.avatar.attempts,
        paidReceipt(
          await requestHashOf(project.projectDir, {
            ...scene,
            avatar: { ...scene.avatar, take: 1 },
          }),
          'video-toma-1',
        ),
      ],
    }),
  })
  const [first] = await readScenesJson(project.projectDir)
  assert.equal('take' in first.avatar, false)

  fake.reset({ clip: project.clip, clipSeconds: 1 })
  assert.deepEqual(
    await renderScenes(project.root, {
      projectId: PROJECT_ID,
      sceneIds: [1],
      regenerateSceneIds: [1],
    }),
    { rendered: [1], failed: [] },
  )
  assert.deepEqual(fake.posts(), [])
  assert.ok(fake.calls.some((call) => call.path === '/v3/videos/video-toma-1'))
  const [harvested] = await readScenesJson(project.projectDir)
  assert.equal(harvested.avatar.take, 1)
  assert.equal(
    harvested.avatar.clipFile,
    await clipNameOf(project.projectDir, harvested),
  )
})

test('el escritor no reescribe el automático con un recibo `creating` o `ambiguous` del pedido actual (I1 de la revisión): el pedido se repite con su misma clave y el prompt de su recibo', async (t) => {
  const old = 'Old calm smile at the camera, nodding.'
  const waiting = (id) =>
    avatarScene(id, id - 1, {
      engine: 'avatar_v',
      status: 'failed',
      errorCode: 'avatar_network',
      motionPrompt: old,
      motionSource: 'auto',
      autoMotionPrompt: old,
      autoMotionTextHash: autoMotionHash('Texto viejo'),
    })
  const project = await videoProject(t, [waiting(1), waiting(2)])
  const hashes = {}
  const receipt = (state) => async (scene) => {
    hashes[scene.id] = await requestHashOf(project.projectDir, scene)
    return {
      attempts: [
        {
          hash: hashes[scene.id],
          state,
          engine: 'avatar_v',
          lookId: 'look-1',
          audioAssetId: `asset-${scene.id}`,
          motionPrompt: old,
          createdAt: '2026-10-12T05:00:00.000Z',
        },
      ],
    }
  }
  await patchAvatars(project.projectDir, {
    1: receipt('ambiguous'),
    2: receipt('creating'),
  })
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const llm = fakeMotionLlm()
  assert.deepEqual(
    await renderAvatarScenes(await stageContext(project.root, []), {
      sceneIds: [1, 2],
      motionLlm: llm,
    }),
    { rendered: [1, 2], failed: [] },
  )
  assert.equal(llm.calls.length, 0)
  for (const id of [1, 2]) {
    const post = postOf(fake, id)
    assert.equal(post.body.motion_prompt, old, `escena ${id}`)
    assert.equal(
      post.headers['Idempotency-Key'],
      sceneKey(id, hashes[id]),
      `escena ${id}`,
    )
  }
  assert.equal(fake.posts().length, 2)
  assert.deepEqual(fake.uploads(), [])
})

test('una lista desactualizada pedida sin regenerar (m2 de la revisión): el carril va a pedir, así que Vimo le reescribe el automático escrito para el texto viejo', async (t) => {
  const old = 'Old calm smile at the camera, nodding.'
  const scene = avatarScene(1, 0, {
    engine: 'avatar_v',
    motionPrompt: old,
    motionSource: 'auto',
    autoMotionPrompt: old,
    autoMotionTextHash: autoMotionHash('Texto viejo'),
  })
  const project = await videoProject(t, [scene], {
    metadata: { narrationVersion: 1 },
  })
  await mkdir(join(project.projectDir, 'avatar'), { recursive: true })
  await writeFile(
    join(project.projectDir, 'avatar', 'scene_1.ab12cd34.mp4'),
    project.clip,
  )
  await patchAvatars(project.projectDir, {
    1: async (current) => ({
      status: 'ready',
      clipFile: 'scene_1.ab12cd34.mp4',
      renderHash: renderHashOf(current, 0),
      narrationVersion: 0,
      attempts: [
        {
          ...paidReceipt(
            await requestHashOf(project.projectDir, current, 0),
            'video-v0',
          ),
          engine: 'avatar_v',
        },
      ],
    }),
  })
  const fake = fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const llm = fakeMotionLlm()
  assert.deepEqual(
    await renderAvatarScenes(await stageContext(project.root, []), {
      sceneIds: [1],
      motionLlm: llm,
    }),
    { rendered: [1], failed: [] },
  )
  assert.equal(llm.calls.length, 1)
  assert.deepEqual(
    llm.scenesOf(0).map((request) => request.sceneId),
    [1],
  )
  assert.equal(postOf(fake, 1).body.motion_prompt, llm.answer(1))
  const [after] = await readScenesJson(project.projectDir)
  assert.equal(after.avatar.motionPrompt, llm.answer(1))
  assert.equal('take' in after.avatar, false)
})

test('las posiciones del movimiento siguen el orden de inicio, no el de los ids (m3 de la revisión)', async (t) => {
  // La 2 abre, la 3 va en el medio y la 1 cierra.
  const project = await videoProject(t, [
    avatarScene(1, 4, { engine: 'avatar_v' }),
    avatarScene(2, 0, { engine: 'avatar_v' }),
    avatarScene(3, 2, { engine: 'avatar_v' }),
  ])
  fakeHeyGen(t, { clip: project.clip, clipSeconds: 1 })
  const llm = fakeMotionLlm()
  await renderAvatarScenes(await stageContext(project.root, []), {
    sceneIds: [1, 2, 3],
    motionLlm: llm,
  })
  assert.equal(llm.calls.length, 1)
  assert.deepEqual(
    llm.scenesOf(0).map((request) => [request.sceneId, request.position]),
    [
      [1, 'closing'],
      [2, 'opening'],
      [3, 'middle'],
    ],
  )
})

// Centinela (registro `node-test-doble-mock-del-mismo-metodo-deja-el-global-sucio`):
// va SIEMPRE último; un test nuevo va antes que este.
test('centinela: al terminar, fetch vuelve a ser el real', () => {
  assert.equal(globalThis.fetch, ORIGINAL_FETCH)
})
