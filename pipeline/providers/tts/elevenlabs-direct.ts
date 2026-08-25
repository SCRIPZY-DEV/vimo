import { PipelineFailure } from '../../runner/failure.ts'
import type { VoiceGenerationSettings } from '../../types/voices.ts'

// ElevenLabs DIRECTO (api.elevenlabs.io, la clave del propio usuario): es el
// fallback de la narración cuando DubVoice está caído y la voz elegida es de
// ElevenLabs (port de sintetizarElevenLabsDirecto). El fallback del origen
// para Minimax/Edge dependía de un ELEVENLABS_VOICE_ID configurado por env
// que en este repo no existe — con esos motores no hay fallback (ADR-0013).
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io'
const DEFAULT_MODEL = 'eleven_multilingual_v2'
const REQUEST_TIMEOUT_MS = 300_000

export async function synthesizeElevenLabsDirect(
  text: string,
  voiceId: string,
  apiKey: string,
  settings: VoiceGenerationSettings | undefined,
  signal?: AbortSignal,
): Promise<Buffer> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(
      `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: DEFAULT_MODEL,
          voice_settings: {
            stability: settings?.stability ?? 0.5,
            similarity_boost: settings?.similarityBoost ?? 0.75,
            style: settings?.style ?? 0,
            use_speaker_boost: settings?.useSpeakerBoost ?? true,
          },
        }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      },
    )
  } catch (error) {
    if (signal?.aborted) throw error
    throw new PipelineFailure(
      'voice_network',
      `ElevenLabs request failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (response.status === 401 || response.status === 403)
    throw new PipelineFailure(
      'voice_invalid_api_key',
      `ElevenLabs rejected the API key (HTTP ${response.status})`,
    )
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200)
    throw new PipelineFailure(
      'voice_provider_error',
      `ElevenLabs HTTP ${response.status}: ${detail}`,
    )
  }

  const audio = Buffer.from(await response.arrayBuffer())
  if (!audio.length)
    throw new PipelineFailure(
      'voice_empty_audio',
      'ElevenLabs returned 0 bytes of audio',
    )

  return audio
}
