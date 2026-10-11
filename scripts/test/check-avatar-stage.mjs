// La fase `avatar` (ADR-0057, entrega 2, diseño §8) sobre un proyecto en una
// carpeta temporal, con HeyGen simulado por ruta y el ffmpeg del repo
// (escenas de 1 s para que el guard sea rápido; no dependen del mínimo real
// por aparición): el registro (entre `images` y `animation`), `skip` (sin
// escenas de avatar, todo listo, listo pero desactualizado —no se paga solo—,
// demo, regeneración de imágenes), el saldo contra el estimado ANTES de subir
// nada y otra vez antes de pagar cada escena (diseño §8: si deja de alcanzar a
// mitad de corrida, las que faltan no se piden y las pedidas se cosechan; solo
// en dólares y en millonésimas, así un saldo igual al estimado alcanza; uno
// ilegible avisa una vez y deja seguir; una clave rechazada o ausente corta),
// la concurrencia de 3, la cosecha de recibos antes del saldo (`pending`,
// `creating` y `ambiguous`), la relectura de scenes.json bajo el lease de
// escena, una escena anunciada una sola vez
// aunque el carril entre dos veces, `avatar_incomplete` con el código
// dominante y reanudar solo lo que falta (un render moderado no se vuelve a
// pedir solo; desde el editor, sí), el código de la cuenta en vez de
// `avatar_incomplete` cuando la clave dejó de servir (también si otra escena
// fue un rechazo para siempre, en cualquier orden), la pausa por saldo que
// ningún otro fallo tapa, los eventos `avatar-scene-*` y
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
import { join } from 'node:path'
import { test } from 'node:test'

import {
  avatarAudioCutHash,
  avatarRequestHash,
  avatarRequestKey,
  avatarVideoTitle,
} from '../../pipeline/avatar/fingerprint.ts'
import { renderAvatarScenes } from '../../pipeline/avatar/render-scenes.ts'
import { videosSubcommands } from '../../pipeline/commands/videos/subcommands.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { STAGE_IDS } from '../../pipeline/runner/stage-id.ts'
import { avatarStage } from '../../pipeline/stages/avatar/avatar.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { CREATE_VIDEO_STAGES } from '../../pipeline/stages/registry.ts'
import { isInsufficientCreditsCode } from '../../pipeline/utils/insufficient-credits.ts'
import {
  FFMPEG,
  ORIGINAL_FETCH,
  fakeHeyGen,
  json,
  writeHeyGenClip,
  writeNarration,
} from './avatar-fixture.mjs'

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

// La huella del pedido actual de una escena de este proyecto, como el carril.
async function currentHash(projectDir, scene) {
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
    narrationVersion: 0,
  })
}

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

test('skip: sin escenas de avatar, con todo listo (aunque desactualizado), en la demo y al regenerar imágenes no hay nada que pagar', async (t) => {
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
  // Lista pero sin el archivo: pendiente.
  await rm(clipPath)
  assert.equal(
    await avatarStage.skip(await stageContext(ready.root, [])),
    false,
  )
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
    [3.3, 'avatar_incomplete', 4, 4],
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
    await assert.rejects(
      avatarStage.run(await stageContext(project.root, [])),
      { code },
      `${remaining}`,
    )
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

test('una escena que falla deja la fase en avatar_incomplete con el código dominante; reanudar solo paga la que falta', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0), avatarScene(2, 1)])
  const events = []
  // Un render fallido por algo que repetir puede arreglar (no moderación ni
  // un look que no sirve): reanudar lo vuelve a pedir solo.
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
  await assert.rejects(
    avatarStage.run(await stageContext(project.root, events)),
    (error) => {
      assert.equal(error.code, 'avatar_incomplete')
      assert.match(error.message, /without a clip: 2 /)
      assert.match(error.message, /avatar_render_failed/)
      return true
    },
  )
  assert.deepEqual(ofType(events, 'avatar-scene-failed'), [
    {
      type: 'avatar-scene-failed',
      sceneId: 2,
      code: 'avatar_render_failed',
    },
  ])
  const afterFirst = await readScenesJson(project.projectDir)
  assert.equal(afterFirst[0].avatar.status, 'ready')
  assert.equal(afterFirst[1].avatar.status, 'failed')

  // Reanudar: la próxima corrida, con el MISMO fetch simulado.
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  const context = await stageContext(project.root, [])
  assert.equal(await avatarStage.skip(context), false)
  await avatarStage.run(context)
  assert.equal(fake.posts().length, 1)
  assert.match(fake.posts()[0].body.title, /:scene-2:/)
  assert.equal(fake.uploads().length, 0)
  assert.equal(
    (await readScenesJson(project.projectDir))[1].avatar.status,
    'ready',
  )
})

test('un render moderado no se vuelve a pedir al reanudar: la escena sigue fallida con su código, sin saldo ni POST, y se avisa; pedido desde el editor, sí se paga otra vez', async (t) => {
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
  await assert.rejects(avatarStage.run(await stageContext(project.root, [])), {
    code: 'avatar_incomplete',
  })

  // Reanudar: la escena moderada no se vuelve a pedir (volvería a fallar
  // igual). Ni saldo, ni audio, ni POST; la fase sigue sin clip para ella y
  // el código dominante es el de la moderación.
  fake.reset({ clip: project.clip, clipSeconds: 1 })
  const events = []
  const context = await stageContext(project.root, events)
  assert.equal(await avatarStage.skip(context), false)
  await assert.rejects(avatarStage.run(context), (error) => {
    assert.equal(error.code, 'avatar_incomplete')
    assert.match(error.message, /without a clip: 2 /)
    assert.match(error.message, /avatar_moderation_rejected/)
    return true
  })
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

test('la clave que deja de servir a mitad de corrida (401 al consultar el render) deja la fase con avatar_invalid_key, no con avatar_incomplete', async (t) => {
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

test('HeyGen caído: cada escena falla con avatar_network, el aviso de proveedor sale una vez y el intento queda sin resolver', async (t) => {
  const project = await videoProject(t, [avatarScene(1, 0), avatarScene(2, 1)])
  const events = []
  fakeHeyGen(t, {
    clip: project.clip,
    create: () =>
      new Response('<html>Service Unavailable</html>', { status: 503 }),
  })
  await assert.rejects(
    avatarStage.run(await stageContext(project.root, events)),
    { code: 'avatar_incomplete' },
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
  // La red se cae en el POST: el recibo queda sin resolver, con su título.
  const fake = fakeHeyGen(t, {
    clip: project.clip,
    clipSeconds: 1,
    create: () => 'network',
  })
  await assert.rejects(avatarStage.run(await stageContext(project.root, [])), {
    code: 'avatar_incomplete',
  })
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
