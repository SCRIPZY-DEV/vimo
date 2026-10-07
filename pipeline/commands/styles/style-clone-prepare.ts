import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { validateImageBytes } from '../../providers/image/download.ts'
import {
  readYouTubeInfo,
  requireYtDlpPath,
  validateYouTubeUrl,
} from '../../providers/ytdlp/download.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure, toPipelineFailure } from '../../runner/failure.ts'
import type {
  StyleCloneMaterialKind,
  StyleClonePreparePayload,
  StyleClonePrepareResult,
} from '../../types/style-clone.ts'
import { ensureDirectory, writeFileAtomic } from '../../utils/atomic-fs.ts'
import { requireFfmpegPath, runFfmpeg } from '../../utils/ffmpeg.ts'
import {
  jpegSize,
  pickStoryboard,
  spreadIndexes,
  youtubeVideoIdOf,
  type Storyboard,
} from './style-clone-material.ts'
import {
  assertValidCloneSessionId,
  cloneSessionDirectory,
  toMaterialItem,
  writeCloneMaterial,
  type StoredCloneMaterial,
  type StoredCloneMaterialItem,
} from './style-clone-store.ts'

// Topes del material, los mismos que acepta el servidor (`pedido.ts` de
// vimo-landing): 10 mosaicos, 3 fotogramas y la miniatura de un video, o 10
// imágenes del usuario; con menos de 2 imágenes de un video no hay muestra.
const MAX_MOSAICS = 10
const PUBLIC_FRAMES = 3
export const MAX_CLONE_IMAGES = 10
const MIN_VIDEO_IMAGES = 2
// Lado mayor de una imagen del usuario ya achicada para el modelo.
const IMAGE_MAX_SIDE = 1536
const MAX_SOURCE_IMAGE_BYTES = 30 * 1024 * 1024
const TITLE_CHAR_LIMIT = 300
const DOWNLOAD_TIMEOUT_MS = 30_000
// El cliente de YouTube que responde cuando el de siempre está bloqueado.
const BOT_BLOCK_PLAYER_CLIENT = 'mweb'

const MATERIAL_FILE_PATTERN =
  /^(?:(?:mosaic|frame|image)-\d+\.jpg|thumbnail\.jpg|material\.json)$/

type MaterialDraft = Omit<StoredCloneMaterialItem, 'mimeType'>

// Junta en la carpeta de la sesión lo que va a mirar el modelo. De un video:
// hasta 10 mosaicos del storyboard repartidos por todo el video, 3 fotogramas
// públicos, la miniatura y el título. De imágenes del usuario: cada una
// validada por sus bytes y achicada a JPEG.
//
// YouTube bloquea algunas redes como bot: el storyboard se pide con el
// cliente de siempre y, si sale ese bloqueo, con `mweb`. Si igual no hay
// storyboard la clonación sigue con los fotogramas públicos, sin avisar
// (decisión del dueño: es lo que hace Imperio Pro). Solo falla con menos de
// dos imágenes, y entonces con el motivo que dio yt-dlp.
export async function styleClonePrepare(
  context: PipelineContext,
): Promise<StyleClonePrepareResult> {
  const payload = context.job.payload as StyleClonePreparePayload | undefined
  assertValidCloneSessionId(payload?.sessionId)
  const source = payload.source
  if (!source || typeof source !== 'object')
    throw new PipelineFailure('invalid_payload', 'payload.source is required')

  const directory = cloneSessionDirectory(context, payload.sessionId)

  if (source.kind === 'youtube') {
    // El link se valida antes de tocar el disco o la red.
    const videoUrl = validateYouTubeUrl(source.url)
    const videoId = youtubeVideoIdOf(videoUrl)
    if (!videoId)
      throw new PipelineFailure(
        'ytdlp_invalid_url',
        'the link is not a YouTube video',
        { provider: 'ytdlp' },
      )
    await resetMaterial(directory)
    return prepareVideo(context, directory, videoUrl, videoId)
  }

  if (source.kind === 'images') {
    const paths = source.paths
    if (
      !Array.isArray(paths) ||
      paths.length === 0 ||
      paths.length > MAX_CLONE_IMAGES ||
      paths.some((path) => typeof path !== 'string' || !path)
    )
      throw new PipelineFailure(
        'invalid_payload',
        `payload.source.paths must list 1 to ${MAX_CLONE_IMAGES} image paths`,
      )
    await resetMaterial(directory)
    return prepareImages(context, directory, paths)
  }

  throw new PipelineFailure(
    'invalid_payload',
    'payload.source.kind must be youtube or images',
  )
}

// Preparar de nuevo (otro link, o un reintento) reemplaza el material: las
// pruebas ya dibujadas de la sesión no se tocan.
async function resetMaterial(directory: string): Promise<void> {
  await ensureDirectory(directory)
  for (const file of await readdir(directory)) {
    if (MATERIAL_FILE_PATTERN.test(file))
      await rm(join(directory, file), { force: true })
  }
}

function reportStage(
  context: PipelineContext,
  stage: 'storyboard' | 'frames' | 'images',
  percent: number,
): void {
  context.emitter.emit({ type: 'progress', percent, detail: { stage } })
}

async function finish(
  directory: string,
  stored: StoredCloneMaterial,
): Promise<StyleClonePrepareResult> {
  await writeCloneMaterial(directory, stored)
  return {
    material: stored.items.map((item) => toMaterialItem(directory, item)),
    title: stored.title,
    rejectedImages: [],
  }
}

const toStored = (draft: MaterialDraft): StoredCloneMaterialItem => ({
  ...draft,
  mimeType: 'image/jpeg',
})

// ── Video de YouTube ──

async function prepareVideo(
  context: PipelineContext,
  directory: string,
  videoUrl: string,
  videoId: string,
): Promise<StyleClonePrepareResult> {
  reportStage(context, 'storyboard', 0)
  const { info, failure } = await readVideoInfo(context, videoUrl)
  const storyboard = pickStoryboard(info)
  const mosaics = storyboard
    ? await downloadMosaics(context, directory, storyboard)
    : []

  reportStage(context, 'frames', 60)
  const frames = await downloadPublicFrames(context, directory, videoId)
  const thumbnail = await downloadThumbnail(context, directory, videoId)
  const items = [...mosaics, ...frames, ...(thumbnail ? [thumbnail] : [])]

  if (items.length < MIN_VIDEO_IMAGES) {
    // Privado, borrado o restringido: el motivo de yt-dlp es el que sirve.
    if (failure) throw failure
    throw new PipelineFailure(
      'style_clone_no_material',
      `the video gave ${items.length} image(s); at least ${MIN_VIDEO_IMAGES} are needed`,
    )
  }

  const title = (await readVideoTitle(context, videoUrl)) || titleFromInfo(info)
  reportStage(context, 'frames', 100)
  return finish(directory, {
    source: 'youtube',
    videoUrl,
    title: title.slice(0, TITLE_CHAR_LIMIT),
    items: items.map(toStored),
  })
}

// La ficha del video, o por qué no se pudo leer. Nunca corta la clonación:
// sin ficha no hay storyboard y se sigue con los fotogramas públicos.
async function readVideoInfo(
  context: PipelineContext,
  videoUrl: string,
): Promise<{ info: unknown; failure: PipelineFailure | null }> {
  try {
    const options = {
      ytDlpPath: requireYtDlpPath(context.job.binaryPaths.ytDlp),
      signal: context.signal,
    }
    try {
      return { info: await readYouTubeInfo(videoUrl, options), failure: null }
    } catch (error) {
      context.signal.throwIfAborted()
      if (toPipelineFailure(error).code !== 'ytdlp_needs_login') throw error
      context.emitter.emit({
        type: 'log',
        level: 'warn',
        message: `YouTube blocked the default client: retrying with ${BOT_BLOCK_PLAYER_CLIENT}`,
      })
      return {
        info: await readYouTubeInfo(videoUrl, options, BOT_BLOCK_PLAYER_CLIENT),
        failure: null,
      }
    }
  } catch (error) {
    context.signal.throwIfAborted()
    const failure = toPipelineFailure(error)
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `no storyboard for the style clone (${failure.code}): going on with the public frames`,
    })
    return { info: null, failure }
  }
}

function titleFromInfo(info: unknown): string {
  const title = (info as { title?: unknown } | null)?.title
  return typeof title === 'string' ? title.trim() : ''
}

// Las imágenes de un video solo se bajan de los servidores de imágenes de
// YouTube: la URL de un mosaico viene de la ficha, que es dato de afuera.
function isYouTubeImageUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    const host = url.hostname.toLowerCase()
    return (
      url.protocol === 'https:' &&
      (host === 'ytimg.com' || host.endsWith('.ytimg.com'))
    )
  } catch {
    return false
  }
}

// Los bytes de una imagen de YouTube ya como JPEG, o null si no está (un
// fotograma que no existe responde 404 con una imagen de relleno).
async function fetchYouTubeJpeg(
  context: PipelineContext,
  url: string,
  temporaryPath: string,
): Promise<Buffer | null> {
  if (!isYouTubeImageUrl(url)) return null

  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.any([
        context.signal,
        AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      ]),
    })
  } catch {
    context.signal.throwIfAborted()
    return null
  }
  if (!response.ok) return null

  const image = validateImageBytes(Buffer.from(await response.arrayBuffer()))
  if (!image) return null
  if (image.ext === 'jpg') return image.bytes

  // Algunos videos entregan WEBP: el material viaja siempre como JPEG.
  await writeFileAtomic(temporaryPath, image.bytes)
  try {
    return await transcodeToJpeg(context, temporaryPath, `${temporaryPath}.jpg`)
  } catch {
    context.signal.throwIfAborted()
    return null
  } finally {
    await rm(temporaryPath, { force: true })
    await rm(`${temporaryPath}.jpg`, { force: true })
  }
}

async function transcodeToJpeg(
  context: PipelineContext,
  sourcePath: string,
  outputPath: string,
): Promise<Buffer> {
  await runFfmpeg(
    requireFfmpegPath(context.job.binaryPaths.ffmpeg),
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      outputPath,
    ],
    { signal: context.signal },
  )
  return readFile(outputPath)
}

async function downloadMosaics(
  context: PipelineContext,
  directory: string,
  storyboard: Storyboard,
): Promise<MaterialDraft[]> {
  // El segundo en que empieza cada mosaico: la suma de los anteriores.
  const starts: number[] = []
  let elapsed = 0
  for (const fragment of storyboard.fragments) {
    starts.push(elapsed)
    elapsed += fragment.durationSeconds
  }

  const picked = spreadIndexes(storyboard.fragments.length, MAX_MOSAICS)
  const downloads = await Promise.all(
    picked.map(async (index) => ({
      index,
      bytes: await fetchYouTubeJpeg(
        context,
        storyboard.fragments[index].url,
        join(directory, `mosaic-download-${index}`),
      ),
    })),
  )
  context.signal.throwIfAborted()

  const mosaics: MaterialDraft[] = []
  for (const { index, bytes } of downloads) {
    if (!bytes) continue
    const file = `mosaic-${mosaics.length + 1}.jpg`
    await writeFileAtomic(join(directory, file), bytes)

    // El último mosaico de un video suele traer menos filas que el resto.
    const size = jpegSize(bytes)
    const gridOf = (pixels: number | undefined, cell: number, most: number) =>
      pixels ? Math.min(most, Math.max(1, Math.round(pixels / cell))) : most
    mosaics.push({
      kind: 'mosaic',
      file,
      rows: gridOf(size?.height, storyboard.cellHeight, storyboard.rows),
      columns: gridOf(size?.width, storyboard.cellWidth, storyboard.columns),
      startSeconds: starts[index],
      ...(storyboard.fps ? { secondsPerCell: 1 / storyboard.fps } : {}),
    })
  }
  return mosaics
}

const publicImageUrl = (videoId: string, name: string) =>
  `https://i.ytimg.com/vi/${videoId}/${name}.jpg`

// La primera variante que exista de una imagen pública del video, de la más
// grande a la más chica.
async function downloadFirstAvailable(
  context: PipelineContext,
  directory: string,
  videoId: string,
  names: string[],
): Promise<Buffer | null> {
  for (const name of names) {
    const bytes = await fetchYouTubeJpeg(
      context,
      publicImageUrl(videoId, name),
      join(directory, `public-download-${name}`),
    )
    if (bytes) return bytes
  }
  return null
}

// Los tres fotogramas que YouTube saca solo de cada video (al 25, 50 y 75 %):
// responden siempre, sin clave ni bloqueo.
async function downloadPublicFrames(
  context: PipelineContext,
  directory: string,
  videoId: string,
): Promise<MaterialDraft[]> {
  const downloads = await Promise.all(
    Array.from({ length: PUBLIC_FRAMES }, (_, index) =>
      downloadFirstAvailable(context, directory, videoId, [
        `maxres${index + 1}`,
        `sd${index + 1}`,
        `hq${index + 1}`,
      ]),
    ),
  )
  context.signal.throwIfAborted()

  const frames: MaterialDraft[] = []
  for (const bytes of downloads) {
    if (!bytes) continue
    const file = `frame-${frames.length + 1}.jpg`
    await writeFileAtomic(join(directory, file), bytes)
    frames.push({ kind: 'frame', file })
  }
  return frames
}

async function downloadThumbnail(
  context: PipelineContext,
  directory: string,
  videoId: string,
): Promise<MaterialDraft | null> {
  const bytes = await downloadFirstAvailable(context, directory, videoId, [
    'maxresdefault',
    'sddefault',
    'hqdefault',
  ])
  if (!bytes) return null

  const file = 'thumbnail.jpg'
  await writeFileAtomic(join(directory, file), bytes)
  return { kind: 'thumbnail', file }
}

// El título por oEmbed, que responde aunque el video esté bloqueado para
// yt-dlp. '' = no lo entregó (queda el de la ficha, si hubo).
async function readVideoTitle(
  context: PipelineContext,
  videoUrl: string,
): Promise<string> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
      {
        signal: AbortSignal.any([
          context.signal,
          AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        ]),
      },
    )
    if (!response.ok) return ''
    const title = ((await response.json()) as { title?: unknown }).title
    return typeof title === 'string' ? title.trim() : ''
  } catch {
    context.signal.throwIfAborted()
    return ''
  }
}

// ── Imágenes del usuario ──

// Cada imagen se valida por sus bytes (nunca por la extensión) y se achica a
// un JPEG de hasta 1 536 px de lado mayor, sin agrandar las chicas. Con una
// sola inválida no se prepara nada: la app la marca y pide quitarla.
async function prepareImages(
  context: PipelineContext,
  directory: string,
  paths: string[],
): Promise<StyleClonePrepareResult> {
  const kind: StyleCloneMaterialKind = 'image'
  const items: MaterialDraft[] = []
  const rejectedImages: number[] = []

  for (const [index, path] of paths.entries()) {
    reportStage(context, 'images', Math.round((index / paths.length) * 100))
    const file = `image-${index + 1}.jpg`
    if (await normalizeImage(context, path, join(directory, file)))
      items.push({ kind, file })
    else rejectedImages.push(index + 1)
  }
  context.signal.throwIfAborted()

  if (rejectedImages.length > 0) {
    await resetMaterial(directory)
    return { material: [], title: '', rejectedImages }
  }
  reportStage(context, 'images', 100)
  return finish(directory, {
    source: 'images',
    title: '',
    items: items.map(toStored),
  })
}

async function normalizeImage(
  context: PipelineContext,
  sourcePath: string,
  outputPath: string,
): Promise<boolean> {
  let bytes: Buffer
  try {
    bytes = await readFile(sourcePath)
  } catch {
    return false
  }
  if (!bytes.length || bytes.length > MAX_SOURCE_IMAGE_BYTES) return false
  if (!validateImageBytes(bytes)) return false

  try {
    await runFfmpeg(
      requireFfmpegPath(context.job.binaryPaths.ffmpeg),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        sourcePath,
        '-vf',
        `scale=w='min(${IMAGE_MAX_SIDE},iw)':h='min(${IMAGE_MAX_SIDE},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        outputPath,
      ],
      { signal: context.signal },
    )
    return true
  } catch (error) {
    context.signal.throwIfAborted()
    // Sin FFmpeg no hay imagen que valga: es un fallo del job, no de la foto.
    if (toPipelineFailure(error).code === 'ffmpeg_missing') throw error
    return false
  }
}
