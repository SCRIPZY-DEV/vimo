import { AlertTriangle, ImageIcon, Loader2 } from 'lucide-react'
import { videosApi } from '@/modules/videos/api'
import type { SceneSummary } from '@pipeline/types/scenes.ts'

interface SceneThumbnailProps {
  scene: SceneSummary
  // Cache-buster explícito (mtime del sidecar): en Library el status queda
  // 'ok' antes y después de regenerar y el fallback id-status no alcanza.
  version?: number
}

export function SceneThumbnail({ scene, version }: SceneThumbnailProps) {
  // Cache-buster client-side: la escena regenerada conserva la misma ruta en
  // disco y el webview mostraría la imagen vieja sin él.
  if (scene.imagePath) {
    const cacheBuster = version ?? `${scene.id}-${scene.imageStatus}`
    return (
      <img
        src={`${videosApi.imageSource(scene.imagePath)}?v=${cacheBuster}`}
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
