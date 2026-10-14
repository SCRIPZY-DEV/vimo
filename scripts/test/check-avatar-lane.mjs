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
// de 25 fps) o un avatar sin look, sin hablar con HeyGen. Y el título de cada
// render (entrega 2c, diseño §7.1, con las rondas 1 a 4): `<nombre del video>
// · <marca>` con el nombre sin espacios de más y cortado en 80 grafemas (ni un
// emoji compuesto ni una bandera partidos; sin nombre, la marca sola),
// guardado en el intento ANTES del POST; la recuperación, que adopta primero
// el render con el título exacto que salió (pedido por ese título, una
// página, y después por la marca, en cualquier página y con cualquier estado;
// también con un HeyGen que filtre por igualdad) y, solo sin él, uno que
// termine en la marca y no esté `failed`, el más avanzado (así ni un nombre ni
// un separador que HeyGen guardó distinto impiden recuperar, y una copia de
// HeyGen que termina igual no le gana al exacto), nunca uno con la marca en
// otro lugar; una consulta por el título que falla, que deja la escena fallida
// y el intento sin resolver, sin seguir por la marca ni pagar; un renombre en
// el medio que no cambia nada; y la repetición byte a byte: el título guardado
// o, en un recibo de antes de la 2c, la marca sola, sin escribir nada antes
// del POST. Y el motor y el movimiento (entrega 2e, diseño §21.2): sin
// movimiento ni toma, la huella, la clave y el cuerpo de antes (con huellas
// fijas calculadas antes del cambio); el prompt recortado y `expressiveness`
// solo cuando el motor y el look los admiten (IV con foto, los dos; V, el
// prompt; IV con gemelo o estudio y Avatar III, ninguno), al final del cuerpo,
// en el recibo y en la huella; la toma en la huella y no en el cuerpo; la
// repetición con el movimiento del recibo; y el rechazo del movimiento, que
// cierra el intento, marca la escena `motionUnsupported` y pide enseguida sin
// movimiento con otra clave (en la cosecha, recién con el saldo mirado). Y
// regenerar una lista (`forceNewRender`, diseño §21.4): sin el atajo de «lista
// con el mismo pedido»; sin subir la toma, el render pagado se cosecha; con la
// toma siguiente, un pedido nuevo con otra clave; hasta el clip nuevo, cada
// recibo guardado conserva el clip y el estimado de hoy; si el render nuevo
// falla (un 400, un render `failed`, el plazo) la escena vuelve a su estado
// listo sin error y el resultado sale `failed`, y si la cuenta pausa el carril
// lanza con el clip a salvo; y «más expresivo» con V sobre un prompt de la
// persona (R-2e-14), que viaja con la frase al final en el cuerpo, la huella y
// el recibo. Y la entrega 2h (diseño §24.3): la fase `render` sale recién
// cuando HeyGen aceptó el pedido (también al repetir uno sin respuesta; al
// retomar uno ya pedido, como siempre); un 429 de la cuenta llena espera el
// `Retry-After` y repite con la misma clave y el mismo cuerpo sin cerrar el
// intento, hasta 10 min (agotados, `ambiguous` como siempre) y cancelable; y
// el corte y la normalización pasan por el límite del trabajo local. Un solo
// fetch simulado por test (con
// `reset` entre corridas) y un centinela al final. Los nombres de archivo y la
// tarifa los fija `check-avatar-scene-model.mjs`.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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
  avatarNamedVideoTitle,
  avatarRenderHash,
  avatarRequestHash,
  avatarRequestKey,
  avatarRetryIndex,
  avatarVideoTitle,
  endsWithAvatarVideoMarker,
} from '../../pipeline/avatar/fingerprint.ts'
import {
  avatarRequestMotion,
  avatarSceneRequestHash,
  renderAvatarScene,
} from '../../pipeline/avatar/lane.ts'
import {
  AVATAR_DURATION_TOLERANCE_SECONDS,
  cutAvatarAudio,
  normalizeAvatarClip,
} from '../../pipeline/avatar/normalization.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'
import { toSceneAvatarView } from '../../pipeline/project/scenes-file.ts'
import { createHeyGenClient } from '../../pipeline/providers/avatar/heygen.ts'
import { PipelineFailure } from '../../pipeline/runner/failure.ts'
import {
  AVATAR_EXPRESSIVE_PROMPT_SUFFIX,
  AVATAR_VIDEO_TITLE_NAME_LIMIT,
  avatarSceneSpan,
} from '../../pipeline/types/avatar.ts'
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
    // Sin nombre, el título es la marca sola (como antes de la 2c): los tests
    // del título le ponen uno.
    videoName: '',
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
  const waits = []
  t.mock.method(globalThis, 'setTimeout', (callback, ms) => {
    waits.push(ms)
    return setImmediate(callback)
  })
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
  // El original (409), la repetición tras la espera (2 s) y, ante el 429, la
  // espera creciente mientras entra en los 10 min de paciencia (entrega 2h):
  // nueve más, todas con la misma clave.
  assert.deepEqual(
    waits,
    [2000, 3000, 5000, 9000, 17_000, 33_000, 65_000, 120_000, 120_000, 120_000],
  )
  const keys = fake.posts().map((call) => call.headers['Idempotency-Key'])
  assert.equal(keys.length, 11)
  assert.deepEqual([...new Set(keys)], [idempotencyKey(0)])
})

// ─── Entrega 2h (diseño §24.3): la fase `render` y la cuenta llena ───

// Un 429 de la cuenta llena, con su `Retry-After` (segundos).
const accountFull = (retryAfter = 30) =>
  new Response(
    JSON.stringify({
      error: {
        code: 'rate_limit_exceeded',
        message:
          'Too many requests. Retry after the duration specified in the Retry-After header.',
        param: null,
      },
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(retryAfter),
      },
    },
  )
const progressPhases = (events) =>
  events
    .filter((event) => event.type === 'progress')
    .map((event) => event.phase)

test('2h: la fase `render` sale recién cuando HeyGen aceptó el pedido; mientras sale el POST la aparición sigue en `upload`', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const { options, events } = lane(paths)
  const phasesAtPost = []
  fakeHeyGen(t, {
    clip,
    onRequest(call) {
      if (call.method === 'POST' && call.path === '/v3/videos')
        phasesAtPost.push(progressPhases(events))
    },
  })
  const result = await renderAvatarScene(SCENE, options)

  assert.equal(result.outcome, 'ready')
  assert.deepEqual(phasesAtPost, [['audio', 'upload']])
  const phases = progressPhases(events)
  assert.deepEqual(phases.slice(0, 3), ['audio', 'upload', 'render'])
})

test('2h: `render` sale apenas HeyGen acepta, antes de guardar el recibo: si guardar el `pending` falla, la aparición igual figura cobrada', async (t) => {
  const { paths } = await project(t)
  let writes = 0
  fakeHeyGen(t, { listed: [] })
  const { options, events } = lane(paths, {
    // La segunda escritura (el `pending`, después del POST aceptado) falla.
    onCheckpoint: async () => {
      writes += 1
      if (writes === 2)
        throw new PipelineFailure('scenes_missing', 'scenes.json disappeared')
    },
  })
  await assert.rejects(renderAvatarScene(SCENE, options), {
    code: 'scenes_missing',
  })
  assert.deepEqual(progressPhases(events), ['audio', 'upload', 'render'])
})

test('2h: al repetir un pedido sin respuesta (la misma clave) el pedido va en `upload` y `render` sale después del POST, una sola vez; al retomar un render ya pedido, `render` como siempre', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const phasesAtPost = []
  const repeated = lane(paths)
  const fake = fakeHeyGen(t, {
    clip,
    listed: [],
    onRequest(call) {
      if (call.method === 'POST' && call.path === '/v3/videos')
        phasesAtPost.push(progressPhases(repeated.events))
    },
  })
  const repeat = await renderAvatarScene(
    withAttempts([{ ...creatingAttempt(), state: 'ambiguous' }]),
    repeated.options,
  )
  assert.equal(repeat.outcome, 'ready')
  assert.equal(fake.posts().length, 1)
  // Sin subida en esta corrida, igual sale `upload` antes del POST (ronda 1):
  // la app no lo muestra como «Preparando la voz» mientras espera a HeyGen.
  assert.deepEqual(phasesAtPost, [['upload']])
  assert.deepEqual(progressPhases(repeated.events), [
    'upload',
    'render',
    'download',
    'normalize',
  ])

  // Un recibo `pending` (el render ya pedido en otra corrida): sin POST.
  fake.reset({ clip })
  const resumed = lane(paths)
  const pending = await renderAvatarScene(
    withAttempts([
      { ...creatingAttempt(), state: 'pending', videoId: 'video-3-1' },
    ]),
    resumed.options,
  )
  assert.equal(pending.outcome, 'ready')
  assert.deepEqual(fake.posts(), [])
  assert.deepEqual(progressPhases(resumed.events), [
    'render',
    'download',
    'normalize',
  ])
})

test('2h (ronda 1): con el audio reusado de un intento anterior del mismo pedido (sin subida en esta corrida), el pedido va en `upload` antes del POST', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const { options, events } = lane(paths)
  const phasesAtPost = []
  const fake = fakeHeyGen(t, {
    clip,
    onRequest(call) {
      if (call.method === 'POST' && call.path === '/v3/videos')
        phasesAtPost.push(progressPhases(events))
    },
  })
  // Un render anterior del MISMO pedido falló (no para siempre): el intento
  // siguiente presta su audio ya subido.
  const result = await renderAvatarScene(
    withAttempts([
      {
        ...creatingAttempt(),
        state: 'failed',
        errorCode: 'avatar_render_failed',
        videoId: 'video-3-0',
      },
    ]),
    options,
  )

  assert.equal(result.outcome, 'ready')
  assert.deepEqual(fake.uploads(), [])
  assert.equal(fake.posts()[0].body.audio_asset_id, 'asset-audio')
  assert.deepEqual(phasesAtPost, [['upload']])
  assert.deepEqual(progressPhases(events), [
    'upload',
    'render',
    'download',
    'normalize',
  ])
})

test('2h (ronda 1): ninguna fase se avisa dos veces seguidas: ni `upload` antes del POST de un pedido nuevo, ni `render` al aceptar y en cada consulta del render', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const { options, events } = lane(paths)
  const fake = fakeHeyGen(t, {
    clip,
    // Tres consultas antes de que termine.
    poll: (_videoId, n) => ({
      status: ['waiting', 'processing', 'processing', 'completed'][
        Math.min(n, 3)
      ],
    }),
  })
  const result = await renderAvatarScene(SCENE, options)

  assert.equal(result.outcome, 'ready')
  assert.equal(
    fake.calls.filter((call) => call.path === '/v3/videos/video-3-1').length,
    4,
  )
  assert.deepEqual(progressPhases(events), [
    'audio',
    'upload',
    'render',
    'download',
    'normalize',
  ])
})

test('2h: un 429 al pedir (la cuenta llena) espera el Retry-After y repite con la MISMA clave y el mismo cuerpo, sin cerrar el intento como fallido ni pasar a `render`; cuando HeyGen acepta, la escena sale lista', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const waits = []
  t.mock.method(globalThis, 'setTimeout', (callback, ms) => {
    waits.push(ms)
    return setImmediate(callback)
  })
  const { options, checkpoints, events } = lane(paths)
  const phasesAtPosts = []
  const fake = fakeHeyGen(t, {
    clip,
    create: (_call, n) => (n <= 3 ? accountFull(30) : undefined),
    onRequest(call) {
      if (call.method === 'POST' && call.path === '/v3/videos')
        phasesAtPosts.push(progressPhases(events).at(-1))
    },
  })
  const result = await renderAvatarScene(SCENE, options)

  assert.equal(result.outcome, 'ready')
  const posts = fake.posts()
  assert.equal(posts.length, 4)
  assert.deepEqual(
    [...new Set(posts.map((call) => call.headers['Idempotency-Key']))],
    [idempotencyKey(0)],
  )
  assert.equal(new Set(posts.map((call) => JSON.stringify(call.body))).size, 1)
  assert.deepEqual(waits.slice(0, 3), [31_000, 31_000, 31_000])
  // Un solo intento, que nunca pasó por `failed` ni `ambiguous`.
  assert.deepEqual(
    checkpoints.map((avatar) =>
      avatar.attempts.map((attempt) => attempt.state),
    ),
    [['creating'], ['pending'], ['succeeded'], ['succeeded']],
  )
  // Durante las esperas seguía en `upload`, avisado una sola vez.
  assert.deepEqual(phasesAtPosts, ['upload', 'upload', 'upload', 'upload'])
  assert.deepEqual(progressPhases(events), [
    'audio',
    'upload',
    'render',
    'download',
    'normalize',
  ])
})

test('2h: con la cuenta llena más allá de la paciencia (10 min), el intento queda `ambiguous` como un 429 agotado de siempre, sin `render`; la corrida siguiente repite la MISMA clave', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const waits = []
  t.mock.method(globalThis, 'setTimeout', (callback, ms) => {
    waits.push(ms)
    return setImmediate(callback)
  })
  const { options, events } = lane(paths)
  const fake = fakeHeyGen(t, { create: () => accountFull(120) })
  const result = await renderAvatarScene(SCENE, options)

  assert.equal(result.outcome, 'failed')
  assert.equal(result.errorCode, 'avatar_rate_limited')
  assert.equal(result.failure.httpStatus, 429)
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => attempt.state),
    ['ambiguous'],
  )
  // Cinco esperas de 2 min (los 10 min justos) y seis pedidos.
  assert.deepEqual(waits, [120_000, 120_000, 120_000, 120_000, 120_000])
  assert.equal(fake.posts().length, 6)
  assert.ok(!progressPhases(events).includes('render'))

  fake.reset({ clip, listed: [] })
  const next = await renderAvatarScene(
    { ...SCENE, avatar: result.avatar },
    lane(paths).options,
  )
  assert.equal(next.outcome, 'ready')
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [idempotencyKey(0)],
  )
})

test('2h: cancelar mientras se espera a la cuenta llena sale como cancelación y deja el intento `ambiguous` guardado, sin repetir el POST', async (t) => {
  const { paths } = await project(t)
  const controller = new AbortController()
  t.mock.method(globalThis, 'setTimeout', (callback) => {
    controller.abort()
    return setImmediate(callback)
  })
  const client = createHeyGenClient('key-123', controller.signal)
  const { options, checkpoints } = lane(paths, {
    client,
    signal: controller.signal,
  })
  const fake = fakeHeyGen(t, { create: () => accountFull(30) })
  await assert.rejects(renderAvatarScene(SCENE, options), {
    name: 'AbortError',
  })

  assert.equal(fake.posts().length, 1)
  assert.deepEqual(
    checkpoints.at(-1).attempts.map((attempt) => attempt.state),
    ['ambiguous'],
  )
})

test('2h: el corte del audio y la normalización del clip pasan por el límite del trabajo local de la corrida', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  fakeHeyGen(t, { clip })
  // Un límite que anota qué archivos hay en avatar/ al terminar cada tarea:
  // la primera deja el WAV del corte; la segunda, el clip normalizado.
  const produced = []
  const localWork = async (task) => {
    const result = await task()
    produced.push(
      (await readdir(paths.avatarDirectory)).filter(
        (name) =>
          name.endsWith('.wav') || /^scene_3\.[0-9a-f]+\.mp4$/.test(name),
      ),
    )
    return result
  }
  const { options } = lane(paths, { localWork })
  const result = await renderAvatarScene(SCENE, options)

  assert.equal(result.outcome, 'ready')
  assert.equal(produced.length, 2)
  assert.ok(produced[0].some((name) => name.endsWith('.wav')))
  assert.ok(!produced[0].some((name) => name.endsWith('.mp4')))
  assert.ok(produced[1].includes(result.avatar.clipFile))
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

// ─── El título del video en cada render (entrega 2c, diseño §7.1) ───

const VIDEO_NAME = 'Mi video'
// La marca del intento `retryIndex` del pedido de la escena 3.
const markerOf = (retryIndex) =>
  avatarVideoTitle(PROJECT_ID, 3, avatarRequestKey(REQUEST_HASH, retryIndex))
// El título que sale con ese nombre de video, escrito a mano: el formato es
// el contrato.
const namedTitle = (name, retryIndex = 0) => `${name} · ${markerOf(retryIndex)}`

test('título: `<nombre> · <marca>` con el nombre sin espacios de más y cortado en 80 caracteres enteros; sin nombre, la marca sola', () => {
  const marker = markerOf(0)
  assert.equal(AVATAR_VIDEO_TITLE_NAME_LIMIT, 80)
  assert.equal(
    avatarNamedVideoTitle(VIDEO_NAME, marker),
    namedTitle(VIDEO_NAME),
  )
  // Sin espacios de más: las puntas, los dobles, los saltos de línea y las
  // tabulaciones quedan en un espacio.
  assert.equal(
    avatarNamedVideoTitle('  Mi   video\n\tfinal  ', marker),
    `Mi video final · ${marker}`,
  )
  // Sin nombre (vacío, solo espacios, o un project.json sin `name`): la marca
  // sola, como antes de la 2c.
  for (const name of ['', '   ', '\n\t ', undefined])
    assert.equal(
      avatarNamedVideoTitle(name, marker),
      marker,
      JSON.stringify(name),
    )
  // Un nombre largo se corta en 80 caracteres; la marca va entera al final.
  assert.equal(
    avatarNamedVideoTitle('a'.repeat(120), marker),
    `${'a'.repeat(80)} · ${marker}`,
  )
  // El corte cuenta grafemas: nunca deja medio emoji ni UTF-16 inválido.
  const emoji = avatarNamedVideoTitle(`${'a'.repeat(79)}😀b`, marker)
  assert.equal(emoji, `${'a'.repeat(79)}😀 · ${marker}`)
  assert.ok(emoji.isWellFormed())
  // Tampoco parte un emoji unido con ZWJ, una bandera ni un tono de piel,
  // aunque el corte caiga entre sus code points.
  for (const grapheme of [
    String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467),
    String.fromCodePoint(0x1f1e6, 0x1f1f7),
    String.fromCodePoint(0x1f44d, 0x1f3fd),
  ])
    assert.equal(
      avatarNamedVideoTitle(`${'a'.repeat(79)}${grapheme}b`, marker),
      `${'a'.repeat(79)}${grapheme} · ${marker}`,
      grapheme,
    )
  // Un corte que cae en un espacio no deja dos antes del separador.
  assert.equal(
    avatarNamedVideoTitle(`${'a'.repeat(79)} bcd`, marker),
    `${'a'.repeat(79)} · ${marker}`,
  )
  // En NFC, y sin caracteres de control ni mitades sueltas de un par sustituto.
  assert.equal(
    avatarNamedVideoTitle('Jose\u0301\u0000\uD800 Pérez', marker),
    `José Pérez · ${marker}`,
  )
})

test('título: el POST lleva `<nombre del video> · <marca>`, el intento lo guarda ANTES de salir y lo conserva; la Idempotency-Key no depende del nombre', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const { options, checkpoints } = lane(paths, { videoName: VIDEO_NAME })
  const seenAtPost = []
  const fake = fakeHeyGen(t, {
    clip,
    onRequest(call) {
      if (call.method === 'POST' && call.path === '/v3/videos')
        seenAtPost.push(structuredClone(checkpoints.at(-1)))
    },
  })
  const result = await renderAvatarScene(SCENE, options)
  assert.equal(result.outcome, 'ready')
  const title = namedTitle(VIDEO_NAME)
  assert.deepEqual(
    fake
      .posts()
      .map((call) => [call.body.title, call.headers['Idempotency-Key']]),
    [[title, idempotencyKey(0)]],
  )
  // En disco ya estaba el título exacto cuando salió el POST: viajó con la
  // intención, en la misma escritura (ninguna de más antes del POST).
  assert.deepEqual(
    seenAtPost.map((avatar) =>
      avatar.attempts.map((attempt) => [attempt.state, attempt.title]),
    ),
    [[['creating', title]]],
  )
  assert.deepEqual(
    checkpoints.map((avatar) => avatar.attempts.at(-1)?.state),
    ['creating', 'pending', 'succeeded', 'succeeded'],
  )
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => [attempt.state, attempt.title]),
    [['succeeded', title]],
  )
})

test('título: el intento que sigue a uno fallido lleva la marca de SU clave (la siguiente), en el título y en la búsqueda', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, { clip })
  const result = await renderAvatarScene(
    withAttempts([
      {
        ...creatingAttempt(),
        state: 'failed',
        errorCode: 'avatar_render_failed',
      },
    ]),
    lane(paths, { videoName: VIDEO_NAME }).options,
  )
  assert.equal(result.outcome, 'ready')
  assert.deepEqual(
    fake
      .posts()
      .map((call) => [call.body.title, call.headers['Idempotency-Key']]),
    [[namedTitle(VIDEO_NAME, 1), idempotencyKey(1)]],
  )
  assert.notEqual(markerOf(1), markerOf(0))
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => [attempt.state, attempt.title]),
    [
      ['failed', undefined],
      ['succeeded', namedTitle(VIDEO_NAME, 1)],
    ],
  )
})

test('título: un render de este pedido se reconoce por la marca al final, con lo que sea delante (el nombre o el separador que HeyGen haya guardado distinto; también una copia de HeyGen, que la decide el orden de la recuperación); la marca en otro lugar, no', () => {
  const marker = markerOf(0)
  for (const title of [
    marker,
    namedTitle(VIDEO_NAME),
    // El nombre como HeyGen lo pudo haber guardado: descompuesto y con otro
    // emoji. La marca es ASCII y va al final: no cambia.
    `${'José'.normalize('NFD')} 🙂 · ${marker}`,
    // El separador cambiado o perdido.
    `${VIDEO_NAME}·${marker}`,
    `${VIDEO_NAME} - ${marker}`,
    `${VIDEO_NAME} ${marker}`,
    `${VIDEO_NAME}${marker}`,
    // Una copia hecha en HeyGen también termina así: por eso la recuperación
    // prefiere el título exacto y no elige una `failed`.
    `Copia de ${namedTitle(VIDEO_NAME)}`,
    `Copia de ${marker}`,
  ])
    assert.equal(endsWithAvatarVideoMarker(title, marker), true, title)
  for (const title of [
    `${marker} (copia)`,
    `${marker} · ${VIDEO_NAME}`,
    `${marker} `,
    `${marker}x`,
    // La marca de otra escena o de otro proyecto que termina parecido.
    namedTitle(VIDEO_NAME).replace(':scene-3:', ':scene-13:'),
    namedTitle(VIDEO_NAME).replace('vimo:mi-video:', 'vimo:otro-mi-video:'),
  ])
    assert.equal(endsWithAvatarVideoMarker(title, marker), false, title)
})

test('reanudar un recibo de la 2c sin su título exacto en HeyGen: se busca por el título que salió y por la marca, y se adopta sin pagar el render que termina en la marca (HeyGen guardó el nombre distinto); las copias con la marca en otro lugar no', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const marker = markerOf(0)
  const sent = avatarNamedVideoTitle('José 😀', marker)
  assert.equal(sent, `José 😀 · ${marker}`)
  // HeyGen filtra por substring: con la marca vuelven también las copias.
  const fake = fakeHeyGen(t, {
    clip,
    listed: [
      { id: 'video-copia', title: `${sent} (copia)`, status: 'completed' },
      {
        id: 'video-marca-al-medio',
        title: `${marker} · José 😀`,
        status: 'completed',
      },
      // El render pagado, con el nombre como HeyGen lo pudo haber guardado:
      // descompuesto y con otro emoji.
      {
        id: 'video-pagado',
        title: `${'José'.normalize('NFD')} 🙂 · ${marker}`,
        status: 'processing',
      },
    ],
  })
  const result = await renderAvatarScene(
    withAttempts([{ ...creatingAttempt(), title: sent }]),
    lane(paths, { videoName: 'José 😀' }).options,
  )
  assert.equal(result.outcome, 'ready')
  assert.equal(fake.posts().length, 0)
  assert.equal(fake.uploads().length, 0)
  // Primero una página por el título que salió; después, por la marca.
  assert.deepEqual(
    fake.lists().map((call) => new URLSearchParams(call.search).get('title')),
    [sent, marker],
  )
  // El recibo conserva el título que salió: es para repetir el mismo cuerpo.
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => [
      attempt.state,
      attempt.videoId,
      attempt.title,
    ]),
    [['succeeded', 'video-pagado', sent]],
  )
})

test('reanudar un recibo de antes de la 2c (sin título): se busca solo por la marca y se adopta sin pagar el render con la marca sola, aunque antes aparezcan otros que terminan en la marca; las copias con la marca adentro no', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const marker = markerOf(0)
  const fake = fakeHeyGen(t, {
    clip,
    listed: [
      // Un candidato por el sufijo: el exacto (la marca sola) le gana.
      {
        id: 'video-con-nombre',
        title: `${VIDEO_NAME} · ${marker}`,
        status: 'completed',
      },
      { id: 'video-copia', title: `${marker} (copia)`, status: 'completed' },
      { id: 'video-copia-2', title: `Copia de ${marker}`, status: 'completed' },
      {
        id: 'video-marca-al-medio',
        title: `${marker} · ${VIDEO_NAME}`,
        status: 'completed',
      },
      { id: 'video-pagado', title: marker, status: 'completed' },
    ],
  })
  const result = await renderAvatarScene(
    withAttempts([{ ...creatingAttempt(), state: 'ambiguous' }]),
    lane(paths, { videoName: VIDEO_NAME }).options,
  )
  assert.equal(result.outcome, 'ready')
  assert.equal(fake.posts().length, 0)
  assert.equal(fake.uploads().length, 0)
  assert.equal(result.avatar.attempts[0].videoId, 'video-pagado')
  // Sin título guardado no hay búsqueda por título: solo por la marca.
  assert.deepEqual(
    fake.lists().map((call) => new URLSearchParams(call.search).get('title')),
    [marker],
  )
  // No mandó nada: el recibo sigue sin título.
  assert.equal(result.avatar.attempts[0].title, undefined)
})

test('una copia nunca se adopta: con solo títulos que llevan la marca en otro lugar (no al final) se repite el MISMO pedido con la MISMA clave y el mismo cuerpo, en un recibo de antes de la 2c y en uno de después', async (t) => {
  const fake = fakeHeyGen(t, {})
  let clip
  const marker = markerOf(0)
  const title = namedTitle(VIDEO_NAME)
  const copies = [
    `${marker} (copia)`,
    `${marker} · ${VIDEO_NAME}`,
    `${title} (1)`,
    `${marker} `,
    `${marker}x`,
  ]
  for (const stored of [undefined, title]) {
    const { paths } = await project(t)
    clip ??= await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
    fake.reset({
      clip,
      listed: copies.map((listedTitle, index) => ({
        id: `video-ajeno-${index}`,
        title: listedTitle,
        status: 'completed',
      })),
    })
    const attempt = { ...creatingAttempt(), state: 'ambiguous' }
    const result = await renderAvatarScene(
      withAttempts([stored ? { ...attempt, title: stored } : attempt]),
      lane(paths, { videoName: VIDEO_NAME }).options,
    )
    const label = stored ?? 'sin título'
    assert.equal(result.outcome, 'ready', label)
    // El mismo cuerpo que el envío original: el título guardado o, sin él,
    // la marca sola.
    assert.deepEqual(
      fake
        .posts()
        .map((call) => [
          call.headers['Idempotency-Key'],
          call.body.title,
          call.body.audio_asset_id,
        ]),
      [[idempotencyKey(0), stored ?? marker, 'asset-audio']],
      label,
    )
    assert.equal(fake.uploads().length, 0, label)
    assert.equal(result.avatar.attempts[0].videoId, 'video-3-1', label)
  }
})

test('renombrar el video entre el POST y la recuperación no cambia nada: se adopta el render por su marca y, sin rastro, se repite el título guardado (el del nombre viejo) con la MISMA clave', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  // Primera corrida con el nombre viejo: la red se cae en el POST.
  const fake = fakeHeyGen(t, { clip, create: () => 'network' })
  const first = await renderAvatarScene(
    SCENE,
    lane(paths, { videoName: 'Nombre viejo' }).options,
  )
  assert.equal(first.outcome, 'failed')
  const sent = namedTitle('Nombre viejo')
  assert.equal(fake.posts()[0].body.title, sent)
  assert.deepEqual(
    first.avatar.attempts.map((attempt) => [attempt.state, attempt.title]),
    [['ambiguous', sent]],
  )

  // El video se llama distinto. HeyGen tiene el render con el título que
  // salió, y una copia con la marca al medio que no es nuestra.
  fake.reset({
    clip,
    listed: [
      {
        id: 'video-copia',
        title: `${markerOf(0)} · Nombre viejo`,
        status: 'completed',
      },
      { id: 'video-pagado', title: sent, status: 'completed' },
    ],
  })
  const second = await renderAvatarScene(
    { ...SCENE, avatar: first.avatar },
    lane(paths, { videoName: 'Nombre nuevo' }).options,
  )
  assert.equal(second.outcome, 'ready')
  assert.equal(fake.posts().length, 0)
  assert.deepEqual(
    second.avatar.attempts.map((attempt) => [
      attempt.state,
      attempt.videoId,
      attempt.title,
    ]),
    [['succeeded', 'video-pagado', sent]],
  )

  // Otra corrida posible, sin rastro en HeyGen: la repetición manda el título
  // guardado (el del nombre viejo) con la misma clave, el mismo cuerpo.
  const other = await project(t)
  fake.reset({ clip, listed: [] })
  const third = await renderAvatarScene(
    { ...SCENE, avatar: first.avatar },
    lane(other.paths, { videoName: 'Nombre nuevo' }).options,
  )
  assert.equal(third.outcome, 'ready')
  assert.deepEqual(
    fake
      .posts()
      .map((call) => [call.headers['Idempotency-Key'], call.body.title]),
    [[idempotencyKey(0), sent]],
  )
  assert.equal(third.avatar.attempts[0].title, sent)
})

test('un recibo de antes de la 2c sin rastro se repite byte a byte: la MISMA clave y el cuerpo de su POST original, con la marca sola, sin guardar un título ni escribir antes del POST; la corrida siguiente lo adopta sin pagar', async (t) => {
  const fake = fakeHeyGen(t, {})
  let clip
  for (const state of ['creating', 'ambiguous']) {
    const { paths } = await project(t)
    clip ??= await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
    const { options, checkpoints } = lane(paths, { videoName: VIDEO_NAME })
    const writesAtPost = []
    // La repetición también se queda sin respuesta.
    fake.reset({
      listed: [],
      create: () => 'network',
      onRequest(call) {
        if (call.method === 'POST' && call.path === '/v3/videos')
          writesAtPost.push(checkpoints.length)
      },
    })
    const repeated = await renderAvatarScene(
      withAttempts([{ ...creatingAttempt(), state }]),
      options,
    )
    assert.equal(repeated.errorCode, 'avatar_network', state)
    // El cuerpo del POST de antes de la 2c, tal cual: la marca sola.
    assert.deepEqual(
      fake.posts().map((call) => [call.headers['Idempotency-Key'], call.body]),
      [
        [
          idempotencyKey(0),
          {
            type: 'avatar',
            title: markerOf(0),
            avatar_id: 'look-1',
            audio_asset_id: 'asset-audio',
            engine: { type: 'avatar_iii' },
            aspect_ratio: '16:9',
            resolution: '1080p',
            output_format: 'mp4',
          },
        ],
      ],
      state,
    )
    // Nada se escribió antes del POST y el recibo no ganó título.
    assert.deepEqual(writesAtPost, [0], state)
    assert.deepEqual(
      repeated.avatar.attempts.map((attempt) => [attempt.state, attempt.title]),
      [['ambiguous', undefined]],
      state,
    )

    // La corrida siguiente (con otro nombre) lo encuentra por la marca y no paga.
    const next = await project(t)
    fake.reset({
      clip,
      listed: [
        { id: 'video-original', title: markerOf(0), status: 'completed' },
      ],
    })
    const resumed = await renderAvatarScene(
      { ...SCENE, avatar: repeated.avatar },
      lane(next.paths, { videoName: 'Otro nombre' }).options,
    )
    assert.equal(resumed.outcome, 'ready', state)
    assert.equal(fake.posts().length, 0, state)
    assert.equal(resumed.avatar.attempts[0].videoId, 'video-original', state)
  }
})

test('un título guardado que no es texto (un scenes.json editado) cuenta como sin título: se adopta por la marca y, sin rastro, la repetición manda la marca sola', async (t) => {
  const fake = fakeHeyGen(t, {})
  let clip
  for (const listed of [
    [{ id: 'video-pagado', title: markerOf(0), status: 'completed' }],
    [],
  ]) {
    const { paths } = await project(t)
    clip ??= await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
    fake.reset({ clip, listed })
    const result = await renderAvatarScene(
      withAttempts([{ ...creatingAttempt(), state: 'ambiguous', title: 42 }]),
      lane(paths, { videoName: VIDEO_NAME }).options,
    )
    assert.equal(result.outcome, 'ready')
    if (listed.length > 0) {
      assert.equal(fake.posts().length, 0)
      assert.equal(result.avatar.attempts[0].videoId, 'video-pagado')
      continue
    }

    assert.deepEqual(
      fake
        .posts()
        .map((call) => [call.headers['Idempotency-Key'], call.body.title]),
      [[idempotencyKey(0), markerOf(0)]],
    )
  }
})

// ─── Ronda 2 de la 2c: el título exacto primero (R-H3) ───

// La consulta de un render `failed`, como la devuelve HeyGen.
const failedRender = {
  status: 'failed',
  extra: { failure_code: 'render_error', failure_message: 'Render failed' },
}

test('una copia hecha en HeyGen («Copia de <título>») que aparece antes nunca le gana al render con el título exacto: ni `failed` (se pagaría otro render) ni de estado desconocido (avatar_timeout para siempre)', async (t) => {
  const fake = fakeHeyGen(t, {})
  let clip
  const title = namedTitle(VIDEO_NAME)
  for (const copyStatus of ['failed', 'draft']) {
    const { paths } = await project(t)
    clip ??= await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
    fake.reset({
      clip,
      listed: [
        { id: 'video-copia', title: `Copia de ${title}`, status: copyStatus },
        { id: 'video-pagado', title, status: 'completed' },
      ],
      // Si se adoptara la copia, su consulta diría lo mismo que el listado.
      poll: (videoId) => {
        if (videoId !== 'video-copia') return { status: 'completed' }
        if (copyStatus === 'failed') return failedRender

        return { status: copyStatus }
      },
    })
    const result = await renderAvatarScene(
      withAttempts([{ ...creatingAttempt(), state: 'ambiguous', title }]),
      lane(paths, { videoName: VIDEO_NAME }).options,
    )
    assert.equal(result.outcome, 'ready', copyStatus)
    assert.equal(fake.posts().length, 0, copyStatus)
    assert.equal(result.avatar.attempts[0].videoId, 'video-pagado', copyStatus)
    assert.equal(
      fake.calls.some((call) => call.path === '/v3/videos/video-copia'),
      false,
      copyStatus,
    )
  }
})

test('el render con el título exacto gana aunque llegue en la tercera página y un candidato por el sufijo haya aparecido en la primera', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const marker = markerOf(0)
  const title = namedTitle(VIDEO_NAME)
  const fake = fakeHeyGen(t, {
    clip,
    pageSize: 2,
    listed: [
      {
        id: 'video-sufijo',
        title: `Otro nombre · ${marker}`,
        status: 'completed',
      },
      { id: 'video-copia-1', title: `${title} (1)`, status: 'completed' },
      { id: 'video-copia-2', title: `${title} (2)`, status: 'completed' },
      { id: 'video-copia-3', title: `${title} (3)`, status: 'completed' },
      { id: 'video-pagado', title, status: 'processing' },
    ],
  })
  const result = await renderAvatarScene(
    withAttempts([{ ...creatingAttempt(), title }]),
    lane(paths, { videoName: VIDEO_NAME }).options,
  )
  assert.equal(result.outcome, 'ready')
  assert.equal(fake.posts().length, 0)
  // Una página por el título que salió y, sin el exacto ahí, tres por la marca.
  assert.deepEqual(
    fake.lists().map((call) => {
      const query = new URLSearchParams(call.search)
      return [query.get('title'), query.get('token')]
    }),
    [
      [title, null],
      [marker, null],
      [marker, '2'],
      [marker, '4'],
    ],
  )
  assert.equal(result.avatar.attempts[0].videoId, 'video-pagado')
})

test('sin el título exacto en las páginas revisadas, gana el candidato por el sufijo más avanzado (completado, después en curso, después de estado desconocido; entre iguales, el primero) y nunca uno `failed`; con solo `failed`, se repite el MISMO pedido', async (t) => {
  const fake = fakeHeyGen(t, {})
  let clip
  const marker = markerOf(0)
  const title = namedTitle(VIDEO_NAME)
  // Un render que solo termina en la marca, con el estado que trae el listado.
  const candidate = (id, status) => ({ id, title: `${id} · ${marker}`, status })
  for (const [stored, listed, adopted] of [
    [
      title,
      [
        candidate('desconocido', 'draft'),
        candidate('fallido', 'failed'),
        candidate('procesando', 'processing'),
        candidate('completado', 'completed'),
      ],
      'completado',
    ],
    [
      title,
      [
        candidate('desconocido', 'queued'),
        candidate('fallido', 'failed'),
        candidate('esperando', 'waiting'),
        candidate('procesando', 'processing'),
      ],
      'esperando',
    ],
    [
      title,
      [candidate('fallido', 'failed'), candidate('desconocido', 'draft')],
      'desconocido',
    ],
    // La regla vale también para un recibo de antes de la 2c sin su exacto.
    [undefined, [candidate('completado', 'completed')], 'completado'],
    [title, [candidate('fallido', 'failed')], undefined],
  ]) {
    const { paths } = await project(t)
    clip ??= await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
    fake.reset({ clip, listed })
    const attempt = { ...creatingAttempt(), state: 'ambiguous' }
    const result = await renderAvatarScene(
      withAttempts([stored ? { ...attempt, title: stored } : attempt]),
      lane(paths, { videoName: VIDEO_NAME }).options,
    )
    const label = listed.map((video) => video.id).join(', ')
    assert.equal(result.outcome, 'ready', label)
    if (adopted) {
      assert.equal(fake.posts().length, 0, label)
      assert.equal(result.avatar.attempts[0].videoId, adopted, label)
      continue
    }

    // Sin candidato que sirva: el mismo pedido, con la misma clave y el
    // mismo cuerpo.
    assert.deepEqual(
      fake
        .posts()
        .map((call) => [call.headers['Idempotency-Key'], call.body.title]),
      [[idempotencyKey(0), title]],
      label,
    )
    assert.equal(result.avatar.attempts[0].videoId, 'video-3-1', label)
  }
})

test('el render con el título exacto se adopta aunque esté `failed` (es el nuestro y no se cobró): le gana a una copia completada y el intento se cierra `failed` sin otro POST, en un recibo de la 2c y en uno de antes', async (t) => {
  const fake = fakeHeyGen(t, {})
  const marker = markerOf(0)
  const title = namedTitle(VIDEO_NAME)
  for (const stored of [title, undefined]) {
    const { paths } = await project(t)
    const exactTitle = stored ?? marker
    fake.reset({
      listed: [
        {
          id: 'video-copia',
          title: `Copia de ${exactTitle}`,
          status: 'completed',
        },
        { id: 'video-propio', title: exactTitle, status: 'failed' },
      ],
      poll: () => failedRender,
    })
    const attempt = { ...creatingAttempt(), state: 'ambiguous' }
    const result = await renderAvatarScene(
      withAttempts([stored ? { ...attempt, title: stored } : attempt]),
      lane(paths, { videoName: VIDEO_NAME }).options,
    )
    const label = stored ?? 'sin título'
    assert.equal(result.outcome, 'failed', label)
    assert.equal(result.errorCode, 'avatar_render_failed', label)
    assert.equal(fake.posts().length, 0, label)
    assert.deepEqual(
      result.avatar.attempts.map((attempt) => [attempt.state, attempt.videoId]),
      [['failed', 'video-propio']],
      label,
    )
  }
})

// ─── Ronda 3 de la 2c: búsqueda por el título exacto y cualquier separador (R-H4) ───

test('con un HeyGen que filtra el listado por título EXACTO, el render de un recibo de la 2c se recupera pidiéndolo por su título guardado (una página), sin pagar; uno de antes de la 2c, por la marca', async (t) => {
  const fake = fakeHeyGen(t, {})
  let clip
  const marker = markerOf(0)
  const title = namedTitle(VIDEO_NAME)
  for (const [stored, listedTitle, queries] of [
    [title, title, [title]],
    [undefined, marker, [marker]],
  ]) {
    const { paths } = await project(t)
    clip ??= await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
    fake.reset({
      clip,
      listed: [
        {
          id: 'video-copia',
          title: `Copia de ${listedTitle}`,
          status: 'completed',
        },
        { id: 'video-pagado', title: listedTitle, status: 'completed' },
      ],
    })
    // El cliente de siempre, con el listado filtrado por igualdad, como lo
    // devolvería un HeyGen de filtro exacto.
    const real = createHeyGenClient('key-123', new AbortController().signal)
    const client = {
      ...real,
      async listVideos(params) {
        const page = await real.listVideos(params)
        return {
          ...page,
          videos: page.videos.filter((video) => video.title === params.title),
        }
      },
    }
    const attempt = { ...creatingAttempt(), state: 'ambiguous' }
    const result = await renderAvatarScene(
      withAttempts([stored ? { ...attempt, title: stored } : attempt]),
      lane(paths, { videoName: VIDEO_NAME, client }).options,
    )
    const label = stored ?? 'sin título'
    assert.equal(result.outcome, 'ready', label)
    assert.equal(fake.posts().length, 0, label)
    assert.equal(result.avatar.attempts[0].videoId, 'video-pagado', label)
    assert.deepEqual(
      fake.lists().map((call) => new URLSearchParams(call.search).get('title')),
      queries,
      label,
    )
  }
})

test('un render cuyo título volvió de HeyGen con otro separador (o sin él) delante de la marca se adopta por el respaldo, sin pagar', async (t) => {
  const fake = fakeHeyGen(t, {})
  let clip
  const marker = markerOf(0)
  const title = namedTitle(VIDEO_NAME)
  for (const returned of [
    `${VIDEO_NAME} - ${marker}`,
    `${VIDEO_NAME} ${marker}`,
    `${VIDEO_NAME}${marker}`,
  ]) {
    const { paths } = await project(t)
    clip ??= await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
    fake.reset({
      clip,
      listed: [
        { id: 'video-copia', title: `${marker} (copia)`, status: 'completed' },
        { id: 'video-pagado', title: returned, status: 'completed' },
      ],
    })
    const result = await renderAvatarScene(
      withAttempts([{ ...creatingAttempt(), state: 'ambiguous', title }]),
      lane(paths, { videoName: VIDEO_NAME }).options,
    )
    assert.equal(result.outcome, 'ready', returned)
    assert.equal(fake.posts().length, 0, returned)
    assert.equal(result.avatar.attempts[0].videoId, 'video-pagado', returned)
  }
})

// ─── Ronda 4 de la 2c: una consulta por el título que falla no paga ───

test('si falla la consulta por el título guardado de un recibo de la 2c, el carril no sigue por la marca ni repite el POST: la escena falla y el intento queda sin resolver con su título; si la persona cancela en esa consulta, sale como cancelación sin escribir nada', async (t) => {
  const fake = fakeHeyGen(t, {})
  let clip
  const title = namedTitle(VIDEO_NAME)
  for (const [state, failure] of [
    [
      'creating',
      new PipelineFailure(
        'avatar_invalid_request',
        'HeyGen rejected the title filter',
        { provider: 'heygen', httpStatus: 400 },
      ),
    ],
    [
      'ambiguous',
      new PipelineFailure('avatar_network', 'HeyGen is down', {
        provider: 'heygen',
        httpStatus: 503,
      }),
    ],
    ['ambiguous', 'cancelación'],
  ]) {
    const { paths } = await project(t)
    clip ??= await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
    // Por la marca, HeyGen sí tiene el render pagado: si el carril siguiera
    // por ahí, lo adoptaría.
    fake.reset({
      clip,
      listed: [{ id: 'video-pagado', title, status: 'completed' }],
    })
    // El cliente de siempre, pero la consulta por el título guardado falla.
    const controller = new AbortController()
    const real = createHeyGenClient('key-123', new AbortController().signal)
    const queries = []
    const client = {
      ...real,
      async listVideos(params) {
        queries.push(params.title)
        if (params.title !== title) return real.listVideos(params)
        if (failure !== 'cancelación') throw failure

        controller.abort()
        throw controller.signal.reason
      },
    }
    const { options, checkpoints } = lane(paths, {
      videoName: VIDEO_NAME,
      client,
      signal: controller.signal,
    })
    const scene = withAttempts([{ ...creatingAttempt(), state, title }])
    const label = failure === 'cancelación' ? failure : failure.code
    if (failure === 'cancelación') {
      await assert.rejects(
        renderAvatarScene(scene, options),
        { name: 'AbortError' },
        label,
      )
      // Nada se escribió: en disco el recibo sigue como estaba.
      assert.deepEqual(checkpoints, [], label)
    } else {
      const result = await renderAvatarScene(scene, options)
      assert.equal(result.outcome, 'failed', label)
      assert.equal(result.errorCode, failure.code, label)
      assert.deepEqual(
        result.avatar.attempts.map((attempt) => [
          attempt.state,
          attempt.title,
          attempt.videoId,
        ]),
        [[state, title, undefined]],
        label,
      )
    }
    // Ni consulta por la marca, ni POST, ni subida.
    assert.deepEqual(queries, [title], label)
    assert.equal(fake.lists().length, 0, label)
    assert.equal(fake.posts().length, 0, label)
    assert.equal(fake.uploads().length, 0, label)
  }
})

// ─── El motor y el movimiento en el pedido (entrega 2e, diseño §21.2) ───

// Calculadas con el código de antes de la 2e (commit e3c7634d): un pedido sin
// movimiento ni toma tiene que dar exactamente estas huellas, así los recibos
// guardados se siguen cosechando sin pagar.
const PRE_2E_IDENTITY_HASH =
  '47b82575681aae7d9c714f359efd9551ba21681abb227e64a9201491a7d61a0f'
const PRE_2E_REQUEST_HASH =
  '0c73b05ddd9374ad04316d3c894e9476eabb4528c402daa103192142f2fafddb'
const PRE_2E_KEY = 'vimo-avatar-video-d059e7a72c693e4fd7c6ae3364b3c2ca'
const MOTION_PROMPT =
  'Warm, confident smile at the camera with a small welcoming nod.'
// La escena 3 con Avatar IV y un look de foto, el prompt (con espacios de más:
// el carril lo recorta) y «más expresivo».
const IV_SCENE = {
  ...SCENE,
  avatar: {
    ...SCENE.avatar,
    engine: 'avatar_iv',
    motionPrompt: `  ${MOTION_PROMPT} `,
    motionSource: 'auto',
    expressive: true,
  },
}
// Lo que la huella toma de la corrida (avatarSceneRequestHash).
const RUN = {
  format: '16:9',
  narrationSha256: NARRATION_SHA,
  narrationVersion: 0,
}
// La huella del pedido de la escena 3 con otro motor, movimiento o toma.
const requestHashWith = (extra) =>
  avatarRequestHash({
    lookId: 'look-1',
    engine: 'avatar_iii',
    aspectRatio: '16:9',
    resolution: '1080p',
    audioCutHash: CUT_HASH,
    narrationVersion: 0,
    ...extra,
  })
const MOTION_HASH = requestHashWith({
  engine: 'avatar_iv',
  motionPrompt: MOTION_PROMPT,
  expressiveness: 'high',
})
const PLAIN_IV_HASH = requestHashWith({ engine: 'avatar_iv' })
const keyFor = (hash, retryIndex = 0) =>
  avatarIdempotencyKey(PROJECT_ID, 3, avatarRequestKey(hash, retryIndex))
// Las claves del cuerpo de antes de la 2e, en su orden.
const BASE_BODY_KEYS = [
  'type',
  'title',
  'avatar_id',
  'audio_asset_id',
  'engine',
  'aspect_ratio',
  'resolution',
  'output_format',
]
const motionRejection = (param) =>
  rejection(
    400,
    'invalid_parameter',
    `${param} is not supported for this avatar`,
    param,
  )
const sha256 = (text) => createHash('sha256').update(text).digest('hex')

test('huellas (entrega 2e): sin movimiento ni toma la huella del pedido es la de antes; el prompt, «más expresivo» y la toma van al final, cada uno solo cuando va', () => {
  const identity = {
    lookId: 'look-1',
    engine: 'avatar_iii',
    aspectRatio: '16:9',
    resolution: '1080p',
    audioCutHash: 'a'.repeat(64),
    narrationVersion: 0,
  }
  const base = avatarRequestHash(identity)
  assert.equal(base, PRE_2E_IDENTITY_HASH)
  assert.equal(REQUEST_HASH, PRE_2E_REQUEST_HASH)
  assert.equal(idempotencyKey(0), PRE_2E_KEY)
  // Lo que no va no cambia nada: ausente, vacío, la toma 0 o una toma que no
  // es un entero positivo (un scenes.json editado: a lo sumo cosecha).
  for (const extra of [
    { motionPrompt: undefined, expressiveness: undefined, take: undefined },
    { motionPrompt: '' },
    { take: 0 },
    { take: -1 },
    { take: 1.5 },
    { take: Number.NaN },
    { take: '2' },
  ])
    assert.equal(
      avatarRequestHash({ ...identity, ...extra }),
      base,
      JSON.stringify(extra),
    )
  // Cada uno cambia la huella, y cada combinación es otra.
  const variants = [
    { motionPrompt: 'Smile at the camera.' },
    { motionPrompt: 'Smile at the camera, nodding.' },
    { expressiveness: 'high' },
    { take: 1 },
    { take: 2 },
    { motionPrompt: 'Smile at the camera.', expressiveness: 'high' },
    { motionPrompt: 'Smile at the camera.', take: 1 },
    { motionPrompt: 'Smile at the camera.', expressiveness: 'high', take: 1 },
  ]
  const hashes = new Set([
    base,
    ...variants.map((extra) => avatarRequestHash({ ...identity, ...extra })),
  ])
  assert.equal(hashes.size, variants.length + 1)
  // El arreglo de antes y, al final y en este orden, los tres extras.
  assert.equal(
    avatarRequestHash({
      ...identity,
      take: 3,
      expressiveness: 'high',
      motionPrompt: 'Smile at the camera.',
    }),
    sha256(
      JSON.stringify([
        'look-1',
        'avatar_iii',
        '16:9',
        '1080p',
        'a'.repeat(64),
        0,
        ['motion', 'Smile at the camera.'],
        ['expressiveness', 'high'],
        ['take', 3],
      ]),
    ),
  )
})

test('movimiento del pedido (entrega 2e): el prompt recortado solo si el motor y el look lo admiten y `expressiveness: high` solo con IV y foto; nada con Avatar III ni si HeyGen ya lo rechazó', () => {
  const avatar = (engine, lookType, extra = {}) => ({
    ...SCENE.avatar,
    engine,
    lookType,
    motionPrompt: '  Smile at the camera.  ',
    expressive: true,
    ...extra,
  })
  const prompt = { motionPrompt: 'Smile at the camera.' }
  for (const [engine, lookType, expected] of [
    ['avatar_iii', 'photo_avatar', {}],
    ['avatar_iii', 'studio_avatar', {}],
    ['avatar_iii', 'digital_twin', {}],
    ['avatar_iv', 'photo_avatar', { ...prompt, expressiveness: 'high' }],
    ['avatar_iv', 'studio_avatar', {}],
    ['avatar_iv', 'digital_twin', {}],
    // Con V, «más expresivo» va en el prompt: el proveedor rechaza
    // `expressiveness`.
    ['avatar_v', 'photo_avatar', prompt],
    ['avatar_v', 'studio_avatar', prompt],
    ['avatar_v', 'digital_twin', prompt],
  ])
    assert.deepEqual(
      avatarRequestMotion(avatar(engine, lookType)),
      expected,
      `${engine}/${lookType}`,
    )
  // Apagado no manda `expressiveness`; solo prendido, sin prompt, sí.
  assert.deepEqual(
    avatarRequestMotion(
      avatar('avatar_iv', 'photo_avatar', { expressive: false }),
    ),
    prompt,
  )
  assert.deepEqual(
    avatarRequestMotion(
      avatar('avatar_iv', 'photo_avatar', { motionPrompt: undefined }),
    ),
    { expressiveness: 'high' },
  )
  // Un prompt de solo espacios no viaja.
  assert.deepEqual(
    avatarRequestMotion(
      avatar('avatar_v', 'photo_avatar', { motionPrompt: ' \n ' }),
    ),
    {},
  )
  // HeyGen ya rechazó el movimiento con este look: nada.
  assert.deepEqual(
    avatarRequestMotion(
      avatar('avatar_iv', 'photo_avatar', { motionUnsupported: true }),
    ),
    {},
  )
  // Un scenes.json editado: un prompt que no es texto o un `expressive` que no
  // es true no viajan.
  assert.deepEqual(
    avatarRequestMotion(
      avatar('avatar_iv', 'photo_avatar', {
        motionPrompt: 5,
        expressive: 'yes',
      }),
    ),
    {},
  )
})

test('carril (entrega 2e): IV con un look de foto manda el prompt recortado y `expressiveness: high` al final del cuerpo, los guarda en el recibo y los mete en la huella; el clip no depende de ellos', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, { clip })
  const result = await renderAvatarScene(IV_SCENE, lane(paths).options)

  assert.equal(result.outcome, 'ready')
  assert.equal(avatarSceneRequestHash(IV_SCENE, RUN), MOTION_HASH)
  const [attempt] = result.avatar.attempts
  assert.equal(attempt.hash, MOTION_HASH)
  assert.equal(attempt.engine, 'avatar_iv')
  assert.equal(attempt.motionPrompt, MOTION_PROMPT)
  assert.equal(attempt.expressiveness, 'high')
  const [post] = fake.posts()
  assert.equal(post.headers['Idempotency-Key'], keyFor(MOTION_HASH))
  assert.deepEqual(Object.keys(post.body), [
    ...BASE_BODY_KEYS,
    'motion_prompt',
    'expressiveness',
  ])
  assert.deepEqual(post.body.engine, { type: 'avatar_iv' })
  assert.equal(post.body.motion_prompt, MOTION_PROMPT)
  assert.equal(post.body.expressiveness, 'high')
  // La huella del clip es la de siempre (look, motor, tramo y narración):
  // editar el movimiento después no lo deja desactualizado.
  assert.equal(
    result.avatar.renderHash,
    avatarRenderHash({
      lookId: 'look-1',
      engine: 'avatar_iv',
      startFrame: 26,
      endFrame: 201,
      narrationVersion: 0,
    }),
  )
  // La escena conserva lo que escribió quien escribió el prompt.
  assert.equal(result.avatar.motionPrompt, IV_SCENE.avatar.motionPrompt)
  assert.equal(result.avatar.motionSource, 'auto')
  assert.deepEqual(fake.unexpected, [])
})

test('carril (entrega 2e): V manda el prompt sin `expressiveness`; IV con un gemelo digital o un look de estudio, y Avatar III, no mandan ninguno aunque la escena los tenga: el cuerpo y la huella de siempre', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, { clip })

  const withV = await renderAvatarScene(
    { ...IV_SCENE, avatar: { ...IV_SCENE.avatar, engine: 'avatar_v' } },
    lane(paths).options,
  )
  assert.equal(withV.outcome, 'ready')
  const vHash = requestHashWith({
    engine: 'avatar_v',
    motionPrompt: MOTION_PROMPT,
  })
  assert.equal(withV.avatar.attempts[0].hash, vHash)
  assert.equal('expressiveness' in withV.avatar.attempts[0], false)
  const [vPost] = fake.posts()
  assert.deepEqual(Object.keys(vPost.body), [
    ...BASE_BODY_KEYS,
    'motion_prompt',
  ])
  assert.deepEqual(vPost.body.engine, { type: 'avatar_v' })
  assert.equal(vPost.body.motion_prompt, MOTION_PROMPT)

  for (const [engine, lookType, hash] of [
    ['avatar_iv', 'digital_twin', requestHashWith({ engine: 'avatar_iv' })],
    ['avatar_iv', 'studio_avatar', requestHashWith({ engine: 'avatar_iv' })],
    ['avatar_iii', 'photo_avatar', PRE_2E_REQUEST_HASH],
  ]) {
    const label = `${engine}/${lookType}`
    fake.reset({ clip })
    const scene = {
      ...IV_SCENE,
      avatar: { ...IV_SCENE.avatar, engine, lookType },
    }
    const result = await renderAvatarScene(scene, lane(paths).options)
    assert.equal(result.outcome, 'ready', label)
    const [attempt] = result.avatar.attempts
    assert.equal(attempt.hash, hash, label)
    assert.equal(avatarSceneRequestHash(scene, RUN), hash, label)
    for (const key of ['motionPrompt', 'expressiveness'])
      assert.equal(key in attempt, false, `${label} ${key}`)
    const [post] = fake.posts()
    assert.equal(post.headers['Idempotency-Key'], keyFor(hash), label)
    assert.deepEqual(Object.keys(post.body), BASE_BODY_KEYS, label)
    assert.deepEqual(post.body.engine, { type: engine }, label)
  }
})

test('carril (entrega 2e): la repetición de un recibo con movimiento manda el mismo cuerpo con la misma clave; y es el movimiento del recibo, no el de la escena', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  // El POST se queda sin respuesta: el recibo queda sin resolver.
  const fake = fakeHeyGen(t, { create: () => 'network' })
  const first = await renderAvatarScene(IV_SCENE, lane(paths).options)
  assert.equal(first.errorCode, 'avatar_network')
  assert.deepEqual(
    first.avatar.attempts.map((attempt) => attempt.state),
    ['ambiguous'],
  )
  const [original] = fake.posts()

  // HeyGen no lo muestra por su título: se repite byte a byte.
  fake.reset({ clip, listed: [] })
  const second = await renderAvatarScene(
    { ...IV_SCENE, avatar: first.avatar },
    lane(paths).options,
  )
  assert.equal(second.outcome, 'ready')
  const [repeat] = fake.posts()
  assert.equal(
    repeat.headers['Idempotency-Key'],
    original.headers['Idempotency-Key'],
  )
  assert.deepEqual(repeat.body, original.body)
  assert.equal(fake.uploads().length, 0)

  // Un recibo cuyo movimiento guardado no es el de la escena de hoy (con la
  // misma huella): la repetición manda el del recibo, que es lo que salió.
  fake.reset({ clip, listed: [] })
  const stored = {
    hash: MOTION_HASH,
    state: 'creating',
    engine: 'avatar_iv',
    lookId: 'look-1',
    audioAssetId: 'asset-audio',
    createdAt: '2026-10-12T05:00:00.000Z',
    motionPrompt: 'Calm, sincere expression with open hands.',
  }
  const fromReceipt = await renderAvatarScene(
    { ...IV_SCENE, avatar: { ...IV_SCENE.avatar, attempts: [stored] } },
    lane(paths).options,
  )
  assert.equal(fromReceipt.outcome, 'ready')
  const [resent] = fake.posts()
  assert.equal(resent.headers['Idempotency-Key'], keyFor(MOTION_HASH))
  assert.equal(resent.body.motion_prompt, stored.motionPrompt)
  assert.equal('expressiveness' in resent.body, false)
})

test('carril (entrega 2e): un 400 por el movimiento (`motion_prompt` o `expressiveness`) cierra el intento `failed`, marca la escena `motionUnsupported`, lo guarda y pide enseguida sin movimiento con otra clave; la escena queda lista', async (t) => {
  const fake = fakeHeyGen(t, {})
  for (const param of ['motion_prompt', 'expressiveness']) {
    const { paths } = await project(t)
    const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
    const { options, checkpoints, events } = lane(paths)
    const atPost = []
    fake.reset({
      clip,
      create: (_call, n) => (n === 1 ? motionRejection(param) : undefined),
      onRequest(call) {
        if (call.method === 'POST' && call.path === '/v3/videos')
          atPost.push(structuredClone(checkpoints.at(-1)))
      },
    })
    const result = await renderAvatarScene(IV_SCENE, options)

    assert.equal(result.outcome, 'ready', param)
    assert.equal(result.avatar.status, 'ready', param)
    assert.equal(result.avatar.motionUnsupported, true, param)
    assert.equal('errorCode' in result.avatar, false, param)
    // El prompt de la escena queda: lo que cambia es que no viaja.
    assert.equal(result.avatar.motionPrompt, IV_SCENE.avatar.motionPrompt)
    assert.deepEqual(
      result.avatar.attempts.map((attempt) => [
        attempt.hash,
        attempt.state,
        attempt.errorCode,
        attempt.motionPrompt,
        attempt.expressiveness,
      ]),
      [
        [
          MOTION_HASH,
          'failed',
          'avatar_motion_unsupported',
          MOTION_PROMPT,
          'high',
        ],
        [PLAIN_IV_HASH, 'succeeded', undefined, undefined, undefined],
      ],
      param,
    )
    const posts = fake.posts()
    assert.equal(posts.length, 2, param)
    assert.equal(posts[0].body.motion_prompt, MOTION_PROMPT, param)
    assert.equal(posts[0].headers['Idempotency-Key'], keyFor(MOTION_HASH))
    // Otra huella, otra clave, el cuerpo sin movimiento.
    assert.equal(posts[1].headers['Idempotency-Key'], keyFor(PLAIN_IV_HASH))
    assert.notEqual(
      posts[1].headers['Idempotency-Key'],
      posts[0].headers['Idempotency-Key'],
    )
    assert.deepEqual(Object.keys(posts[1].body), BASE_BODY_KEYS, param)
    // Antes del segundo POST ya estaban en disco el intento cerrado y la
    // escena sin movimiento, y la intención del pedido nuevo.
    assert.deepEqual(
      checkpoints.map((avatar) => [
        avatar.motionUnsupported === true,
        avatar.attempts.map((attempt) => attempt.state).join(','),
      ]),
      [
        [false, 'creating'],
        [true, 'failed'],
        [true, 'failed,creating'],
        [true, 'failed,pending'],
        [true, 'failed,succeeded'],
        [true, 'failed,succeeded'],
      ],
      param,
    )
    assert.equal(atPost[1].motionUnsupported, true, param)
    assert.equal(atPost[1].attempts[1].hash, PLAIN_IV_HASH, param)
    // El rechazo absorbido va al log de diagnóstico, una vez.
    assert.deepEqual(
      events.filter((event) => event.type === 'recovered'),
      [{ type: 'recovered', sceneId: 3, code: 'avatar_motion_unsupported' }],
      param,
    )
    assert.deepEqual(fake.unexpected, [], param)
  }
})

test('carril (entrega 2e): si el pedido sin movimiento también falla, sigue el camino de siempre (un 400 por el look cierra ese intento y la escena falla), sin un tercer POST', async (t) => {
  const { paths } = await project(t)
  const fake = fakeHeyGen(t, {
    create: (_call, n) =>
      n === 1
        ? motionRejection('motion_prompt')
        : rejection(400, 'invalid_parameter', 'Engine not allowed', 'engine'),
  })
  const result = await renderAvatarScene(IV_SCENE, lane(paths).options)
  assert.equal(result.outcome, 'failed')
  assert.equal(result.errorCode, 'avatar_look_unsupported')
  assert.equal(result.avatar.status, 'failed')
  assert.equal(result.avatar.motionUnsupported, true)
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => [attempt.hash, attempt.errorCode]),
    [
      [MOTION_HASH, 'avatar_motion_unsupported'],
      [PLAIN_IV_HASH, 'avatar_look_unsupported'],
    ],
  )
  assert.equal(fake.posts().length, 2)
})

test('carril (entrega 2e): una escena ya `motionUnsupported` pide sin movimiento aunque tenga prompt; el mismo rechazo a un pedido que no llevaba movimiento falla como cualquiera, sin repetirse', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, { clip })
  const unsupported = {
    ...IV_SCENE,
    avatar: { ...IV_SCENE.avatar, motionUnsupported: true },
  }
  assert.equal(avatarSceneRequestHash(unsupported, RUN), PLAIN_IV_HASH)
  const ready = await renderAvatarScene(unsupported, lane(paths).options)
  assert.equal(ready.outcome, 'ready')
  assert.deepEqual(Object.keys(fake.posts()[0].body), BASE_BODY_KEYS)
  assert.equal(ready.avatar.attempts[0].hash, PLAIN_IV_HASH)

  // Un gemelo digital con IV no lleva movimiento: si HeyGen igual dice que
  // no lo admite, la escena falla con ese código y no hay un segundo POST.
  fake.reset({ create: () => motionRejection('motion_prompt') })
  const twin = {
    ...IV_SCENE,
    avatar: { ...IV_SCENE.avatar, lookType: 'digital_twin' },
  }
  const result = await renderAvatarScene(twin, lane(paths).options)
  assert.equal(result.outcome, 'failed')
  assert.equal(result.errorCode, 'avatar_motion_unsupported')
  assert.equal('motionUnsupported' in result.avatar, false)
  assert.equal(fake.posts().length, 1)
})

test('carril (entrega 2e): en la cosecha (sin permiso para pagar), la repetición de un recibo con movimiento que HeyGen rechaza por el movimiento marca la escena, pero el pedido sin movimiento espera al saldo (`needs-request`); con el saldo mirado sale sin movimiento', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const scene = {
    ...IV_SCENE,
    avatar: {
      ...IV_SCENE.avatar,
      attempts: [
        {
          hash: MOTION_HASH,
          state: 'ambiguous',
          engine: 'avatar_iv',
          lookId: 'look-1',
          audioAssetId: 'asset-audio',
          createdAt: '2026-10-12T05:00:00.000Z',
          motionPrompt: MOTION_PROMPT,
          expressiveness: 'high',
        },
      ],
    },
  }
  const fake = fakeHeyGen(t, {
    listed: [],
    create: () => motionRejection('motion_prompt'),
  })
  const harvested = await renderAvatarScene(
    scene,
    lane(paths, { allowNewRequest: false }).options,
  )
  assert.equal(harvested.outcome, 'needs-request')
  assert.equal(harvested.avatar.motionUnsupported, true)
  assert.deepEqual(
    harvested.avatar.attempts.map((attempt) => [
      attempt.state,
      attempt.errorCode,
    ]),
    [['failed', 'avatar_motion_unsupported']],
  )
  // Solo la repetición, con su clave de siempre: ni subida ni otro POST.
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [keyFor(MOTION_HASH)],
  )
  assert.equal(fake.uploads().length, 0)

  fake.reset({ clip })
  const paid = await renderAvatarScene(
    { ...scene, avatar: harvested.avatar },
    lane(paths).options,
  )
  assert.equal(paid.outcome, 'ready')
  const [post] = fake.posts()
  assert.equal(post.headers['Idempotency-Key'], keyFor(PLAIN_IV_HASH))
  assert.deepEqual(Object.keys(post.body), BASE_BODY_KEYS)
})

test('carril (entrega 2e): la toma entra en la huella: con `take` 1 un recibo `succeeded` de la toma 0 no se cosecha y sale un pedido nuevo con otra clave; la toma no viaja en el cuerpo', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const paidReceipt = {
    hash: REQUEST_HASH,
    state: 'succeeded',
    engine: 'avatar_iii',
    lookId: 'look-1',
    audioAssetId: 'asset-audio',
    videoId: 'video-viejo',
    videoUrl: 'https://cdn.example/video-viejo.mp4',
    createdAt: '2026-10-12T05:00:00.000Z',
  }
  const scene = {
    ...SCENE,
    avatar: { ...SCENE.avatar, status: 'failed', attempts: [paidReceipt] },
  }
  // Sin toma: el recibo pagado se cosecha sin POST.
  const fake = fakeHeyGen(t, { clip })
  const harvested = await renderAvatarScene(scene, lane(paths).options)
  assert.equal(harvested.outcome, 'ready')
  assert.equal(fake.posts().length, 0)

  // Toma 1: otra huella; el recibo de la toma 0 no es de este pedido.
  fake.reset({ clip })
  const retake = { ...scene, avatar: { ...scene.avatar, take: 1 } }
  const takeHash = requestHashWith({ take: 1 })
  assert.equal(avatarSceneRequestHash(retake, RUN), takeHash)
  const result = await renderAvatarScene(retake, lane(paths).options)
  assert.equal(result.outcome, 'ready')
  assert.equal(result.avatar.take, 1)
  const [post] = fake.posts()
  assert.equal(fake.posts().length, 1)
  assert.equal(post.headers['Idempotency-Key'], keyFor(takeHash))
  assert.notEqual(post.headers['Idempotency-Key'], idempotencyKey(0))
  assert.deepEqual(Object.keys(post.body), BASE_BODY_KEYS)
  assert.deepEqual(
    result.avatar.attempts.map((attempt) => [attempt.hash, attempt.state]),
    [
      [REQUEST_HASH, 'succeeded'],
      [takeHash, 'succeeded'],
    ],
  )
  assert.equal(
    result.avatar.clipFile,
    avatarClipFileName(3, avatarRequestKey(takeHash, 0)),
  )
})

// ─── Regenerar una lista (entrega 2e, §21.4, `forceNewRender`) ───

// Lo que describe el clip de una escena lista: lo que vuelve si la
// regeneración falla.
const READY_FIELDS = [
  'status',
  'clipFile',
  'normalizedSeconds',
  'renderHash',
  'narrationVersion',
  'usdEstimated',
]
const readyFieldsOf = (avatar) =>
  Object.fromEntries(READY_FIELDS.map((field) => [field, avatar[field]]))
// El pedido de la escena 3 en su toma 1.
const TAKE_HASH = requestHashWith({ take: 1 })

// La escena 3 lista y al día, con su clip en disco y el recibo pagado de su
// pedido (toma 0). Su estimado no es el de hoy (0,1155): así se ve si se
// reemplaza antes de que el clip nuevo esté listo.
async function readyScene(paths, extra = {}) {
  const key = avatarRequestKey(REQUEST_HASH, 0)
  await mkdir(paths.avatarDirectory, { recursive: true })
  await writeFile(
    join(paths.avatarDirectory, avatarClipFileName(3, key)),
    Buffer.from('mp4'),
  )
  return {
    ...SCENE,
    avatar: {
      ...SCENE.avatar,
      status: 'ready',
      clipFile: avatarClipFileName(3, key),
      normalizedSeconds: 7,
      renderHash: RENDER_HASH,
      narrationVersion: 0,
      usdEstimated: 0.5,
      attempts: [
        {
          hash: REQUEST_HASH,
          state: 'succeeded',
          engine: 'avatar_iii',
          lookId: 'look-1',
          audioAssetId: 'asset-audio',
          videoId: 'video-viejo',
          videoUrl: 'https://cdn.example/video-viejo.mp4',
          createdAt: '2026-10-12T05:00:00.000Z',
        },
      ],
      ...extra,
    },
  }
}

test('regenerar (entrega 2e, `forceNewRender`): una lista al día no toma el atajo; sin subir la toma, el recibo pagado de su pedido se cosecha sin pagar; con la toma siguiente sale un pedido nuevo con otra clave y, hasta el clip nuevo, cada recibo guardado conserva el clip y el estimado de hoy', async (t) => {
  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const ready = await readyScene(paths)
  const retake = { ...ready, avatar: { ...ready.avatar, take: 1 } }
  const fake = fakeHeyGen(t, { clip })

  // Sin `forceNewRender`: el atajo, sin hablar con HeyGen.
  const shortcut = await renderAvatarScene(retake, lane(paths).options)
  assert.equal(shortcut.outcome, 'ready')
  assert.deepEqual(fake.calls, [])

  // Con `forceNewRender` y la misma toma: el render pagado se vuelve a bajar,
  // sin otro POST. Es la toma la que hace que el pedido sea nuevo.
  const harvested = await renderAvatarScene(
    ready,
    lane(paths, { forceNewRender: true }).options,
  )
  assert.equal(harvested.outcome, 'ready')
  assert.deepEqual(fake.posts(), [])
  assert.deepEqual(fake.uploads(), [])

  // La toma 1: otro pedido, otra clave, el cuerpo de siempre.
  fake.reset({ clip })
  const { options, checkpoints } = lane(paths, { forceNewRender: true })
  const result = await renderAvatarScene(retake, options)
  assert.equal(result.outcome, 'ready')
  assert.deepEqual(
    fake.posts().map((call) => call.headers['Idempotency-Key']),
    [keyFor(TAKE_HASH)],
  )
  assert.deepEqual(Object.keys(fake.posts()[0].body), BASE_BODY_KEYS)
  const newClip = avatarClipFileName(3, avatarRequestKey(TAKE_HASH, 0))
  assert.equal(result.avatar.clipFile, newClip)
  assert.equal(result.avatar.usdEstimated, 0.1155)
  assert.equal(result.avatar.take, 1)
  assert.equal(checkpoints.at(-1).clipFile, newClip)
  const before = checkpoints.slice(0, -1)
  assert.deepEqual(
    before.map((avatar) =>
      avatar.attempts.map((attempt) => attempt.state).join(','),
    ),
    ['succeeded,creating', 'succeeded,pending', 'succeeded,succeeded'],
  )
  for (const avatar of before)
    assert.deepEqual(readyFieldsOf(avatar), readyFieldsOf(ready.avatar))
})

test('regenerar (entrega 2e): si el render nuevo falla —un 400, un render `failed` o el plazo—, la escena vuelve a su estado listo anterior sin error, con el recibo guardado, y el resultado sale `failed` con su código; sin `forceNewRender`, o en una escena que no estaba lista, falla como siempre', async (t) => {
  const { paths } = await project(t)
  // Una lista que arrastra un error viejo (un scenes.json editado): vuelve sin él.
  const ready = await readyScene(paths, {
    take: 1,
    errorCode: 'avatar_timeout',
  })
  const lookRejection = () =>
    rejection(400, 'invalid_parameter', 'Engine not allowed', 'engine')
  const fake = fakeHeyGen(t, {})
  for (const { label, options, code, state } of [
    {
      label: '400 del look',
      options: { create: lookRejection },
      code: 'avatar_look_unsupported',
      state: 'failed',
    },
    {
      label: 'render failed',
      options: {
        poll: () => ({
          status: 'failed',
          extra: {
            failure_code: 'rendering_failed',
            failure_message: 'Avatar rendering timed out',
          },
        }),
      },
      code: 'avatar_render_failed',
      state: 'failed',
    },
    {
      label: 'plazo vencido',
      options: { poll: () => ({ status: 'processing' }) },
      code: 'avatar_timeout',
      state: 'pending',
    },
  ]) {
    fake.reset(options)
    const lanes = lane(paths, { forceNewRender: true })
    const result = await renderAvatarScene(ready, lanes.options)
    assert.equal(result.outcome, 'failed', label)
    assert.equal(result.errorCode, code, label)
    assert.deepEqual(
      readyFieldsOf(result.avatar),
      readyFieldsOf(ready.avatar),
      label,
    )
    assert.equal('errorCode' in result.avatar, false, label)
    assert.equal(result.avatar.take, 1, label)
    assert.deepEqual(
      result.avatar.attempts.map((attempt) => [attempt.hash, attempt.state]),
      [
        [REQUEST_HASH, 'succeeded'],
        [TAKE_HASH, state],
      ],
      label,
    )
    // Ningún recibo guardado dejó a la escena sin su clip.
    for (const avatar of lanes.checkpoints)
      assert.deepEqual(
        readyFieldsOf(avatar),
        readyFieldsOf(ready.avatar),
        label,
      )
  }

  // Sin `forceNewRender` (una lista desactualizada que se vuelve a pedir) o
  // en una escena planeada: falla como siempre.
  for (const [label, scene, overrides] of [
    [
      'desactualizada',
      {
        ...ready,
        avatar: { ...ready.avatar, renderHash: 'del-render-anterior' },
      },
      {},
    ],
    ['planeada', SCENE, { forceNewRender: true }],
  ]) {
    fake.reset({ create: lookRejection })
    const result = await renderAvatarScene(
      scene,
      lane(paths, overrides).options,
    )
    assert.equal(result.avatar.status, 'failed', label)
    assert.equal(result.avatar.errorCode, 'avatar_look_unsupported', label)
  }
})

test('regenerar (entrega 2e): si la cuenta pausa —un 402 al pedir o un render que HeyGen corta por saldo—, el carril lanza y la escena guardada sigue lista con su clip y su estimado', async (t) => {
  const { paths } = await project(t)
  const ready = await readyScene(paths, { take: 1 })
  const fake = fakeHeyGen(t, {})
  for (const [label, options] of [
    [
      '402',
      {
        create: () =>
          rejection(402, 'insufficient_credit', 'Not enough credit'),
      },
    ],
    [
      'render sin saldo',
      {
        poll: () => ({
          status: 'failed',
          extra: {
            failure_code: 'insufficient_credit',
            failure_message: 'Insufficient credit balance',
          },
        }),
      },
    ],
  ]) {
    fake.reset(options)
    const lanes = lane(paths, { forceNewRender: true })
    await assert.rejects(
      renderAvatarScene(ready, lanes.options),
      { code: 'avatar_insufficient_credits' },
      label,
    )
    assert.equal(fake.posts().length, 1, label)
    assert.ok(lanes.checkpoints.length >= 2, label)
    for (const avatar of lanes.checkpoints) {
      assert.deepEqual(
        readyFieldsOf(avatar),
        readyFieldsOf(ready.avatar),
        label,
      )
      assert.equal('errorCode' in avatar, false, label)
    }
    assert.deepEqual(
      lanes.checkpoints
        .at(-1)
        .attempts.map((attempt) => [attempt.state, attempt.errorCode]),
      [
        ['succeeded', undefined],
        ['failed', 'avatar_insufficient_credits'],
      ],
      label,
    )
  }
})

test('«más expresivo» con V sobre un prompt de la persona (R-2e-14): el pedido lleva su prompt con la frase al final —en el cuerpo, la huella y el recibo—, y la escena guarda el suyo; vacío, la frase sola (m8 de la revisión); con el automático, con IV y foto o sin «más expresivo», no', async (t) => {
  const own = 'Lean in with a confident nod.'
  const sent = `${own} ${AVATAR_EXPRESSIVE_PROMPT_SUFFIX}`
  const avatar = (extra = {}) => ({
    ...SCENE.avatar,
    engine: 'avatar_v',
    motionPrompt: ` ${own} `,
    motionSource: 'user',
    expressive: true,
    ...extra,
  })
  assert.equal(
    AVATAR_EXPRESSIVE_PROMPT_SUFFIX,
    'More energy and clearer gestures.',
  )
  for (const lookType of ['photo_avatar', 'studio_avatar', 'digital_twin'])
    assert.deepEqual(
      avatarRequestMotion(avatar({ lookType })),
      { motionPrompt: sent },
      lookType,
    )
  for (const [label, extra, expected] of [
    ['automático', { motionSource: 'auto' }, { motionPrompt: own }],
    [
      'sin quién lo escribió',
      { motionSource: undefined },
      { motionPrompt: own },
    ],
    ['sin «más expresivo»', { expressive: false }, { motionPrompt: own }],
    // Vacío y «más expresivo»: la frase sola (m8); sin el interruptor, nada.
    [
      'sin prompt',
      { motionPrompt: '  ' },
      { motionPrompt: AVATAR_EXPRESSIVE_PROMPT_SUFFIX },
    ],
    [
      'sin prompt guardado',
      { motionPrompt: undefined },
      { motionPrompt: AVATAR_EXPRESSIVE_PROMPT_SUFFIX },
    ],
    [
      'sin prompt ni «más expresivo»',
      { motionPrompt: '', expressive: false },
      {},
    ],
    [
      'sin prompt, el de Vimo todavía sin escribir',
      { motionPrompt: '', motionSource: undefined },
      {},
    ],
    [
      'IV con foto',
      { engine: 'avatar_iv' },
      { motionPrompt: own, expressiveness: 'high' },
    ],
    [
      'IV con foto, sin prompt',
      { engine: 'avatar_iv', motionPrompt: '' },
      { expressiveness: 'high' },
    ],
    ['movimiento rechazado', { motionUnsupported: true }, {}],
  ])
    assert.deepEqual(avatarRequestMotion(avatar(extra)), expected, label)

  const { paths } = await project(t)
  const clip = await heygenClip(paths, { seconds: 7, switchSeconds: 3 })
  const fake = fakeHeyGen(t, { clip })
  const scene = { ...SCENE, avatar: avatar() }
  const hash = requestHashWith({ engine: 'avatar_v', motionPrompt: sent })
  assert.equal(avatarSceneRequestHash(scene, RUN), hash)
  const result = await renderAvatarScene(scene, lane(paths).options)
  assert.equal(result.outcome, 'ready')
  const [post] = fake.posts()
  assert.equal(post.body.motion_prompt, sent)
  assert.equal('expressiveness' in post.body, false)
  assert.equal(post.headers['Idempotency-Key'], keyFor(hash))
  assert.equal(result.avatar.attempts[0].hash, hash)
  assert.equal(result.avatar.attempts[0].motionPrompt, sent)
  assert.equal(result.avatar.motionPrompt, ` ${own} `)

  // La persona borró el prompt y dejó «más expresivo»: la frase sola, también
  // en la huella y el recibo; la escena sigue sin prompt.
  fake.reset({ clip })
  const emptied = { ...SCENE, avatar: avatar() }
  delete emptied.avatar.motionPrompt
  const suffixHash = requestHashWith({
    engine: 'avatar_v',
    motionPrompt: AVATAR_EXPRESSIVE_PROMPT_SUFFIX,
  })
  assert.equal(avatarSceneRequestHash(emptied, RUN), suffixHash)
  const alone = await renderAvatarScene(emptied, lane(paths).options)
  assert.equal(alone.outcome, 'ready')
  const [suffixPost] = fake.posts()
  assert.equal(suffixPost.body.motion_prompt, AVATAR_EXPRESSIVE_PROMPT_SUFFIX)
  assert.equal(suffixPost.headers['Idempotency-Key'], keyFor(suffixHash))
  assert.equal(
    alone.avatar.attempts[0].motionPrompt,
    AVATAR_EXPRESSIVE_PROMPT_SUFFIX,
  )
  assert.equal('motionPrompt' in alone.avatar, false)
})

test('regenerar (entrega 2e): la restauración conserva lo que el carril aprendió en el camino (L1 de la revisión): si HeyGen rechaza el movimiento y después el pedido sin él, la escena vuelve lista con su clip y queda `motionUnsupported`', async (t) => {
  const { paths } = await project(t)
  const ready = await readyScene(paths, {
    engine: 'avatar_iv',
    motionPrompt: MOTION_PROMPT,
    motionSource: 'auto',
    take: 1,
  })
  const fake = fakeHeyGen(t, {
    create: (_call, n) =>
      n === 1
        ? motionRejection('motion_prompt')
        : rejection(400, 'invalid_parameter', 'Engine not allowed', 'engine'),
  })
  const { options, checkpoints } = lane(paths, { forceNewRender: true })
  const result = await renderAvatarScene(ready, options)
  assert.equal(result.outcome, 'failed')
  assert.equal(result.errorCode, 'avatar_look_unsupported')
  assert.equal(fake.posts().length, 2)
  assert.deepEqual(readyFieldsOf(result.avatar), readyFieldsOf(ready.avatar))
  assert.equal(result.avatar.motionUnsupported, true)
  assert.equal(result.avatar.motionPrompt, MOTION_PROMPT)
  assert.equal(result.avatar.take, 1)
  assert.equal(checkpoints.at(-1).motionUnsupported, true)
  assert.deepEqual(
    result.avatar.attempts.slice(1).map((attempt) => attempt.errorCode),
    ['avatar_motion_unsupported', 'avatar_look_unsupported'],
  )
})

// Centinela (registro `node-test-doble-mock-del-mismo-metodo-deja-el-global-sucio`):
// va SIEMPRE último.
test('centinela: al terminar, fetch vuelve a ser el real', () => {
  assert.equal(globalThis.fetch, ORIGINAL_FETCH)
})
