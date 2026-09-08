import type { VoiceProviderId, VoiceSource } from '@pipeline/types/voices.ts'

// Catálogos que paginan en el server (y filtran allá búsqueda/idioma/género):
// ElevenLabs vía DubVoice (~12k voces) y la biblioteca pública de ElevenLabs.
// El resto llega completo y se rebana en cliente.
export function isServerPagedCatalog(
  provider: VoiceProviderId,
  source?: VoiceSource,
): boolean {
  if (provider === 'elevenlabs') return true
  return provider === 'elevenlabs-direct' && source === 'library'
}
