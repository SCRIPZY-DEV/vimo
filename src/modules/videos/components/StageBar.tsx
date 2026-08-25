import { useTranslation } from 'react-i18next'
import { Check, Circle, Loader2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { PIPELINE_STAGES } from '@/modules/videos/constants'
import type { StageId } from '@pipeline/runner/stage-id.ts'

interface StageBarProps {
  currentStage: StageId | null
  completedStages: StageId[]
}

export function StageBar({ currentStage, completedStages }: StageBarProps) {
  const { t } = useTranslation()

  return (
    <ul className="space-y-1.5">
      {PIPELINE_STAGES.map((stage) => {
        const done = completedStages.includes(stage.id)
        const active = currentStage === stage.id
        return (
          <li
            key={stage.id}
            className={cn(
              'flex items-center gap-2 font-body text-sm',
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
