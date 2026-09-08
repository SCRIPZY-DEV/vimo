import { useInfiniteQuery } from '@tanstack/react-query'
import { videosApi } from '@/modules/videos/api'
import { isServerPagedCatalog } from '@/modules/voices/utilities/isServerPagedCatalog'
import type {
  ListVoicesFilters,
  ListVoicesResult,
  VoiceProviderId,
  VoiceSource,
} from '@pipeline/types/voices.ts'

interface UseVoiceCatalogOptions {
  provider: VoiceProviderId
  // Solo elevenlabs-direct: cuenta (completa) o biblioteca (paginada).
  source?: VoiceSource
  // Server-side solo en los catálogos paginados; el resto llega completo y
  // filtra client-side.
  search: string
  language: string
  gender: string
  category: string
  enabled: boolean
}

export function useVoiceCatalog({
  provider,
  source,
  search,
  language,
  gender,
  category,
  enabled,
}: UseVoiceCatalogOptions) {
  const paged = isServerPagedCatalog(provider, source)
  const trimmedSearch = search.trim()
  // La biblioteca de ElevenLabs también filtra categoría en el server.
  const serverCategory = source === 'library' ? category : ''

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: [
      'videos',
      'voices',
      provider,
      source ?? 'default',
      paged
        ? `${trimmedSearch}|${language}|${gender}|${serverCategory}`
        : 'all',
    ],
    enabled,
    retry: false,
    initialPageParam: 1,
    async queryFn({ pageParam }) {
      const filters: ListVoicesFilters = {}
      if (source) filters.source = source
      if (paged) {
        filters.page = pageParam
        if (trimmedSearch) filters.search = trimmedSearch
        if (language) filters.language = language
        if (gender) filters.gender = gender
        if (serverCategory) filters.category = serverCategory
      }
      return videosApi.listVoices({ provider, filters })
    },
    getNextPageParam(lastPage: ListVoicesResult, allPages) {
      if (!paged || !lastPage.hasMore) return undefined
      return allPages.length + 1
    },
  })

  const voices = (data?.pages ?? []).flatMap((page) => page.voices)

  return {
    voices,
    isLoading,
    errorKey: isError ? videosApi.errorMessageKey(error) : null,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
    loadMore: () => void fetchNextPage(),
    // Los catálogos completos filtran client-side.
    filtersAreClientSide: !paged,
    // La biblioteca ya filtró categoría en el server.
    categoryIsServerSide: Boolean(serverCategory),
  }
}
