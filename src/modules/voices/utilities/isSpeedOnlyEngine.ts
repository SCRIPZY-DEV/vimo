import type { VoiceProviderId } from '@pipeline/types/voices.ts'

// Motores cuyo único ajuste es `speed` (0.5–1.5): Vbee y Fish Audio vía
// DubVoice, y ai33, que en su API v3 solo recibe la voz y la velocidad.
export function isSpeedOnlyEngine(provider: VoiceProviderId): boolean {
  return provider === 'vbee' || provider === 'fishaudio' || provider === 'ai33'
}
