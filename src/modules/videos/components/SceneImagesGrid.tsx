import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import { SceneThumbnail } from '@/modules/videos/components/SceneThumbnail'
import { SceneViewerDialog } from '@/modules/videos/components/SceneViewerDialog'
import { aspectClass, isVertical } from '@/modules/videos/utilities/videoFormat'
import type { SceneSummary } from '@pipeline/types/scenes.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

interface SceneImagesGridProps {
  scenes: SceneSummary[]
  videoFormat?: VideoFormat
}

export function SceneImagesGrid({
  scenes,
  videoFormat = '16:9',
}: SceneImagesGridProps) {
  const { t } = useTranslation()
  // Escena abierta en el visor; null = cerrado.
  const [viewerSceneId, setViewerSceneId] = useState<number | null>(null)

  if (scenes.length === 0) return null

  const ready = scenes.filter((scene) => scene.imageStatus === 'ok').length
  const vertical = isVertical(videoFormat)

  return (
    <div className="space-y-2">
      <p className="font-body text-sm text-muted-foreground">
        {t('create.progress.imagesCount', {
          ready,
          total: scenes.length,
        })}
      </p>
      {/* En vertical las celdas son altas: más columnas para que las
          miniaturas no queden gigantes (port de GrillaPreviewImagenes). */}
      <ul
        className={cn(
          'grid gap-2',
          vertical
            ? 'grid-cols-4 md:grid-cols-8'
            : 'grid-cols-3 md:grid-cols-6',
        )}
      >
        {scenes.map((scene) => (
          <li key={scene.id}>
            <button
              type="button"
              title={scene.text}
              onClick={() => setViewerSceneId(scene.id)}
              className={cn(
                'relative flex w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/40 transition-all hover:border-saffron/60 focus:outline-none focus:ring-2 focus:ring-saffron/50',
                aspectClass(videoFormat),
                scene.imageStatus === 'error'
                  ? 'border-destructive/50'
                  : 'border-border',
              )}
            >
              <SceneThumbnail scene={scene} />
              <span className="absolute bottom-0.5 left-1 font-mono text-[10px] text-white drop-shadow">
                {scene.id}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {viewerSceneId !== null && (
        <SceneViewerDialog
          scenes={scenes}
          sceneId={viewerSceneId}
          onClose={() => setViewerSceneId(null)}
          onNavigate={setViewerSceneId}
        />
      )}
    </div>
  )
}
