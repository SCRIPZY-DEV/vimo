import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { avatarsApi } from '@/modules/avatars/api'
import {
  avatarsQueryKeys,
  STOCK_FAVORITES_STORE_KEY,
} from '@/modules/avatars/constants'

// Lo que entregan los favoritos (lo usan las tarjetas y los filtros del
// diálogo de stock).
export interface StockFavorites {
  favoriteIds: ReadonlySet<string>
  isFavorite: (groupId: string) => boolean
  toggle: (groupId: string) => void
  // La lectura inicial de lo guardado está en vuelo: el corazón todavía no
  // puede cambiar nada (se muestra deshabilitado).
  reading: boolean
}

// Agrega el avatar si no está; si está, lo saca.
function toggled(groupIds: string[], groupId: string): string[] {
  if (groupIds.includes(groupId)) return groupIds.filter((id) => id !== groupId)

  return [...groupIds, groupId]
}

// Los avatares del stock público marcados con el corazón (ids de grupo de
// HeyGen), guardados en esta máquina: el store de la app, sin HeyGen. El
// corazón cambia al instante (la caché se actualiza antes de escribir). Cada
// escritura guarda la lista entera, así que van de a una y en orden (`scope`
// de TanStack) y no se escribe nada hasta haber leído la guardada (si no, un
// clic temprano la pisaría con un solo id). Si una escritura falla, avisa y,
// cuando ya no queda ninguna en la cola, relee el store: la verdad es la que
// quedó guardada. Si la lectura falla, avisa, y el corazón vuelve a intentar
// leer antes de cambiar (no queda mudo). Nunca escribe por su cuenta: un id
// que el listado de HeyGen no trae se conserva (el listado se corre entre
// páginas: «no está» puede ser falso) y solo no se muestra. El store es
// local: con el modo `online` por defecto, TanStack pausaría lectura y
// escritura sin conexión (ERRORES-CONOCIDOS:
// tanstack-mutacion-pausada-por-networkmode-online).
export function useStockFavorites(): StockFavorites {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const showError = (error: unknown) => {
    toast({
      description: t(avatarsApi.errorMessageKey(error)),
      variant: 'destructive',
    })
  }

  const query = useQuery({
    queryKey: avatarsQueryKeys.stockFavorites,
    queryFn: async () => {
      try {
        return await avatarsApi.readStockFavorites()
      } catch (error) {
        showError(error)
        throw error
      }
    },
    networkMode: 'always',
    retry: false,
    staleTime: Infinity,
  })

  const { mutate } = useMutation({
    mutationKey: avatarsQueryKeys.stockFavorites,
    scope: { id: STOCK_FAVORITES_STORE_KEY },
    mutationFn: (groupIds: string[]) =>
      avatarsApi.writeStockFavorites(groupIds),
    networkMode: 'always',
    async onMutate(groupIds: string[]) {
      await queryClient.cancelQueries({
        queryKey: avatarsQueryKeys.stockFavorites,
      })
      queryClient.setQueryData(avatarsQueryKeys.stockFavorites, groupIds)
    },
    onError: (error) => showError(error),
    // La última de la cola (la que todavía cuenta como pendiente es esta)
    // relee el store: tras un fallo, el corazón vuelve a lo que quedó
    // guardado; tras éxitos, la lectura coincide con lo que ya se ve.
    onSettled: () => {
      const pending = queryClient.isMutating({
        mutationKey: avatarsQueryKeys.stockFavorites,
      })
      if (pending > 1) return

      return queryClient.invalidateQueries({
        queryKey: avatarsQueryKeys.stockFavorites,
      })
    },
  })

  const favoriteIds: ReadonlySet<string> = new Set(query.data)

  // Agrega o quita un avatar sobre la lista más nueva de la caché (la de un
  // corazón anterior todavía en cola incluida). Sin la lista leída: si la
  // lectura está en vuelo, espera; si falló, la reintenta y aplica el cambio
  // si esta vez se pudo leer (si no, la lectura avisa).
  const toggle = (groupId: string) => {
    const current = queryClient.getQueryData<string[]>(
      avatarsQueryKeys.stockFavorites,
    )
    if (current) {
      mutate(toggled(current, groupId))
      return
    }
    if (!query.isError) return

    void query.refetch().then(({ data }) => {
      if (data) mutate(toggled(data, groupId))
    })
  }

  return {
    favoriteIds,
    isFavorite: (groupId: string) => favoriteIds.has(groupId),
    toggle,
    reading: query.isLoading,
  }
}
