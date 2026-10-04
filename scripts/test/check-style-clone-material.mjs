// El material de una clonación de estilo (`style-clone-prepare`, ADR-0050):
// de un video de YouTube, hasta 10 mosaicos del storyboard repartidos por todo
// el video, 3 fotogramas públicos, la miniatura y el título; de imágenes del
// usuario, cada una validada por sus bytes y achicada a JPEG. Si YouTube
// bloquea al cliente por defecto de yt-dlp se repite con `mweb`, y sin
// storyboard la clonación sigue con los fotogramas públicos, sin fallar.
// yt-dlp y la red simulados; FFmpeg real (como check-voice-resume) y la
// carpeta de la sesión en un directorio temporal.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { executableSuffix, targetTriple } from '../target-triple.mjs'
import {
  jpegSize,
  pickStoryboard,
  spreadIndexes,
  youtubeVideoIdOf,
} from '../../pipeline/commands/styles/style-clone-material.ts'
import { styleClonePrepare } from '../../pipeline/commands/styles/style-clone-prepare.ts'
import { classifyYtDlpError } from '../../pipeline/providers/ytdlp/download.ts'
import { stylesSubcommands } from '../../pipeline/commands/styles/subcommands.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { RESERVED_ROOT_DIRECTORIES } from '../../pipeline/project/paths.ts'

const triple = targetTriple()
const FFMPEG = fileURLToPath(
  new URL(
    `../../src-tauri/binaries/ffmpeg-${triple}${executableSuffix(triple)}`,
    import.meta.url,
  ),
)
const VIDEO_ID = 'tBBhUn0D0I0'
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`
const SESSION = 'sc-fixture-1'
// El storyboard `sb0` real de un video de 19 minutos: 13 mosaicos de 3×3.
const FPS = 0.1015625
const FRAGMENT_SECONDS = 9 / FPS
// El bloqueo de bot tal como lo escribe yt-dlp 2026.08.19 (medido el
// 2026-10-03): el apóstrofo de «you’re» es el tipográfico (U+2019), no el
// recto. Con el recto en el fixture, el reintento con `mweb` pasaba la prueba
// y no ocurría contra YouTube.
const BOT_BLOCK_STDERR = `ERROR: [youtube] ${VIDEO_ID}: Sign in to confirm you\u2019re not a bot. Use --cookies-from-browser or --cookies for the authentication. See  https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp  for how to manually pass cookies.\n`

const images = new Map()
// Una imagen real del tamaño pedido, hecha con FFmpeg una sola vez.
function image(width, height, extension = 'jpg') {
  const key = `${width}x${height}.${extension}`
  if (!images.has(key)) {
    const bytes = execFileSync(
      FFMPEG,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `color=c=teal:s=${width}x${height}`,
        '-frames:v',
        '1',
        '-f',
        'image2pipe',
        '-c:v',
        extension === 'png' ? 'png' : 'mjpeg',
        'pipe:1',
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    )
    images.set(key, bytes)
  }
  return images.get(key)
}

function storyboardInfo({ fragments = 13, host = 'i.ytimg.com' } = {}) {
  return {
    title: 'Título según yt-dlp',
    duration: Math.round(fragments * FRAGMENT_SECONDS),
    formats: [
      {
        format_id: 'sb2',
        format_note: 'storyboard',
        width: 80,
        height: 45,
        fps: FPS,
        rows: 10,
        columns: 10,
        fragments: [{ url: `https://${host}/sb/small/M0.jpg`, duration: 984 }],
      },
      {
        format_id: 'sb0',
        format_note: 'storyboard',
        width: 320,
        height: 180,
        fps: FPS,
        rows: 3,
        columns: 3,
        fragments: Array.from({ length: fragments }, (_, index) => ({
          url: `https://${host}/sb/${VIDEO_ID}/storyboard3_L3/M${index}.jpg?sigh=fixture`,
          duration: FRAGMENT_SECONDS,
        })),
      },
      { format_id: '18', width: 640, height: 360, ext: 'mp4' },
    ],
  }
}

// Un yt-dlp de mentira: un script de Node que anota sus argumentos y responde
// lo que diga su guion (`bot` = el bloqueo de YouTube salvo con el cliente
// `mweb`; `private` = video privado; `ok` = el JSON del video).
async function fakeYtDlp(root, { mode = 'ok', info = storyboardInfo() } = {}) {
  const log = join(root, 'yt-dlp-calls.log')
  const infoFile = join(root, 'yt-dlp-info.json')
  await writeFile(infoFile, JSON.stringify(info))
  const script = join(root, 'fake-yt-dlp.mjs')
  await writeFile(
    script,
    `#!${process.execPath}
import { appendFileSync, readFileSync } from 'node:fs'
const args = process.argv.slice(2)
appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n')
const mode = ${JSON.stringify(mode)}
const mweb = args.some((arg) => arg.includes('player_client=mweb'))
if (mode === 'private') {
  process.stderr.write('ERROR: [youtube] ${VIDEO_ID}: Private video. Sign in if you have been granted access\\n')
  process.exit(1)
}
if (mode === 'bot-always' || (mode === 'bot' && !mweb)) {
  process.stderr.write(${JSON.stringify(BOT_BLOCK_STDERR)})
  process.exit(1)
}
process.stdout.write(readFileSync(${JSON.stringify(infoFile)}, 'utf8'))
`,
  )
  await chmod(script, 0o755)
  return {
    path: script,
    async calls() {
      try {
        return (await readFile(log, 'utf8'))
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      } catch {
        return []
      }
    },
  }
}

// La red de YouTube: mosaicos, fotogramas públicos, miniatura y oEmbed.
function youtube(t, { missing = [], lastMosaicRows } = {}) {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    const target = String(url)
    requests.push(target)
    if (missing.some((piece) => target.includes(piece)))
      return new Response(image(120, 90), {
        status: 404,
        headers: { 'content-type': 'image/jpeg' },
      })
    if (target.includes('/oembed'))
      return Response.json({ title: 'POV: Eres el COCINERO del Cartel' })
    if (target.includes('/storyboard3_L3/')) {
      const index = Number(target.match(/M(\d+)\.jpg/)[1])
      const rows = lastMosaicRows && index === 12 ? lastMosaicRows : 3
      return new Response(image(960, 180 * rows), {
        headers: { 'content-type': 'image/jpeg' },
      })
    }
    if (target.includes(`/vi/${VIDEO_ID}/`))
      return new Response(image(1280, 720), {
        headers: { 'content-type': 'image/jpeg' },
      })
    return new Response('not found', { status: 404 })
  })
  return requests
}

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-style-clone-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
function context(root, payload, { ytDlp, events = [] } = {}) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: {},
      binaryPaths: { ffmpeg: FFMPEG, ...(ytDlp ? { ytDlp } : {}) },
      payload,
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit: (event) => events.push(event) },
  }
}
function prepareVideo(root, ytDlp, extra = {}) {
  return styleClonePrepare(
    context(
      root,
      {
        sessionId: SESSION,
        source: { kind: 'youtube', url: VIDEO_URL },
        ...extra,
      },
      { ytDlp: ytDlp.path },
    ),
  )
}
const sessionDirectory = (root) => join(root, '_style-clones', SESSION)
const kinds = (result) => result.material.map((item) => item.kind)

// ── Piezas puras ──

test('the video id is read from every YouTube link shape', () => {
  assert.equal(youtubeVideoIdOf(VIDEO_URL), VIDEO_ID)
  assert.equal(youtubeVideoIdOf(`https://youtu.be/${VIDEO_ID}?t=30`), VIDEO_ID)
  assert.equal(
    youtubeVideoIdOf(`https://www.youtube.com/shorts/${VIDEO_ID}`),
    VIDEO_ID,
  )
  assert.equal(
    youtubeVideoIdOf(`https://m.youtube.com/watch?list=PL1&v=${VIDEO_ID}`),
    VIDEO_ID,
  )
  assert.equal(
    youtubeVideoIdOf(`https://www.youtube.com/live/${VIDEO_ID}`),
    VIDEO_ID,
  )
  assert.equal(youtubeVideoIdOf('https://www.youtube.com/@canal'), null)
})

test('the picked mosaics are spread across the whole video', () => {
  assert.deepEqual(spreadIndexes(13, 10), [0, 1, 3, 4, 5, 7, 8, 9, 11, 12])
  assert.deepEqual(spreadIndexes(4, 10), [0, 1, 2, 3])
  assert.deepEqual(spreadIndexes(1, 10), [0])
  assert.deepEqual(spreadIndexes(0, 10), [])
})

test('the storyboard with the largest cells is the one used', () => {
  const storyboard = pickStoryboard(storyboardInfo())
  assert.equal(storyboard.cellWidth, 320)
  assert.equal(storyboard.rows, 3)
  assert.equal(storyboard.columns, 3)
  assert.equal(storyboard.fragments.length, 13)
  assert.equal(pickStoryboard({ formats: [{ format_id: '18' }] }), null)
  assert.equal(pickStoryboard(null), null)
})

test('the size of a JPEG is read from its bytes', () => {
  assert.deepEqual(jpegSize(image(960, 540)), { width: 960, height: 540 })
  assert.equal(jpegSize(Buffer.from('not an image')), null)
})

test('the bot block of YouTube is recognized with either apostrophe', () => {
  assert.equal(classifyYtDlpError(BOT_BLOCK_STDERR), 'ytdlp_needs_login')
  assert.equal(
    classifyYtDlpError("ERROR: Sign in to confirm you're not a bot."),
    'ytdlp_needs_login',
  )
  assert.equal(
    classifyYtDlpError('ERROR: [youtube] abc: Private video'),
    'ytdlp_private_video',
  )
})

// ── Video de YouTube ──

test('a video gives 10 mosaics, 3 frames, the thumbnail and its title', async (t) => {
  const root = await workspace(t)
  const ytDlp = await fakeYtDlp(root)
  youtube(t)

  const result = await prepareVideo(root, ytDlp)

  assert.deepEqual(kinds(result), [
    ...Array(10).fill('mosaic'),
    'frame',
    'frame',
    'frame',
    'thumbnail',
  ])
  assert.equal(result.title, 'POV: Eres el COCINERO del Cartel')
  assert.deepEqual(result.rejectedImages, [])

  const mosaics = result.material.filter((item) => item.kind === 'mosaic')
  assert.deepEqual(
    mosaics.map((item) => item.file),
    Array.from({ length: 10 }, (_, index) => `mosaic-${index + 1}.jpg`),
  )
  // El cuarto mosaico elegido es el quinto del video (índice 4).
  assert.equal(mosaics[3].rows, 3)
  assert.equal(mosaics[3].columns, 3)
  assert.ok(Math.abs(mosaics[3].startSeconds - 4 * FRAGMENT_SECONDS) < 1e-6)
  assert.equal(mosaics[3].secondsPerCell, 1 / FPS)
  for (const item of result.material) {
    assert.equal(item.mimeType, 'image/jpeg')
    assert.equal(item.path, join(sessionDirectory(root), item.file))
    assert.ok((await readFile(item.path)).length > 0)
  }
})

test('the material is left on disk for the later steps of the session', async (t) => {
  const root = await workspace(t)
  const ytDlp = await fakeYtDlp(root)
  youtube(t)

  await prepareVideo(root, ytDlp)

  const stored = JSON.parse(
    await readFile(join(sessionDirectory(root), 'material.json'), 'utf8'),
  )
  assert.equal(stored.source, 'youtube')
  assert.equal(stored.videoUrl, VIDEO_URL)
  assert.equal(stored.items.length, 14)
  // Sin rutas absolutas: la carpeta raíz puede moverse.
  assert.ok(stored.items.every((item) => item.path === undefined))
})

test('the default client is asked first and mweb only after the bot block', async (t) => {
  const root = await workspace(t)
  const ytDlp = await fakeYtDlp(root, { mode: 'bot' })
  youtube(t)

  const result = await prepareVideo(root, ytDlp)

  const calls = await ytDlp.calls()
  assert.equal(calls.length, 2)
  assert.ok(!calls[0].some((arg) => arg.includes('player_client')))
  assert.ok(calls[1].includes('youtube:player_client=mweb'))
  assert.ok(calls.every((args) => args.includes('-J')))
  assert.equal(
    result.material.filter((item) => item.kind === 'mosaic').length,
    10,
  )
})

test('without a storyboard the clone goes on with the public frames', async (t) => {
  const root = await workspace(t)
  const ytDlp = await fakeYtDlp(root, { mode: 'bot-always' })
  youtube(t)

  const result = await prepareVideo(root, ytDlp)

  assert.deepEqual(kinds(result), ['frame', 'frame', 'frame', 'thumbnail'])
  assert.equal(result.title, 'POV: Eres el COCINERO del Cartel')
})

test('smaller public frames replace the missing maxres ones', async (t) => {
  const root = await workspace(t)
  const ytDlp = await fakeYtDlp(root, { mode: 'bot-always' })
  const requests = youtube(t, { missing: ['maxres', '/sd'] })

  const result = await prepareVideo(root, ytDlp)

  assert.deepEqual(kinds(result), ['frame', 'frame', 'frame', 'thumbnail'])
  assert.ok(requests.some((url) => url.endsWith('/hq2.jpg')))
  assert.ok(requests.some((url) => url.endsWith('/hqdefault.jpg')))
})

test('a video with fewer than two images fails with the reason yt-dlp gave', async (t) => {
  const root = await workspace(t)
  const ytDlp = await fakeYtDlp(root, { mode: 'private' })
  youtube(t, { missing: [`/vi/${VIDEO_ID}/`] })

  await assert.rejects(prepareVideo(root, ytDlp), {
    code: 'ytdlp_private_video',
  })
  // Otro cliente no abre un video privado: solo el bloqueo de bot se repite.
  assert.equal((await ytDlp.calls()).length, 1)
})

test('a video with no images and no yt-dlp reason fails as without material', async (t) => {
  const root = await workspace(t)
  const ytDlp = await fakeYtDlp(root, { info: { title: 'x', formats: [] } })
  youtube(t, { missing: [`/vi/${VIDEO_ID}/`] })

  await assert.rejects(prepareVideo(root, ytDlp), {
    code: 'style_clone_no_material',
  })
})

test('a mosaic hosted outside YouTube is never downloaded', async (t) => {
  const root = await workspace(t)
  const ytDlp = await fakeYtDlp(root, {
    info: storyboardInfo({ host: 'evil.example' }),
  })
  const requests = youtube(t)

  const result = await prepareVideo(root, ytDlp)

  assert.deepEqual(kinds(result), ['frame', 'frame', 'frame', 'thumbnail'])
  assert.ok(requests.every((url) => !url.includes('evil.example')))
})

test('the last mosaic reports the rows it really has', async (t) => {
  const root = await workspace(t)
  const ytDlp = await fakeYtDlp(root)
  youtube(t, { lastMosaicRows: 1 })

  const result = await prepareVideo(root, ytDlp)

  const mosaics = result.material.filter((item) => item.kind === 'mosaic')
  assert.equal(mosaics.at(-1).rows, 1)
  assert.equal(mosaics.at(-1).columns, 3)
  assert.equal(mosaics[0].rows, 3)
})

test('a link that is not from YouTube is rejected before running anything', async (t) => {
  const root = await workspace(t)
  const ytDlp = await fakeYtDlp(root)
  const requests = youtube(t)

  await assert.rejects(
    styleClonePrepare(
      context(
        root,
        {
          sessionId: SESSION,
          source: { kind: 'youtube', url: 'https://vimeo.com/123' },
        },
        { ytDlp: ytDlp.path },
      ),
    ),
    { code: 'ytdlp_invalid_url' },
  )
  assert.deepEqual(await ytDlp.calls(), [])
  assert.deepEqual(requests, [])
})

test('a channel link without a video is rejected as an invalid link', async (t) => {
  const root = await workspace(t)
  const ytDlp = await fakeYtDlp(root)
  youtube(t)

  await assert.rejects(
    styleClonePrepare(
      context(
        root,
        {
          sessionId: SESSION,
          source: { kind: 'youtube', url: 'https://www.youtube.com/@canal' },
        },
        { ytDlp: ytDlp.path },
      ),
    ),
    { code: 'ytdlp_invalid_url' },
  )
})

test('preparing again replaces the material of the session', async (t) => {
  const root = await workspace(t)
  youtube(t)
  await prepareVideo(root, await fakeYtDlp(root))

  const blocked = await fakeYtDlp(root, { mode: 'bot-always' })
  const result = await prepareVideo(root, blocked)

  assert.deepEqual(kinds(result), ['frame', 'frame', 'frame', 'thumbnail'])
  const files = await readdir(sessionDirectory(root))
  assert.ok(!files.some((file) => file.startsWith('mosaic-')))
})

// ── Imágenes del usuario ──

async function userImages(root, entries) {
  const paths = []
  for (const [name, bytes] of entries) {
    const path = join(root, name)
    await writeFile(path, bytes)
    paths.push(path)
  }
  return paths
}
function prepareImages(root, paths) {
  return styleClonePrepare(
    context(root, {
      sessionId: SESSION,
      source: { kind: 'images', paths },
    }),
  )
}

test('user images become JPEGs of at most 1536 px, in the order given', async (t) => {
  const root = await workspace(t)
  youtube(t)
  const paths = await userImages(root, [
    ['wide.png', image(3000, 1000, 'png')],
    ['small.jpg', image(400, 300)],
    ['tall.jpg', image(1000, 2000)],
  ])

  const result = await prepareImages(root, paths)

  assert.deepEqual(kinds(result), ['image', 'image', 'image'])
  assert.deepEqual(
    result.material.map((item) => item.file),
    ['image-1.jpg', 'image-2.jpg', 'image-3.jpg'],
  )
  assert.equal(result.title, '')
  assert.deepEqual(result.rejectedImages, [])
  const sizes = await Promise.all(
    result.material.map(async (item) => jpegSize(await readFile(item.path))),
  )
  assert.deepEqual(sizes[0], { width: 1536, height: 512 })
  // Una imagen chica no se agranda.
  assert.deepEqual(sizes[1], { width: 400, height: 300 })
  assert.deepEqual(sizes[2], { width: 768, height: 1536 })
})

test('a file that is not an image is reported and nothing is prepared', async (t) => {
  const root = await workspace(t)
  const paths = await userImages(root, [
    ['one.jpg', image(400, 300)],
    ['notes.png', Buffer.from('just text')],
    ['three.jpg', image(400, 300)],
  ])
  paths.push(join(root, 'missing.jpg'))

  const result = await prepareImages(root, paths)

  assert.deepEqual(result.rejectedImages, [2, 4])
  assert.deepEqual(result.material, [])
})

test('the images are limited to 10 and to at least one', async (t) => {
  const root = await workspace(t)
  const paths = await userImages(
    root,
    Array.from({ length: 11 }, (_, index) => [
      `image-${index}.jpg`,
      image(400, 300),
    ]),
  )

  await assert.rejects(prepareImages(root, paths), { code: 'invalid_payload' })
  await assert.rejects(prepareImages(root, []), { code: 'invalid_payload' })
})

// ── La sesión ──

test('the session id cannot leave the clones folder', async (t) => {
  const root = await workspace(t)
  for (const sessionId of ['../outside', 'UPPER', '', 'a/b'])
    await assert.rejects(
      styleClonePrepare(
        context(root, { sessionId, source: { kind: 'images', paths: [] } }),
      ),
      { code: 'invalid_payload' },
    )
})

test('the clones folder is reserved and the subcommand is registered', () => {
  assert.ok(RESERVED_ROOT_DIRECTORIES.has('_style-clones'))
  assert.equal(stylesSubcommands['style-clone-prepare'], styleClonePrepare)
})
