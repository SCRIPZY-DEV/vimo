import { matchesSearch } from './matchesSearch'
import type { VoiceSummary } from '@pipeline/types/voices.ts'

// Campos buscables del catálogo de voces: nombre, id e idioma.
export function matchesVoiceSearch(
  voice: VoiceSummary,
  search: string,
): boolean {
  return matchesSearch([voice.name, voice.voiceId, voice.language], search)
}
