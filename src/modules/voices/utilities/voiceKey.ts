import type { VoiceSummary } from '@pipeline/types/voices.ts'

// Clave estable de una voz cruzando providers (los voice_id pueden chocar).
export function voiceKey(voice: VoiceSummary): string {
  return `${voice.provider}:${voice.voiceId}`
}
