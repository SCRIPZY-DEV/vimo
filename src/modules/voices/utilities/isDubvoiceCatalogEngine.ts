import type { VoiceProviderId } from '@pipeline/types/voices.ts'

// Motores que DubVoice sirve por su catálogo v1 paginado y sintetiza por
// tarea asíncrona con `speed` como único ajuste: Vbee y Fish Audio.
// ElevenLabs vía DubVoice comparte el transporte pero tiene sus propios
// modelos, ajustes y filtros (isElevenLabsEngine).
export function isDubvoiceCatalogEngine(provider: VoiceProviderId): boolean {
  return provider === 'vbee' || provider === 'fishaudio'
}
