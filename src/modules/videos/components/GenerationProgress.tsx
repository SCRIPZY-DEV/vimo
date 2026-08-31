import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  Loader2,
  Mic,
  Music2,
  PauseCircle,
  Plus,
  Timer,
  X,
} from 'lucide-react'
import DoodleStar from '@/modules/common/doodles/DoodleStar'
import { LabeledProgress } from '@/modules/common/components/LabeledProgress'
import { ProgressBar } from '@/modules/common/components/ProgressBar'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { videosApi } from '@/modules/videos/api'
import { SceneImagesGrid } from '@/modules/videos/components/SceneImagesGrid'
import { StageBar } from '@/modules/videos/components/StageBar'
import { VideoFileActions } from '@/modules/videos/components/VideoFileActions'
import { CANCEL_CONFIRM_WINDOW_MS } from '@/modules/videos/constants'
import { voiceProgressPercent } from '@/modules/videos/utilities/voiceProgressPercent'
import type { CreateTask } from '@/modules/videos/types/create'

interface GenerationProgressProps {
  task: CreateTask
  onCancel: () => void
  // Solo la vista de Create lo pasa: en Library el completado redirige al
  // player y este estado no se alcanza.
  onCreateAnother?: () => void
}

// Cronómetro honesto: descuenta los tramos en pausa (el tiempo que la
// persona tarda en confirmar no cuenta) y se congela al completar.
function elapsedSeconds(task: CreateTask): number {
  const end = task.finishedAt ?? Date.now()
  const livePause = task.pausedAt !== null ? end - task.pausedAt : 0
  return Math.max(
    0,
    Math.floor((end - task.startedAt - task.pausedMs - livePause) / 1000),
  )
}

// El cronómetro tiene su propio tick para no re-renderizar por segundo todo
// lo que cuelga de la tarea.
export function GenerationProgress({
  task,
  onCancel,
  onCreateAnother,
}: GenerationProgressProps) {
  const { t } = useTranslation()
  const [elapsed, setElapsed] = useState(() => elapsedSeconds(task))
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const paused = task.status === 'awaitingConfirmation'
  const finished = task.status === 'completed'

  useEffect(() => {
    const timer = setInterval(() => setElapsed(elapsedSeconds(task)), 1000)
    return () => clearInterval(timer)
  }, [task])

  useEffect(() => {
    if (!confirmingCancel) return undefined
    const timer = setTimeout(
      () => setConfirmingCancel(false),
      CANCEL_CONFIRM_WINDOW_MS,
    )
    return () => clearTimeout(timer)
  }, [confirmingCancel])

  const voice = task.voiceProgress
  const voicePercent = voiceProgressPercent(voice)

  // «Una fase, un panel» (origen v1.1.0): solo el panel de la fase que corre.
  // Reglas por datos y no solo por `stage`: al retomar, las fases vienen del
  // disco y `stage` es null hasta el primer evento del job.
  const completed = task.completedStages
  const showVoicePanel =
    voice !== null && (task.stage === 'voice' || !completed.includes('voice'))
  const showBgmPanel =
    task.bgmProgress !== null && task.bgmProgress.status !== 'completed'
  const showImagesPanel =
    completed.includes('scene-prompts') &&
    !completed.includes('render') &&
    task.stage !== 'render'
  const showRenderPanel = task.renderProgress !== null && !finished

  return (
    <div className="space-y-5 rounded-2xl border-2 border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <p className="truncate font-display text-lg font-extrabold text-foreground">
            {task.projectName}
          </p>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-display text-xs font-bold',
              paused || finished
                ? 'border-saffron/60 bg-saffron/10 text-foreground'
                : 'border-border bg-muted text-muted-foreground',
            )}
          >
            {finished ? (
              <Check className="h-3.5 w-3.5 text-saffron" />
            ) : paused ? (
              <PauseCircle className="h-3.5 w-3.5 text-saffron" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-saffron" />
            )}
            {finished
              ? t('create.progress.status.completed')
              : paused
                ? t('create.progress.status.paused')
                : t('create.progress.status.generating')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-sm tabular-nums text-muted-foreground">
            <Timer className="h-4 w-4" />
            {formatTime(elapsed)}
          </span>
          {finished ? (
            onCreateAnother && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCreateAnother}
                className="rounded-lg font-display"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                {t('create.completed.createAnother')}
              </Button>
            )
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!confirmingCancel) {
                  setConfirmingCancel(true)
                  return
                }
                setConfirmingCancel(false)
                onCancel()
              }}
              className="rounded-lg font-display text-muted-foreground"
            >
              <X className="mr-1.5 h-4 w-4" />
              {confirmingCancel
                ? t('create.progress.cancelConfirm')
                : t('create.progress.cancel')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <h2 className="font-display text-sm font-bold text-foreground">
            {t('create.progress.phasesTitle')}
          </h2>
          <StageBar
            currentStage={task.stage}
            completedStages={task.completedStages}
            paused={paused}
          />
          {task.audioDurationSeconds !== null && (
            <p className="rounded-lg bg-muted/40 px-3 py-2 font-body text-xs text-muted-foreground">
              {t('create.progress.audioSummary', {
                seconds: Math.round(task.audioDurationSeconds),
                scenes: task.scenes.length,
              })}
            </p>
          )}
        </aside>

        <div className="min-w-0 space-y-5">
          {finished && task.videoPath && (
            <div className="space-y-3 rounded-xl border-2 border-saffron/30 p-4">
              <div className="flex items-center gap-2">
                <DoodleStar size={28} />
                <p className="font-body text-sm text-muted-foreground">
                  {t('create.completed.subtitle')}
                </p>
              </div>
              <video
                src={videosApi.videoSource(task.videoPath)}
                controls
                className="w-full rounded-xl border border-border bg-black"
              />
              <VideoFileActions videoPath={task.videoPath} />
            </div>
          )}

          {showVoicePanel && voice && (
            <div className="space-y-2 rounded-xl border-2 border-ocean/40 bg-ocean/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                  <Mic className="h-4 w-4 text-ocean" />
                  {t('create.progress.voice', { chars: voice.totalChars })}
                </p>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {Math.round(voicePercent)}%
                </span>
              </div>
              <ProgressBar percent={voicePercent} />
            </div>
          )}

          {showBgmPanel && task.bgmProgress && (
            <div className="space-y-2 rounded-xl border-2 border-ocean/40 bg-ocean/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                  <Music2 className="h-4 w-4 text-ocean" />
                  {t('create.progress.music')}
                </p>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {Math.round(task.bgmProgress.percent)}%
                </span>
              </div>
              <ProgressBar percent={task.bgmProgress.percent} />
            </div>
          )}

          {showImagesPanel && <SceneImagesGrid scenes={task.scenes} />}

          {showRenderPanel && task.renderProgress && (
            <LabeledProgress
              label={t(`create.progress.render.${task.renderProgress.phase}`)}
              percent={task.renderProgress.percent}
            />
          )}

          {task.logs.length > 0 && (
            <details className="rounded-xl border border-border bg-background p-3">
              <summary className="cursor-pointer font-display text-sm text-muted-foreground">
                {t('create.progress.logs')}
              </summary>
              <ul className="mt-2 space-y-0.5">
                {task.logs.map((line, index) => (
                  <li
                    key={`${index}-${line.slice(0, 24)}`}
                    className="font-mono text-xs text-muted-foreground"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
