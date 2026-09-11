import { useQuery } from '@tanstack/react-query'
import { commonApi } from '@/modules/common/api'
import { commonQueryKeys } from '@/modules/common/constants'

// Saldos de los proveedores de imagen (formulario de Crear, panel del editor,
// modal de estilo propio y modal de personaje). Cada proveedor llega con su
// propio errorCode; uno caído no oculta al otro. `isLoading` es la primera
// carga (sin saldo que mostrar); `isRefreshing`, un refetch con el saldo
// anterior todavía en pantalla — el del botón de refrescar o el que se difiere
// tras generar imágenes (scheduleCreditsRefresh).
interface UseImageCreditsOptions {
  // Con false no se consulta (cada consulta levanta un proceso del sidecar).
  enabled?: boolean
}

export function useImageCredits({
  enabled = true,
}: UseImageCreditsOptions = {}) {
  const native = commonApi.isNative() && enabled

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: commonQueryKeys.imageCredits,
    queryFn: () => commonApi.getImageCredits(),
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
