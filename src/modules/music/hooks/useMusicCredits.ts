import { useQuery } from '@tanstack/react-query'
import { musicApi } from '@/modules/music/api'
import { musicQueryKeys } from '../constants'

/**
 * Saldo de créditos de Evolink. Sin reintentos: cada intento levanta un
 * proceso del sidecar y pega a la API. Si falla, el badge no se muestra
 * (mismo comportamiento que el origen).
 */
export function useMusicCredits() {
  const native = musicApi.isNative()

  const { data: credits } = useQuery({
    queryKey: musicQueryKeys.credits,
    queryFn: () => musicApi.getCredits(),
    enabled: native,
    retry: false,
    staleTime: 60_000,
  })

  return { isNative: native, credits: credits ?? null }
}
