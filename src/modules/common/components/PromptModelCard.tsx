import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import type { LlmModelProfile, ModelSpeed } from '@pipeline/types/llm-models.ts'

interface PromptModelCardProps {
  model: LlmModelProfile
  active: boolean
  disabled?: boolean
  // Sin onSelect la tarjeta es de solo lectura: el modo compacto muestra el
  // modelo en uso, no ofrece elegir.
  onSelect?: () => void
}

const SPEED_BADGE_CLASS: Record<ModelSpeed, string> = {
  fast: 'border-ocean/40 bg-ocean/10 text-ocean',
  medium: 'border-saffron/50 bg-saffron/15 text-saffron',
  slow: 'border-destructive/40 bg-destructive/10 text-destructive',
}

const SPEED_LABEL_KEY: Record<ModelSpeed, string> = {
  fast: 'create.promptModel.speed.fast',
  medium: 'create.promptModel.speed.medium',
  slow: 'create.promptModel.speed.slow',
}

// La tarjeta de un modelo: nombre, velocidad y autor. La comparten el selector
// (una por modelo, clickeable) y la vista compacta de Crear (solo la elegida).
export function PromptModelCard({
  model,
  active,
  disabled,
  onSelect,
}: PromptModelCardProps) {
  const { t } = useTranslation()

  const className = cn(
    'rounded-2xl border-2 px-5 py-3 text-left transition-colors',
    active ? 'border-saffron bg-saffron/10' : 'border-border bg-card',
    onSelect && !active && 'hover:bg-muted',
  )

  const content = (
    <>
      <div className="flex items-center gap-2">
        <span className="font-display text-base font-extrabold text-foreground">
          {model.label}
        </span>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 font-display text-[10px] font-bold tracking-wide',
            SPEED_BADGE_CLASS[model.speed],
          )}
        >
          {t(SPEED_LABEL_KEY[model.speed])}
        </span>
      </div>
      <span className="font-body text-sm text-muted-foreground">
        {model.author}
      </span>
    </>
  )

  if (!onSelect) return <div className={className}>{content}</div>

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onSelect}
      className={className}
    >
      {content}
    </button>
  )
}
