import { AlertTriangle, ImageIcon, Loader2 } from 'lucide-react'
import { videosApi } from '@/modules/videos/api'
import type { SceneSummary } from '@pipeline/types/scenes.ts'

interface SceneThumbnailProps {
  scene: SceneSummary
}

export function SceneThumbnail({ scene }: SceneThumbnailProps) {
  // Cache-buster client-side: la escena regenerada conserva la misma ruta en
  // disco y el webview mostraría la imagen vieja sin él.
  if (scene.imagePath) {
    return (
      <img
        src={`${videosApi.imageSource(scene.imagePath)}?v=${scene.id}-${scene.imageStatus}`}
        alt=""
        className="h-full w-full object-cover"
      />
    )
  }

  if (scene.imageStatus === 'generating') {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  }

  if (scene.imageStatus === 'error') {
    return <AlertTriangle className="h-4 w-4 text-destructive" />
  }

  return <ImageIcon className="h-4 w-4 text-muted-foreground opacity-50" />
}
