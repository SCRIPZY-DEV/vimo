import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, X } from 'lucide-react'
import { LabeledProgress } from '@/modules/common/components/LabeledProgress'
import { Button } from '@/modules/common/ui/button'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { SceneImagesGrid } from '@/modules/videos/components/SceneImagesGrid'
import { StageBar } from '@/modules/videos/components/StageBar'
import { CANCEL_CONFIRM_WINDOW_MS } from '@/modules/videos/constants'
import { voiceProgressPercent } from '@/modules/videos/utilities/voiceProgressPercent'
import type { CreateTask } from '@/modules/videos/types/create'

interface GenerationProgressProps {
  task: CreateTask
  onCancel: () => void
}

// El cronómetro tiene su propio tick para no re-renderizar por segundo todo
// lo que cuelga de la tarea.
export function GenerationProgress({
  task,
  onCancel,
}: GenerationProgressProps) {
  const { t } = useTranslation()
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - task.startedAt) / 1000),
  )
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const startedAt = task.startedAt
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [startedAt])

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

  return (
    <div className="space-y-5 rounded-2xl border-2 border-saffron/30 bg-saffron/5 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-saffron" />
          <div>
            <p className="font-display text-lg font-extrabold text-foreground">
              {task.projectName}
            </p>
            <p className="font-body text-sm text-muted-foreground">
              {t('create.progress.elapsed', { time: formatTime(elapsed) })}
            </p>
          </div>
        </div>

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
      </div>

      <StageBar
        currentStage={task.stage}
        completedStages={task.completedStages}
      />

      {voice && (
        <LabeledProgress
          label={t('create.progress.voice', { chars: voice.totalChars })}
          percent={voicePercent}
        />
      )}

      {task.bgmProgress && task.bgmProgress.status !== 'completed' && (
        <LabeledProgress
          label={t('create.progress.music')}
          percent={task.bgmProgress.percent}
        />
      )}

      <SceneImagesGrid scenes={task.scenes} />

      {task.renderProgress && (
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
  )
}
