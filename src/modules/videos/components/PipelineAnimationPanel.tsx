import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clapperboard, Loader2, Play, AlertTriangle } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/modules/common/ui/dialog'
import { videosApi } from '@/modules/videos/api'
import { SceneThumbnail } from '@/modules/videos/components/SceneThumbnail'
import { ANIMATION_PROGRESS_TICK_MS } from '@/modules/videos/constants'
import { pipelineAnimationCards } from '@/modules/videos/utilities/pipelineAnimationCards'
import { animationProgressPercent } from '@/modules/videos/utilities/animationProgressPercent'
import { formatSceneSeconds } from '@/modules/videos/utilities/formatSceneSeconds'
import type { SceneView } from '@/modules/videos/types/create'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

interface PipelineAnimationPanelProps {
  scenes: SceneView[]
  endSeconds?: number
  videoFormat: VideoFormat
  active: boolean
  complete: boolean
}

// Lee el mismo plan puro del sidecar y cuenta clips, no imágenes absorbidas.
// El porcentaje dentro de un clip es orientativo, igual que en el editor;
// el 100% requiere el archivo listo y el cierre de la fase.
export function PipelineAnimationPanel({
  scenes,
  endSeconds,
  videoFormat,
  active,
  complete,
}: PipelineAnimationPanelProps) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const cards = pipelineAnimationCards(scenes, endSeconds).map((card) => {
    const { scene, animation } = card
    const ready = Boolean(animation?.clipPath)
    const failed = scene.animationActivity === 'error'
    const percent = ready
      ? 100
      : scene.animationProgress
        ? animationProgressPercent(scene.animationProgress, now)
        : 0
    return { ...card, ready, failed, percent }
  })
  const playing = cards.find((card) => card.id === openCardId)
  const readyCount = cards.filter((card) => card.ready).length
  const percent = complete
    ? 100
    : Math.min(
        99,
        Math.floor(
          cards.reduce((sum, card) => sum + card.percent, 0) /
            Math.max(1, cards.length),
        ),
      )

  useEffect(() => {
    if (!active) return
    const timer = setInterval(
      () => setNow(Date.now()),
      ANIMATION_PROGRESS_TICK_MS,
    )
    return () => clearInterval(timer)
  }, [active])

  return (
    <section className="space-y-4 rounded-2xl border-2 border-sky/40 bg-sky/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Clapperboard className="h-5 w-5 text-sky" />
          {t('create.stages.animation')}
        </h2>
        <span className="font-display text-xl font-extrabold tabular-nums text-sky">
          {percent}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t('create.stages.animation')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-sky/10"
      >
        <div
          className="h-full bg-sky transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="font-body text-sm text-muted-foreground" role="status">
        {t('create.progress.animationClipsCount', {
          ready: readyCount,
          total: cards.length,
        })}
      </p>
      {active && (
        <p className="font-body text-xs text-muted-foreground">
          {t('create.progress.animationProgressHint')}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 min-[1500px]:grid-cols-4">
        {cards.map(
          ({
            id,
            unit,
            scene,
            animation,
            ready,
            failed,
            percent: clipPercent,
          }) => (
            <button
              key={id}
              type="button"
              disabled={!ready}
              onClick={() => setOpenCardId(id)}
              className="overflow-hidden rounded-xl border-2 border-sky/30 bg-card text-left enabled:cursor-pointer enabled:hover:border-sky focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"
            >
              <div
                className={cn(
                  'relative overflow-hidden bg-muted',
                  videoFormat === '9:16' ? 'aspect-[9/12]' : 'aspect-video',
                )}
              >
                <SceneThumbnail
                  scene={scene}
                  className="h-full w-full object-contain"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                  {ready ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 font-display text-xs font-bold text-charcoal">
                      <Play className="h-4 w-4" />
                      {t('create.progress.animationPlay')}
                    </span>
                  ) : failed ? (
                    <AlertTriangle className="h-7 w-7 text-coral" />
                  ) : (
                    <span className="flex items-center gap-2 rounded-full bg-sky px-3 py-2 font-display text-sm font-bold">
                      {active && <Loader2 className="h-4 w-4 animate-spin" />}
                      {active
                        ? t(
                            scene.animationProgress?.phase === 'retrying'
                              ? 'create.progress.animationRetrying'
                              : 'create.progress.animationWorking',
                            {
                              percent: clipPercent,
                              attempt: scene.animationProgress?.attempt,
                              maxAttempts: scene.animationProgress?.maxAttempts,
                            },
                          )
                        : t('create.progress.animationPending')}
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-1 p-3">
                <p className="font-display text-sm font-bold">
                  {t('create.progress.animationScenes', {
                    ids: unit.sceneIds.join(' · '),
                    count: unit.sceneIds.length,
                  })}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {formatSceneSeconds(unit.startSeconds)} –{' '}
                  {formatSceneSeconds(unit.endSeconds)}
                </p>
                {failed && (
                  <p className="font-body text-xs text-coral">
                    {t('create.progress.animationClipFailed')}
                  </p>
                )}
                {animation && (
                  <span className="sr-only">
                    {t('create.progress.animationPlay')}
                  </span>
                )}
              </div>
            </button>
          ),
        )}
      </div>
      <Dialog
        open={Boolean(playing?.animation?.clipPath)}
        onOpenChange={(open) => {
          if (!open) setOpenCardId(null)
        }}
      >
        <DialogContent className="max-h-[90vh] w-[min(94vw,1000px)] max-w-none rounded-2xl border-2 border-sky/40 p-5">
          <DialogTitle>
            {t('create.progress.animationScenes', {
              ids: playing?.unit.sceneIds.join(' · '),
              count: playing?.unit.sceneIds.length ?? 0,
            })}
          </DialogTitle>
          <DialogDescription>
            {playing &&
              `${formatSceneSeconds(playing.unit.startSeconds)} – ${formatSceneSeconds(playing.unit.endSeconds)}`}
          </DialogDescription>
          {playing?.animation?.clipPath && (
            <video
              key={playing.animation.clipPath}
              src={`${videosApi.videoSource(playing.animation.clipPath)}?v=${playing.animation.clipMtimeMs ?? 0}`}
              controls
              autoPlay
              muted
              playsInline
              className="mx-auto max-h-[68vh] max-w-full rounded-xl bg-black"
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
