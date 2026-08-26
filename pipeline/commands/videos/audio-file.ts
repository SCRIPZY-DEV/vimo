import { copyFile } from 'node:fs/promises'
import { extname } from 'node:path'

import { isValidFile } from '../../project/paths.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { requireFfmpegPath, runFfmpeg } from '../../utils/ffmpeg.ts'

// Escritura de un audio del usuario dentro del proyecto (narración o BGM):
// mp3 se copia tal cual; el resto se transcodifica con el ffmpeg empaquetado.
// Compartido por upload-narration (Create), replace-narration y
// set-project-music (Library).

const TRANSCODABLE_EXTENSIONS = new Set(['.wav', '.ogg', '.m4a', '.aac'])

export async function writeProjectAudioFile(
  targetFile: string,
  sourcePath: string,
  ffmpegPath: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  if (!(await isValidFile(sourcePath)))
    throw new PipelineFailure(
      'narration_source_missing',
      `audio file not found or empty: ${sourcePath}`,
    )

  const extension = extname(sourcePath).toLowerCase()
  if (extension === '.mp3') {
    await copyFile(sourcePath, targetFile)
    return
  }
  if (!TRANSCODABLE_EXTENSIONS.has(extension))
    throw new PipelineFailure(
      'narration_unsupported_format',
      `unsupported audio extension "${extension}"`,
    )

  await runFfmpeg(
    requireFfmpegPath(ffmpegPath),
    ['-y', '-i', sourcePath, '-c:a', 'libmp3lame', '-q:a', '2', targetFile],
    { signal },
  )
}
