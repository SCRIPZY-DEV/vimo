import { matchesVoiceSearch } from '@/modules/common/utilities/matchesVoiceSearch'
import { languageMatches } from './languageMatches'
import type { VoiceSummary } from '@pipeline/types/voices.ts'
import type { VoiceFilterState } from '../types/voices'

// Filtrado client-side sobre el catálogo cargado. Para los catálogos
// completos cubre todos los filtros; para los paginados server-side,
// búsqueda, idioma y género ya vienen filtrados — acá solo se aplican
// acento/categoría sobre las páginas cargadas (y ni categoría cuando el
// server también la filtró, como en la biblioteca de ElevenLabs).
export function filterVoices(
  voices: VoiceSummary[],
  filters: VoiceFilterState,
  options: { serverFiltered: boolean; serverFilteredCategory?: boolean },
): VoiceSummary[] {
  return voices.filter((voice) => {
    if (filters.accent && voice.accent !== filters.accent) return false
    if (
      filters.category &&
      !options.serverFilteredCategory &&
      voice.category !== filters.category
    )
      return false
    if (filters.onlyClones && !voice.isClone) return false
    if (filters.onlyWithPreview && !voice.previewUrl) return false
    if (options.serverFiltered) return true

    if (!matchesVoiceSearch(voice, filters.search)) return false

    if (
      filters.language &&
      !(voice.language && languageMatches(voice.language, filters.language))
    )
      return false
    if (filters.gender && voice.gender?.toLowerCase() !== filters.gender)
      return false

    return true
  })
}
