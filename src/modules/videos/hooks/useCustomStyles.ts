import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '@/modules/common/queryClient'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'
import type {
  CustomStyleSummary,
  StyleSavePayload,
  StylesListResult,
} from '@pipeline/types/styles.ts'

// Galería de estilos propios: listado cacheado + guardar/borrar con
// invalidación. Los flujos del modal usan mutateAsync para encadenar
// (guardar antes de generar muestras). Todo va al sidecar local, así que no
// depende de la red: con el `networkMode` por defecto (`online`), TanStack
// pausa la query y las mutaciones apenas el webview avisa `offline`, y el modal
// queda esperando un guardado que no sale (ERRORES-CONOCIDOS:
// tanstack-mutacion-pausada-por-networkmode-online).
export function useCustomStyles() {
  const native = videosApi.isNative()

  const { data, isLoading } = useQuery({
    queryKey: videosQueryKeys.customStyles,
    queryFn: () => videosApi.listCustomStyles(),
    enabled: native,
    networkMode: 'always',
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: videosQueryKeys.customStyles,
    })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: StyleSavePayload) =>
      videosApi.saveCustomStyle(payload),
    onSuccess: invalidate,
    networkMode: 'always',
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => videosApi.deleteCustomStyle({ id }),
    onSuccess: invalidate,
    networkMode: 'always',
  })

  return {
    styles: data?.entries ?? [],
    isLoading: native && isLoading,
    // Pone lo recién guardado en la lista cacheada sin esperar el refetch: el
    // modal que pasa a esa gema la encuentra en `styles` aunque el refetch
    // tarde o falle (si no, se desmontaría y el editor quedaría trabado).
    showSavedStyle: (entry: CustomStyleSummary) => {
      queryClient.setQueryData<StylesListResult>(
        videosQueryKeys.customStyles,
        (current) => {
          const entries = current?.entries ?? []
          if (!entries.some((style) => style.id === entry.id))
            return { entries: [...entries, entry] }
          return {
            entries: entries.map((style) =>
              style.id === entry.id ? entry : style,
            ),
          }
        },
      )
    },
    saveStyle: (payload: StyleSavePayload) => saveMutation.mutateAsync(payload),
    deleteStyle: (id: string) => deleteMutation.mutateAsync(id),
    saving: saveMutation.isPending,
  }
}
