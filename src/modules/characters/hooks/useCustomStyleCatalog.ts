import { useQuery } from '@tanstack/react-query'
import { charactersApi } from '@/modules/characters/api'
import { charactersQueryKeys } from '@/modules/characters/constants'

// Estilos propios de la galería, para ofrecerlos como estilo del preview
// junto a los del catálogo
export function useCustomStyleCatalog() {
  const native = charactersApi.isNative()

  const { data, isLoading } = useQuery({
    queryKey: charactersQueryKeys.customStyles,
    queryFn: () => charactersApi.listCustomStyles(),
    enabled: native,
    retry: false,
  })

  return {
    styles: data?.entries ?? [],
    isLoading: native && isLoading,
  }
}
