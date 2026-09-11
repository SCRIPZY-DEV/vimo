import { VOICE_COST_FACTORS } from '@/modules/voices/constants'
import type { VoiceProviderId } from '@pipeline/types/voices.ts'

// Unidades del vendor que cuesta sintetizar N caracteres con ese motor
// (créditos DubVoice o caracteres ElevenLabs).
export function estimateVoiceCost(
  provider: VoiceProviderId,
  characters: number,
): number {
  return Math.ceil(characters * VOICE_COST_FACTORS[provider])
}
