import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { FLOW_TOOLS_EXECUTION_PLAN } from '@/modules/common/constants'
import { useFlowExecutionOptions } from '@/modules/common/hooks/useFlowExecutionOptions'
import { cn } from '@/modules/common/utilities/cn'
import type { FlowExecutionSelectorProps } from '@/modules/common/types/flowExecutionSelector'

export function FlowExecutionSelector({
  executionPlan,
  onChange,
  disabled = false,
}: FlowExecutionSelectorProps) {
  const { t } = useTranslation()
  const availability = useFlowExecutionOptions()
  const helpId = useId()
  const toolsSelected = executionPlan !== undefined

  return (
    <fieldset
      className="space-y-2"
      disabled={disabled}
      aria-describedby={helpId}
    >
      <legend className="mb-2 font-display text-sm font-semibold">
        {t('extension.executionLabel')}
      </legend>
      <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-border bg-muted p-0.5">
        <button
          type="button"
          aria-pressed={!toolsSelected}
          disabled={disabled}
          onClick={() => onChange(undefined)}
          className={cn(
            'rounded-full px-4 py-1.5 font-display text-sm font-bold transition-colors',
            !toolsSelected
              ? 'bg-saffron text-charcoal shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t('extension.executionRpc')}
        </button>
        <button
          type="button"
          aria-pressed={toolsSelected}
          disabled={disabled || !availability.toolsAvailable}
          onClick={() => onChange({ ...FLOW_TOOLS_EXECUTION_PLAN })}
          className={cn(
            'rounded-full px-4 py-1.5 font-display text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
            toolsSelected
              ? 'bg-saffron text-charcoal shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t('extension.executionTools')}
        </button>
      </div>
      <div
        id={helpId}
        className="space-y-1 font-body text-xs text-muted-foreground"
        aria-live="polite"
      >
        {availability.helpKey && (
          <p>
            {t(availability.helpKey, {
              ready: availability.readyProfiles,
              minimum: availability.minimumProfiles,
            })}
          </p>
        )}
        {toolsSelected && <p>{t('extension.executionProviderSeed')}</p>}
      </div>
    </fieldset>
  )
}
