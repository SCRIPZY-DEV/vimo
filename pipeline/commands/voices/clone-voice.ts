import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'

import { cloneAi33Voice } from '../../providers/tts/ai33.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { CloneVoicePayload, CloneVoiceResult } from '../../types/voices.ts'
import { requireFfmpegPath } from '../../utils/ffmpeg.ts'
import { measureDurationSeconds } from '../../utils/media-duration.ts'

// Límites de la muestra: los mismos que valida el panel web de ai33 antes de
// enviarla (la API solo documenta los 10 MB).
const NAME_LIMIT = 100
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const MIN_AUDIO_SECONDS = 3
const MAX_AUDIO_SECONDS = 30
const CLONE_AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'm4a',
  'aac',
  'ogg',
  'webm',
  'flac',
  'opus',
]

// Clona una voz en la cuenta de ai33 con la muestra que eligió la persona.
// Todo se valida ANTES de enviar: un archivo inválido no llega a ai33. Los
// mensajes de fallo nunca llevan la ruta del archivo (es del usuario).
export async function cloneVoiceCommand(
  context: PipelineContext,
): Promise<CloneVoiceResult> {
  const payload = context.job.payload as CloneVoicePayload | undefined
  const name = payload?.name?.trim()
  const audioPath = payload?.audioPath?.trim()
  if (!name || !audioPath)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.name and payload.audioPath are required',
    )

  const apiKey = context.job.apiKeys.ai33
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'ai33 API key is missing')

  const extension = extname(audioPath).slice(1).toLowerCase()
  if (!CLONE_AUDIO_EXTENSIONS.includes(extension))
    throw new PipelineFailure(
      'voice_clone_audio_invalid',
      `unsupported sample extension ".${extension}"`,
    )

  let audio: Buffer
  try {
    audio = await readFile(audioPath)
  } catch {
    throw new PipelineFailure(
      'voice_clone_audio_invalid',
      'could not read the voice sample',
    )
  }
  if (!audio.length || audio.length > MAX_AUDIO_BYTES)
    throw new PipelineFailure(
      'voice_clone_audio_invalid',
      `the sample must be between 1 byte and ${MAX_AUDIO_BYTES} bytes (got ${audio.length})`,
    )

  // 0 = ffmpeg no lo reconoce como audio (extensión correcta, contenido no).
  const seconds = await measureDurationSeconds(
    requireFfmpegPath(context.job.binaryPaths.ffmpeg),
    audioPath,
  )
  if (seconds <= 0)
    throw new PipelineFailure(
      'voice_clone_audio_invalid',
      'the voice sample is not a readable audio file',
    )
  if (seconds < MIN_AUDIO_SECONDS || seconds > MAX_AUDIO_SECONDS)
    throw new PipelineFailure(
      'voice_clone_duration_invalid',
      `the sample lasts ${seconds.toFixed(1)} s; it must last between ${MIN_AUDIO_SECONDS} and ${MAX_AUDIO_SECONDS} s`,
    )

  const voice = await cloneAi33Voice(
    apiKey,
    {
      name: name.slice(0, NAME_LIMIT),
      audio,
      fileName: basename(audioPath),
      removeBackground: payload?.removeBackground ?? false,
    },
    context.signal,
  )

  return { voice }
}
