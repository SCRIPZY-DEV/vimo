import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '@/modules/common/queryClient'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'
import type { CatalogCopyRequest } from '@/modules/videos/types/styles'

// El catálogo de Vimo (Entrega 2): las gemas de la pestaña Catálogo, en su
// orden, y «Pasar a mi estilo». El catálogo no cambia durante la sesión (viene
// con el sidecar), así que se pide una vez; y como la lista es pura en el
// sidecar, un fallo se repetiría igual: no se reintenta. Todo va al sidecar
// local, que no depende de la red: con el `networkMode` por defecto, TanStack
// pausaría la lista y la copia apenas el webview avisa `offline`
// (ERRORES-CONOCIDOS: tanstack-mutacion-pausada-por-networkmode-online).
export function useCatalogStyles() {
  const native = videosApi.isNative()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: videosQueryKeys.catalogStyles,
    queryFn: () => videosApi.listCatalogStyles(),
    enabled: native,
    networkMode: 'always',
    staleTime: Infinity,
    retry: false,
  })

  // La copia trae las muestras que tiene la app y crea la tarjeta en Mi
  // estilo. La lista de Mi estilo se invalida aunque la galería del catálogo
  // ya no esté: así la copia aparece en esa pestaña pase lo que pase.
  const copyMutation = useMutation({
    mutationFn: async ({ gem, name, character }: CatalogCopyRequest) => {
      const samples = await videosApi.catalogSampleUploads(gem)
      return videosApi.copyCatalogStyle({
        catalogStyleId: gem.id,
        name,
        character,
        samples,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: videosQueryKeys.customStyles,
      })
    },
    networkMode: 'always',
  })

  return {
    gems: data?.entries ?? [],
    isLoading: native && isLoading,
    errorKey: isError ? videosApi.errorMessageKey(error) : null,
    copyStyle: (request: CatalogCopyRequest) =>
      copyMutation.mutateAsync(request),
    copying: copyMutation.isPending,
    // La última copia: qué se pidió, la tarjeta que quedó en Mi estilo (la
    // galería lleva el formulario a ella) o si falló, con su porqué cuando el
    // texto sirve para la copia (si no, null).
    copyRequest: copyMutation.variables ?? null,
    copiedStyle: copyMutation.data?.entry ?? null,
    copyFailed: copyMutation.isError,
    copyErrorKey: copyMutation.isError
      ? videosApi.catalogCopyErrorKey(copyMutation.error)
      : null,
  }
}
