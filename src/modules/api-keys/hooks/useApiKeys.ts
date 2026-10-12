import { useQuery } from '@tanstack/react-query'
import { apiKeysApi } from '@/modules/api-keys/api'
import { apiKeysQueryKeys } from '@/modules/api-keys/constants'

/** Estado enmascarado: un fallo de lectura no significa que falten claves. */
export function useApiKeys() {
  const native = apiKeysApi.isNative()
  const query = useQuery({
    queryKey: apiKeysQueryKeys.status,
    queryFn: () => apiKeysApi.getStatus(),
    enabled: native,
    retry: false,
  })

  return {
    isNative: native,
    statuses: query.data ?? [],
    isLoading: native && query.isLoading,
    isFetched: native && query.isFetched,
    isFetching: native && query.isFetching,
    isSuccess: native && query.isSuccess,
    errorKey: query.isError ? apiKeysApi.errorMessageKey(query.error) : null,
    refreshStatus: () => query.refetch(),
  }
}
