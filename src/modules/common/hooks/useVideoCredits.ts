import { useQuery } from '@tanstack/react-query'
import { commonApi } from '@/modules/common/api'
import { commonQueryKeys } from '@/modules/common/constants'

// Saldos de los proveedores de animación (Kie.ai y PoYo, ADR-0040): el panel
// del editor, la alerta de saldo y el panel de reanudar. Espejo exacto de
// useImageCredits: cada proveedor llega con su propio errorCode; uno caído
// no oculta al otro.
interface UseVideoCreditsOptions {
  // Con false no se consulta (cada consulta levanta un proceso del sidecar).
  enabled?: boolean
}

export function useVideoCredits({
  enabled = true,
}: UseVideoCreditsOptions = {}) {
  const native = commonApi.isNative() && enabled

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: commonQueryKeys.videoCredits,
    queryFn: () => commonApi.getVideoCredits(),
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
