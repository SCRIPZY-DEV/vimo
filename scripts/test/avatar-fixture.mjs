// Apoyo para los guards del avatar dentro del video (ADR-0057, entrega 2), no
// es una prueba: el ffmpeg empaquetado del repo, medios chicos generados al
// vuelo con lavfi (la narración y el mp4 «de HeyGen») y un HeyGen simulado por
// ruta (assets, renders con sus estados, búsqueda por título, saldo y el CDN
// del mp4). Nada sale a la red; todo se escribe donde el guard lo pide
// (siempre una carpeta de mkdtemp).
import { execFileSync, spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { executableSuffix, targetTriple } from '../target-triple.mjs'

const TRIPLE = targetTriple()

// El mismo binario que Rust inyecta en `binaryPaths.ffmpeg` (ADR-0026).
export const FFMPEG = fileURLToPath(
  new URL(
    `../../src-tauri/binaries/ffmpeg-${TRIPLE}${executableSuffix(TRIPLE)}`,
    import.meta.url,
  ),
)

function ffmpeg(args) {
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args])
}

// Narración de prueba: un tono en mp3 de `seconds` segundos.
export function writeNarration(path, seconds) {
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${seconds}`,
    '-c:a',
    'libmp3lame',
    '-y',
    path,
  ])
}

// El mp4 «de HeyGen»: rojo hasta `switchSeconds` y azul después, a 25 fps y
// con pista de audio (la normalización la tiene que descartar). Con el cambio
// de color en un borde de cuadro, un clip retimado se delata solo.
export function writeHeyGenClip(
  path,
  { seconds, switchSeconds = seconds / 2, size = '1280x720' },
) {
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `color=c=red:size=${size}:rate=25:duration=${switchSeconds}`,
    '-f',
    'lavfi',
    '-i',
    `color=c=blue:size=${size}:rate=25:duration=${seconds - switchSeconds}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=330:duration=${seconds}`,
    '-filter_complex',
    '[0:v][1:v]concat=n=2:v=1:a=0[v]',
    '-map',
    '[v]',
    '-map',
    '2:a',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    '-y',
    path,
  ])
}

// Tres franjas verticales (rojo 300 px, verde 600 px, azul 300 px) en
// 1200×720: recortado al centro en 9:16 queda solo verde; aplastado se verían
// las tres; con bandas negras, los bordes no serían verdes.
export function writeStripesClip(path, seconds) {
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `color=c=red:size=300x720:rate=25:duration=${seconds}`,
    '-f',
    'lavfi',
    '-i',
    `color=c=green:size=600x720:rate=25:duration=${seconds}`,
    '-f',
    'lavfi',
    '-i',
    `color=c=blue:size=300x720:rate=25:duration=${seconds}`,
    '-filter_complex',
    '[0:v][1:v][2:v]hstack=inputs=3[v]',
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-y',
    path,
  ])
}

// Color [r, g, b] de un píxel del cuadro `frame` de un video. Se pasa a RGB
// ANTES de recortar: un recorte de 1×1 en yuv420p no existe.
export function pixelAt(path, frame, x, y) {
  const bytes = execFileSync(FFMPEG, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    path,
    '-vf',
    `select=eq(n\\,${frame}),format=rgb24,crop=1:1:${x}:${y}`,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-',
  ])
  return [...bytes.subarray(0, 3)]
}

export const isRed = ([r, g, b]) => r > 180 && g < 70 && b < 70
export const isGreen = ([r, g, b]) => g > 90 && r < 70 && b < 70
export const isBlue = ([r, g, b]) => b > 180 && r < 70 && g < 70

// Ancho y alto del video, de la línea `Stream … Video:` de ffmpeg.
export function videoSize(path) {
  const run = spawnSync(
    FFMPEG,
    ['-hide_banner', '-i', path, '-frames:v', '1', '-f', 'null', '-'],
    { encoding: 'utf8' },
  )
  const match = /Video: .*?, (\d+)x(\d+)[ ,]/.exec(run.stderr)
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null
}

// Canales, frecuencia y segundos de un WAV PCM de 16 bits. Recorre los chunks:
// ffmpeg escribe un LIST entre `fmt ` y `data`.
export async function wavInfo(path) {
  const bytes = await readFile(path)
  let offset = 12
  let channels = 0
  let sampleRate = 0
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('latin1', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    if (id === 'fmt ') {
      channels = bytes.readUInt16LE(offset + 10)
      sampleRate = bytes.readUInt32LE(offset + 12)
    }
    if (id === 'data')
      return {
        channels,
        sampleRate,
        seconds: size / (sampleRate * 2 * channels),
      }
    offset += 8 + size + (size % 2)
  }
  return { channels, sampleRate, seconds: 0 }
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

// Reloj falso del carril: `sleep` adelanta el tiempo sin dormir.
export function fakeClock(start = 0) {
  let now = start
  return {
    now: () => now,
    async sleep(ms) {
      now += ms
    },
  }
}

// El número de escena del título de un render (`vimo:<proyecto>:scene-<id>:<hash8>`).
const sceneOfTitle = (title) => /:scene-(\d+):/.exec(title ?? '')?.[1] ?? 'x'

// HeyGen simulado por ruta (molde: el de check-avatar-library.mjs). Anota cada
// llamada en `calls` (`host`, `method`, `path`, `search`, `headers`, el cuerpo
// JSON en `body` o el archivo subido en `fileName`/`fileType`). Opciones:
//  - `clip`: los bytes que sirve el CDN (`cdn.example`); `cdnStatus(path)`
//    puede devolver otro status para una ruta (una URL vencida);
//  - `create(call, n)`: la respuesta del POST n-ésimo de esa escena; sin ella
//    (o con `undefined`), `video-<escena>-<n>` en `waiting`; con el string
//    'network', el fetch falla como una red caída;
//  - `poll(videoId, n)`: la consulta n-ésima (0, 1, …) de ese video,
//    `{ status, extra }` o `{ httpStatus }`; por defecto `completed`, con
//    `video_url` en el CDN y `duration` = `clipSeconds`;
//  - `listed`: los videos crudos de `GET /v3/videos`, filtrados por substring
//    del título, como HeyGen; con `pageSize`, en páginas con `has_more` y
//    `next_token` (sin él, una sola página); `listStatus` hace fallar el
//    listado con ese status;
//  - `me`: `{ status, body }` de `GET /v3/users/me` (por defecto 10 USD);
//  - `onRequest(call, init)`: corre antes de responder (mirar el disco,
//    retener, cancelar, o esperar a que la señal del pedido —`init.signal`—
//    venza: un pedido cuya señal se cancela sale como el de un fetch real).
// Un pedido que no conoce queda en `unexpected` y responde 418; el simulacro
// no asevera nada (un assert adentro se volvería un fallo de red). El fetch
// simulado es global: UNO por test (registro de errores conocidos,
// `node-test-doble-mock-del-mismo-metodo-deja-el-global-sucio`). Un test que
// simula dos corridas (la primera falla y la segunda reanuda) no monta otro:
// llama a `reset(nuevasOpciones)`, que cambia el comportamiento y vacía lo
// anotado (llamadas, POST por escena y consultas por video) sin reinstalar el
// fetch.
export function fakeHeyGen(t, initialOptions = {}) {
  let options = initialOptions
  const calls = []
  const unexpected = []
  const postsByScene = new Map()
  const pollsByVideo = new Map()
  globalThis.fetch.mock?.restore()
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    // Con la señal ya cancelada, un fetch real ni sale.
    init.signal?.throwIfAborted()
    const target = new URL(String(url))
    const method = init.method ?? 'GET'
    const call = {
      host: target.hostname,
      method,
      path: target.pathname,
      search: target.search,
      headers: init.headers ?? {},
    }
    if (init.body instanceof FormData) {
      const file = init.body.get('file')
      call.fileName = file.name
      call.fileType = file.type
    } else if (typeof init.body === 'string') call.body = JSON.parse(init.body)
    calls.push(call)
    await options.onRequest?.(call, init)
    // Cancelado con el pedido en vuelo: sale como el AbortError de un fetch real.
    init.signal?.throwIfAborted()

    if (target.hostname === 'cdn.example') {
      const status = options.cdnStatus?.(target.pathname) ?? 200
      if (status !== 200) return new Response('expired', { status })
      return new Response(options.clip, {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      })
    }
    if (target.pathname === '/v3/users/me') {
      const me = options.me ?? {
        status: 200,
        body: {
          data: {
            username: 'user_abc123',
            billing_type: 'wallet',
            wallet: { currency: 'usd', remaining_balance: 10 },
          },
        },
      }
      return json(me.body, me.status)
    }
    if (target.pathname === '/v3/assets' && method === 'POST')
      return json({
        data: {
          asset_id: `asset-${call.fileName}`,
          url: 'https://x',
          mime_type: call.fileType,
          size_bytes: 1,
        },
      })
    if (target.pathname === '/v3/videos' && method === 'POST') {
      const scene = sceneOfTitle(call.body?.title)
      const n = (postsByScene.get(scene) ?? 0) + 1
      postsByScene.set(scene, n)
      const custom = options.create?.(call, n)
      if (custom === 'network') throw new TypeError('fetch failed')
      if (custom) return custom
      return json({
        data: {
          video_id: `video-${scene}-${n}`,
          status: 'waiting',
          output_format: 'mp4',
        },
      })
    }
    if (target.pathname === '/v3/videos' && method === 'GET') {
      if (options.listStatus)
        return json(
          { error: { code: 'server_error', message: 'Listing failed' } },
          options.listStatus,
        )

      const title = target.searchParams.get('title') ?? ''
      const matches = (options.listed ?? []).filter((video) =>
        (video.title ?? '').includes(title),
      )
      const pageSize = options.pageSize ?? Math.max(matches.length, 1)
      const start = Number(target.searchParams.get('token') ?? 0)
      const end = start + pageSize
      const nextToken = end < matches.length ? String(end) : null
      return json({
        data: matches.slice(start, end),
        has_more: nextToken !== null,
        next_token: nextToken,
      })
    }
    const video = /^\/v3\/videos\/([^/]+)$/.exec(target.pathname)
    if (video && method === 'GET') {
      const videoId = decodeURIComponent(video[1])
      const n = pollsByVideo.get(videoId) ?? 0
      pollsByVideo.set(videoId, n + 1)
      const step = options.poll?.(videoId, n) ?? { status: 'completed' }
      if (step.httpStatus)
        return json(
          {
            error: {
              code: 'not_found',
              message: 'Video not found',
              param: null,
            },
          },
          step.httpStatus,
        )
      const done =
        step.status === 'completed'
          ? {
              video_url: `https://cdn.example/${videoId}.mp4`,
              duration: options.clipSeconds ?? 7,
            }
          : {}
      return json({
        data: { id: videoId, status: step.status, ...done, ...step.extra },
      })
    }
    unexpected.push(call)
    return new Response('unexpected', { status: 418 })
  })
  const is = (method, path) => (call) =>
    call.method === method && call.path === path
  return {
    calls,
    unexpected,
    posts: () => calls.filter(is('POST', '/v3/videos')),
    uploads: () => calls.filter(is('POST', '/v3/assets')),
    lists: () => calls.filter(is('GET', '/v3/videos')),
    // La «próxima corrida» del mismo test: otras respuestas, lo anotado en
    // cero y el MISMO fetch simulado (nunca un segundo `t.mock.method`).
    reset(next = {}) {
      options = next
      calls.length = 0
      unexpected.length = 0
      postsByScene.clear()
      pollsByVideo.clear()
    },
  }
}

// El fetch real, para el test centinela del final de cada guard que lo
// simula: si un test dejó su simulacro puesto, el centinela lo detecta.
export const ORIGINAL_FETCH = globalThis.fetch
