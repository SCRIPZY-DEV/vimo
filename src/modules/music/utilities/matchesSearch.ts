import type { MusicHistoryEntry } from '@pipeline/types/music.ts'

export function matchesSearch(
  entry: MusicHistoryEntry,
  search: string,
): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  return [entry.name, entry.title, entry.prompt, entry.style]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle))
}
