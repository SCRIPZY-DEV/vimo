import { useQuery } from '@tanstack/react-query'
import { avatarsApi } from '@/modules/avatars/api'
import { avatarsQueryKeys } from '@/modules/avatars/constants'

// Sin reintentos: cada intento levanta un proceso del sidecar, y un fallo de
// lectura local no se arregla insistiendo. Mientras un avatar entrena, la
// lista no se sondea acá: `useProcessingAvatarsRefresh` le pregunta a HeyGen
// cada tanto y, al cerrar cada ronda, invalida esta consulta para releerla.
export function useAvatars() {
  const native = avatarsApi.isNative()

  const {
    data: entries,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: avatarsQueryKeys.list,
    queryFn: () => avatarsApi.list(),
    enabled: native,
    retry: false,
  })

  return {
    isNative: native,
    entries: entries ?? [],
    isLoading: native && isLoading,
    errorKey: isError ? avatarsApi.errorMessageKey(error) : null,
  }
}
