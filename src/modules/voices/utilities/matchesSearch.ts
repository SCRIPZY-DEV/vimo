import type { VoiceHistoryEntry } from '@pipeline/types/voices.ts'

// Búsqueda de texto libre sobre el historial de voces: nombre, id, proveedor
// y texto narrado. Insensible a mayúsculas; vacía coincide con todo.
export function matchesSearch(
  entry: VoiceHistoryEntry,
  search: string,
): boolean {
  const query = search.trim().toLowerCase()
  if (!query) return true
  const searchableText =
    `${entry.voiceName ?? ''} ${entry.voiceId} ${entry.provider} ${entry.text}`.toLowerCase()
  return searchableText.includes(query)
}
