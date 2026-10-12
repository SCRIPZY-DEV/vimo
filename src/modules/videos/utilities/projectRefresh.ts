import { queryClient } from '@/modules/common/queryClient'
import { videosQueryKeys } from '@/modules/videos/constants'

// Tras el cierre de un job, la lista, el estado y el detail del editor
// quedaron viejos: se invalidan para mostrar los archivos reales sin
// esperar a que la persona vuelva a entrar.
export function refreshProjectQueries(projectId: string): void {
  void queryClient.invalidateQueries({ queryKey: videosQueryKeys.projects })
  void queryClient.invalidateQueries({
    queryKey: videosQueryKeys.projectStatus(projectId),
  })
  void queryClient.invalidateQueries({
    queryKey: videosQueryKeys.projectDetail(projectId),
  })
}
