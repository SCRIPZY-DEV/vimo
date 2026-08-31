import { useTranslation } from 'react-i18next'
import { Check, Circle, Loader2, PauseCircle } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { PIPELINE_STAGES } from '@/modules/videos/constants'
import type { StageId } from '@pipeline/runner/stage-id.ts'

interface StageBarProps {
  currentStage: StageId | null
  completedStages: StageId[]
  // En pausa de confirmación: la fase que espera muestra pausa honesta en
  // vez de un spinner mentiroso (el job está cerrado).
  paused: boolean
}

export function StageBar({
  currentStage,
  completedStages,
  paused,
}: StageBarProps) {
  const { t } = useTranslation()

  // Con el job cerrado en pausa no hay currentStage: la fase que espera es
  // la primera sin completar.
  const pausedStageId = paused
    ? (PIPELINE_STAGES.find((stage) => !completedStages.includes(stage.id))
        ?.id ?? null)
    : null

  return (
    <ul className="space-y-1.5">
      {PIPELINE_STAGES.map((stage) => {
        const done = completedStages.includes(stage.id)
        const active = currentStage === stage.id
        const waiting = stage.id === pausedStageId

        if (waiting) {
          return (
            <li
              key={stage.id}
              className="rounded-lg border border-saffron bg-saffron/10 px-2 py-1.5"
            >
              <span className="flex items-center gap-2 font-body text-sm font-semibold text-foreground">
                <PauseCircle className="h-4 w-4 shrink-0 text-saffron" />
                {t(stage.labelKey)}
              </span>
              <span className="block pl-6 font-handwritten text-xs text-muted-foreground">
                {t('create.progress.waitingForYou')}
              </span>
            </li>
          )
        }

        return (
          <li
            key={stage.id}
            className={cn(
              'flex items-center gap-2 px-2 font-body text-sm',
              done && 'text-foreground',
              active && 'font-semibold text-foreground',
              !done && !active && 'text-muted-foreground',
            )}
          >
            {done ? (
              <Check className="h-4 w-4 shrink-0 text-saffron" />
            ) : active ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-saffron" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 opacity-40" />
            )}
            {t(stage.labelKey)}
          </li>
        )
      })}
    </ul>
  )
}
