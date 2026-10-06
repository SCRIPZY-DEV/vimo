import { skipToken, useQuery } from '@tanstack/react-query'
import { commonQueryKeys } from '@/modules/common/constants'
import { readAccessAdmin } from '@/modules/common/utilities/readAccessAdmin'

// ¿La persona es admin de Vimo? Lee el veredicto que el loader del layout ya
// cacheó, sin disparar otra verificación (como useAccessFeature). Sin red vale
// el último valor recordado para este correo. Es configuración global: se lee
// donde se usa y no viaja por props. Sin veredicto en caché: no.
export function useAccessAdmin(): boolean {
  const { data } = useQuery({
    queryKey: commonQueryKeys.access,
    queryFn: skipToken,
    select: (verdict: unknown) => readAccessAdmin(verdict),
  })

  return data === true
}
