import { useQuery } from '@tanstack/react-query'
import { charactersApi } from '@/modules/characters/api'
import { charactersQueryKeys } from '../constants'

// Sin reintentos: cada intento levanta un proceso del sidecar, y un fallo de
// lectura local no se arregla insistiendo.
export function useCharacters() {
  const native = charactersApi.isNative()

  const {
    data: entries,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: charactersQueryKeys.list,
    queryFn: () => charactersApi.list(),
    enabled: native,
    retry: false,
  })

  return {
    isNative: native,
    entries: entries ?? [],
    isLoading: native && isLoading,
    errorKey: isError ? charactersApi.errorMessageKey(error) : null,
  }
}
