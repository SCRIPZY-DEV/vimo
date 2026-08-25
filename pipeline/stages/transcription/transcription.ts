import { readFile } from 'node:fs/promises'

import { isValidFile } from '../../project/paths.ts'
import { transcribeWithDeepgram } from '../../providers/transcription/deepgram.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { Stage } from '../../runner/stage.ts'
import { writeFileAtomic } from '../../utils/atomic-fs.ts'
import { requireFfmpegPath } from '../../utils/ffmpeg.ts'
import { measureExactDurationSeconds } from '../../utils/media-duration.ts'
import type { CreateVideoContext } from '../context.ts'

// Fase 2: transcripción palabra-a-palabra + duración REAL del audio.
//
// La duración del proyecto es el audio maestro DECODIFICADO, no el header
// (un MP3 VBR miente) ni la transcripción (puede desalinearse en ambos
// sentidos). Con ese valor: (1) se capan los timestamps que se pasen del
// audio real, (2) la duración total = max(audio real, última palabra) para
// cubrir la cola del TTS. Sin esto la voz se cortaba al final del video.
export const transcriptionStage: Stage<CreateVideoContext> = {
  id: 'transcription',

  async skip(context) {
    if (!(await isValidFile(context.paths.wordsFile))) return false
    // La duración medida viaja en la metadata: si falta, la fase corre de
    // nuevo (words.json solo no alcanza para cortar escenas).
    return context.metadata.audioDurationSeconds !== undefined
  },

  async run(context) {
    const apiKey = context.job.apiKeys.deepgram
    if (!apiKey)
      throw new PipelineFailure(
        'missing_api_key',
        'deepgram API key is missing',
      )

    const ffmpegPath = requireFfmpegPath(context.job.binaryPaths.ffmpeg)
    const narrationFile = context.paths.narrationFile

    // La medición decodifica el archivo entero (segundos en proyectos
    // largos): corre en paralelo con la transcripción y se cobra después.
    const durationTask = measureExactDurationSeconds(ffmpegPath, narrationFile)
    durationTask.catch(() => {})

    const audioBytes = await readFile(narrationFile)
    const words = await transcribeWithDeepgram(
      audioBytes,
      apiKey,
      context.signal,
    )

    const realAudioSeconds = await durationTask
    if (realAudioSeconds > 0) {
      for (const word of words) {
        if (word.end > realAudioSeconds) {
          word.end = realAudioSeconds
          if (word.start > realAudioSeconds) word.start = realAudioSeconds
        }
      }
    }

    await writeFileAtomic(
      context.paths.wordsFile,
      `${JSON.stringify(words, null, 2)}\n`,
    )

    const lastWordEnd = words[words.length - 1].end
    context.metadata.audioDurationSeconds =
      realAudioSeconds > 0
        ? Math.max(realAudioSeconds, lastWordEnd)
        : lastWordEnd
    context.metadata.wordCount = words.length
    await context.saveMetadata()

    return undefined
  },
}
