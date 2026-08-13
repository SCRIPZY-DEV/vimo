import { useQuery } from '@tanstack/react-query'
import { authApi } from '@/modules/auth/api'
import { ACCESS_STALE_TIME_MS, authQueryKeys } from '../constants'
import type { AccessStatus } from '../types/access'

export function useAccess() {
  return useQuery<AccessStatus>({
    queryKey: authQueryKeys.access,
    queryFn: () => authApi.verifyAccess(),
    staleTime: ACCESS_STALE_TIME_MS,
    retry: false,
  })
}
