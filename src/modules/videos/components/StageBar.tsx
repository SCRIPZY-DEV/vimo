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

// Cada fase es una card alargada: completada en saffron, en curso en ocean,
// pendiente neutra (pedido del usuario sobre el look del origen).
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
    <ul className="space-y-2">
      {PIPELINE_STAGES.map((stage) => {
        const done = completedStages.includes(stage.id)
        const active = currentStage === stage.id
        const waiting = stage.id === pausedStageId

        if (waiting) {
          return (
            <li
              key={stage.id}
              className="rounded-xl border-2 border-saffron bg-saffron/10 px-3 py-2.5"
            >
              <span className="flex items-center gap-2.5 font-body text-sm font-semibold text-foreground">
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
              'flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 font-body text-sm transition-colors',
              done &&
                'border-saffron/60 bg-saffron/10 font-semibold text-foreground',
              active && 'border-ocean bg-ocean/5 font-semibold text-foreground',
              !done && !active && 'border-border bg-card text-muted-foreground',
            )}
          >
            {done ? (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-saffron">
                <Check className="h-3 w-3 text-charcoal" strokeWidth={3} />
              </span>
            ) : active ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ocean" />
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
