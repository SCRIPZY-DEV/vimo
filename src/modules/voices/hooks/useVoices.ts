import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { voicesApi } from '@/modules/voices/api'
import {
  VOICE_LIST_CACHE_TTL_MS,
  VOICE_SNAPSHOT_PROVIDERS,
  voicesQueryKeys,
} from '../constants'
import { isServerPagedCatalog } from '../utilities/isServerPagedCatalog'
import {
  readVoiceListSnapshot,
  writeVoiceListSnapshot,
} from '../utilities/voiceListCache'
import type {
  ListVoicesFilters,
  ListVoicesResult,
  VoiceProviderId,
  VoiceSource,
} from '@pipeline/types/voices.ts'
import type { VoiceFilterState } from '../types/voices'

interface UseVoicesOptions {
  provider: VoiceProviderId | null
  source?: VoiceSource
  filters: VoiceFilterState
  page: number
  ready: boolean
}

// Solo estos filtros viajan al server, y solo los catálogos paginados los
// usan (el resto del filtrado es client-side con filterVoices). La biblioteca
// de ElevenLabs además filtra categoría allá.
function serverFilters(
  provider: VoiceProviderId,
  source: VoiceSource | undefined,
  filters: VoiceFilterState,
): ListVoicesFilters {
  const result: ListVoicesFilters = {}
  if (source) result.source = source
  if (!isServerPagedCatalog(provider, source)) return result

  if (filters.search.trim()) result.search = filters.search.trim()
  if (filters.language) result.language = filters.language
  if (filters.gender) result.gender = filters.gender
  if (source === 'library' && filters.category)
    result.category = filters.category
  return result
}

/**
 * Catálogo de voces del provider activo. Minimax y Edge llegan completos en
 * un job (con snapshot 24 h en localStorage — el listado son hasta 50
 * requests paginados) y se paginan en cliente; la cuenta de ElevenLabs
 * también llega completa pero sin snapshot (cambia al añadir voces).
 * ElevenLabs vía DubVoice y la biblioteca de ElevenLabs paginan server-side:
 * `page` pide esa página y `hasNextPage` dice si hay otra; mientras llega, se
 * sigue mostrando la anterior para no parpadear.
 */
export function useVoices({
  provider,
  source,
  filters,
  page,
  ready,
}: UseVoicesOptions) {
  const native = voicesApi.isNative()
  const activeProvider = provider ?? 'minimax'
  const serverPaged = isServerPagedCatalog(activeProvider, source)
  const baseFilters = serverFilters(activeProvider, source, filters)
  const pageFilters = serverPaged ? { ...baseFilters, page } : baseFilters
  const filtersKey = JSON.stringify(pageFilters)
  const snapshot = VOICE_SNAPSHOT_PROVIDERS.includes(activeProvider)
    ? readVoiceListSnapshot(activeProvider)
    : null

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: voicesQueryKeys.list(activeProvider, filtersKey),
    enabled: native && ready && provider !== null,
    retry: false,
    staleTime: VOICE_LIST_CACHE_TTL_MS,
    placeholderData: keepPreviousData,
    initialData: snapshot
      ? ({ voices: snapshot.voices } satisfies ListVoicesResult)
      : undefined,
    initialDataUpdatedAt: snapshot?.savedAt,
    async queryFn() {
      const result = await voicesApi.listVoices({
        provider: activeProvider,
        filters: pageFilters,
      })
      if (VOICE_SNAPSHOT_PROVIDERS.includes(activeProvider))
        writeVoiceListSnapshot(activeProvider, result.voices)
      return result
    },
  })

  return {
    voices: data?.voices ?? [],
    isLoading,
    isFetching,
    errorKey: isError ? voicesApi.errorMessageKey(error) : null,
    serverPaged,
    hasNextPage: serverPaged && Boolean(data?.hasMore),
    // Solo lo informa elevenlabs vía DubVoice; el resto se cuenta en la vista.
    serverTotal: serverPaged ? (data?.total ?? null) : null,
  }
}
