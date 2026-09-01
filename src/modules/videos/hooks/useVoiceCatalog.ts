import { useInfiniteQuery } from '@tanstack/react-query'
import { videosApi } from '@/modules/videos/api'
import type {
  ListVoicesResult,
  VoiceProviderId,
} from '@pipeline/types/voices.ts'

interface UseVoiceCatalogOptions {
  provider: VoiceProviderId
  // Server-side solo para elevenlabs (paginado); minimax/edge llegan
  // completos y filtran client-side.
  search: string
  language: string
  gender: string
  enabled: boolean
}

export function useVoiceCatalog({
  provider,
  search,
  language,
  gender,
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
    queryKey: [
      'videos',
      'voices',
      provider,
      paged ? `${trimmedSearch}|${language}|${gender}` : 'all',
    ],
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
              ...(language ? { language } : {}),
              ...(gender ? { gender } : {}),
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
    // Minimax y Edge llegan completos: los filtros son client-side.
    filtersAreClientSide: !paged,
  }
}
