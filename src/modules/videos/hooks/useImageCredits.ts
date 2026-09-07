import { useQuery } from '@tanstack/react-query'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'

// Saldos de los proveedores de imagen (formulario de Crear y panel del
// editor). Cada proveedor llega con su propio errorCode; uno caído no oculta
// al otro. `isLoading` es la primera carga (sin saldo que mostrar);
// `isRefreshing`, un refetch con el saldo anterior todavía en pantalla — el
// del botón de refrescar o el que se difiere tras regenerar imágenes
// (scheduleCreditsRefresh).
export function useImageCredits() {
  const native = videosApi.isNative()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: videosQueryKeys.imageCredits,
    queryFn: () => videosApi.getImageCredits(),
    enabled: native,
    retry: false,
    staleTime: 60_000,
  })

  return {
    credits: data ?? null,
    isLoading: native && isLoading,
    isRefreshing: native && isFetching && !isLoading,
    refresh: () => {
      void refetch()
    },
  }
}
