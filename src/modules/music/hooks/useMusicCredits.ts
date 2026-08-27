import { useQuery } from '@tanstack/react-query'
import { musicApi } from '@/modules/music/api'
import { musicQueryKeys } from '../constants'

// Saldo de créditos de Evolink. Sin reintentos automáticos: cada intento
// levanta un proceso del sidecar y pega a la API. Si falla, el badge muestra
// el estado de error y deja refrescar a mano.
export function useMusicCredits() {
  const native = musicApi.isNative()

  const {
    data: credits,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: musicQueryKeys.credits,
    queryFn: () => musicApi.getCredits(),
    enabled: native,
    retry: false,
    staleTime: 60_000,
  })

  return {
    isNative: native,
    credits: credits ?? null,
    isLoading,
    isError,
    isFetching,
    refresh: refetch,
  }
}
