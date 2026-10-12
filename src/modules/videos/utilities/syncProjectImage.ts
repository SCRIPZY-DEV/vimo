import { queryClient } from '@/modules/common/queryClient'
import { videosQueryKeys } from '@/modules/videos/constants'
import type { VideoProjectDetailResult } from '@pipeline/types/video-project.ts'

// El evento confirma la importación local. Actualiza sólo la imagen en un
// detail ya leído; el refetch terminal confirma metadata y mtime desde disco.
export function syncProjectImage(
  projectId: string,
  sceneId: number,
  imagePath: string,
): void {
  if (!projectId || !imagePath) return
  const queryKey = videosQueryKeys.projectDetail(projectId)
  const cached = queryClient.getQueryData<VideoProjectDetailResult>(queryKey)
  if (!cached?.scenes.some((scene) => scene.id === sceneId)) return
  // Una lectura anterior a la importación no puede borrar su confirmación.
  // Cancelar esta query descarta su respuesta, no los jobs de generación.
  void queryClient.cancelQueries({ queryKey, exact: true })
  queryClient.setQueryData<VideoProjectDetailResult>(queryKey, (detail) => {
    if (!detail) return detail
    const known = detail.scenes.find((scene) => scene.id === sceneId)
    if (!known) return detail
    if (known.imageStatus === 'ok' && known.imagePath === imagePath)
      return detail
    return {
      ...detail,
      scenes: detail.scenes.map((scene) => {
        if (scene.id !== sceneId) return scene
        return { ...scene, imageStatus: 'ok', imagePath }
      }),
    }
  })
}
