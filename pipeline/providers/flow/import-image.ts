import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { requireFfmpegPath, runFfmpeg } from '../../utils/ffmpeg.ts'
import { validateImageBytes } from '../image/download.ts'
import { flowHash, withFlowLock, writeFlowFile } from './storage.ts'

export async function imageFileHash(path: string): Promise<string | null> {
  try {
    return flowHash(await readFile(path))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

// Decodifica realmente antes de publicar. JPEG conserva sus bytes; PNG/WebP
// se convierten mediante el FFmpeg empaquetado, incluida su autorrotación.
export async function flowJpeg(
  context: PipelineContext,
  bytes: Buffer,
): Promise<Buffer> {
  const ffmpeg = requireFfmpegPath(context.job.binaryPaths.ffmpeg)
  if (!context.job.flowRuntime)
    throw new PipelineFailure(
      'flow_not_connected',
      'Flow runtime is unavailable',
    )
  const directory = join(context.job.flowRuntime.dataDir, 'import-staging')
  const image = validateImageBytes(bytes)
  if (!image)
    throw new PipelineFailure(
      'flow_result_invalid',
      'Unsupported Flow image format',
    )
  const source = join(directory, `${randomUUID()}.${image.ext}`)
  const destination = join(directory, `${randomUUID()}.jpg`)
  await writeFlowFile(source, bytes)
  try {
    await runFfmpeg(
      ffmpeg,
      [
        '-v',
        'error',
        '-xerror',
        '-i',
        source,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-f',
        'null',
        '-',
      ],
      { signal: context.signal },
    )
    if (image.ext === 'jpg') return bytes
    await runFfmpeg(
      ffmpeg,
      [
        '-v',
        'error',
        '-xerror',
        '-i',
        source,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-q:v',
        '2',
        '-update',
        '1',
        destination,
      ],
      { signal: context.signal },
    )
    const jpeg = await readFile(destination)
    if (validateImageBytes(jpeg)?.ext !== 'jpg')
      throw new PipelineFailure(
        'flow_result_invalid',
        'Flow conversion did not produce JPEG',
      )
    return jpeg
  } catch (error) {
    context.signal.throwIfAborted()
    if (error instanceof PipelineFailure && error.code === 'ffmpeg_missing')
      throw error
    throw new PipelineFailure(
      'flow_result_invalid',
      'Flow image could not be decoded safely',
    )
  } finally {
    await Promise.all([
      unlink(source).catch(() => {}),
      unlink(destination).catch(() => {}),
    ])
  }
}

export async function importFlowImage(
  context: PipelineContext,
  options: {
    destination: string
    bytes: Buffer
    previousHash: string | null
    isCurrent(): Promise<boolean>
  },
): Promise<string> {
  if (!(await options.isCurrent()))
    throw new PipelineFailure(
      'flow_result_obsolete',
      'The image destination no longer exists',
    )
  const jpeg = await flowJpeg(context, options.bytes)
  await withFlowLock(
    `${options.destination}.flow.lock`,
    async () => {
      context.signal.throwIfAborted()
      if (!(await options.isCurrent()))
        throw new PipelineFailure(
          'flow_result_obsolete',
          'The image scene revision changed during generation',
        )
      const currentHash = await imageFileHash(options.destination)
      // Replay tras un cierre entre rename y recibo: el mismo JPEG ya publicado.
      if (currentHash === flowHash(jpeg)) return
      if (currentHash !== options.previousHash)
        throw new PipelineFailure(
          'flow_result_obsolete',
          'Another image replaced this destination during generation',
        )
      await writeFlowFile(options.destination, jpeg)
    },
    false,
  )
  return flowHash(jpeg)
}
