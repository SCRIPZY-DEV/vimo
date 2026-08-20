import { useQuery } from '@tanstack/react-query'
import { voicesApi } from '@/modules/voices/api'
import { voicesQueryKeys } from '../constants'

export function useVoiceCredits() {
  const native = voicesApi.isNative()

  const { data: credits } = useQuery({
    queryKey: voicesQueryKeys.credits,
    queryFn: () => voicesApi.getCredits(),
    enabled: native,
    retry: false,
    staleTime: 60_000,
  })

  return { isNative: native, credits: credits ?? null }
}
