import {
  CATALOG_PAGE_SIZE,
  ELEVENLABS_LIBRARY_CATEGORIES,
  SEARCH_DEBOUNCE_MS,
  VOICE_PAGE_SIZE,
  VOICE_PROVIDERS_BY_VENDOR,
  VOICE_TAB_CATALOGS,
} from '@/modules/voices/constants'
import { useDebouncedValue } from '@/modules/voices/hooks/useDebouncedValue'
import { useVoiceFavorites } from '@/modules/voices/hooks/useVoiceFavorites'
import { useVoices } from '@/modules/voices/hooks/useVoices'
import { filterVoices } from '@/modules/voices/utilities/filterVoices'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'
import type { VoiceFilterState, VoiceTab } from '@/modules/voices/types/voices'

interface UseVoiceCatalogPageOptions {
  vendor: VoiceVendorId
  tab: VoiceTab
  filters: VoiceFilterState
  page: number
  ready: boolean
}

/**
 * Una página del catálogo de la pestaña activa: la lista del proveedor (o los
 * favoritos del vendor), filtrada y paginada. La página Voces y el selector
 * de voz de Crear la comparten, así las dos vistas muestran exactamente lo
 * mismo: mismo contador, mismos filtros, misma paginación.
 */
export function useVoiceCatalogPage({
  vendor,
  tab,
  filters,
  page,
  ready,
}: UseVoiceCatalogPageOptions) {
  const { favorites } = useVoiceFavorites()

  const catalog = tab === 'favorites' ? null : VOICE_TAB_CATALOGS[tab]
  const provider = catalog?.provider ?? null
  const source = catalog?.source
  // Favoritos del vendor visible: los del otro siguen guardados.
  const vendorFavorites = favorites.filter((favorite) =>
    VOICE_PROVIDERS_BY_VENDOR[vendor].includes(favorite.provider),
  )

  const debouncedSearch = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS)
  const effectiveFilters = { ...filters, search: debouncedSearch }
  const {
    voices,
    isLoading,
    isFetching,
    errorKey,
    serverPaged,
    hasNextPage,
    serverTotal,
  } = useVoices({ provider, source, filters: effectiveFilters, page, ready })

  const catalogVoices = tab === 'favorites' ? vendorFavorites : voices
  const filteredVoices = filterVoices(catalogVoices, effectiveFilters, {
    serverFiltered: serverPaged,
    serverFilteredCategory: source === 'library',
  })
  // Un catálogo paginado server-side saca sus páginas del total que informa
  // el proveedor (null si no lo trae); el resto se rebana en cliente.
  const serverTotalPages =
    serverTotal === null
      ? null
      : Math.max(1, Math.ceil(serverTotal / CATALOG_PAGE_SIZE))
  const totalPages = serverPaged
    ? serverTotalPages
    : Math.max(1, Math.ceil(filteredVoices.length / VOICE_PAGE_SIZE))
  const pageVoices = serverPaged
    ? filteredVoices
    : filteredVoices.slice((page - 1) * VOICE_PAGE_SIZE, page * VOICE_PAGE_SIZE)
  const canGoNext = serverPaged ? hasNextPage : page < (totalPages ?? 1)
  const totalVoices = serverPaged ? serverTotal : filteredVoices.length

  // Opciones de acento y categoría derivadas de lo cargado (solo los motores
  // ElevenLabs las traen); la biblioteca filtra categoría en el server con
  // opciones fijas.
  const accents = [
    ...new Set(voices.map((voice) => voice.accent).filter(Boolean)),
  ] as string[]
  const categories =
    source === 'library'
      ? [...ELEVENLABS_LIBRARY_CATEGORIES]
      : ([
          ...new Set(voices.map((voice) => voice.category).filter(Boolean)),
        ] as string[])

  return {
    provider,
    source,
    vendorFavorites,
    pageVoices,
    totalVoices,
    totalPages,
    canGoNext,
    isLoading,
    isFetching,
    errorKey,
    accents,
    categories,
  }
}
