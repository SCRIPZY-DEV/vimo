import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '@/modules/common/queryClient'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'
import type { StyleSavePayload } from '@pipeline/types/styles.ts'

// Galería de estilos propios: listado cacheado + guardar/borrar con
// invalidación. Los flujos del modal usan mutateAsync para encadenar
// (guardar antes de generar muestras).
export function useCustomStyles() {
  const native = videosApi.isNative()

  const { data, isLoading } = useQuery({
    queryKey: videosQueryKeys.customStyles,
    queryFn: () => videosApi.listCustomStyles(),
    enabled: native,
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
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => videosApi.deleteCustomStyle({ id }),
    onSuccess: invalidate,
  })

  return {
    styles: data?.entries ?? [],
    isLoading: native && isLoading,
    saveStyle: (payload: StyleSavePayload) => saveMutation.mutateAsync(payload),
    deleteStyle: (id: string) => deleteMutation.mutateAsync(id),
    saving: saveMutation.isPending,
  }
}
