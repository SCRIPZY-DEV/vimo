import { matchesVoiceSearch } from '@/modules/common/utilities/matchesVoiceSearch'
import { languageMatches } from './languageMatches'
import type { VoiceSummary } from '@pipeline/types/voices.ts'
import type { VoiceFilterState } from '../types/voices'

// Filtrado client-side sobre el catálogo cargado. Para Minimax/Edge cubre
// todos los filtros (el listado viene completo); para ElevenLabs, búsqueda,
// idioma y género ya vienen filtrados del server — acá solo se aplican
// acento/categoría sobre las páginas cargadas.
export function filterVoices(
  voices: VoiceSummary[],
  filters: VoiceFilterState,
  options: { serverFiltered: boolean },
): VoiceSummary[] {
  return voices.filter((voice) => {
    if (filters.accent && voice.accent !== filters.accent) return false
    if (filters.category && voice.category !== filters.category) return false
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
