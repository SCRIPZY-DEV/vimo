import {
  TTS_VENDOR_IDS,
  resolveTtsVendor,
} from '../../providers/tts/vendors.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  VoiceCreditsPayload,
  VoiceCreditsResult,
} from '../../types/voices.ts'

// Saldo del vendor de voces: créditos de DubVoice (compartidos por sus tres
// motores) o cuota de caracteres de ElevenLabs. Sin payload → DubVoice.
export async function getVoiceCredits(
  context: PipelineContext,
): Promise<VoiceCreditsResult> {
  const payload = context.job.payload as VoiceCreditsPayload | undefined
  const vendor = resolveTtsVendor(payload?.vendor ?? 'dubvoice')
  if (!vendor)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.vendor must be one of: ${TTS_VENDOR_IDS}`,
    )

  const apiKey = vendor.apiKeyOf(context.job.apiKeys)
  if (!apiKey)
    throw new PipelineFailure(
      'missing_api_key',
      `${vendor.id} API key is missing`,
    )

  return vendor.getCredits(apiKey, context.signal)
}
