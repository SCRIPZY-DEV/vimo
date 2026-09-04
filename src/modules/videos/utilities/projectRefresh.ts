import { queryClient } from '@/modules/common/queryClient'
import { videosQueryKeys } from '@/modules/videos/constants'

// Tras el cierre de un job, lo leído de disco (la lista y el estado del
// proyecto) quedó viejo: se invalida para que la biblioteca muestre el estado
// real sin esperar a que la persona vuelva a entrar.
export function refreshProjectQueries(projectId: string): void {
  void queryClient.invalidateQueries({ queryKey: videosQueryKeys.projects })
  void queryClient.invalidateQueries({
    queryKey: videosQueryKeys.projectStatus(projectId),
  })
}
