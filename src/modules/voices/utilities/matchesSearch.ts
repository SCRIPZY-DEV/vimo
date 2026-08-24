import { matchesSearch as matchesFields } from '@/modules/common/utilities/matchesSearch'
import type { VoiceHistoryEntry } from '@pipeline/types/voices.ts'

// Campos buscables del historial de voces: nombre, id, proveedor y texto
// narrado.
export function matchesSearch(
  entry: VoiceHistoryEntry,
  search: string,
): boolean {
  return matchesFields(
    [entry.voiceName, entry.voiceId, entry.provider, entry.text],
    search,
  )
}
