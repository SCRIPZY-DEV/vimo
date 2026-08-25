import { matchesSearch as matchesFields } from '@/modules/common/utilities/matchesSearch'
import type { MusicHistoryEntry } from '@pipeline/types/music.ts'

// Campos buscables del historial de música: nombre, título, prompt y estilo.
export function matchesSearch(
  entry: MusicHistoryEntry,
  search: string,
): boolean {
  return matchesFields(
    [entry.name, entry.title, entry.prompt, entry.style],
    search,
  )
}
