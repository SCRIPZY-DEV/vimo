// El modelo de la escena de avatar (ADR-0057, entrega 2, tarea 1): la tarifa
// con la que se estima el costo (diseño §3.4), la carpeta `avatar/` del
// proyecto y los nombres de sus archivos (§3.2: el clip que se lee de
// scenes.json se valida antes de usarse, como el de las animaciones), la vista
// que la UI recibe de una escena de avatar (§3.3: sin recibos, con la ruta del
// clip, «desactualizada» derivada al leer y, como vista previa fija, la del
// look: Vimo no genera imagen para una escena de avatar) y la versión de la
// narración, que sube al reemplazarla sin tocar los recibos de HeyGen que
// viven en las escenas. Importa el código real del sidecar (Node quita los
// tipos); el reemplazo de narración corre con el FFmpeg del repo y con
// Deepgram simulado: nada sale a la red.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  avatarAudioFile,
  avatarClipFile,
  avatarClipFileName,
  avatarLookPreviewFile,
  avatarRawClipFile,
  findAvatarLookPreview,
  sceneAvatarClipFile,
} from '../../pipeline/avatar/clip-path.ts'
import { avatarRenderHash } from '../../pipeline/avatar/fingerprint.ts'
import { retranscribeAndRedistribute } from '../../pipeline/commands/videos/audio-replacement.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { writeProjectMetadata } from '../../pipeline/project/metadata.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'
import {
  readScenes,
  toSceneSummaries,
  toSceneSummary,
  writeScenes,
} from '../../pipeline/project/scenes-file.ts'
import {
  AVATAR_DEFAULT_ENGINE,
  AVATAR_ENGINES,
  AVATAR_LOOK_ORIENTATION_BY_FORMAT,
  AVATAR_LOOK_TYPES,
  AVATAR_USD_PER_MINUTE,
  avatarUsdPerMinute,
  estimateAvatarUsd,
} from '../../pipeline/types/avatar.ts'
import { FRAME_SIZES } from '../../pipeline/types/video-format.ts'
import { executableSuffix, targetTriple } from '../target-triple.mjs'

// Una huella de pedido como la arma el carril de HeyGen (sha256 en hex).
const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const PROJECT_DIR = join(tmpdir(), 'vimo-avatar-model', 'mi-video')
const paths = resolveProjectPaths(PROJECT_DIR, 'mi-video')

// Una escena de avatar ya renderizada con la narración 0 y su recibo pagado.
const READY_AVATAR = {
  lookId: 'look-1',
  lookName: 'Ana',
  lookType: 'photo_avatar',
  engine: 'avatar_iii',
  origin: 'auto',
  status: 'ready',
  clipFile: 'scene_1.a1b2c3d4.mp4',
  normalizedSeconds: 10,
  renderHash: HASH,
  narrationVersion: 0,
  usdEstimated: 0.165,
  attempts: [
    {
      hash: HASH,
      state: 'succeeded',
      engine: 'avatar_iii',
      lookId: 'look-1',
      audioAssetId: 'asset-audio',
      videoId: 'video-1',
      videoUrl: 'https://files.heygen.ai/video-1.mp4',
      createdAt: '2026-10-10T00:00:00.000Z',
    },
  ],
}

// La huella del tramo de una escena de avatar de 0 a `endSeconds` s con la
// narración 0, como la arma el carril de HeyGen (tarea 7): con ella, el clip
// del tramo de hoy no se lee desactualizado.
const renderHashUntil = (endSeconds) =>
  avatarRenderHash({
    lookId: 'look-1',
    engine: 'avatar_iii',
    startFrame: 0,
    endFrame: Math.round(endSeconds * 25),
    narrationVersion: 0,
  })

const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`)

// Un solo fetch simulado vivo por test (registro de errores conocidos:
// `node-test-doble-mock-del-mismo-metodo-deja-el-global-sucio`).
function mockFetch(t, implementation) {
  globalThis.fetch.mock?.restore()
  return t.mock.method(globalThis, 'fetch', implementation)
}

function ffmpegPath() {
  const triple = targetTriple()
  return fileURLToPath(
    new URL(
      `../../src-tauri/binaries/ffmpeg-${triple}${executableSuffix(triple)}`,
      import.meta.url,
    ),
  )
}

// Una carpeta de proyecto temporal con su `avatar/`.
async function projectFolder(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-model-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const project = resolveProjectPaths(join(root, 'mi-video'), 'mi-video')
  await mkdir(project.avatarDirectory, { recursive: true })
  return { root, project }
}

test('tarifa: con Avatar III, tres apariciones de 10 s cuestan ≈ 0,50 USD con foto o estudio y ≈ 0,30 con gemelo digital', () => {
  close(estimateAvatarUsd(3 * 10, 'avatar_iii', 'photo_avatar'), 0.495)
  close(estimateAvatarUsd(3 * 10, 'avatar_iii', 'studio_avatar'), 0.495)
  close(estimateAvatarUsd(3 * 10, 'avatar_iii', 'digital_twin'), 0.3)
  // Un minuto de Avatar IV con foto cuesta su tarifa entera.
  close(estimateAvatarUsd(60, 'avatar_iv', 'photo_avatar'), 2.31)
  // Avatar V no aplica a foto ni a estudio: sin precio, nunca «gratis».
  assert.equal(estimateAvatarUsd(30, 'avatar_v', 'studio_avatar'), null)
  assert.equal(estimateAvatarUsd(30, 'avatar_v', 'photo_avatar'), null)
  // Nada que renderizar no cuesta nada, y un valor roto no da NaN.
  assert.equal(estimateAvatarUsd(0, 'avatar_iii', 'photo_avatar'), 0)
  assert.equal(estimateAvatarUsd(Number.NaN, 'avatar_iii', 'photo_avatar'), 0)
})

test('tarifa: una entrada por motor y tipo de look, y el motor de Vimo tiene precio para los tres tipos', () => {
  for (const engine of AVATAR_ENGINES)
    for (const lookType of AVATAR_LOOK_TYPES) {
      const rate = AVATAR_USD_PER_MINUTE[engine][lookType]
      assert.ok(
        rate === null || (Number.isFinite(rate) && rate > 0),
        `${engine}/${lookType}: ${rate}`,
      )
      assert.equal(avatarUsdPerMinute(engine, lookType), rate)
    }
  for (const lookType of AVATAR_LOOK_TYPES)
    assert.equal(
      typeof avatarUsdPerMinute(AVATAR_DEFAULT_ENGINE, lookType),
      'number',
      lookType,
    )
})

test('orientación del look por formato: horizontal para 16:9, vertical para 9:16, y la de cada formato coincide con su cuadro', () => {
  assert.deepEqual(AVATAR_LOOK_ORIENTATION_BY_FORMAT, {
    '16:9': 'landscape',
    '9:16': 'portrait',
  })
  // Cada formato del proyecto tiene la suya, y es la de su cuadro de render:
  // un formato nuevo sin orientación (o con la equivocada) rompe acá.
  for (const [format, { width, height }] of Object.entries(FRAME_SIZES))
    assert.equal(
      AVATAR_LOOK_ORIENTATION_BY_FORMAT[format],
      width > height ? 'landscape' : 'portrait',
      format,
    )
})

test('carpeta: lo del avatar vive en avatar/ dentro del proyecto (la biblioteca es avatars/ en la raíz)', () => {
  assert.equal(paths.avatarDirectory, join(PROJECT_DIR, 'avatar'))
})

test('nombres: audio, crudo y clip llevan la escena y los 8 primeros caracteres de la huella', () => {
  assert.equal(avatarClipFileName(3, HASH), 'scene_3.a1b2c3d4.mp4')
  assert.equal(
    avatarAudioFile(paths, 3, HASH),
    join(paths.avatarDirectory, 'scene_3.a1b2c3d4.wav'),
  )
  assert.equal(
    avatarRawClipFile(paths, 3, HASH),
    join(paths.avatarDirectory, 'scene_3.a1b2c3d4.raw.mp4'),
  )
  assert.equal(
    avatarClipFile(paths, 3, HASH),
    join(paths.avatarDirectory, 'scene_3.a1b2c3d4.mp4'),
  )
  // Otra huella (otro tramo u otra narración) es otro archivo: el viejo queda.
  assert.notEqual(
    avatarClipFileName(3, 'f'.repeat(64)),
    avatarClipFileName(3, HASH),
  )
  for (const [sceneId, hash] of [
    [0, HASH],
    [1.5, HASH],
    [3, 'A1B2C3D4' + HASH.slice(8)],
    [3, 'a1b2'],
    [3, '../../x'],
  ])
    assert.throws(
      () => avatarClipFileName(sceneId, hash),
      { code: 'invalid_payload' },
      `${sceneId} ${hash}`,
    )
})

test('clip leído de scenes.json: solo el nombre que arma Vimo; una ruta, el crudo o un nombre ajeno no se usan', () => {
  assert.equal(
    sceneAvatarClipFile(paths, { clipFile: 'scene_3.a1b2c3d4.mp4' }),
    join(paths.avatarDirectory, 'scene_3.a1b2c3d4.mp4'),
  )
  assert.equal(sceneAvatarClipFile(paths, {}), undefined)
  for (const clipFile of [
    '',
    '../scene_3.a1b2c3d4.mp4',
    '/tmp/scene_3.a1b2c3d4.mp4',
    'scene_3.a1b2c3d4.raw.mp4',
    'scene_3.A1B2C3D4.mp4',
    'scene_3.a1b2c3d4.mov',
    'scene_0.a1b2c3d4.mp4',
  ])
    assert.equal(sceneAvatarClipFile(paths, { clipFile }), undefined, clipFile)
})

test('vista previa del avatar en el proyecto: conserva la extensión real de la imagen y se encuentra la que haya', async (t) => {
  for (const extension of ['jpg', 'png', 'webp'])
    assert.equal(
      avatarLookPreviewFile(paths, extension),
      join(paths.avatarDirectory, `look.${extension}`),
    )
  assert.throws(() => avatarLookPreviewFile(paths, 'gif'), {
    code: 'invalid_payload',
  })

  const { project } = await projectFolder(t)
  assert.equal(await findAvatarLookPreview(project), undefined)
  // La copia de una vista previa WEBP de la biblioteca (diseño §16).
  await writeFile(
    join(project.avatarDirectory, 'look.webp'),
    Buffer.from('webp'),
  )
  assert.equal(
    await findAvatarLookPreview(project),
    join(project.avatarDirectory, 'look.webp'),
  )
})

test('vista: la escena de avatar llega sin recibos, con la vista previa del look como imagen, con su clip si está en disco, fallida sin él y desactualizada si cambió la narración', async (t) => {
  const { project } = await projectFolder(t)
  await writeFile(avatarClipFile(project, 1, HASH), Buffer.from('mp4'))
  const scene = {
    id: 1,
    text: 'hola',
    startSeconds: 0,
    endSeconds: 10,
    avatar: { ...READY_AVATAR, renderHash: renderHashUntil(10) },
  }

  // Sin la copia de la vista previa no hay imagen que mostrar (Vimo no genera
  // ninguna para una escena de avatar): queda pendiente, sin ruta.
  const withoutPreview = await toSceneSummary(project, scene, {})
  assert.equal(withoutPreview.imageStatus, 'pending')
  assert.equal(withoutPreview.imagePath, undefined)
  // Con `avatar/look.png`, esa es la imagen fija de la escena.
  const lookPreview = join(project.avatarDirectory, 'look.png')
  await writeFile(lookPreview, Buffer.from('png'))
  const summary = await toSceneSummary(project, scene, {})
  assert.equal(summary.imageStatus, 'ok')
  assert.equal(summary.imagePath, lookPreview)

  const fresh = summary.avatar
  assert.equal(fresh.status, 'ready')
  assert.equal(fresh.clipPath, avatarClipFile(project, 1, HASH))
  assert.equal(typeof fresh.clipMtimeMs, 'number')
  assert.equal(fresh.stale, undefined)
  assert.deepEqual(
    [fresh.lookId, fresh.lookName, fresh.lookType, fresh.engine, fresh.origin],
    ['look-1', 'Ana', 'photo_avatar', 'avatar_iii', 'auto'],
  )
  assert.deepEqual(
    [fresh.normalizedSeconds, fresh.narrationVersion, fresh.usdEstimated],
    [10, 0, 0.165],
  )
  // Ni los recibos, ni el nombre local del clip, ni la huella viajan a la UI.
  for (const hidden of ['attempts', 'clipFile', 'renderHash'])
    assert.equal(hidden in fresh, false, hidden)

  // Otra narración: el mismo clip se lee desactualizado (no se persiste nada).
  const replaced = (
    await toSceneSummary(project, scene, { narrationVersion: 1 })
  ).avatar
  assert.equal(replaced.status, 'ready')
  assert.equal(replaced.stale, true)

  // `ready` sin el archivo, o con un nombre que no es de Vimo: fallido, como
  // un clip de Kie que falta; el código lleva a reintentar la descarga.
  for (const clipFile of ['scene_2.a1b2c3d4.mp4', '../scene_1.a1b2c3d4.mp4']) {
    const missing = (
      await toSceneSummary(
        project,
        { ...scene, id: 2, avatar: { ...READY_AVATAR, clipFile } },
        {},
      )
    ).avatar
    assert.equal(missing.status, 'failed', clipFile)
    assert.equal(missing.errorCode, 'avatar_download_failed', clipFile)
    assert.equal(missing.clipPath, undefined, clipFile)
  }

  // Recién cortada: solo el look y el estado.
  const planned = (
    await toSceneSummary(
      project,
      {
        ...scene,
        id: 3,
        avatar: {
          lookId: 'look-1',
          lookName: 'Ana',
          lookType: 'photo_avatar',
          engine: 'avatar_iii',
          origin: 'auto',
          status: 'planned',
        },
      },
      {},
    )
  ).avatar
  assert.deepEqual(planned, {
    lookId: 'look-1',
    lookName: 'Ana',
    lookType: 'photo_avatar',
    engine: 'avatar_iii',
    origin: 'auto',
    status: 'planned',
  })

  // Una escena normal no gana la clave ni la vista previa del look: los
  // proyectos de antes, idénticos.
  const plain = await toSceneSummary(
    project,
    { id: 4, text: 'x', startSeconds: 0, endSeconds: 3 },
    {},
  )
  assert.equal('avatar' in plain, false)
  assert.equal(plain.imagePath, undefined)
  assert.equal(plain.imageStatus, 'pending')
})

test('vista: un clip vacío no es un clip, la lista de escenas le pasa el proyecto a cada una y «desactualizado» es solo de un clip listo', async (t) => {
  const { project } = await projectFolder(t)
  const scene = {
    id: 1,
    text: 'hola',
    startSeconds: 0,
    endSeconds: 10,
    avatar: { ...READY_AVATAR, renderHash: renderHashUntil(10) },
  }

  // Un clip de 0 bytes (una normalización cortada a mitad) sale fallido, como
  // uno que falta: reintentar la descarga lo recupera sin pagar de nuevo.
  await writeFile(avatarClipFile(project, 1, HASH), Buffer.alloc(0))
  const empty = (await toSceneSummary(project, scene, {})).avatar
  assert.equal(empty.status, 'failed')
  assert.equal(empty.errorCode, 'avatar_download_failed')
  assert.equal(empty.clipPath, undefined)

  // `toSceneSummaries` (estado, cortes, animación, demo) le pasa a cada
  // escena el proyecto que recibe: con otra narración, el clip se lee
  // desactualizado; con la misma, vigente.
  await writeFile(avatarClipFile(project, 1, HASH), Buffer.from('mp4'))
  const [replaced] = await toSceneSummaries(project, [scene], {
    narrationVersion: 1,
  })
  assert.equal(replaced.avatar.stale, true)
  const [current] = await toSceneSummaries(project, [scene], {
    narrationVersion: 0,
  })
  assert.equal(current.avatar.stale, undefined)

  // «Desactualizado» describe un clip listo (diseño §3.3): una escena
  // planeada o fallida de otra narración no lo lleva.
  for (const avatar of [
    {
      lookId: 'look-1',
      lookName: 'Ana',
      lookType: 'photo_avatar',
      engine: 'avatar_iii',
      origin: 'auto',
      status: 'planned',
      narrationVersion: 0,
    },
    {
      ...READY_AVATAR,
      status: 'failed',
      errorCode: 'avatar_render_failed',
      clipFile: undefined,
    },
  ]) {
    const [view] = await toSceneSummaries(project, [{ ...scene, avatar }], {
      narrationVersion: 1,
    })
    assert.equal('stale' in view.avatar, false, avatar.status)
  }
})

test('reemplazar la narración sube narrationVersion y no toca el avatar de las escenas: sus recibos siguen y el clip queda desactualizado', async (t) => {
  const { root, project } = await projectFolder(t)
  const sceneAvatar = { ...READY_AVATAR, renderHash: renderHashUntil(7) }
  const ffmpeg = ffmpegPath()
  // La narración nueva: 2 s de tono (la duración real la mide ffmpeg).
  execFileSync(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=2',
    '-c:a',
    'libmp3lame',
    project.narrationFile,
  ])
  await writeScenes(project, [
    {
      id: 1,
      text: 'hola mundo',
      startSeconds: 0,
      endSeconds: 7,
      avatar: sceneAvatar,
    },
    {
      id: 2,
      text: 'adiós',
      startSeconds: 7,
      endSeconds: 10,
      imagePrompt: 'A quiet street at dusk',
    },
  ])
  const metadata = {
    id: 'mi-video',
    name: 'Mi video',
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    state: 'completed',
    options: {
      styleId: 'cartoon',
      sceneCount: 0,
      narrationMode: 'tts',
      imageProvider: 'fal',
      useBgm: false,
      useOverlay: false,
      confirmScenes: false,
    },
    completedStages: ['voice', 'transcription', 'scene-cuts', 'images'],
    audioDurationSeconds: 10,
    wordCount: 3,
  }
  await writeProjectMetadata(project, metadata)
  mockFetch(t, async (url) => {
    assert.ok(String(url).startsWith('https://api.deepgram.com/v1/listen'))
    return new Response(
      JSON.stringify({
        results: {
          channels: [
            {
              alternatives: [
                {
                  words: [
                    {
                      word: 'hola',
                      start: 0.1,
                      end: 0.5,
                      punctuated_word: 'Hola.',
                    },
                    {
                      word: 'mundo',
                      start: 1,
                      end: 1.6,
                      punctuated_word: 'mundo.',
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  const context = {
    job: {
      jobId: 'narration-version',
      projectsRoot: root,
      apiKeys: { deepgram: 'fake-key' },
      binaryPaths: { ffmpeg },
      payload: {},
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit: () => {} },
    paths: project,
    metadata,
    options: metadata.options,
    saveMetadata: () => writeProjectMetadata(project, metadata),
  }

  await retranscribeAndRedistribute(context)

  const stored = JSON.parse(await readFile(project.metadataFile, 'utf8'))
  assert.equal(stored.narrationVersion, 1)
  const scenes = await readScenes(project)
  // El avatar y su recibo pagado, intactos: regenerarlo puede reusar el video.
  assert.deepEqual(scenes[0].avatar, sceneAvatar)
  assert.equal(scenes[1].imagePrompt, 'A quiet street at dusk')
  // Los tiempos se redistribuyen sobre la duración nueva, contiguos.
  assert.equal(scenes[0].startSeconds, 0)
  assert.equal(scenes[0].endSeconds, scenes[1].startSeconds)
  assert.equal(
    scenes[1].endSeconds,
    Math.round(stored.audioDurationSeconds * 1000) / 1000,
  )
  // La vista lo declara desactualizado (foco 5 del plan).
  await writeFile(avatarClipFile(project, 1, HASH), Buffer.from('mp4'))
  assert.equal(
    (await toSceneSummary(project, scenes[0], stored)).avatar.stale,
    true,
  )
  // Aun con la narración de antes, el tramo se redistribuyó: la huella del
  // tramo (renderHash, tarea 7) ya no coincide y el clip sigue desactualizado.
  assert.equal(
    (await toSceneSummary(project, scenes[0], { narrationVersion: 0 })).avatar
      .stale,
    true,
  )
})

test('centinela: al terminar, fetch vuelve a ser el real', () => {
  assert.equal(globalThis.fetch.mock, undefined)
})
