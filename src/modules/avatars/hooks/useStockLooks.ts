import { useInfiniteQuery } from '@tanstack/react-query'
import { avatarsApi } from '@/modules/avatars/api'
import {
  avatarsQueryKeys,
  STOCK_LOOKS_STALE_TIME_MS,
} from '@/modules/avatars/constants'
import type { StockLookTypeFilter } from '@/modules/avatars/constants'

interface UseStockLooksOptions {
  ownership: 'public' | 'private'
  lookType: StockLookTypeFilter
  enabled: boolean
}

// Páginas de looks de HeyGen por cursor (`next_token`). Cada página es un
// proceso del sidecar, por eso no reintenta y recuerda un rato lo leído.
export function useStockLooks({
  ownership,
  lookType,
  enabled,
}: UseStockLooksOptions) {
  const filter = lookType === 'all' ? undefined : lookType
  const query = useInfiniteQuery({
    queryKey: [...avatarsQueryKeys.stockLooks, ownership, lookType],
    queryFn: ({ pageParam }) =>
      avatarsApi.listStockLooks({
        ownership,
        ...(filter ? { lookType: filter } : {}),
        ...(pageParam ? { token: pageParam } : {}),
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled,
    retry: false,
    staleTime: STOCK_LOOKS_STALE_TIME_MS,
    // Al volver a la ventana no se releen todas las páginas cargadas: cada una
    // es un proceso del sidecar más una llamada a HeyGen.
    refetchOnWindowFocus: false,
    // Un filtro de tipo nuevo conserva la grilla anterior mientras llega la
    // suya; un origen nuevo (índice 2 de la clave) no: sus tarjetas son de la
    // otra lista y se agregarían con el origen equivocado.
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery?.queryKey[2] !== ownership) return undefined

      return previousData
    },
  })

  const looks = query.data?.pages.flatMap((page) => page.looks) ?? []

  return {
    looks,
    isLoading: query.isLoading,
    isFetchingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
    errorKey: query.isError ? avatarsApi.errorMessageKey(query.error) : null,
  }
}
