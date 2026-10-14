import { useQuery } from '@tanstack/react-query'
import { avatarsApi } from '@/modules/avatars/api'
import { avatarsQueryKeys } from '@/modules/avatars/constants'

interface UseAvatarsOptions {
  // Quien la lee de paso (la tarjeta del avatar en Crear) la pide solo cuando
  // la persona puede usar el avatar: cada lectura es un proceso del sidecar.
  enabled?: boolean
  // Quien la lee de paso tampoco la relee en cada montaje ni en cada foco de
  // la ventana: con un `staleTime` la caché vale ese rato. Lo que cambia la
  // lista (agregar, quitar, el sondeo de lo que procesa) la invalida igual.
  staleTime?: number
}

// Sin reintentos: cada intento levanta un proceso del sidecar, y un fallo de
// lectura local no se arregla insistiendo. Mientras un avatar entrena, la
// lista no se sondea acá: `useProcessingAvatarsRefresh` le pregunta a HeyGen
// cada tanto y, al cerrar cada ronda, invalida esta consulta para releerla.
// Es una lectura del disco por el sidecar local: no depende de la red, y con
// el modo `online` por defecto quedaría en pausa sin conexión
// (ERRORES-CONOCIDOS: tanstack-mutacion-pausada-por-networkmode-online).
export function useAvatars({
  enabled = true,
  staleTime = 0,
}: UseAvatarsOptions = {}) {
  const native = avatarsApi.isNative()

  const {
    data: entries,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: avatarsQueryKeys.list,
    queryFn: () => avatarsApi.list(),
    enabled: native && enabled,
    networkMode: 'always',
    retry: false,
    staleTime,
  })

  return {
    isNative: native,
    entries: entries ?? [],
    isLoading: native && enabled && isLoading,
    errorKey: isError ? avatarsApi.errorMessageKey(error) : null,
  }
}
