import { useInfiniteQuery } from '@tanstack/react-query'
import { voicesApi } from '@/modules/voices/api'
import { VOICE_LIST_CACHE_TTL_MS, voicesQueryKeys } from '../constants'
import {
  readVoiceListSnapshot,
  writeVoiceListSnapshot,
} from '../utilities/voiceListCache'
import type {
  ListVoicesFilters,
  ListVoicesResult,
  VoiceProviderId,
} from '@pipeline/types/voices.ts'
import type { VoiceFilterState } from '../types/voices'

interface UseVoicesOptions {
  provider: VoiceProviderId | null
  filters: VoiceFilterState
  ready: boolean
}

// Solo estos filtros viajan al server, y solo ElevenLabs los usa (el resto
// del filtrado es client-side con filterVoices).
function serverFilters(
  provider: VoiceProviderId,
  filters: VoiceFilterState,
): ListVoicesFilters {
  if (provider !== 'elevenlabs') return {}
  const result: ListVoicesFilters = {}
  if (filters.search.trim()) result.search = filters.search.trim()
  if (filters.language) result.language = filters.language
  if (filters.gender) result.gender = filters.gender
  return result
}

/**
 * Catálogo de voces del provider activo. Minimax/Edge llegan completos en un
 * job (con snapshot 24 h en localStorage — el listado Minimax son hasta 50
 * requests paginados); ElevenLabs pagina server-side y `loadMore` trae la
 * página siguiente (~12k voces, bajarlas todas serían minutos).
 */
export function useVoices({ provider, filters, ready }: UseVoicesOptions) {
  const native = voicesApi.isNative()
  const activeProvider = provider ?? 'minimax'
  const paged = activeProvider === 'elevenlabs'
  const baseFilters = serverFilters(activeProvider, filters)
  const filtersKey = paged ? JSON.stringify(baseFilters) : 'all'
  const snapshot = paged ? null : readVoiceListSnapshot(activeProvider)

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: voicesQueryKeys.list(activeProvider, filtersKey),
    enabled: native && ready && provider !== null,
    retry: false,
    staleTime: VOICE_LIST_CACHE_TTL_MS,
    initialPageParam: 1,
    initialData: snapshot
      ? {
          pages: [{ voices: snapshot.voices } satisfies ListVoicesResult],
          pageParams: [1],
        }
      : undefined,
    initialDataUpdatedAt: snapshot?.savedAt,
    async queryFn({ pageParam }) {
      const result = await voicesApi.listVoices({
        provider: activeProvider,
        filters: paged ? { ...baseFilters, page: pageParam } : undefined,
      })
      if (!paged) writeVoiceListSnapshot(activeProvider, result.voices)
      return result
    },
    getNextPageParam(lastPage, allPages) {
      if (!paged || !lastPage.hasMore) return undefined
      return allPages.length + 1
    },
  })

  return {
    voices: data?.pages.flatMap((page) => page.voices) ?? [],
    isLoading,
    errorKey: isError ? voicesApi.errorMessageKey(error) : null,
    hasMore: paged && Boolean(hasNextPage),
    loadingMore: isFetchingNextPage,
    loadMore: () => {
      if (paged && hasNextPage && !isFetchingNextPage) void fetchNextPage()
    },
  }
}
