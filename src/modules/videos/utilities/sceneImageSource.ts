import { videosApi } from '@/modules/videos/api'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// URL de la imagen de una escena con cache-buster: la escena regenerada
// conserva la misma ruta en disco y el webview mostraría la imagen vieja.
// Prioridad: versión transitoria del store > mtime del disco > 0.
export function sceneImageSource(
  scene: Pick<SceneDetail, 'imagePath' | 'imageMtimeMs'>,
  version?: number,
): string {
  if (!scene.imagePath) return ''
  return videosApi.imageSource(
    scene.imagePath,
    version ?? scene.imageMtimeMs ?? 0,
  )
}
