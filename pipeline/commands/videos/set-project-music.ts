import { rm } from 'node:fs/promises'

import {
  markVideoOutdated,
  readProjectMetadata,
  writeProjectMetadata,
} from '../../project/metadata.ts'
import {
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
} from '../../project/paths.ts'
import {
  downloadYouTubeAudio,
  requireYtDlpPath,
} from '../../providers/ytdlp/download.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { SetProjectMusicPayload } from '../../types/video-project.ts'
import { downloadCappedAudio } from '../../utils/download-audio.ts'
import { requireFfmpegPath } from '../../utils/ffmpeg.ts'
import { writeProjectAudioFile } from './audio-file.ts'

// Música de fondo del proyecto desde el editor: YouTube (yt-dlp), una URL
// directa (la variación Suno elegida — la GENERACIÓN reusa el subcomando
// generate-music del dominio music, acá solo llega la URL ganadora), un
// archivo local, o quitarla. Todos los caminos marcan el video como
// desactualizado: la mezcla vive en el render.

// Tope de descarga por URL (port del cap del origen).
export const MAX_BGM_BYTES = 50 * 1024 * 1024

export async function setProjectMusic(context: PipelineContext): Promise<null> {
  const payload = context.job.payload as SetProjectMusicPayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )

  const projectDir = resolveProjectDir(
    projectsRootOf(context),
    payload.projectId,
  )
  const paths = resolveProjectPaths(projectDir, payload.projectId)
  const metadata = await readProjectMetadata(paths)
  const options = metadata.options

  switch (payload.source) {
    case 'youtube': {
      if (!payload.url)
        throw new PipelineFailure(
          'invalid_payload',
          'source youtube requires payload.url',
        )
      await downloadYouTubeAudio(payload.url, paths.musicFile, {
        ytDlpPath: requireYtDlpPath(context.job.binaryPaths.ytDlp),
        ffmpegPath: requireFfmpegPath(context.job.binaryPaths.ffmpeg),
        signal: context.signal,
      })
      options.useBgm = true
      options.bgmMode = 'youtube'
      options.bgmUrl = payload.url
      break
    }

    case 'download-url': {
      if (!payload.url)
        throw new PipelineFailure(
          'invalid_payload',
          'source download-url requires payload.url',
        )
      await downloadCappedAudio(
        payload.url,
        paths.musicFile,
        MAX_BGM_BYTES,
        context.signal,
      )
      options.useBgm = true
      options.bgmMode = 'evolink-ai'
      delete options.bgmUrl
      break
    }

    case 'file': {
      if (!payload.audioPath)
        throw new PipelineFailure(
          'invalid_payload',
          'source file requires payload.audioPath',
        )
      await writeProjectAudioFile(
        paths.musicFile,
        payload.audioPath,
        context.job.binaryPaths.ffmpeg,
        context.signal,
      )
      options.useBgm = true
      // Un archivo local no es ninguno de los modos de generación.
      delete options.bgmMode
      delete options.bgmUrl
      delete options.bgmMusic
      break
    }

    case 'remove': {
      await rm(paths.musicFile, { force: true })
      options.useBgm = false
      delete options.bgmMode
      delete options.bgmUrl
      delete options.bgmMusic
      break
    }

    default:
      throw new PipelineFailure(
        'invalid_payload',
        `unknown source "${String(payload.source)}"`,
      )
  }

  await writeProjectMetadata(paths, metadata)
  await markVideoOutdated(paths, metadata)
  return null
}
