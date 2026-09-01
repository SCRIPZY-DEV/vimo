import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import { SceneThumbnail } from '@/modules/videos/components/SceneThumbnail'
import { SceneViewerDialog } from '@/modules/videos/components/SceneViewerDialog'
import type { SceneSummary } from '@pipeline/types/scenes.ts'

interface SceneImagesGridProps {
  scenes: SceneSummary[]
}

export function SceneImagesGrid({ scenes }: SceneImagesGridProps) {
  const { t } = useTranslation()
  // Escena abierta en el visor; null = cerrado.
  const [viewerSceneId, setViewerSceneId] = useState<number | null>(null)

  if (scenes.length === 0) return null

  const ready = scenes.filter((scene) => scene.imageStatus === 'ok').length

  return (
    <div className="space-y-2">
      <p className="font-body text-sm text-muted-foreground">
        {t('create.progress.imagesCount', {
          ready,
          total: scenes.length,
        })}
      </p>
      <ul className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {scenes.map((scene) => (
          <li key={scene.id}>
            <button
              type="button"
              title={scene.text}
              onClick={() => setViewerSceneId(scene.id)}
              className={cn(
                'relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/40 transition-all hover:border-saffron/60 focus:outline-none focus:ring-2 focus:ring-saffron/50',
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
