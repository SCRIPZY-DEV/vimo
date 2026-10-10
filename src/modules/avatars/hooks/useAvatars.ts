import { useQuery } from '@tanstack/react-query'
import { avatarsApi } from '@/modules/avatars/api'
import { avatarsQueryKeys } from '@/modules/avatars/constants'

// Sin reintentos: cada intento levanta un proceso del sidecar, y un fallo de
// lectura local no se arregla insistiendo. Mientras un avatar entrena, la
// lista no se sondea acá: `useProcessingAvatarsRefresh` le pregunta a HeyGen
// cada tanto y, al cerrar cada ronda, invalida esta consulta para releerla.
// Es una lectura del disco por el sidecar local: no depende de la red, y con
// el modo `online` por defecto quedaría en pausa sin conexión
// (ERRORES-CONOCIDOS: tanstack-mutacion-pausada-por-networkmode-online).
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
    networkMode: 'always',
    retry: false,
  })

  return {
    isNative: native,
    entries: entries ?? [],
    isLoading: native && isLoading,
    errorKey: isError ? avatarsApi.errorMessageKey(error) : null,
  }
}
