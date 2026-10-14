import { useQuery } from '@tanstack/react-query'
import { avatarsApi } from '@/modules/avatars/api'
import { avatarsQueryKeys } from '@/modules/avatars/constants'
import type { AvatarStockTypesResult } from '@pipeline/types/avatar.ts'

interface UseStockTypesOptions {
  enabled: boolean
}

// Los ids de grupo van como `ReadonlySet`: quien filtra solo consulta.
interface StockTypes {
  studioGroupIds: ReadonlySet<string>
  twinGroupIds: ReadonlySet<string>
  isLoading: boolean
  errorKey: string | null
}

// Una clasificación sin ningún grupo es casi seguro un fallo pasajero de HeyGen
// (el sidecar tampoco la guarda), no un stock sin estudio ni gemelos.
function hasGroups({
  studioGroupIds,
  twinGroupIds,
}: AvatarStockTypesResult): boolean {
  return studioGroupIds.length + twinGroupIds.length > 0
}

// Qué avatares públicos de HeyGen son de estudio y cuáles gemelos digitales
// (filtros «Profesional» y «Comunidad» del stock). Una barrida son ~45
// pedidos a HeyGen y ~20 s, así que dentro de la sesión se hace una sola vez:
// una clasificación con grupos nunca se considera vencida (`staleTime` e
// `gcTime` infinitos) y no se relee al volver a la ventana. Una sin ningún
// grupo vence al instante, así que reabrir el stock la pide de nuevo, y
// mientras se reintenta `isLoading` es verdadero aunque ya haya datos (los
// vacíos): las categorías de tipo todavía no sirven. La caché de 24 h entre
// sesiones vive en el sidecar (`avatar-stock-types`), que la devuelve sin
// pedirle nada a HeyGen. Sin reintentos: un fallo lo dice y «Todos» sigue
// andando. El sidecar es local, así que con el modo `online` por defecto la
// consulta quedaría en pausa sin conexión (ERRORES-CONOCIDOS:
// tanstack-mutacion-pausada-por-networkmode-online).
export function useStockTypes({ enabled }: UseStockTypesOptions): StockTypes {
  const query = useQuery({
    queryKey: avatarsQueryKeys.stockTypes,
    queryFn: () => avatarsApi.listStockTypes({}),
    enabled,
    networkMode: 'always',
    retry: false,
    staleTime: ({ state }) => {
      if (!state.data) return 0
      if (!hasGroups(state.data)) return 0

      return Infinity
    },
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  })

  // El reintento de una clasificación vacía corre en segundo plano (ya hay
  // datos), así que TanStack no lo llama «cargando»; para quien filtra sí lo es.
  // Una con grupos no se relee sola, y sin `enabled` no se espera nada.
  const isRetryingEmpty =
    enabled &&
    query.isFetching &&
    query.data !== undefined &&
    !hasGroups(query.data)

  // Son a lo sumo unos mil ids: armar los conjuntos en cada render no pesa.
  return {
    studioGroupIds: new Set(query.data?.studioGroupIds),
    twinGroupIds: new Set(query.data?.twinGroupIds),
    isLoading: query.isLoading || isRetryingEmpty,
    errorKey: query.isError ? avatarsApi.errorMessageKey(query.error) : null,
  }
}
