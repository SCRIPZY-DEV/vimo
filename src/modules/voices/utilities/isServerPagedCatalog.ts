import type { VoiceProviderId, VoiceSource } from '@pipeline/types/voices.ts'
import { isDubvoiceCatalogEngine } from './isDubvoiceCatalogEngine'

// Catálogos que paginan en el server (y filtran allá búsqueda/idioma/género):
// los motores del catálogo v1 de DubVoice (ElevenLabs ~12k voces, Vbee, Fish
// Audio), la Voice Library de ai33 y la biblioteca pública de ElevenLabs. El
// resto llega completo y se rebana en cliente.
export function isServerPagedCatalog(
  provider: VoiceProviderId,
  source?: VoiceSource,
): boolean {
  if (provider === 'elevenlabs' || provider === 'ai33') return true
  if (isDubvoiceCatalogEngine(provider)) return true
  return provider === 'elevenlabs-direct' && source === 'library'
}
