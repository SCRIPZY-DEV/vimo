import { useQuery } from '@tanstack/react-query'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'

// Saldos de los proveedores de imagen (panel del editor). Cada proveedor
// llega con su propio errorCode; uno caído no oculta al otro.
export function useImageCredits() {
  const native = videosApi.isNative()

  const { data, isLoading, refetch } = useQuery({
    queryKey: videosQueryKeys.imageCredits,
    queryFn: () => videosApi.getImageCredits(),
    enabled: native,
    retry: false,
    staleTime: 60_000,
  })

  return {
    credits: data ?? null,
    isLoading: native && isLoading,
    refresh: () => {
      void refetch()
    },
  }
}
