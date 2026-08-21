import { copyFile, rm } from 'node:fs/promises'
import { extname } from 'node:path'

import { readProjectMetadata } from '../../project/metadata.ts'
import {
  isValidFile,
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
} from '../../project/paths.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { requireFfmpegPath, runFfmpeg } from '../../utils/ffmpeg.ts'
import type { UploadNarrationPayload } from '../../types/video-project.ts'

// Guarda la narración del usuario como narration.mp3, copiándola o transcodificándola.
const TRANSCODABLE_EXTENSIONS = new Set(['.wav', '.ogg', '.m4a', '.aac'])

export async function uploadNarration(context: PipelineContext): Promise<null> {
  const payload = context.job.payload as UploadNarrationPayload | undefined
  if (!payload?.projectId || !payload.audioPath)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId and payload.audioPath are required',
    )

  const projectDir = resolveProjectDir(
    projectsRootOf(context),
    payload.projectId,
  )
  const paths = resolveProjectPaths(projectDir, payload.projectId)
  // Valida que el proyecto exista antes de escribirle adentro.
  await readProjectMetadata(paths)

  if (!(await isValidFile(payload.audioPath)))
    throw new PipelineFailure(
      'narration_source_missing',
      `audio file not found or empty: ${payload.audioPath}`,
    )

  const extension = extname(payload.audioPath).toLowerCase()
  if (extension === '.mp3') {
    await copyFile(payload.audioPath, paths.narrationFile)
  } else if (TRANSCODABLE_EXTENSIONS.has(extension)) {
    const ffmpegPath = requireFfmpegPath(context.job.binaryPaths.ffmpeg)
    await runFfmpeg(
      ffmpegPath,
      [
        '-y',
        '-i',
        payload.audioPath,
        '-c:a',
        'libmp3lame',
        '-q:a',
        '2',
        paths.narrationFile,
      ],
      { signal: context.signal },
    )
  } else {
    throw new PipelineFailure(
      'narration_unsupported_format',
      `unsupported audio extension "${extension}"`,
    )
  }

  await rm(paths.wordsFile, { force: true })
  await rm(paths.scenesFile, { force: true })

  return null
}
