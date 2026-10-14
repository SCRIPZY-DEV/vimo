import { useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { avatarsApi } from '@/modules/avatars/api'
import {
  avatarsQueryKeys,
  STOCK_LOOKS_STALE_TIME_MS,
} from '@/modules/avatars/constants'
import type { HeyGenAvatarGroup } from '@pipeline/types/avatar.ts'

interface UseStockGroupsOptions {
  ownership: 'public' | 'private'
  enabled: boolean
}

// El listado de avatares de HeyGen tal como lo usa el diálogo de stock (y sus
// filtros, que piden páginas solos).
export interface StockGroupsListing {
  groups: HeyGenAvatarGroup[]
  isLoading: boolean
  isFetchingMore: boolean
  hasMore: boolean
  loadMore: () => void
  errorKey: string | null
}

// Páginas de avatares de HeyGen (grupos de looks) por cursor (`next_token`):
// el stock público o los propios de la cuenta. Cada página es un proceso del
// sidecar, por eso no reintenta y recuerda un rato lo leído. Sin datos de
// reemplazo al cambiar de origen: las tarjetas de una lista no se mezclan con
// las de la otra (se agregarían con el origen equivocado). El sidecar es local
// y responde `avatar_network` por su cuenta: con el modo `online` por defecto
// la consulta quedaría en pausa, cargando para siempre, sin conexión
// (ERRORES-CONOCIDOS: tanstack-mutacion-pausada-por-networkmode-online).
export function useStockGroups({
  ownership,
  enabled,
}: UseStockGroupsOptions): StockGroupsListing {
  const query = useInfiniteQuery({
    queryKey: avatarsQueryKeys.stockGroupsOf(ownership),
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
  const { fetchNextPage } = query
  // Estable entre renders (`fetchNextPage` es del observador): la auto-carga
  // de los filtros la llama desde un efecto que depende de ella.
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage])

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
    loadMore,
    errorKey: query.isError ? avatarsApi.errorMessageKey(query.error) : null,
  }
}
