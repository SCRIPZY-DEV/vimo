import { useQuery } from '@tanstack/react-query'
import { apiKeysApi } from '@/modules/api-keys/api'
import { apiKeysQueryKeys } from '../constants'

/**
 * Estado de todas las claves (enmascarado, nunca la clave real). En web la
 * query queda deshabilitada y la vista se atenúa, igual que en settings.
 */
export function useApiKeys() {
  const native = apiKeysApi.isNative()

  const { data: statuses, isLoading } = useQuery({
    queryKey: apiKeysQueryKeys.status,
    queryFn: () => apiKeysApi.getStatus(),
    enabled: native,
  })

  return {
    isNative: native,
    statuses: statuses ?? [],
    isLoading: native && isLoading,
  }
}
