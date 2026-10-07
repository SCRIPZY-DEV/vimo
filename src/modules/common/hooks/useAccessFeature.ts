import { skipToken, useQuery } from '@tanstack/react-query'
import { commonQueryKeys } from '@/modules/common/constants'
import { readAccessFeature } from '@/modules/common/utilities/readAccessFeature'
import type { AccessFeatureName } from '@/modules/common/types/accessFeatures'

// ¿Está encendido este interruptor para la persona (ADR-0048)? Lee el
// veredicto que el loader del layout ya cacheó, sin disparar otra verificación
// (como el Sidebar con `demo`). Es configuración global: se lee donde se usa y
// no viaja por props. Sin veredicto en caché: apagado.
export function useAccessFeature(name: AccessFeatureName): boolean {
  const { data } = useQuery({
    queryKey: commonQueryKeys.access,
    queryFn: skipToken,
    select: (verdict: unknown) => readAccessFeature(verdict, name),
  })

  return data === true
}
