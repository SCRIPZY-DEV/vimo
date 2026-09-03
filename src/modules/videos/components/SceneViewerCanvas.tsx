import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { SceneThumbnail } from '@/modules/videos/components/SceneThumbnail'
import { SUPPORT_NOTE_CLASS } from '@/modules/videos/constants'
import { formatSceneSeconds } from '@/modules/videos/utilities/formatSceneSeconds'
import { aspectClass, isVertical } from '@/modules/videos/utilities/videoFormat'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
import type { SceneView } from '@/modules/videos/types/create'

interface SceneViewerCanvasProps {
  scene: SceneView
  videoFormat: VideoFormat
}

// Lo grande del visor (port de LienzoDeLaEscena del origen): la imagen si
// está, o un recuadro con la forma del video que cuenta en qué anda la
// escena. En 9:16 el recuadro se acota por alto, no por ancho: si no, un
// short ocupaba media pantalla.
export function SceneViewerCanvas({
  scene,
  videoFormat,
}: SceneViewerCanvasProps) {
  const { t } = useTranslation()

  const generating = scene.imageStatus === 'generating'
  const progress =
    generating && typeof scene.imageProgress === 'number'
      ? Math.min(100, Math.max(0, scene.imageProgress))
      : null

  return (
    <div className="space-y-2">
      {scene.imagePath && scene.imageStatus === 'ok' ? (
        <SceneThumbnail
          scene={scene}
          className="mx-auto max-h-[58vh] w-auto rounded-2xl border-2 border-border object-contain"
        />
      ) : (
        <div
          className={cn(
            'mx-auto flex flex-col items-center justify-center gap-3 rounded-2xl border-2',
            aspectClass(videoFormat),
            isVertical(videoFormat) ? 'h-[58vh] w-auto' : 'w-full max-w-3xl',
            generating && 'border-ocean/60 bg-ocean/10',
            scene.imageStatus === 'error' &&
              'border-destructive/60 bg-destructive/10',
            scene.imageStatus === 'pending' &&
              'animate-pulse border-border bg-muted/40',
          )}
        >
          {generating && (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-ocean" />
              {progress !== null && (
                <>
                  <span className="font-display text-4xl font-extrabold tabular-nums text-ocean">
                    {Math.round(progress)}%
                  </span>
                  <div className="h-1.5 w-48 overflow-hidden rounded-full bg-black/10">
                    <div
                      className="h-full bg-ocean transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </>
              )}
              <p className={cn(SUPPORT_NOTE_CLASS, 'text-muted-foreground')}>
                {t('create.viewer.generating')}
              </p>
            </>
          )}
          {scene.imageStatus === 'pending' && (
            <>
              <span
                className={cn(SUPPORT_NOTE_CLASS, 'text-muted-foreground/50')}
              >
                ?
              </span>
              <p className={cn(SUPPORT_NOTE_CLASS, 'text-muted-foreground')}>
                {t('create.viewer.pending')}
              </p>
            </>
          )}
          {scene.imageStatus === 'error' && (
            <>
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <p className="max-w-md px-6 text-center font-body text-sm text-destructive">
                {t('create.viewer.failed')}
              </p>
            </>
          )}
        </div>
      )}

      <p className="text-center font-display text-xs font-bold tabular-nums text-muted-foreground">
        {formatSceneSeconds(scene.startSeconds ?? 0)} –{' '}
        {formatSceneSeconds(scene.endSeconds ?? 0)}
      </p>
    </div>
  )
}
