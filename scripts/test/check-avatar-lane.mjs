// El carril de UNA escena de avatar (ADR-0057, entrega 2, diseño §7.2 con el
// cambio del dueño del 2026-10-10: el clip ES la escena con el fondo propio
// del look y solo se sube el audio) con un HeyGen simulado por ruta y el
// ffmpeg del repo. FFmpeg real, no inyectado: el corte de audio y la
// normalización sin retimar son justamente lo que se prueba, y los medios son
// chicos y se generan al vuelo en carpetas temporales (nada sale a la red).
// Fija: las huellas del pedido y del tramo, y la vista «desactualizada» cuando
// el clip ya no es del tramo, del look o del motor de la escena; el corte de
// audio cuantizado a 25 fps; la normalización al cuadro sin deformar, sin
// audio, sin retimar (un video 0,6 s más largo se recorta y se avisa) y con un
// cuadro clave por segundo; el intento `creating` persistido ANTES del POST (y
// sin él guardado no sale ningún POST; un `pending` que no se pudo guardar no
// se toma por una respuesta de HeyGen); reanudar un `creating` o un
// `ambiguous` sin pagar dos veces (adopción por el `title` exacto, siguiendo
// el cursor de HeyGen, o la misma `Idempotency-Key`, que lleva el proyecto y
// la escena); los «no» definitivos (el look, el saldo, la clave, el asset de
// audio, el cliente que no manda el pedido), que cierran el recibo `failed`
// para que el reintento lleve la clave siguiente, también en una repetición
// salvo la clave, el saldo y el transporte (un 401, 402, 403, 408 o 425, o un
// 5xx que habla del saldo, a una repetición lo dejan sin resolver y la
// corrida siguiente repite la MISMA clave); el asset rechazado, que sale solo
// de los recibos del mismo pedido; el 409 y el 429 agotados, también uno
// detrás del otro, el 409 de cuerpo cortado y cualquier rechazo que llega
// después de un 409 del mismo pedido, que dejan el recibo `ambiguous`; un
// render que el listado nombra con un estado desconocido, que igual se adopta
// por su título; el 404 al consultar, que no paga de nuevo; una
// consulta caída que no corta la espera y un 401 que deja el recibo
// `pending`; un rechazo para siempre (moderación, look) que no se repite solo
// y, pedido desde el editor, se reintenta con otra clave y el mismo audio (y
// la escena lista sin el error viejo); el plazo que conserva el
// recibo; la URL vencida que se vuelve a pedir; un crudo ilegible que se
// vuelve a bajar y uno legible que se conserva; los temporales de un job
// matado, que se barren al entrar (solo los de la escena); la cancelación con
// el POST en vuelo, durante la espera y durante la descarga; una búsqueda por
// título que falla sin POST; una escena lista que no vuelve a HeyGen;
// `needs-request` sin tocar nada; un recibo sin su audio, que se cierra sin
// POST; y un tramo sin cuadros (la regla única de `avatarSceneSpan`, en cuadros
// de 25 fps) o un avatar sin look, sin hablar con HeyGen. Un solo fetch
// simulado por test (con `reset` entre corridas) y un centinela al final. Los
// nombres de archivo y la tarifa los fija `check-avatar-scene-model.mjs`.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { inspectAnimationFile } from '../../pipeline/animation/normalize-file.ts'
import {
  avatarAudioFile,
  avatarClipFileName,
  avatarRawClipFile,
  sceneAvatarClipFile,
} from '../../pipeline/avatar/clip-path.ts'
import {
  avatarAudioCutHash,
  avatarIdempotencyKey,
  avatarRenderHash,
  avatarRequestHash,
  avatarRequestKey,
  avatarRetryIndex,
  avatarVideoTitle,
} from '../../pipeline/avatar/fingerprint.ts'
import { renderAvatarScene } from '../../pipeline/avatar/lane.ts'
import {
  AVATAR_DURATION_TOLERANCE_SECONDS,
  cutAvatarAudio,
  normalizeAvatarClip,
} from '../../pipeline/avatar/normalization.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'
import { toSceneAvatarView } from '../../pipeline/project/scenes-file.ts'
import { createHeyGenClient } from '../../pipeline/providers/avatar/heygen.ts'
import { PipelineFailure } from '../../pipeline/runner/failure.ts'
import { avatarSceneSpan } from '../../pipeline/types/avatar.ts'
import {
  FFMPEG,
  ORIGINAL_FETCH,
  fakeClock,
  fakeHeyGen,
  isBlue,
  isGreen,
  isRed,
  json,
  pixelAt,
  videoSize,
  wavInfo,
  writeHeyGenClip,
  writeNarration,
  writeStripesClip,
} from './avatar-fixture.mjs'

const PROJECT_ID = 'mi-video'
const NARRATION_SHA = 'f'.repeat(64)
// Tramo de 7 s: del cuadro 26 (1,04 s) al 201 (8,04 s).
const SPAN_FRAMES = 175
const SMALL_FRAME = { width: 320, height: 180 }
const SCENE = {
  id: 3,
  text: 'Hola, soy tu presentador.',
  startSeconds: 1.04,
  endSeconds: 8.04,
  avatar: {
    lookId: 'look-1',
    lookName: 'Ana',
    lookType: 'photo_avatar',
    engine: 'avatar_iii',
    origin: 'auto',
    status: 'planned',
  },
}
// La huella del corte de la escena 3 y la de su pedido, calculadas como el carril.
const CUT_HASH = avatarAudioCutHash({
  narrationSha256: NARRATION_SHA,
  startFrame: 26,
  endFrame: 201,
})
const REQUEST_HASH = avatarRequestHash({
  lookId: 'look-1',
  engine: 'avatar_iii',
  aspectRatio: '16:9',
  resolution: '1080p',
  audioCutHash: CUT_HASH,
  narrationVersion: 0,
})
const RENDER_HASH = avatarRenderHash({
  lookId: 'look-1',
  engine: 'avatar_iii',
  startFrame: 26,
  endFrame: 201,
  narrationVersion: 0,
})
// La Idempotency-Key del intento `retryIndex` del pedido de la escena 3.
const idempotencyKey = (retryIndex) =>
  avatarIdempotencyKey(
    PROJECT_ID,
    3,
    avatarRequestKey(REQUEST_HASH, retryIndex),
  )
// Un rechazo de HeyGen con su sobre de error.
const rejection = (status, code, message, param = null) =>
  json({ error: { code, message, param } }, status)

const withAttempts = (attempts) => ({
  ...SCENE,
  avatar: { ...SCENE.avatar, attempts },
})
const creatingAttempt = () => ({
  hash: REQUEST_HASH,
  state: 'creating',
  engine: 'avatar_iii',
  lookId: 'look-1',
  audioAssetId: 'asset-audio',
  createdAt: '2026-10-10T15:00:00.000Z',
})

// Proyecto temporal con 10 s de narración.
async function project(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-lane-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, PROJECT_ID), PROJECT_ID)
  await mkdir(paths.root, { recursive: true })
  writeNarration(paths.narrationFile, 10)
  return { root, paths }
}

// Los bytes del mp4 «de HeyGen» de un test.
async function heygenClip(paths, options) {
  const path = join(paths.root, 'heygen-source.mp4')
  writeHeyGenClip(path, options)
  return readFile(path)
}

// Los cuadros clave de un video (`iskey:1` en el showinfo de ffmpeg).
function keyFrames(path) {
  const run = spawnSync(
    FFMPEG,
    ['-hide_banner', '-i', path, '-vf', 'showinfo', '-f', 'null', '-'],
    { encoding: 'utf8' },
  )
  return [...run.stderr.matchAll(/\bn:\s*(\d+)\b[^\n]*\biskey:1\b/g)].map(
    (match) => Number(match[1]),
  )
}

// Opciones del carril con un reloj falso, y lo que el carril persistió y avisó.
function lane(paths, overrides = {}) {
  const checkpoints = []
  const events = []
  const options = {
    client: createHeyGenClient('key-123', new AbortController().signal),
    paths,
    projectId: PROJECT_ID,
    ffmpegPath: FFMPEG,
    format: '16:9',
    frame: SMALL_FRAME,
    narrationSha256: NARRATION_SHA,
    narrationVersion: 0,
    allowNewRequest: true,
    signal: new AbortController().signal,
    clock: fakeClock(),
    events: {
      onStarted: (sceneId) => events.push({ type: 'started', sceneId }),
      onProgress: (sceneId, phase) =>
        events.push({ type: 'progress', sceneId, phase }),
      onWarn: (sceneId, message) =>
        events.push({ type: 'warn', sceneId, message }),
      onRecoveredFailure: (sceneId, failure) =>
        events.push({ type: 'recovered', sceneId, code: failure.code }),
    },
    onCheckpoint: async (avatar) => {
      checkpoints.push(structuredClone(avatar))
    },
    ...overrides,
  }
  return { options, checkpoints, events }
}

test('huellas: cada dato del pedido cambia la huella, el reintento cambia la clave y los formatos son los de HeyGen', () => {
  const identity = {
    lookId: 'look-1',
    engine: 'avatar_iii',
    aspectRatio: '16:9',
    resolution: '1080p',
    audioCutHash: 'a'.repeat(64),
    narrationVersion: 0,
  }
  const base = avatarRequestHash(identity)
  for (const change of [
    { lookId: 'look-2' },
    { engine: 'avatar_iv' },
    { aspectRatio: '9:16' },
    { resolution: '720p' },
    { audioCutHash: 'c'.repeat(64) },
    { narrationVersion: 1 },
  ])
    assert.notEqual(
      avatarRequestHash({ ...identity, ...change }),
      base,
      JSON.stringify(change),
    )
  assert.equal(avatarRequestHash({ ...identity }), base)

  const cut = { narrationSha256: 'n'.repeat(64), startFrame: 26, endFrame: 201 }
  for (const change of [{ endFrame: 202 }, { narrationSha256: 'm'.repeat(64) }])
    assert.notEqual(
      avatarAudioCutHash({ ...cut, ...change }),
      avatarAudioCutHash(cut),
      JSON.stringify(change),
    )
  const render = {
    lookId: 'look-1',
    engine: 'avatar_iii',
    startFrame: 26,
    endFrame: 201,
    narrationVersion: 0,
  }
  for (const change of [
    { narrationVersion: 1 },
    { startFrame: 27 },
    { endFrame: 200 },
    { lookId: 'look-2' },
  ])
    assert.notEqual(
      avatarRenderHash({ ...render, ...change }),
      avatarRenderHash(render),
      JSON.stringify(change),
    )

  const attempt = (hash, state) => ({
    hash,
    state,
    engine: 'avatar_iii',
    lookId: 'look-1',
    createdAt: '2026-10-10T15:00:00.000Z',
  })
  const attempts = [
    attempt(base, 'failed'),
    attempt('otro', 'failed'),
    attempt(base, 'pending'),
  ]
  assert.equal(avatarRetryIndex(attempts, 0), 0)
  assert.equal(avatarRetryIndex(attempts, 2), 1)
  const first = avatarRequestKey(base, 0)
  assert.notEqual(avatarRequestKey(base, 1), first)
  const key = avatarIdempotencyKey('mi-video', 3, first)
  assert.match(key, /^vimo-avatar-video-[0-9a-f]{32}$/)
  // El patrón de la OpenAPI para Idempotency-Key.
  assert.match(key, /^[A-Za-z0-9_\-:.]{1,255}$/)
  // El mismo pedido en otro proyecto o en otra escena (una narración idéntica)
  // no comparte la clave con este.
  assert.notEqual(avatarIdempotencyKey('otro-video', 3, first), key)
  assert.notEqual(avatarIdempotencyKey('mi-video', 4, first), key)
  assert.equal(
    avatarVideoTitle('mi-video', 3, first),
    `vimo:mi-video:scene-3:${first.slice(0, 8)}`,
  )
})

test('vista: un clip listo de otro tramo, de otro look o sin huella sale desactualizado aunque la narración sea la misma', async (t) => {
  const { paths } = await project(t)
  const key = avatarRequestKey(REQUEST_HASH, 0)
  const clipPath = join(paths.avatarDirectory, avatarClipFileName(3, key))
  await mkdir(paths.avatarDirectory, { recursive: true })
  await writeFile(clipPath, Buffer.from('mp4'))
  const ready = {
    ...SCENE.avatar,
    status: 'ready',
    clipFile: avatarClipFileName(3, key),
    normalizedSeconds: 7,
    renderHash: RENDER_HASH,
    narrationVersion: 0,
  }
  const view = (scene) =>
    toSceneAvatarView(paths, scene, { narrationVersion: 0 })

  // El clip del tramo, el look y el motor de hoy: vigente.
  const current = await view({ ...SCENE, avatar: ready })
  assert.equal(current.status, 'ready')
  assert.equal(current.clipPath, clipPath)
  assert.equal(current.stale, undefined)
  // Una frontera se movió un cuadro: el clip ya no es de este tramo.
  assert.equal(
    (await view({ ...SCENE, endSeconds: 8.08, avatar: ready })).stale,
    true,
  )
  // Otro look en la escena con el clip del anterior.
  assert.equal(
    (await view({ ...SCENE, avatar: { ...ready, lookId: 'look-2' } })).stale,
    true,
  )
  // Un clip listo sin huella: no se sabe para qué tramo se hizo.
  assert.equal(
    (await view({ ...SCENE, avatar: { ...ready, renderHash: undefined } }))
      .stale,
    true,
  )
})

test('corte de audio: WAV mono a 44,1 kHz del tramo exacto, cuantizado a 25 fps', async (t) => {
  const { paths } = await project(t)
  const output = join(paths.root, 'cut.wav')
  // 1,05 s y 8,03 s caen en los cuadros 26 y 201: el mismo corte que 1,04–8,04.
  await cutAvatarAudio(FFMPEG, paths.narrationFile, output, {
    startSeconds: 1.05,
    endSeconds: 8.03,
  })
  const info = await wavInfo(output)
  assert.equal(info.channels, 1)
  assert.equal(info.sampleRate, 44_100)
  assert.ok(Math.abs(info.seconds - 7) < 0.005, `seconds=${info.seconds}`)
  // Cuantizado de verdad, también el inicio: byte a byte el corte de 1,04–8,04
  // (con el tono de 440 Hz, empezar 10 ms después cambia todas las muestras).
  const exact = join(paths.root, 'exact.wav')
  await cutAvatarAudio(FFMPEG, paths.narrationFile, exact, {
    startSeconds: 1.04,
    endSeconds: 8.04,
  })
  assert.ok((await readFile(output)).equals(await readFile(exact)))
  // El temporal se renombró: no queda ninguno al lado.
  assert.deepEqual(
    (await readdir(paths.root)).filter((name) => name.includes('tmp')),
    [],
  )
})

test('normalización: un video 0,6 s más largo se recorta al tramo sin retimar, sin audio, al cuadro y con un cuadro clave por segundo', async (t) => {
  const { paths } = await project(t)
  const source = join(paths.root, 'long.mp4')
  writeHeyGenClip(source, { seconds: 7.6, switchSeconds: 3 })
  const output = join(paths.root, 'long-normalized.mp4')
  const result = await normalizeAvatarClip(FFMPEG, source, output, {
    startSeconds: 1.04,
    endSeconds: 8.04,
    frame: SMALL_FRAME,
  })
  assert.equal(result.frames, SPAN_FRAMES)
  assert.equal(result.normalizedSeconds, 7)
  assert.ok(
    Math.abs(result.sourceSeconds - 7.6) < 0.05,
    `${result.sourceSeconds}`,
  )
  assert.ok(
    result.sourceSeconds - result.normalizedSeconds >
      AVATAR_DURATION_TOLERANCE_SECONDS,
  )
  const probe = await inspectAnimationFile(FFMPEG, output)
  assert.equal(probe.frames, SPAN_FRAMES)
  assert.equal(probe.audioStreams, 0)
  assert.deepEqual(videoSize(output), SMALL_FRAME)
  // El rojo termina en el segundo 3 del video de HeyGen: el cuadro 74 sigue
  // rojo y el 75 ya es azul. Retimado de 7,6 a 7 s, el azul llegaría en el 69.
  assert.ok(isRed(pixelAt(output, 74, 10, 10)))
  assert.ok(isBlue(pixelAt(output, 75, 10, 10)))
  assert.ok(isBlue(pixelAt(output, SPAN_FRAMES - 1, 10, 10)))
  // Un cuadro clave cada 25 como mucho: el visor reajusta el clip cuando se
  // desfasa 0,12 s y con el GOP de x264 por defecto (250) habría uno solo.
  const keys = keyFrames(output)
  assert.equal(keys[0], 0, `${keys}`)
  for (let index = 1; index < keys.length; index++)
    assert.ok(keys[index] - keys[index - 1] <= 25, `${keys}`)
  assert.ok(SPAN_FRAMES - 1 - keys.at(-1) < 25, `${keys}`)

  // Más corto que el tramo: se repite el último cuadro hasta el final.
  const short = join(paths.root, 'short.mp4')
  writeHeyGenClip(short, { seconds: 6.5, switchSeconds: 3 })
  const padded = join(paths.root, 'short-normalized.mp4')
  const shortResult = await normalizeAvatarClip(FFMPEG, short, padded, {
    startSeconds: 1.04,
    endSeconds: 8.04,
    frame: SMALL_FRAME,
  })
  assert.equal(shortResult.frames, SPAN_FRAMES)
  assert.ok(isRed(pixelAt(padded, 74, 10, 10)))
  assert.ok(isBlue(pixelAt(padded, SPAN_FRAMES - 1, 10, 10)))
})

test('normalización: llena el cuadro sin deformar en 9:16 y en 16:9', async (t) => {
  const { paths } = await project(t)
  const stripes = join(paths.root, 'stripes.mp4')
  writeStripesClip(stripes, 1)
  const vertical = join(paths.root, 'vertical.mp4')
  await normalizeAvatarClip(FFMPEG, stripes, vertical, {
    startSeconds: 0,
    endSeconds: 1,
    frame: { width: 180, height: 320 },
  })
  assert.deepEqual(videoSize(vertical), { width: 180, height: 320 })
  // Recortado al centro: solo la franja verde, de borde a borde y de arriba a
  // abajo (aplastado se verían las tres; con bandas, un borde sería negro).
  for (const [x, y] of [
    [2, 160],
    [90, 2],
    [177, 317],
  ])
    assert.ok(isGreen(pixelAt(vertical, 0, x, y)), `${x},${y}`)

  const horizontal = join(paths.root, 'horizontal.mp4')
  await normalizeAvatarClip(FFMPEG, stripes, horizontal, {
    startSeconds: 0,
    endSeconds: 1,
    frame: SMALL_FRAME,
  })
  assert.deepEqual(videoSize(horizontal), SMALL_FRAME)
  assert.ok(isRed(pixelAt(horizontal, 0, 2, 90)))
  assert.ok(isGreen(pixelAt(horizontal, 0, 160, 90)))
  assert.ok(isBlue(pixelAt(horizontal, 0, 317, 90)))
})

test('carril: corta y sube el audio, persiste `creating` ANTES del POST, espera, baja y normaliza; la escena queda lista', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const { options, checkpoints, events } = lane(paths)
  const seenAtPost = []
  const fake = fakeHeyGen(t, {
    clip,
    poll: (_videoId, n) => ({
      status: ['waiting', 'processing', 'completed'][Math.min(n, 2)],
    }),
    onRequest(call) {
      if (call.method === 'POST' && call.path === '/v3/videos')
        seenAtPost.push(structuredClone(checkpoints.at(-1)))
    },
  })
  const result = await renderAvatarScene(SCENE, options)

  assert.equal(result.outcome, 'ready')
  const key = avatarRequestKey(REQUEST_HASH, 0)
  // El intento ya estaba en disco, con su audio subido y el costo, cuando salió el POST.
  assert.equal(seenAtPost.length, 1)
  const intent = seenAtPost[0].attempts.at(-1)
  assert.equal(intent.state, 'creating')
  assert.equal(intent.hash, REQUEST_HASH)
  assert.equal(seenAtPost[0].usdEstimated, 0.1155)
  const [post] = fake.posts()
  assert.equal(post.headers['Idempotency-Key'], idempotencyKey(0))
  // Sin fondo, sin recorte y sin encuadre: el look tal cual, en el formato del proyecto.
  assert.deepEqual(post.body, {
    type: 'avatar',
    title: avatarVideoTitle(PROJECT_ID, 3, key),
    avatar_id: 'look-1',
    audio_asset_id: intent.audioAssetId,
    engine: { type: 'avatar_iii' },
    aspect_ratio: '16:9',
    resolution: '1080p',
    output_format: 'mp4',
  })
  // Una sola subida: el WAV del tramo.
  assert.deepEqual(
    fake.uploads().map((call) => call.fileType),
    ['audio/wav'],
  )
  const wav = await wavInfo(avatarAudioFile(paths, 3, CUT_HASH))
  assert.equal(wav.channels, 1)
  assert.ok(Math.abs(wav.seconds - 7) < 0.005)
  // Recibos en orden y la escena lista con todo lo que la describe.
  assert.deepEqual(
    checkpoints.map((avatar) => avatar.attempts.at(-1)?.state),
    ['creating', 'pending', 'succeeded', 'succeeded'],
  )
  assert.deepEqual(
    { ...result.avatar, attempts: undefined },
    {
      ...SCENE.avatar,
      attempts: undefined,
      status: 'ready',
      clipFile: avatarClipFileName(3, key),
      normalizedSeconds: 7,
      renderHash: RENDER_HASH,
      narrationVersion: 0,
      usdEstimated: 0.1155,
    },
  )
  const probe = await inspectAnimationFile(
    FFMPEG,
    sceneAvatarClipFile(paths, result.avatar),
  )
  assert.equal(probe.frames, SPAN_FRAMES)
  assert.equal(probe.audioStreams, 0)
  assert.equal(events[0].type, 'started')
  assert.deepEqual(
    [
      ...new Set(
        events
          .filter((event) => event.type === 'progress')
          .map((event) => event.phase),
      ),
    ],
    ['audio', 'upload', 'render', 'download', 'normalize'],
  )
  assert.equal(
    events.some((event) => event.type === 'warn'),
    false,
  )
  assert.deepEqual(fake.unexpected, [])
})

test('carril: solo el checkpoint que deja la escena lista con su clip lleva `newClip`; los recibos intermedios no', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  fakeHeyGen(t, { clip })
  const saved = []
  const { options } = lane(paths, {
    onCheckpoint: async (avatar, details) => {
      saved.push([avatar.attempts.at(-1)?.state, avatar.status, details])
    },
  })
  const result = await renderAvatarScene(SCENE, options)
  assert.equal(result.outcome, 'ready')
  assert.deepEqual(saved, [
    ['creating', 'planned', undefined],
    ['pending', 'planned', undefined],
    ['succeeded', 'planned', undefined],
    ['succeeded', 'ready', { newClip: true }],
  ])
})

test('carril: si HeyGen devuelve 0,6 s de más se recorta al tramo y se avisa; el audio nunca se toca', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7.6, switchSeconds: 3 })
  const { options, events } = lane(paths)
  fakeHeyGen(t, { clip, clipSeconds: 7.6 })
  const result = await renderAvatarScene(SCENE, options)
  assert.equal(result.outcome, 'ready')
  assert.equal(result.avatar.normalizedSeconds, 7)
  const clipPath = sceneAvatarClipFile(paths, result.avatar)
  const probe = await inspectAnimationFile(FFMPEG, clipPath)
  assert.equal(probe.frames, SPAN_FRAMES)
  assert.equal(probe.audioStreams, 0)
  assert.ok(isRed(pixelAt(clipPath, 74, 10, 10)))
  assert.ok(isBlue(pixelAt(clipPath, 75, 10, 10)))
  const warnings = events.filter((event) => event.type === 'warn')
  assert.equal(warnings.length, 1)
  assert.match(warnings[0].message, /7\.6\d\d s of video for a 7\.000 s span/)
  // El WAV que se le mandó a HeyGen sigue siendo el tramo exacto.
  const wav = await wavInfo(avatarAudioFile(paths, 3, CUT_HASH))
  assert.ok(Math.abs(wav.seconds - 7) < 0.005)
})

test('reanudar: un intento `creating` de un job muerto se adopta por su título exacto y no se paga dos veces', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const title = avatarVideoTitle(
    PROJECT_ID,
    3,
    avatarRequestKey(REQUEST_HASH, 0),
  )
  const fake = fakeHeyGen(t, {
    clip,
    // HeyGen filtra por substring: una copia con el título adentro también
    // vuelve, y no es nuestra.
    listed: [
      { id: 'video-copia', title: `${title} (copia)`, status: 'completed' },
      { id: 'video-pagado', title, status: 'processing' },
    ],
  })
  const result = await renderAvatarScene(
    withAttempts([creatingAttempt()]),
    lane(paths).options,
  )
  assert.equal(result.outcome, 'ready')
  assert.equal(fake.posts().length, 0)
  assert.equal(fake.uploads().length, 0)
  const [list] = fake.lists()
  assert.equal(new URLSearchParams(list.search).get('title'), title)
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => [attempt.state, attempt.videoId]),
    [['succeeded', 'video-pagado']],
  )
})

test('reanudar: sin rastro del `creating`, se repite el MISMO pedido con la MISMA clave y el audio ya subido', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const key = avatarRequestKey(REQUEST_HASH, 0)
  const fake = fakeHeyGen(t, { clip, listed: [] })
  const result = await renderAvatarScene(
    withAttempts([creatingAttempt()]),
    lane(paths).options,
  )
  assert.equal(result.outcome, 'ready')
  assert.equal(fake.posts().length, 1)
  const [post] = fake.posts()
  assert.equal(post.headers['Idempotency-Key'], idempotencyKey(0))
  assert.equal(post.body.title, avatarVideoTitle(PROJECT_ID, 3, key))
  assert.equal(post.body.audio_asset_id, 'asset-audio')
  assert.equal(fake.uploads().length, 0)
  // La búsqueda por título va antes del POST.
  assert.ok(fake.calls.indexOf(fake.lists()[0]) < fake.calls.indexOf(post))
})

test('una red caída en el POST deja el intento `ambiguous` con su audio; la próxima corrida lo adopta sin otro POST', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, { clip, create: () => 'network' })
  const failed = await renderAvatarScene(SCENE, lane(paths).options)
  assert.equal(failed.outcome, 'failed')
  assert.equal(failed.errorCode, 'avatar_network')
  assert.equal(failed.avatar.status, 'failed')
  const [attempt] = failed.avatar.attempts
  assert.equal(attempt.state, 'ambiguous')
  assert.ok(attempt.audioAssetId)
  assert.equal(fake.posts().length, 1)

  fake.reset({
    clip,
    listed: [
      {
        id: 'video-3-1',
        title: avatarVideoTitle(
          PROJECT_ID,
          3,
          avatarRequestKey(attempt.hash, 0),
        ),
        status: 'completed',
      },
    ],
  })
  const second = await renderAvatarScene(
    { ...SCENE, avatar: failed.avatar },
    lane(paths).options,
  )
  assert.equal(second.outcome, 'ready')
  assert.equal(fake.posts().length, 0)
  assert.equal(fake.uploads().length, 0)
  assert.equal(second.avatar.attempts[0].videoId, 'video-3-1')
})

test('un 400 por el look es un rechazo definitivo: el recibo queda `failed` (su clave no se vuelve a mandar) y la escena falla con avatar_look_unsupported', async (t) => {
  const { paths } = await project(t)
  const { options, checkpoints } = lane(paths)
  const fake = fakeHeyGen(t, {
    create: () =>
      json(
        {
          error: {
            code: 'invalid_parameter',
            message: 'This avatar does not support the requested engine',
            param: 'engine',
          },
        },
        400,
      ),
  })
  const result = await renderAvatarScene(SCENE, options)
  assert.equal(result.outcome, 'failed')
  assert.equal(result.errorCode, 'avatar_look_unsupported')
  // El campo que HeyGen rechazó viaja en el fallo (diagnóstico y aviso).
  assert.equal(result.failure.param, 'engine')
  assert.equal(result.avatar.status, 'failed')
  // El recibo se cierra con su código y conserva el audio para el reintento.
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => [attempt.state, attempt.errorCode]),
    [['failed', 'avatar_look_unsupported']],
  )
  assert.ok(result.avatar.attempts[0].audioAssetId)
  assert.equal(fake.posts().length, 1)
  // La intención estuvo en disco antes del POST, el recibo se cerró con la
  // respuesta y después la escena quedó fallida.
  assert.deepEqual(
    checkpoints.map((avatar) => avatar.attempts.length),
    [1, 1, 1],
  )
})

test('un render `failed` por moderación no se cobra: queda el recibo y, pedido desde el editor, el reintento usa otra clave con el mismo audio', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, {
    clip,
    poll: () => ({
      status: 'failed',
      extra: {
        failure_code: 'content_policy_violation',
        failure_message: 'Content rejected by moderation',
      },
    }),
  })
  const first = await renderAvatarScene(SCENE, lane(paths).options)
  assert.equal(first.outcome, 'failed')
  assert.equal(first.errorCode, 'avatar_moderation_rejected')
  assert.equal(first.avatar.status, 'failed')
  assert.equal(first.avatar.errorCode, 'avatar_moderation_rejected')
  const [failedAttempt] = first.avatar.attempts
  assert.equal(failedAttempt.state, 'failed')
  assert.equal(failedAttempt.failureCode, 'content_policy_violation')
  assert.equal(failedAttempt.errorCode, 'avatar_moderation_rejected')
  assert.equal(failedAttempt.videoId, 'video-3-1')
  const firstKey = fake.posts()[0].headers['Idempotency-Key']

  // La moderación es un rechazo que la fase no repite sola: lo pide la
  // persona desde el editor.
  fake.reset({ clip })
  const second = await renderAvatarScene(
    { ...SCENE, avatar: first.avatar },
    lane(paths, { retryFinalRejection: true }).options,
  )
  assert.equal(second.outcome, 'ready')
  // El error de la corrida anterior no sigue en la escena lista: la vista lo
  // mostraría tal cual (toSceneAvatarView copia el `errorCode`).
  assert.equal('errorCode' in second.avatar, false)
  assert.equal(fake.posts().length, 1)
  const [retry] = fake.posts()
  // Con la clave vieja HeyGen devolvería 24 h el mismo video fallido.
  assert.notEqual(retry.headers['Idempotency-Key'], firstKey)
  assert.equal(
    retry.headers['Idempotency-Key'],
    avatarIdempotencyKey(
      PROJECT_ID,
      3,
      avatarRequestKey(failedAttempt.hash, 1),
    ),
  )
  assert.equal(retry.body.audio_asset_id, failedAttempt.audioAssetId)
  assert.equal(fake.uploads().length, 0)
  assert.deepEqual(
    second.avatar.attempts.map((attempt) => attempt.state),
    ['failed', 'succeeded'],
  )
})

test('el plazo de 30 min vence sin pagar de nuevo: el recibo queda `pending` y la próxima corrida lo cosecha', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const clock = fakeClock(0)
  const fake = fakeHeyGen(t, {
    clip,
    poll: () => ({ status: 'processing' }),
  })
  const first = await renderAvatarScene(SCENE, lane(paths, { clock }).options)
  assert.equal(first.outcome, 'failed')
  assert.equal(first.errorCode, 'avatar_timeout')
  assert.deepEqual(
    first.avatar.attempts.map((attempt) => attempt.state),
    ['pending'],
  )
  assert.ok(clock.now() >= 30 * 60_000)
  // Espera creciente: 5 s, 7,5 s, 11,25 s… hasta 20 s; con 30 min son unas 93
  // consultas (a 5 s fijos serían 360).
  const polls = fake.calls.filter(
    (call) => call.method === 'GET' && call.path === '/v3/videos/video-3-1',
  )
  assert.ok(polls.length > 80 && polls.length < 100, `polls=${polls.length}`)

  fake.reset({ clip })
  const second = await renderAvatarScene(
    { ...SCENE, avatar: first.avatar },
    lane(paths).options,
  )
  assert.equal(second.outcome, 'ready')
  assert.equal(fake.posts().length, 0)
  assert.equal(second.avatar.attempts[0].videoId, 'video-3-1')
})

test('un recibo `succeeded` de otra corrida pide una URL fresca: la vencida no se usa', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const scene = withAttempts([
    {
      hash: REQUEST_HASH,
      state: 'succeeded',
      engine: 'avatar_iii',
      lookId: 'look-1',
      audioAssetId: 'asset-audio',
      videoId: 'video-viejo',
      videoUrl: 'https://cdn.example/vencida.mp4',
      createdAt: '2026-10-09T10:00:00.000Z',
    },
  ])
  const fake = fakeHeyGen(t, {
    clip,
    cdnStatus: (path) => (path === '/vencida.mp4' ? 403 : 200),
    poll: () => ({
      status: 'completed',
      extra: { video_url: 'https://cdn.example/fresca.mp4' },
    }),
  })
  const { options, checkpoints } = lane(paths)
  const result = await renderAvatarScene(scene, options)
  assert.equal(result.outcome, 'ready')
  assert.deepEqual(
    fake.calls
      .filter((call) => call.host === 'cdn.example')
      .map((call) => call.path),
    ['/fresca.mp4'],
  )
  assert.equal(fake.posts().length, 0)
  assert.equal(
    checkpoints[0].attempts[0].videoUrl,
    'https://cdn.example/fresca.mp4',
  )
})

test('al entrar, el carril borra los temporales de corte y de normalización que un job matado dejó para su escena, y solo esos', async (t) => {
  const { paths } = await project(t)
  await mkdir(paths.avatarDirectory, { recursive: true })
  const leftovers = [
    '.scene_3.0123abcd.wav.cut-tmp.wav',
    '.scene_3.0123abcd.mp4.normalize-tmp.mp4',
  ]
  const kept = [
    // Otra escena puede estar cortando o normalizando a la vez.
    '.scene_30.0123abcd.mp4.normalize-tmp.mp4',
    '.scene_4.0123abcd.wav.cut-tmp.wav',
    // Lo que no es un temporal de la escena queda.
    'scene_3.0123abcd.wav',
    'scene_3.0123abcd.mp4',
    'look.png',
  ]
  for (const name of [...leftovers, ...kept])
    await writeFile(join(paths.avatarDirectory, name), 'x')
  const fake = fakeHeyGen(t, {})
  const result = await renderAvatarScene(
    SCENE,
    lane(paths, { allowNewRequest: false }).options,
  )
  assert.equal(result.outcome, 'needs-request')
  assert.deepEqual(fake.calls, [])
  assert.deepEqual((await readdir(paths.avatarDirectory)).sort(), kept.sort())
})

test('sin permiso para pedir (antes de mirar el saldo) el carril no corta, no sube ni paga: devuelve `needs-request`', async (t) => {
  const { paths } = await project(t)
  const fake = fakeHeyGen(t, {})
  const { options, checkpoints } = lane(paths, { allowNewRequest: false })
  const result = await renderAvatarScene(SCENE, options)
  assert.equal(result.outcome, 'needs-request')
  assert.deepEqual(fake.calls, [])
  assert.deepEqual(checkpoints, [])
  await assert.rejects(readdir(paths.avatarDirectory), { code: 'ENOENT' })
})

test('un 402 de HeyGen al pedir pausa por saldo con el recibo `failed` y la escena como estaba; recargar y reanudar pide con la clave siguiente y el mismo audio', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, {
    create: () =>
      rejection(
        402,
        'insufficient_credit',
        'Your account has 0 credits but this video requires 10 credits.',
      ),
  })
  const { options, checkpoints } = lane(paths)
  await assert.rejects(renderAvatarScene(SCENE, options), {
    code: 'avatar_insufficient_credits',
  })
  const paused = checkpoints.at(-1)
  assert.equal(paused.status, 'planned')
  assert.equal('errorCode' in paused, false)
  assert.deepEqual(
    paused.attempts.map((attempt) => [attempt.state, attempt.errorCode]),
    [['failed', 'avatar_insufficient_credits']],
  )
  const [rejected] = paused.attempts
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [idempotencyKey(0)],
  )

  // Recargar y reanudar: la clave rechazada no se vuelve a mandar.
  fake.reset({ clip })
  const resumed = await renderAvatarScene(
    { ...SCENE, avatar: paused },
    lane(paths).options,
  )
  assert.equal(resumed.outcome, 'ready')
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [idempotencyKey(1)],
  )
  assert.equal(fake.posts()[0].body.audio_asset_id, rejected.audioAssetId)
  assert.equal(fake.uploads().length, 0)
})

test('un proyecto 9:16 pide el render vertical y el clip llena el cuadro vertical', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, {
    seconds: 7,
    switchSeconds: 3,
    size: '720x1280',
  })
  const fake = fakeHeyGen(t, { clip })
  const result = await renderAvatarScene(
    SCENE,
    lane(paths, { format: '9:16', frame: { width: 180, height: 320 } }).options,
  )
  assert.equal(result.outcome, 'ready')
  assert.equal(fake.posts()[0].body.aspect_ratio, '9:16')
  for (const key of ['background', 'remove_background', 'fit'])
    assert.equal(key in fake.posts()[0].body, false, key)
  assert.deepEqual(videoSize(sceneAvatarClipFile(paths, result.avatar)), {
    width: 180,
    height: 320,
  })
})

test('cancelar con el POST en vuelo deja el intento `ambiguous` con su audio y sale como cancelación, no como un fallo de HeyGen', async (t) => {
  const { paths } = await project(t)
  const controller = new AbortController()
  const fake = fakeHeyGen(t, {
    onRequest(call) {
      if (call.method === 'POST' && call.path === '/v3/videos')
        controller.abort()
    },
  })
  const { options, checkpoints } = lane(paths, {
    client: createHeyGenClient('key-123', controller.signal),
    signal: controller.signal,
  })
  await assert.rejects(renderAvatarScene(SCENE, options), {
    name: 'AbortError',
  })
  assert.equal(fake.posts().length, 1)
  // El POST pudo haber llegado: el recibo queda sin resolver (bloquea otro POST
  // y la próxima corrida lo busca por título) y la escena no queda fallida.
  const saved = checkpoints.at(-1)
  assert.deepEqual(
    saved.attempts.map((attempt) => attempt.state),
    ['ambiguous'],
  )
  assert.ok(saved.attempts[0].audioAssetId)
  assert.equal(saved.status, 'planned')
  assert.equal('errorCode' in saved, false)
})

test('un 409 `request_in_progress` o un 429 agotados dejan el intento `ambiguous`: no dicen nada del envío original', async (t) => {
  const { paths } = await project(t)
  // Las esperas del cliente entre reintentos (2, 4 y 8 s del 409; las del
  // 429) pasan sin dormir.
  t.mock.method(globalThis, 'setTimeout', (callback) => setImmediate(callback))
  const fake = fakeHeyGen(t, {
    create: () =>
      json(
        {
          error: {
            code: 'request_in_progress',
            message: 'A request with this idempotency key is in progress',
          },
        },
        409,
      ),
  })
  const inFlight = await renderAvatarScene(SCENE, lane(paths).options)
  assert.equal(inFlight.outcome, 'failed')
  assert.equal(inFlight.errorCode, 'avatar_rate_limited')
  assert.equal(inFlight.failure.httpStatus, 409)
  assert.deepEqual(
    inFlight.avatar.attempts.map((attempt) => attempt.state),
    ['ambiguous'],
  )
  // El MISMO pedido: el original y tres repeticiones con una sola clave.
  const keys = fake.posts().map((call) => call.headers['Idempotency-Key'])
  assert.equal(keys.length, 4)
  assert.equal(new Set(keys).size, 1)

  fake.reset({
    create: () =>
      json(
        {
          error: { code: 'rate_limit_exceeded', message: 'Too many requests' },
        },
        429,
      ),
  })
  const limited = await renderAvatarScene(SCENE, lane(paths).options)
  assert.equal(limited.outcome, 'failed')
  assert.equal(limited.errorCode, 'avatar_rate_limited')
  assert.equal(limited.failure.httpStatus, 429)
  // HeyGen no guarda un 429 bajo la clave: repetir la MISMA es seguro y gratis.
  assert.deepEqual(
    limited.avatar.attempts.map((attempt) => attempt.state),
    ['ambiguous'],
  )
})

test('un 404 al consultar el render deja el intento `ambiguous` y la escena `avatar_render_failed`; la próxima corrida lo busca por título y no paga de nuevo', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  // `{ error: { code: 'not_found', … } }` con 404: el cliente lo clasifica
  // como un pedido rechazado; el carril mira el status, no el código.
  const fake = fakeHeyGen(t, { clip, poll: () => ({ httpStatus: 404 }) })
  const first = await renderAvatarScene(SCENE, lane(paths).options)
  assert.equal(first.outcome, 'failed')
  assert.equal(first.errorCode, 'avatar_render_failed')
  assert.equal(first.failure.httpStatus, 404)
  const [attempt] = first.avatar.attempts
  assert.equal(attempt.state, 'ambiguous')
  assert.equal(attempt.videoId, 'video-3-1')
  assert.equal(fake.posts().length, 1)

  fake.reset({
    clip,
    listed: [
      {
        id: 'video-3-1',
        title: avatarVideoTitle(
          PROJECT_ID,
          3,
          avatarRequestKey(attempt.hash, 0),
        ),
        status: 'completed',
      },
    ],
  })
  const second = await renderAvatarScene(
    { ...SCENE, avatar: first.avatar },
    lane(paths).options,
  )
  assert.equal(second.outcome, 'ready')
  assert.equal(fake.posts().length, 0)
  assert.equal(second.avatar.attempts[0].videoId, 'video-3-1')
})

test('una consulta de estado caída (HeyGen 503) no corta la espera: se avisa como fallo recuperado y el render se cosecha', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const { options, events } = lane(paths)
  const fake = fakeHeyGen(t, {
    clip,
    poll: (_videoId, n) =>
      n === 0 ? { httpStatus: 503 } : { status: 'completed' },
  })
  const result = await renderAvatarScene(SCENE, options)
  assert.equal(result.outcome, 'ready')
  assert.deepEqual(
    events.filter((event) => event.type === 'recovered'),
    [{ type: 'recovered', sceneId: 3, code: 'avatar_network' }],
  )
  assert.equal(fake.posts().length, 1)
})

test('una escena lista con el clip de su tramo no vuelve a HeyGen; con el clip de otro tramo no cuenta como lista', async (t) => {
  const { paths } = await project(t)
  const key = avatarRequestKey(REQUEST_HASH, 0)
  await mkdir(paths.avatarDirectory, { recursive: true })
  await writeFile(
    join(paths.avatarDirectory, avatarClipFileName(3, key)),
    Buffer.from('mp4'),
  )
  const ready = {
    ...SCENE.avatar,
    status: 'ready',
    clipFile: avatarClipFileName(3, key),
    normalizedSeconds: 7,
    renderHash: RENDER_HASH,
    narrationVersion: 0,
    usdEstimated: 0.1155,
  }
  const fake = fakeHeyGen(t, {})
  const { options, checkpoints } = lane(paths, { allowNewRequest: false })
  const current = await renderAvatarScene({ ...SCENE, avatar: ready }, options)
  assert.equal(current.outcome, 'ready')
  assert.deepEqual(current.avatar, { ...ready, attempts: [] })
  // Una frontera se movió un cuadro: el clip ya no es de este tramo y, sin
  // permiso para pedir, el carril no lo da por listo ni toca nada.
  const moved = await renderAvatarScene(
    { ...SCENE, endSeconds: 8.08, avatar: ready },
    options,
  )
  assert.equal(moved.outcome, 'needs-request')
  assert.deepEqual(fake.calls, [])
  assert.deepEqual(checkpoints, [])
})

test('si la intención no se puede guardar, no sale ningún POST: sin recibo no se paga', async (t) => {
  const { paths } = await project(t)
  const fake = fakeHeyGen(t, {})
  const { options } = lane(paths, {
    onCheckpoint: async () => {
      throw new Error('disk full')
    },
  })
  await assert.rejects(renderAvatarScene(SCENE, options), /disk full/)
  // El audio ya se subió (es gratis y su id no vence); el pedido pago, no.
  assert.equal(fake.uploads().length, 1)
  assert.equal(fake.posts().length, 0)
})

test('la búsqueda por título sigue el cursor de HeyGen: un render de la tercera página se adopta sin pagar de nuevo', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const title = avatarVideoTitle(
    PROJECT_ID,
    3,
    avatarRequestKey(REQUEST_HASH, 0),
  )
  // HeyGen filtra por substring: copias con el título adentro llenan las dos
  // primeras páginas y el render pagado llega en la tercera.
  const copies = [0, 1, 2, 3].map((index) => ({
    id: `video-copia-${index}`,
    title: `${title} (copia ${index})`,
    status: 'completed',
  }))
  const fake = fakeHeyGen(t, {
    clip,
    pageSize: 2,
    listed: [...copies, { id: 'video-pagado', title, status: 'completed' }],
  })
  const result = await renderAvatarScene(
    withAttempts([creatingAttempt()]),
    lane(paths).options,
  )
  assert.equal(result.outcome, 'ready')
  assert.equal(fake.posts().length, 0)
  assert.deepEqual(
    fake.lists().map((call) => new URLSearchParams(call.search).get('token')),
    [null, '2', '4'],
  )
  assert.equal(result.avatar.attempts[0].videoId, 'video-pagado')
})

test('un recibo sin resolver que perdió su audio no sale como POST: se cierra `failed` y reintentar sube el audio y pide con la clave siguiente', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const withoutAudio = creatingAttempt()
  delete withoutAudio.audioAssetId
  const fake = fakeHeyGen(t, { clip, listed: [] })
  const first = await renderAvatarScene(
    withAttempts([withoutAudio]),
    lane(paths).options,
  )
  assert.equal(first.outcome, 'failed')
  assert.equal(first.errorCode, 'avatar_render_failed')
  assert.deepEqual(
    first.avatar.attempts.map((attempt) => [attempt.state, attempt.errorCode]),
    [['failed', 'avatar_render_failed']],
  )
  // Se buscó por título (podía estar pago) y no se mandó nada.
  assert.equal(fake.lists().length, 1)
  assert.equal(fake.posts().length, 0)

  fake.reset({ clip })
  const second = await renderAvatarScene(
    { ...SCENE, avatar: first.avatar },
    lane(paths).options,
  )
  assert.equal(second.outcome, 'ready')
  assert.equal(fake.uploads().length, 1)
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [idempotencyKey(1)],
  )
})

test('avatarSceneSpan: la regla única de «avatar de largo cero» cuenta cuadros de 25 fps, no segundos', () => {
  const avatar = SCENE.avatar
  // Con al menos un cuadro, el tramo sale con sus segundos tal cual.
  assert.deepEqual(
    avatarSceneSpan({ avatar, startSeconds: 1.04, endSeconds: 8.04 }),
    { startSeconds: 1.04, endSeconds: 8.04 },
  )
  assert.deepEqual(
    avatarSceneSpan({ avatar, startSeconds: 1, endSeconds: 1.04 }),
    { startSeconds: 1, endSeconds: 1.04 },
  )
  // Sin avatar, sin tiempos, invertido, con un número que no es finito o con
  // los dos bordes en el mismo cuadro (1,04 y 1,05 s caen en el 26): sin tramo.
  for (const scene of [
    { startSeconds: 1, endSeconds: 8 },
    { avatar },
    { avatar, startSeconds: 1 },
    { avatar, endSeconds: 8 },
    { avatar, startSeconds: 8, endSeconds: 1 },
    { avatar, startSeconds: 1, endSeconds: 1 },
    { avatar, startSeconds: 1.04, endSeconds: 1.05 },
    { avatar, startSeconds: Number.NaN, endSeconds: 8 },
    { avatar, startSeconds: 0, endSeconds: Number.POSITIVE_INFINITY },
  ])
    assert.equal(
      avatarSceneSpan(scene),
      undefined,
      `${scene.startSeconds}–${scene.endSeconds}`,
    )
})

test('un tramo sin cuadros o un avatar sin look fallan con `invalid_payload` sin hablar con HeyGen ni tocar el disco', async (t) => {
  const { paths } = await project(t)
  const fake = fakeHeyGen(t, {})
  for (const scene of [
    { ...SCENE, endSeconds: SCENE.startSeconds + 0.01 },
    { ...SCENE, avatar: { ...SCENE.avatar, lookId: '' } },
  ]) {
    const result = await renderAvatarScene(scene, lane(paths).options)
    assert.equal(result.outcome, 'failed')
    assert.equal(result.errorCode, 'invalid_payload')
    assert.deepEqual(result.avatar.attempts, [])
  }
  assert.deepEqual(fake.calls, [])
  await assert.rejects(readdir(paths.avatarDirectory), { code: 'ENOENT' })
})

test('un pedido que el cliente rechaza sin mandarlo (`invalid_payload` sin status) cierra el recibo `failed`: no hubo POST y no queda sin resolver', async (t) => {
  const { paths } = await project(t)
  const fake = fakeHeyGen(t, { listed: [] })
  // Un recibo roto, sin look: `createVideo` no manda un pedido así.
  const result = await renderAvatarScene(
    withAttempts([{ ...creatingAttempt(), lookId: '' }]),
    lane(paths).options,
  )
  assert.equal(result.outcome, 'failed')
  assert.equal(result.errorCode, 'invalid_payload')
  assert.equal(result.failure.httpStatus, undefined)
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => [attempt.state, attempt.errorCode]),
    [['failed', 'invalid_payload']],
  )
  // Se buscó por título antes (el recibo podía estar pago); el POST no salió.
  assert.equal(fake.lists().length, 1)
  assert.equal(fake.posts().length, 0)
})

test('una repetición sin rastro que recibe 429 hasta agotarse deja el recibo `ambiguous` con su audio; la corrida siguiente repite la MISMA clave (sonda P1)', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  // Las esperas del cliente ante el 429 pasan sin dormir.
  t.mock.method(globalThis, 'setTimeout', (callback) => setImmediate(callback))
  const fake = fakeHeyGen(t, {
    listed: [],
    create: () => rejection(429, 'rate_limit_exceeded', 'Too many requests'),
  })
  const first = await renderAvatarScene(
    withAttempts([{ ...creatingAttempt(), state: 'ambiguous' }]),
    lane(paths).options,
  )
  assert.equal(first.outcome, 'failed')
  assert.equal(first.errorCode, 'avatar_rate_limited')
  assert.deepEqual(
    first.avatar.attempts.map((attempt) => [
      attempt.state,
      attempt.audioAssetId,
    ]),
    [['ambiguous', 'asset-audio']],
  )
  assert.deepEqual(
    [...new Set(fake.posts().map((call) => call.headers['Idempotency-Key']))],
    [idempotencyKey(0)],
  )

  fake.reset({ clip, listed: [] })
  const second = await renderAvatarScene(
    { ...SCENE, avatar: first.avatar },
    lane(paths).options,
  )
  assert.equal(second.outcome, 'ready')
  assert.equal(fake.uploads().length, 0)
  assert.deepEqual(
    fake
      .posts()
      .map((call) => [
        call.headers['Idempotency-Key'],
        call.body.audio_asset_id,
      ]),
    [[idempotencyKey(0), 'asset-audio']],
  )
})

test('un 409 `request_in_progress` y después 429 hasta agotarse, en el mismo pedido, dejan el recibo `ambiguous` (sonda P2)', async (t) => {
  const { paths } = await project(t)
  t.mock.method(globalThis, 'setTimeout', (callback) => setImmediate(callback))
  const fake = fakeHeyGen(t, {
    create: (_call, n) =>
      n === 1
        ? rejection(409, 'request_in_progress', 'The original is in progress')
        : rejection(429, 'rate_limit_exceeded', 'Too many requests'),
  })
  const result = await renderAvatarScene(SCENE, lane(paths).options)
  assert.equal(result.outcome, 'failed')
  assert.equal(result.errorCode, 'avatar_rate_limited')
  assert.equal(result.failure.httpStatus, 429)
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => attempt.state),
    ['ambiguous'],
  )
  // El original (409), la repetición tras la espera y tres más por el 429,
  // todos con la misma clave.
  const keys = fake.posts().map((call) => call.headers['Idempotency-Key'])
  assert.equal(keys.length, 5)
  assert.deepEqual([...new Set(keys)], [idempotencyKey(0)])
})

test('un 409 con el cuerpo cortado (sale `avatar_invalid_request` 409) deja el recibo `ambiguous` (sonda P3)', async (t) => {
  const { paths } = await project(t)
  const fake = fakeHeyGen(t, {
    create: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('body cut'))
          },
        }),
        { status: 409 },
      ),
  })
  const result = await renderAvatarScene(SCENE, lane(paths).options)
  assert.equal(result.outcome, 'failed')
  assert.equal(result.errorCode, 'avatar_invalid_request')
  assert.equal(result.failure.httpStatus, 409)
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => attempt.state),
    ['ambiguous'],
  )
  assert.equal(fake.posts().length, 1)
})

test('si guardar el `pending` falla después de un POST exitoso, el error sube y en disco queda `creating`: la corrida siguiente repite la MISMA clave, nunca la siguiente (sonda P4)', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const saved = []
  let writes = 0
  const fake = fakeHeyGen(t, { clip, listed: [] })
  const { options } = lane(paths, {
    // Solo la segunda escritura (el `pending`) falla, con un código que,
    // adentro del `try` del POST, se habría tomado por un rechazo local; las
    // siguientes andan, como en la sonda de la revisión.
    onCheckpoint: async (avatar) => {
      writes += 1
      if (writes === 2)
        throw new PipelineFailure('invalid_payload', 'scenes.json changed')
      saved.push(structuredClone(avatar))
    },
  })
  await assert.rejects(renderAvatarScene(SCENE, options), {
    code: 'invalid_payload',
  })
  assert.deepEqual(
    saved.map((avatar) => avatar.attempts.map((attempt) => attempt.state)),
    [['creating']],
  )

  fake.reset({ clip, listed: [] })
  const second = await renderAvatarScene(
    { ...SCENE, avatar: saved.at(-1) },
    lane(paths).options,
  )
  assert.equal(second.outcome, 'ready')
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [idempotencyKey(0)],
  )
})

test('si guardar la URL fresca falla, el error sube: no se toma por una consulta caída ni se baja con una URL que no quedó guardada', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, {
    clip,
    poll: () => ({
      status: 'completed',
      extra: { video_url: 'https://cdn.example/fresca.mp4' },
    }),
  })
  let writes = 0
  const { options } = lane(paths, {
    onCheckpoint: async () => {
      writes += 1
      if (writes === 1) throw new Error('disk full')
    },
  })
  const scene = withAttempts([
    {
      ...creatingAttempt(),
      state: 'succeeded',
      videoId: 'video-viejo',
      videoUrl: 'https://cdn.example/vencida.mp4',
    },
  ])
  await assert.rejects(renderAvatarScene(scene, options), /disk full/)
  assert.deepEqual(
    fake.calls.filter((call) => call.host === 'cdn.example'),
    [],
  )
})

test('un rechazo del asset de audio cierra el recibo sin el asset: reintentar vuelve a subir el audio y pide con la clave siguiente', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, {
    create: () =>
      rejection(
        400,
        'invalid_parameter',
        'The audio asset could not be processed',
        'audio_asset_id',
      ),
  })
  const first = await renderAvatarScene(SCENE, lane(paths).options)
  assert.equal(first.outcome, 'failed')
  assert.equal(first.errorCode, 'avatar_invalid_request')
  const [closed] = first.avatar.attempts
  assert.equal(closed.state, 'failed')
  assert.equal('audioAssetId' in closed, false)
  assert.equal(fake.uploads().length, 1)

  fake.reset({ clip })
  const second = await renderAvatarScene(
    { ...SCENE, avatar: first.avatar },
    lane(paths).options,
  )
  assert.equal(second.outcome, 'ready')
  assert.equal(fake.uploads().length, 1)
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [idempotencyKey(1)],
  )
})

test('una repetición sin rastro que recibe un 4xx definitivo cierra el recibo `failed`; pedido desde el editor, el reintento lleva la clave siguiente y el mismo audio', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, {
    listed: [],
    create: () =>
      rejection(
        400,
        'invalid_parameter',
        'This avatar does not support the requested engine',
        'engine',
      ),
  })
  const first = await renderAvatarScene(
    withAttempts([creatingAttempt()]),
    lane(paths).options,
  )
  assert.equal(first.outcome, 'failed')
  assert.equal(first.errorCode, 'avatar_look_unsupported')
  assert.deepEqual(
    first.avatar.attempts.map((attempt) => [attempt.state, attempt.errorCode]),
    [['failed', 'avatar_look_unsupported']],
  )
  assert.equal(fake.lists().length, 1)
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [idempotencyKey(0)],
  )

  // Un look que HeyGen no acepta no se repite solo: lo pide la persona.
  fake.reset({ clip })
  const second = await renderAvatarScene(
    { ...SCENE, avatar: first.avatar },
    lane(paths, { retryFinalRejection: true }).options,
  )
  assert.equal(second.outcome, 'ready')
  assert.equal(fake.uploads().length, 0)
  assert.deepEqual(
    fake
      .posts()
      .map((call) => [
        call.headers['Idempotency-Key'],
        call.body.audio_asset_id,
      ]),
    [[idempotencyKey(1), 'asset-audio']],
  )
})

test('un pedido que HeyGen rechazó para siempre (moderación o look) no se repite solo: la escena queda fallida con su código, sin hablar con HeyGen ni tocar el disco, y se avisa', async (t) => {
  const { paths } = await project(t)
  const fake = fakeHeyGen(t, {})
  for (const code of ['avatar_moderation_rejected', 'avatar_look_unsupported'])
    for (const allowNewRequest of [true, false]) {
      const label = `${code} ${allowNewRequest}`
      const { options, checkpoints, events } = lane(paths, { allowNewRequest })
      const result = await renderAvatarScene(
        withAttempts([
          { ...creatingAttempt(), state: 'failed', errorCode: code },
        ]),
        options,
      )
      assert.equal(result.outcome, 'failed', label)
      assert.equal(result.errorCode, code, label)
      assert.equal(result.failure, undefined, label)
      assert.equal(result.avatar.status, 'failed', label)
      assert.equal(result.avatar.errorCode, code, label)
      // El recibo queda como estaba: no nace otro intento.
      assert.deepEqual(
        result.avatar.attempts.map((attempt) => attempt.state),
        ['failed'],
        label,
      )
      assert.deepEqual(
        checkpoints.map((avatar) => avatar.status),
        ['failed'],
        label,
      )
      const warnings = events.filter((event) => event.type === 'warn')
      assert.equal(warnings.length, 1, label)
      assert.match(warnings[0].message, new RegExp(`for good \\(${code}\\)`))
    }
  assert.deepEqual(fake.calls, [])
  await assert.rejects(readdir(paths.avatarDirectory), { code: 'ENOENT' })
})

test('un rechazo para siempre de OTRO pedido, o un fallo que repetir sí arregla, no frena: el pedido actual se vuelve a pedir solo', async (t) => {
  const { paths } = await project(t)
  const fake = fakeHeyGen(t, {})
  for (const attempt of [
    // Moderado con otra narración: el pedido de hoy es otro.
    {
      ...creatingAttempt(),
      hash: 'b'.repeat(64),
      state: 'failed',
      errorCode: 'avatar_moderation_rejected',
    },
    // Un render fallido, un pedido que HeyGen no entendió o sin saldo.
    {
      ...creatingAttempt(),
      state: 'failed',
      errorCode: 'avatar_render_failed',
    },
    {
      ...creatingAttempt(),
      state: 'failed',
      errorCode: 'avatar_invalid_request',
    },
    {
      ...creatingAttempt(),
      state: 'failed',
      errorCode: 'avatar_insufficient_credits',
    },
  ]) {
    const { options, events } = lane(paths, { allowNewRequest: false })
    const result = await renderAvatarScene(withAttempts([attempt]), options)
    assert.equal(result.outcome, 'needs-request', attempt.errorCode)
    assert.deepEqual(
      events.filter((event) => event.type === 'warn'),
      [],
      attempt.errorCode,
    )
  }
  assert.deepEqual(fake.calls, [])
})

test('cancelar durante la espera del render deja el recibo `pending` y la escena como estaba: sale como cancelación', async (t) => {
  const { paths } = await project(t)
  const controller = new AbortController()
  fakeHeyGen(t, {
    poll: () => ({ status: 'processing' }),
    onRequest(call) {
      if (call.method === 'GET' && call.path === '/v3/videos/video-3-1')
        controller.abort()
    },
  })
  const { options, checkpoints } = lane(paths, {
    client: createHeyGenClient('key-123', controller.signal),
    signal: controller.signal,
  })
  await assert.rejects(renderAvatarScene(SCENE, options), {
    name: 'AbortError',
  })
  const saved = checkpoints.at(-1)
  assert.deepEqual(
    saved.attempts.map((attempt) => [attempt.state, attempt.videoId]),
    [['pending', 'video-3-1']],
  )
  assert.equal(saved.status, 'planned')
  assert.equal('errorCode' in saved, false)
})

test('cancelar durante la descarga deja el recibo `succeeded` con su URL y ningún crudo: sale como cancelación', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const controller = new AbortController()
  fakeHeyGen(t, {
    clip,
    onRequest(call) {
      if (call.host === 'cdn.example') controller.abort()
    },
  })
  const { options, checkpoints } = lane(paths, {
    client: createHeyGenClient('key-123', controller.signal),
    signal: controller.signal,
  })
  await assert.rejects(renderAvatarScene(SCENE, options), {
    name: 'AbortError',
  })
  const saved = checkpoints.at(-1)
  assert.deepEqual(
    saved.attempts.map((attempt) => [attempt.state, attempt.videoUrl]),
    [['succeeded', 'https://cdn.example/video-3-1.mp4']],
  )
  assert.equal(saved.status, 'planned')
  await assert.rejects(
    stat(avatarRawClipFile(paths, 3, avatarRequestKey(REQUEST_HASH, 0))),
    { code: 'ENOENT' },
  )
})

test('si la búsqueda por título falla, el recibo sigue sin resolver y no sale ningún POST', async (t) => {
  const { paths } = await project(t)
  const fake = fakeHeyGen(t, { listStatus: 503 })
  const result = await renderAvatarScene(
    withAttempts([creatingAttempt()]),
    lane(paths).options,
  )
  assert.equal(result.outcome, 'failed')
  assert.equal(result.errorCode, 'avatar_network')
  assert.equal(result.failure.httpStatus, 503)
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => attempt.state),
    ['creating'],
  )
  assert.equal(fake.lists().length, 1)
  assert.equal(fake.posts().length, 0)
})

test('un crudo que no es un video se borra: la corrida siguiente pide una URL fresca y lo vuelve a bajar sin pagar', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  // Pasa el control de la descarga (la caja `ftyp`) pero no se decodifica.
  const broken = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from('ftypisom'),
    Buffer.alloc(64),
  ])
  const fake = fakeHeyGen(t, { clip: broken })
  const rawPath = avatarRawClipFile(paths, 3, avatarRequestKey(REQUEST_HASH, 0))
  const first = await renderAvatarScene(SCENE, lane(paths).options)
  assert.equal(first.outcome, 'failed')
  assert.equal(first.errorCode, 'avatar_download_failed')
  assert.deepEqual(
    first.avatar.attempts.map((attempt) => attempt.state),
    ['succeeded'],
  )
  await assert.rejects(stat(rawPath), { code: 'ENOENT' })

  fake.reset({
    clip,
    poll: () => ({
      status: 'completed',
      extra: { video_url: 'https://cdn.example/fresca.mp4' },
    }),
  })
  const second = await renderAvatarScene(
    { ...SCENE, avatar: first.avatar },
    lane(paths).options,
  )
  assert.equal(second.outcome, 'ready')
  assert.equal(fake.posts().length, 0)
  assert.deepEqual(
    fake.calls
      .filter((call) => call.host === 'cdn.example')
      .map((call) => call.path),
    ['/fresca.mp4'],
  )
})

test('una normalización que falla por algo local conserva el crudo pagado: la corrida siguiente lo vuelve a normalizar sin bajarlo', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, { clip })
  const key = avatarRequestKey(REQUEST_HASH, 0)
  const rawPath = avatarRawClipFile(paths, 3, key)
  // Una carpeta donde va el clip normalizado: el video se codifica bien y
  // falla el último paso, renombrarlo. Un fallo del disco, no del video.
  const blocker = join(paths.avatarDirectory, avatarClipFileName(3, key))
  await mkdir(blocker, { recursive: true })
  const first = await renderAvatarScene(SCENE, lane(paths).options)
  assert.equal(first.outcome, 'failed')
  assert.equal(first.errorCode, 'avatar_download_failed')
  assert.ok((await stat(rawPath)).size > 0)

  await rm(blocker, { recursive: true })
  fake.reset({ clip })
  const second = await renderAvatarScene(
    { ...SCENE, avatar: first.avatar },
    lane(paths).options,
  )
  assert.equal(second.outcome, 'ready')
  assert.deepEqual(fake.calls, [])
})

test('una consulta rechazada por la clave (401) deja el recibo `pending`: la corrida siguiente lo vuelve a consultar sin pagar', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, { poll: () => ({ httpStatus: 401 }) })
  const result = await renderAvatarScene(SCENE, lane(paths).options)
  assert.equal(result.outcome, 'failed')
  assert.equal(result.errorCode, 'avatar_invalid_key')
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => [attempt.state, attempt.videoId]),
    [['pending', 'video-3-1']],
  )
  assert.equal(fake.posts().length, 1)

  // Con la clave arreglada: se consulta el mismo video y se cosecha.
  fake.reset({ clip })
  const second = await renderAvatarScene(
    { ...SCENE, avatar: result.avatar },
    lane(paths).options,
  )
  assert.equal(second.outcome, 'ready')
  assert.equal(fake.posts().length, 0)
  assert.equal(second.avatar.attempts[0].videoId, 'video-3-1')
})

test('una repetición sin rastro que recibe 401 o 403 deja el recibo `ambiguous`: con la clave arreglada, la corrida siguiente lo busca por título y repite la MISMA clave', async (t) => {
  const fake = fakeHeyGen(t, {})
  let clip
  for (const status of [401, 403]) {
    const { paths } = await project(t)
    clip ??= await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
    fake.reset({
      listed: [],
      create: () =>
        rejection(status, 'unauthorized', 'Invalid or expired API key.'),
    })
    const first = await renderAvatarScene(
      withAttempts([{ ...creatingAttempt(), state: 'ambiguous' }]),
      lane(paths).options,
    )
    assert.equal(first.outcome, 'failed', `${status}`)
    assert.equal(first.errorCode, 'avatar_invalid_key', `${status}`)
    // La clave de la cuenta se mira antes que la Idempotency-Key: el original
    // pudo haberse creado igual, y el recibo no se cierra.
    assert.deepEqual(
      first.avatar.attempts.map((attempt) => [
        attempt.state,
        attempt.audioAssetId,
      ]),
      [['ambiguous', 'asset-audio']],
      `${status}`,
    )
    assert.deepEqual(
      fake.posts().map((call) => call.headers['Idempotency-Key']),
      [idempotencyKey(0)],
      `${status}`,
    )

    fake.reset({ clip, listed: [] })
    const second = await renderAvatarScene(
      { ...SCENE, avatar: first.avatar },
      lane(paths).options,
    )
    assert.equal(second.outcome, 'ready', `${status}`)
    assert.equal(fake.lists().length, 1, `${status}`)
    assert.deepEqual(
      fake.posts().map((call) => call.headers['Idempotency-Key']),
      [idempotencyKey(0)],
      `${status}`,
    )
  }
})

test('una repetición sin rastro que recibe 402 pausa sin cerrar el recibo: tras recargar, la corrida siguiente lo busca por título y repite la MISMA clave', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, {
    listed: [],
    create: () =>
      rejection(
        402,
        'insufficient_credit',
        'Your account has 0 credits but this video requires 10 credits.',
      ),
  })
  const { options, checkpoints } = lane(paths)
  await assert.rejects(
    renderAvatarScene(
      withAttempts([{ ...creatingAttempt(), state: 'ambiguous' }]),
      options,
    ),
    { code: 'avatar_insufficient_credits' },
  )
  const paused = checkpoints.at(-1)
  assert.equal(paused.status, 'planned')
  assert.deepEqual(
    paused.attempts.map((attempt) => [attempt.state, attempt.audioAssetId]),
    [['ambiguous', 'asset-audio']],
  )
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [idempotencyKey(0)],
  )

  fake.reset({ clip, listed: [] })
  const resumed = await renderAvatarScene(
    { ...SCENE, avatar: paused },
    lane(paths).options,
  )
  assert.equal(resumed.outcome, 'ready')
  assert.equal(fake.lists().length, 1)
  assert.equal(fake.uploads().length, 0)
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [idempotencyKey(0)],
  )
})

test('una repetición que recibe un rechazo por saldo con otro status (un 400 que dice «insufficient credit») tampoco cierra el recibo y pausa', async (t) => {
  const { paths } = await project(t)
  fakeHeyGen(t, {
    listed: [],
    create: () =>
      rejection(400, 'insufficient_credit', 'Not enough credits to render'),
  })
  const { options, checkpoints } = lane(paths)
  await assert.rejects(
    renderAvatarScene(withAttempts([creatingAttempt()]), options),
    { code: 'avatar_insufficient_credits' },
  )
  assert.deepEqual(
    checkpoints.at(-1).attempts.map((attempt) => attempt.state),
    ['ambiguous'],
  )
})

test('un 401 o un 403 en el primer envío sí cierran el recibo `failed` (no se creó nada): con la clave arreglada, la corrida siguiente pide con la clave siguiente sin buscar por título', async (t) => {
  const fake = fakeHeyGen(t, {})
  let clip
  for (const status of [401, 403]) {
    const { paths } = await project(t)
    clip ??= await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
    fake.reset({
      create: () =>
        rejection(status, 'unauthorized', 'Invalid or expired API key.'),
    })
    const first = await renderAvatarScene(SCENE, lane(paths).options)
    assert.equal(first.errorCode, 'avatar_invalid_key', `${status}`)
    assert.deepEqual(
      first.avatar.attempts.map((attempt) => [
        attempt.state,
        attempt.errorCode,
      ]),
      [['failed', 'avatar_invalid_key']],
      `${status}`,
    )

    fake.reset({ clip })
    const second = await renderAvatarScene(
      { ...SCENE, avatar: first.avatar },
      lane(paths).options,
    )
    assert.equal(second.outcome, 'ready', `${status}`)
    assert.equal(fake.lists().length, 0, `${status}`)
    assert.equal(fake.uploads().length, 0, `${status}`)
    assert.deepEqual(
      fake.posts().map((call) => call.headers['Idempotency-Key']),
      [idempotencyKey(1)],
      `${status}`,
    )
  }
})

test('una repetición sin rastro que recibe 408 o 425 deja el recibo `ambiguous`: la corrida siguiente lo busca por título y repite la MISMA clave', async (t) => {
  const fake = fakeHeyGen(t, {})
  let clip
  for (const status of [408, 425]) {
    const { paths } = await project(t)
    clip ??= await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
    fake.reset({
      listed: [],
      create: () => rejection(status, 'request_timeout', 'Try again later'),
    })
    const first = await renderAvatarScene(
      withAttempts([{ ...creatingAttempt(), state: 'ambiguous' }]),
      lane(paths).options,
    )
    assert.equal(first.outcome, 'failed', `${status}`)
    // Un «no se procesó» del transporte no dice nada del original.
    assert.deepEqual(
      first.avatar.attempts.map((attempt) => [
        attempt.state,
        attempt.audioAssetId,
      ]),
      [['ambiguous', 'asset-audio']],
      `${status}`,
    )

    fake.reset({ clip, listed: [] })
    const second = await renderAvatarScene(
      { ...SCENE, avatar: first.avatar },
      lane(paths).options,
    )
    assert.equal(second.outcome, 'ready', `${status}`)
    assert.equal(fake.lists().length, 1, `${status}`)
    assert.deepEqual(
      fake.posts().map((call) => call.headers['Idempotency-Key']),
      [idempotencyKey(0)],
      `${status}`,
    )
  }
})

test('una repetición sin rastro que recibe un 5xx que habla del saldo pausa (lanza) sin cerrar el recibo y deja la escena como estaba', async (t) => {
  const { paths } = await project(t)
  fakeHeyGen(t, {
    listed: [],
    create: () =>
      rejection(
        500,
        'internal_error',
        'Insufficient balance to process this request',
      ),
  })
  const { options, checkpoints } = lane(paths)
  await assert.rejects(
    renderAvatarScene(withAttempts([creatingAttempt()]), options),
    { code: 'avatar_insufficient_credits' },
  )
  const paused = checkpoints.at(-1)
  assert.equal(paused.status, 'planned')
  assert.equal('errorCode' in paused, false)
  assert.deepEqual(
    paused.attempts.map((attempt) => [attempt.state, attempt.audioAssetId]),
    [['ambiguous', 'asset-audio']],
  )
})

test('un 409 `request_in_progress` y después un 4xx definitivo (en el primer envío y en una repetición) dejan el recibo `ambiguous`: HeyGen confirmó el original en vuelo; la corrida siguiente repite la MISMA clave', async (t) => {
  // Las esperas del cliente entre el 409 y su repetición pasan sin dormir.
  t.mock.method(globalThis, 'setTimeout', (callback) => setImmediate(callback))
  const fake = fakeHeyGen(t, {})
  let clip
  for (const scene of [SCENE, withAttempts([creatingAttempt()])]) {
    const label = scene.avatar.attempts ? 'repetición' : 'primer envío'
    const { paths } = await project(t)
    clip ??= await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
    fake.reset({
      listed: [],
      create: (_call, n) =>
        n === 1
          ? rejection(409, 'request_in_progress', 'The original is in progress')
          : rejection(
              400,
              'invalid_parameter',
              'This avatar does not support the requested engine',
              'engine',
            ),
    })
    const first = await renderAvatarScene(scene, lane(paths).options)
    assert.equal(first.outcome, 'failed', label)
    assert.equal(first.errorCode, 'avatar_look_unsupported', label)
    assert.equal(first.failure.sawRequestInProgress, true, label)
    assert.deepEqual(
      first.avatar.attempts.map((attempt) => [
        attempt.state,
        attempt.audioAssetId === undefined,
      ]),
      [['ambiguous', false]],
      label,
    )
    // El original y su repetición tras la espera, con la misma clave.
    assert.deepEqual(
      [...new Set(fake.posts().map((call) => call.headers['Idempotency-Key']))],
      [idempotencyKey(0)],
      label,
    )

    fake.reset({ clip, listed: [] })
    const second = await renderAvatarScene(
      { ...SCENE, avatar: first.avatar },
      lane(paths).options,
    )
    assert.equal(second.outcome, 'ready', label)
    assert.deepEqual(
      fake.posts().map((call) => call.headers['Idempotency-Key']),
      [idempotencyKey(0)],
      label,
    )
  }
})

test('un 409 `request_in_progress` y después un 402 pausan sin cerrar el recibo: tras recargar, se repite la MISMA clave', async (t) => {
  t.mock.method(globalThis, 'setTimeout', (callback) => setImmediate(callback))
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, {
    create: (_call, n) =>
      n === 1
        ? rejection(409, 'request_in_progress', 'The original is in progress')
        : rejection(402, 'insufficient_credit', 'Not enough credit'),
  })
  const { options, checkpoints } = lane(paths)
  await assert.rejects(renderAvatarScene(SCENE, options), {
    code: 'avatar_insufficient_credits',
  })
  const paused = checkpoints.at(-1)
  assert.equal(paused.status, 'planned')
  assert.deepEqual(
    paused.attempts.map((attempt) => attempt.state),
    ['ambiguous'],
  )

  fake.reset({ clip, listed: [] })
  const resumed = await renderAvatarScene(
    { ...SCENE, avatar: paused },
    lane(paths).options,
  )
  assert.equal(resumed.outcome, 'ready')
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [idempotencyKey(0)],
  )
})

test('la búsqueda por título adopta un render cuyo estado HeyGen nombra distinto (`queued`): no paga de nuevo', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const title = avatarVideoTitle(
    PROJECT_ID,
    3,
    avatarRequestKey(REQUEST_HASH, 0),
  )
  const fake = fakeHeyGen(t, {
    clip,
    listed: [{ id: 'video-pagado', title, status: 'queued' }],
  })
  const result = await renderAvatarScene(
    withAttempts([creatingAttempt()]),
    lane(paths).options,
  )
  assert.equal(result.outcome, 'ready')
  assert.equal(fake.posts().length, 0)
  assert.equal(fake.uploads().length, 0)
  assert.equal(result.avatar.attempts[0].videoId, 'video-pagado')
})

test('el asset rechazado sale solo de los recibos del mismo pedido: un recibo de otro pedido con el mismo asset lo conserva', async (t) => {
  const { paths } = await project(t)
  const shared = 'asset-compartido'
  const otherRequest = {
    ...creatingAttempt(),
    hash: 'b'.repeat(64),
    state: 'ambiguous',
    audioAssetId: shared,
  }
  fakeHeyGen(t, {
    listed: [],
    create: () =>
      rejection(
        400,
        'invalid_parameter',
        'The audio asset could not be processed',
        'audio_asset_id',
      ),
  })
  const result = await renderAvatarScene(
    withAttempts([
      otherRequest,
      { ...creatingAttempt(), audioAssetId: shared },
    ]),
    lane(paths).options,
  )
  assert.equal(result.errorCode, 'avatar_invalid_request')
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => [
      attempt.hash === REQUEST_HASH,
      attempt.state,
      attempt.audioAssetId,
    ]),
    [
      [false, 'ambiguous', shared],
      [true, 'failed', undefined],
    ],
  )
})

// Centinela (registro `node-test-doble-mock-del-mismo-metodo-deja-el-global-sucio`):
// va SIEMPRE último.
test('centinela: al terminar, fetch vuelve a ser el real', () => {
  assert.equal(globalThis.fetch, ORIGINAL_FETCH)
})
