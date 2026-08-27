import { keepPreviousData, useQuery } from '@tanstack/react-query'
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
  page: number
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
 * Catálogo de voces del provider activo. Minimax llega completo en un job
 * (con snapshot 24 h en localStorage — el listado son hasta 50 requests
 * paginados) y se pagina en cliente. ElevenLabs pagina server-side (~12k
 * voces): `page` pide esa página y `hasNextPage` dice si hay otra; mientras
 * llega, se sigue mostrando la anterior para no parpadear.
 */
export function useVoices({
  provider,
  filters,
  page,
  ready,
}: UseVoicesOptions) {
  const native = voicesApi.isNative()
  const activeProvider = provider ?? 'minimax'
  const serverPaged = activeProvider === 'elevenlabs'
  const pageFilters = serverPaged
    ? { ...serverFilters(activeProvider, filters), page }
    : undefined
  const filtersKey = pageFilters ? JSON.stringify(pageFilters) : 'all'
  const snapshot = serverPaged ? null : readVoiceListSnapshot(activeProvider)

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
      if (!serverPaged) writeVoiceListSnapshot(activeProvider, result.voices)
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
  }
}
