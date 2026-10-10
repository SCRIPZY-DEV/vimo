import { useInfiniteQuery } from '@tanstack/react-query'
import { avatarsApi } from '@/modules/avatars/api'
import {
  avatarsQueryKeys,
  STOCK_LOOKS_STALE_TIME_MS,
} from '@/modules/avatars/constants'

interface UseStockLooksOptions {
  ownership: 'public' | 'private'
  // El avatar (grupo de HeyGen) cuyos looks se listan.
  groupId: string
  enabled: boolean
}

// Los looks de un avatar de HeyGen, por páginas con cursor (`next_token`).
// Sirve al segundo nivel del diálogo de stock y a las vistas previas remotas
// del detalle de un avatar (comparten la caché por grupo). Cada página es un
// proceso del sidecar, por eso no reintenta y recuerda un rato lo leído. El
// sidecar es local y responde `avatar_network` por su cuenta: con el modo
// `online` por defecto la consulta quedaría en pausa sin conexión
// (ERRORES-CONOCIDOS: tanstack-mutacion-pausada-por-networkmode-online).
export function useStockLooks({
  ownership,
  groupId,
  enabled,
}: UseStockLooksOptions) {
  const query = useInfiniteQuery({
    queryKey: [...avatarsQueryKeys.stockLooks, ownership, groupId],
    queryFn: ({ pageParam }) =>
      avatarsApi.listStockLooks({
        ownership,
        groupId,
        ...(pageParam ? { token: pageParam } : {}),
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextToken ?? undefined,
    enabled,
    networkMode: 'always',
    retry: false,
    staleTime: STOCK_LOOKS_STALE_TIME_MS,
    // Al volver a la ventana no se releen todas las páginas cargadas: cada
    // una es un proceso del sidecar más una llamada a HeyGen.
    refetchOnWindowFocus: false,
  })

  // Un look repetido entre páginas queda una sola vez (su id es la clave).
  const seen = new Set<string>()
  const looks = (query.data?.pages ?? [])
    .flatMap((page) => page.looks)
    .filter((look) => {
      if (seen.has(look.lookId)) return false

      seen.add(look.lookId)
      return true
    })

  return {
    looks,
    isLoading: query.isLoading,
    isFetchingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
    errorKey: query.isError ? avatarsApi.errorMessageKey(query.error) : null,
  }
}
