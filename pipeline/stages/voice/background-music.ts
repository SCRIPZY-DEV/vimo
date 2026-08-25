import {
  generateMusic,
  downloadMusicAudio,
} from '../../providers/music/evolink.ts'
import {
  downloadYouTubeAudio,
  requireYtDlpPath,
} from '../../providers/ytdlp/download.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { requireFfmpegPath } from '../../utils/ffmpeg.ts'
import type { CreateVideoContext } from '../context.ts'

// Música de fondo → music.mp3. Dos vías del formulario: la URL de YouTube
// (yt-dlp) o la generación con IA (Evolink/Suno, provider ya portado).
export async function downloadBackgroundMusic(
  context: CreateVideoContext,
  signal: AbortSignal,
): Promise<void> {
  const options = context.options

  if (options.bgmMode === 'evolink-ai') {
    await generateBgmWithEvolink(context, signal)
    return
  }

  if (!options.bgmUrl)
    throw new PipelineFailure(
      'invalid_payload',
      'useBgm with bgmMode youtube but no bgmUrl',
    )

  await downloadYouTubeAudio(options.bgmUrl, context.paths.musicFile, {
    ytDlpPath: requireYtDlpPath(context.job.binaryPaths.ytDlp),
    ffmpegPath: requireFfmpegPath(context.job.binaryPaths.ffmpeg),
    signal,
  })
}

async function generateBgmWithEvolink(
  context: CreateVideoContext,
  signal: AbortSignal,
): Promise<void> {
  const params = context.options.bgmMusic
  if (!params?.prompt?.trim())
    throw new PipelineFailure(
      'invalid_payload',
      'useBgm with bgmMode evolink-ai but no bgmMusic.prompt',
    )

  const apiKey = context.job.apiKeys.evolink
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'evolink API key is missing')

  const startedAt = Date.now()
  const result = await generateMusic(params, {
    apiKey,
    signal,
    callbacks: {
      onProgress(progress) {
        context.emitter.emit({
          type: 'bgm-progress',
          percent: progress.percent,
          status: progress.status,
          elapsedSeconds: progress.elapsedSeconds,
        })
      },
    },
  })

  // Suno devuelve variantes; para el BGM del video se toma la primera (el
  // flujo con elección manual es el del módulo AI Music, no este).
  const chosen = result.options[0]
  if (!chosen?.audioUrl)
    throw new PipelineFailure(
      'music_generation_failed',
      'Evolink returned no audioUrl for the BGM',
    )

  await downloadMusicAudio(chosen.audioUrl, context.paths.musicFile, signal)
  context.emitter.emit({
    type: 'bgm-progress',
    percent: 100,
    status: 'completed',
    elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
  })
}
