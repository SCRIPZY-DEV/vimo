import {
  addLibraryVoice,
  elevenLabsDirectProvider,
} from '../../providers/tts/elevenlabs-direct.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  AddLibraryVoicePayload,
  AddLibraryVoiceResult,
} from '../../types/voices.ts'

// Ids de ElevenLabs: alfanuméricos. Vienen del webview, así que se validan
// antes de interpolarlos en la URL.
const ELEVENLABS_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
const NAME_LIMIT = 100

// Una voz de la biblioteca pública de ElevenLabs no se puede sintetizar hasta
// añadirla a la cuenta. Devuelve el voice_id de cuenta con el que la UI
// reemplaza a la voz de biblioteca en todo lo que persiste.
export async function addLibraryVoiceCommand(
  context: PipelineContext,
): Promise<AddLibraryVoiceResult> {
  const payload = context.job.payload as AddLibraryVoicePayload | undefined
  if (
    !payload?.libraryOwnerId ||
    !payload.voiceId ||
    !payload.name?.trim() ||
    !ELEVENLABS_ID_PATTERN.test(payload.libraryOwnerId) ||
    !ELEVENLABS_ID_PATTERN.test(payload.voiceId)
  )
    throw new PipelineFailure(
      'invalid_payload',
      'payload.libraryOwnerId, payload.voiceId and payload.name are required',
    )

  const apiKey = elevenLabsDirectProvider.apiKeyOf(context.job.apiKeys)
  if (!apiKey)
    throw new PipelineFailure(
      'missing_api_key',
      'elevenlabs API key is missing',
    )

  const voiceId = await addLibraryVoice(
    apiKey,
    { ...payload, name: payload.name.trim().slice(0, NAME_LIMIT) },
    context.signal,
  )

  return { voiceId }
}
