import { useTranslation } from 'react-i18next'
import { Check, Circle, Loader2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import type { GemAdaptationPhase } from '@/modules/videos/types/styles'

interface GemAdaptationProgressProps {
  phase: GemAdaptationPhase
  percent: number
}

type StepState = 'done' | 'active' | 'todo'

// Los tres pasos de la adaptación, en orden, con la clave de su texto.
const STEPS: {
  labelKey: string
  stateFor: (phase: GemAdaptationPhase) => StepState
}[] = [
  // La gema se guardó tal cual antes de arrancar: siempre hecho.
  { labelKey: 'create.gemTemplate.adaptStepSaved', stateFor: () => 'done' },
  {
    labelKey: 'create.gemTemplate.adaptStepAgent',
    stateFor: (phase) => (phase === 'agent' ? 'active' : 'done'),
  },
  {
    labelKey: 'create.gemTemplate.adaptStepSaving',
    stateFor: (phase) => (phase === 'saving' ? 'active' : 'todo'),
  },
]

// El avance de la adaptación de una gema, encima de su tarjeta en la galería:
// las fases con la que está en curso, la barra y el porcentaje en número
// (estimado por tiempo, ver gemAdaptationPercent). Presentacional.
export function GemAdaptationProgress({
  phase,
  percent,
}: GemAdaptationProgressProps) {
  const { t } = useTranslation()

  return (
    <div
      role="status"
      className="absolute inset-0 z-[5] flex flex-col justify-center gap-2 bg-background/85 px-4 backdrop-blur-[2px]"
    >
      <p className="font-display text-xs font-bold text-foreground">
        {t('create.gemTemplate.adaptingTitle')}
      </p>
      <ul className="space-y-1">
        {STEPS.map((step) => {
          const state = step.stateFor(phase)
          return (
            <li
              key={step.labelKey}
              className={cn(
                'flex items-center gap-1.5 font-body text-[11px] leading-tight',
                state === 'todo'
                  ? 'text-muted-foreground/70'
                  : 'text-foreground',
              )}
            >
              {state === 'done' && (
                <Check
                  className="h-3 w-3 shrink-0 text-emerald-500"
                  strokeWidth={3}
                />
              )}
              {state === 'active' && (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-saffron" />
              )}
              {state === 'todo' && <Circle className="h-3 w-3 shrink-0" />}
              {t(step.labelKey)}
            </li>
          )
        })}
      </ul>
      <div className="flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-saffron transition-all duration-500"
            style={{ width: `${Math.max(4, percent)}%` }}
          />
        </div>
        <span className="shrink-0 font-body text-[11px] font-bold tabular-nums text-foreground">
          {t('create.gemTemplate.adaptPercent', { percent })}
        </span>
      </div>
    </div>
  )
}
