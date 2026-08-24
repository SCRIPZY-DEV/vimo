import { useQuery } from '@tanstack/react-query'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'

export function useCharacterCatalog(enabled: boolean) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: videosQueryKeys.characters,
    queryFn: () => videosApi.listCharacters(),
    enabled,
    retry: false,
  })

  return {
    characters: data?.entries ?? [],
    isLoading: enabled && isLoading,
    errorKey: isError ? videosApi.errorMessageKey(error) : null,
  }
}
