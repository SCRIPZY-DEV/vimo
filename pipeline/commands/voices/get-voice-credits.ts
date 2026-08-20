import { getDubvoiceAccount } from '../../providers/tts/dubvoice.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { VoiceCreditsResult } from '../../types/voices.ts'

// Saldo de créditos de DubVoice (compartido por los tres motores TTS).
export async function getVoiceCredits(
  context: PipelineContext,
): Promise<VoiceCreditsResult> {
  const apiKey = context.job.apiKeys.dubvoice
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'dubvoice API key is missing')

  return getDubvoiceAccount(apiKey, context.signal)
}
