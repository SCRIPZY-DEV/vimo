import { useInfiniteQuery } from '@tanstack/react-query'
import { videosApi } from '@/modules/videos/api'
import type {
  ListVoicesResult,
  VoiceProviderId,
} from '@pipeline/types/voices.ts'

interface UseVoiceCatalogOptions {
  provider: VoiceProviderId
  search: string
  enabled: boolean
}

export function useVoiceCatalog({
  provider,
  search,
  enabled,
}: UseVoiceCatalogOptions) {
  const paged = provider === 'elevenlabs'
  const trimmedSearch = search.trim()

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['videos', 'voices', provider, paged ? trimmedSearch : 'all'],
    enabled,
    retry: false,
    initialPageParam: 1,
    async queryFn({ pageParam }) {
      return videosApi.listVoices({
        provider,
        filters: paged
          ? {
              page: pageParam,
              ...(trimmedSearch ? { search: trimmedSearch } : {}),
            }
          : undefined,
      })
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
    // Minimax y Edge llegan completos: el filtro de búsqueda es client-side.
    filtersAreClientSide: !paged,
  }
}
