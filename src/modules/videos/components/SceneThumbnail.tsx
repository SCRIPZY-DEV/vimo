import { useTranslation } from 'react-i18next'
import { videosApi } from '@/modules/videos/api'
import type { SceneSummary } from '@pipeline/types/scenes.ts'

interface SceneThumbnailProps {
  scene: SceneSummary
  className?: string
}

// La imagen de una escena. Cache-buster client-side: la escena regenerada
// conserva la misma ruta en disco y el webview mostraría la imagen vieja
// sin él. Sin imagen no dibuja nada: el estado lo pinta quien la monta.
export function SceneThumbnail({
  scene,
  className = 'h-full w-full object-cover',
}: SceneThumbnailProps) {
  const { t } = useTranslation()

  if (!scene.imagePath) return null

  return (
    <img
      src={`${videosApi.imageSource(scene.imagePath)}?v=${scene.id}-${scene.imageStatus}`}
      alt={t('create.progress.cell.alt', { id: scene.id })}
      loading="lazy"
      className={className}
    />
  )
}
