import type { VoiceProviderId } from '@pipeline/types/voices.ts'

// Los dos carriles ElevenLabs (vía DubVoice y directo) comparten modelos,
// ajustes de síntesis y filtros de acento/categoría.
export function isElevenLabsEngine(provider: VoiceProviderId): boolean {
  return provider === 'elevenlabs' || provider === 'elevenlabs-direct'
}
