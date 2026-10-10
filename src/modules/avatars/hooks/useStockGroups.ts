import { useInfiniteQuery } from '@tanstack/react-query'
import { avatarsApi } from '@/modules/avatars/api'
import {
  avatarsQueryKeys,
  STOCK_LOOKS_STALE_TIME_MS,
} from '@/modules/avatars/constants'

interface UseStockGroupsOptions {
  ownership: 'public' | 'private'
  enabled: boolean
}

// Páginas de avatares de HeyGen (grupos de looks) por cursor (`next_token`):
// el stock público o los propios de la cuenta. Cada página es un proceso del
// sidecar, por eso no reintenta y recuerda un rato lo leído. Sin datos de
// reemplazo al cambiar de origen: las tarjetas de una lista no se mezclan con
// las de la otra (se agregarían con el origen equivocado). El sidecar es local
// y responde `avatar_network` por su cuenta: con el modo `online` por defecto
// la consulta quedaría en pausa, cargando para siempre, sin conexión
// (ERRORES-CONOCIDOS: tanstack-mutacion-pausada-por-networkmode-online).
export function useStockGroups({ ownership, enabled }: UseStockGroupsOptions) {
  const query = useInfiniteQuery({
    queryKey: [...avatarsQueryKeys.stockGroups, ownership],
    queryFn: ({ pageParam }) =>
      avatarsApi.listStockGroups({
        ownership,
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

  // Si el listado de HeyGen cambia entre una página y la siguiente, un avatar
  // puede repetirse: queda su primera aparición (su id es la clave de React).
  const seen = new Set<string>()
  const groups = (query.data?.pages ?? [])
    .flatMap((page) => page.groups)
    .filter((group) => {
      if (seen.has(group.groupId)) return false

      seen.add(group.groupId)
      return true
    })

  return {
    groups,
    isLoading: query.isLoading,
    isFetchingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
    errorKey: query.isError ? avatarsApi.errorMessageKey(query.error) : null,
  }
}
