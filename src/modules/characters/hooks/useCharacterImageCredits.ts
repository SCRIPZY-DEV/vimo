import { useQuery } from '@tanstack/react-query'
import { charactersApi } from '@/modules/characters/api'
import { charactersQueryKeys } from '@/modules/characters/constants'

// Saldo de los proveedores de imagen mientras el modal de personaje está
// abierto. Sin reintentos: cada intento levanta un proceso del sidecar.
export function useCharacterImageCredits() {
  const native = charactersApi.isNative()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: charactersQueryKeys.imageCredits,
    queryFn: () => charactersApi.getImageCredits(),
    enabled: native,
    retry: false,
    staleTime: 60_000,
  })

  return {
    credits: data ?? null,
    isRefreshing: native && (isLoading || isFetching),
    refresh: () => {
      void refetch()
    },
  }
}
