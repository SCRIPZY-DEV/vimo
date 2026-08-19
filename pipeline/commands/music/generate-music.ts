import { generateMusic } from '../../providers/music/evolink.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  MusicGenerationParams,
  MusicGenerationResult,
} from '../../types/music.ts'

// Genera variaciones de música con Evolink (Suno) y reporta el avance del
// polling como eventos `progress`; las opciones vuelven en el job-completed.
export async function generateMusicCommand(
  context: PipelineContext,
): Promise<MusicGenerationResult> {
  const params = context.job.payload as MusicGenerationParams | undefined
  if (!params?.prompt?.trim())
    throw new PipelineFailure('invalid_payload', 'payload.prompt is required')

  const apiKey = context.job.apiKeys.evolink
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'evolink API key is missing')

  return generateMusic(params, {
    apiKey,
    signal: context.signal,
    callbacks: {
      onEstimatedCredits(credits) {
        context.emitter.emit({
          type: 'progress',
          percent: 0,
          detail: { estimatedCredits: credits },
        })
      },
      onProgress(progress) {
        context.emitter.emit({
          type: 'progress',
          percent: progress.percent,
          detail: {
            status: progress.status,
            elapsedSeconds: progress.elapsedSeconds,
          },
        })
      },
    },
  })
}
