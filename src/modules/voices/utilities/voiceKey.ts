import type { VoiceSummary } from '@pipeline/types/voices.ts'

// Clave estable de una voz cruzando providers (los voice_id pueden chocar).
// Acepta cualquier objeto con provider y voiceId: la voz elegida en Crear no
// es un VoiceSummary completo.
export function voiceKey(
  voice: Pick<VoiceSummary, 'provider' | 'voiceId'>,
): string {
  return `${voice.provider}:${voice.voiceId}`
}
