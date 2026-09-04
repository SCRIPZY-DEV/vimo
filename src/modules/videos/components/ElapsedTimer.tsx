import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, PauseCircle } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { formatElapsed } from '@/modules/videos/utilities/formatElapsed'
import type {
  CreateTask,
  CreateTaskTiming,
} from '@/modules/videos/types/create'

interface ElapsedTimerProps {
  task: CreateTask
}

// Cronómetro honesto (origen v1.1.0): descuenta los tramos en pausa —el
// tiempo que la persona tarda en confirmar no cuenta— y se congela al
// completar.
function elapsedSeconds(timing: CreateTaskTiming): number {
  const end = timing.finishedAt ?? Date.now()
  const livePause = timing.pausedAt !== null ? end - timing.pausedAt : 0
  return Math.max(
    0,
    Math.floor((end - timing.startedAt - timing.pausedMs - livePause) / 1000),
  )
}

// Chip del reloj de la cabecera (port de Cronometro.tsx). Tiene su propio
// tick para no re-renderizar por segundo todo lo que cuelga de la tarea.
export function ElapsedTimer({ task }: ElapsedTimerProps) {
  const { t } = useTranslation()
  // El intervalo depende solo de las marcas de tiempo, nunca de `task`: cada
  // evento del sidecar (voz cada 1 s, imágenes cada 250 ms por escena, ffmpeg
  // cada 500 ms) crea una tarea nueva, y un efecto atado a ella reiniciaba el
  // intervalo antes de que llegara a disparar: el reloj quedaba clavado toda
  // la fase y saltaba recién en la pausa, cuando paraban los eventos.
  const { startedAt, pausedAt, pausedMs, finishedAt } = task
  const [elapsed, setElapsed] = useState(() => elapsedSeconds(task))

  const paused = task.status === 'awaitingConfirmation'
  // Al completar lo congela finishedAt; al fallar no hay marca de tiempo, así
  // que simplemente deja de contar (el origen para el reloj en el error).
  const frozen = task.status === 'completed' || task.status === 'error'

  useEffect(() => {
    if (frozen) return undefined
    const timing = { startedAt, pausedAt, pausedMs, finishedAt }
    const timer = setInterval(() => setElapsed(elapsedSeconds(timing)), 1000)
    return () => clearInterval(timer)
  }, [startedAt, pausedAt, pausedMs, finishedAt, frozen])

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-body text-xs tabular-nums',
        paused
          ? 'border-saffron/40 bg-saffron/10 text-foreground'
          : 'border-border bg-muted/40',
      )}
      title={
        paused
          ? t('create.progress.timer.pausedTitle')
          : t('create.progress.timer.title')
      }
    >
      {paused ? (
        <PauseCircle className="h-3.5 w-3.5 text-saffron" />
      ) : (
        <Clock className="h-3.5 w-3.5 text-saffron" />
      )}
      <span className="font-display font-semibold">
        {formatElapsed(elapsed)}
      </span>
      {paused && (
        <span className="font-display font-semibold text-saffron">
          {t('create.progress.timer.paused')}
        </span>
      )}
    </div>
  )
}
