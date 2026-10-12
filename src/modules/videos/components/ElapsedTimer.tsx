import { useCallback, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, PauseCircle } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { formatElapsed } from '@/modules/videos/utilities/formatElapsed'
import { createTaskElapsedSeconds } from '@/modules/videos/utilities/createTaskElapsedSeconds'
import type { CreateTask } from '@/modules/videos/types/create'

interface ElapsedTimerProps {
  task: CreateTask
}

// La suscripción tiene identidad estable: eventos frecuentes del sidecar no
// reinician el tick. El snapshot es un número de segundos (o null), no un
// objeto nuevo; React puede comprobarlo al renderizar o remontar la vista.
function subscribeClock(listener: () => void) {
  const timer = setInterval(listener, 1000)
  return () => clearInterval(timer)
}

function subscribeFrozenClock() {
  return () => undefined
}

export function ElapsedTimer({ task }: ElapsedTimerProps) {
  const { t } = useTranslation()
  const paused = task.status === 'awaitingConfirmation'
  const frozen =
    paused ||
    task.status === 'completed' ||
    task.status === 'error' ||
    task.timingUnknown === true
  const { startedAt, pausedAt, pausedMs, finishedAt, timingUnknown } = task
  const getElapsed = useCallback(() => {
    return createTaskElapsedSeconds(
      { startedAt, pausedAt, pausedMs, finishedAt, timingUnknown },
      Date.now(),
    )
  }, [startedAt, pausedAt, pausedMs, finishedAt, timingUnknown])
  const elapsed = useSyncExternalStore(
    frozen ? subscribeFrozenClock : subscribeClock,
    getElapsed,
    getElapsed,
  )
  let title = t('create.progress.timer.title')
  if (paused) title = t('create.progress.timer.pausedTitle')
  if (elapsed === null) title = t('create.progress.timer.unavailableTitle')

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-body text-xs tabular-nums',
        paused
          ? 'border-saffron/40 bg-saffron/10 text-foreground'
          : 'border-border bg-muted/40',
      )}
      title={title}
    >
      {paused ? (
        <PauseCircle className="h-3.5 w-3.5 text-saffron" />
      ) : (
        <Clock className="h-3.5 w-3.5 text-saffron" />
      )}
      <span className="font-display font-semibold">
        {elapsed === null
          ? t('create.progress.timer.unavailable')
          : formatElapsed(elapsed)}
      </span>
      {paused && (
        <span className="font-display font-semibold text-saffron">
          {t('create.progress.timer.paused')}
        </span>
      )}
    </div>
  )
}
