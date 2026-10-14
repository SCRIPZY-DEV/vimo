import { deleteAi33ClonedVoice } from '../../providers/tts/ai33.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { DeleteClonedVoicePayload } from '../../types/voices.ts'

// Solo voces clonadas de ai33 (`clone_<id>`): el id viene del webview y se
// interpola en la URL, así que se valida antes.
const CLONED_VOICE_ID_PATTERN = /^clone_[a-zA-Z0-9_-]+$/

// Borra una voz clonada de la cuenta de ai33.
export async function deleteClonedVoiceCommand(
  context: PipelineContext,
): Promise<null> {
  const payload = context.job.payload as DeleteClonedVoicePayload | undefined
  if (!payload?.voiceId || !CLONED_VOICE_ID_PATTERN.test(payload.voiceId))
    throw new PipelineFailure(
      'invalid_payload',
      'payload.voiceId must be an ai33 cloned voice id',
    )

  const apiKey = context.job.apiKeys.ai33
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'ai33 API key is missing')

  await deleteAi33ClonedVoice(apiKey, payload.voiceId, context.signal)

  return null
}
