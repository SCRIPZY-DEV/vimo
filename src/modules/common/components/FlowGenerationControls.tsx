import { CirclePause, Images } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { FlowPauseButton } from '@/modules/common/components/FlowPauseButton'
import { useFlowPause } from '@/modules/common/hooks/useFlowPause'
import { useFlowStatus } from '@/modules/common/hooks/useFlowStatus'
import type { FlowGenerationControlsProps } from '@/modules/common/types/flowPause'
import { cn } from '@/modules/common/utilities/cn'
import { flowErrorKey } from '@/modules/common/utilities/flowErrorKey'
import { flowGenerationState } from '@/modules/common/utilities/flowGenerationState'

export function FlowGenerationControls({
  disabled = false,
  size = 'default',
}: FlowGenerationControlsProps) {
  const { t } = useTranslation()
  const flow = useFlowStatus()
  const pause = useFlowPause()
  const pending = pause.isPending || pause.isBlocked
  const {
    manualPaused,
    hasProviderHold,
    hasPendingWork,
    hasLimitedProfiles,
    hasRunningChecks,
    hasUnconfirmedChecks,
  } = flowGenerationState(flow.status)
  const showControl = manualPaused || hasPendingWork || pending
  const stateKey = () => {
    if (manualPaused) return 'extension.generationManualPaused'

    if (!flow.native) return 'extension.desktopOnly'

    if (!flow.status) {
      if (flow.isLoading) return 'extension.checking'

      return flow.errorKey ?? 'extension.unavailable'
    }

    if (hasProviderHold) return 'extension.generationProviderHold'

    if (hasRunningChecks) return 'extension.generationChecking'

    if (hasUnconfirmedChecks) return 'extension.generationCheckingUnconfirmed'

    if (hasPendingWork) return 'extension.generationWorkPending'

    if (hasLimitedProfiles) return 'extension.generationLimited'

    return 'extension.generationIdle'
  }
  const Icon = manualPaused ? CirclePause : Images

  return (
    <section
      aria-label={t('extension.generationControlsTitle')}
      className={cn(
        'space-y-3 rounded-xl border p-3',
        manualPaused
          ? 'border-2 border-saffron bg-saffron/10'
          : 'border-border bg-card',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">
            {t('extension.generationControlsTitle')}
          </p>
          <p
            role="status"
            className="flex items-start gap-2 text-sm font-semibold"
          >
            <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            {t(stateKey())}
          </p>
        </div>
        {showControl && (
          <FlowPauseButton
            disabled={
              disabled ||
              !flow.native ||
              !flow.status ||
              (flow.isError && !manualPaused)
            }
            size={size}
            manualPaused={manualPaused}
            pending={pending}
            pendingPaused={pause.pendingPaused}
            onPauseChange={pause.mutate}
          />
        )}
      </div>
      {manualPaused && (
        <p className="text-sm">{t('extension.generationManualPausedHelp')}</p>
      )}
      {hasProviderHold && (
        <p className="text-xs text-muted-foreground">
          {t('extension.generationProviderHoldHelp')}
        </p>
      )}
      {hasLimitedProfiles && (
        <p className="text-xs text-muted-foreground">
          {t('extension.generationLimitedHelp')}
        </p>
      )}
      {showControl && (
        <p className="text-xs text-muted-foreground">
          {t('extension.pauseScope')}
        </p>
      )}
      {flow.isError && flow.status && (
        <p role="alert" className="text-xs text-destructive">
          {t('extension.generationStatusStale')}
        </p>
      )}
      {pause.feedbackKey && (
        <p role="status" className="text-xs text-muted-foreground">
          {t(pause.feedbackKey, { count: pause.pendingCount })}
        </p>
      )}
      {pause.isError && (
        <p role="alert" className="text-xs text-destructive">
          {t(flowErrorKey(pause.error))}
        </p>
      )}
    </section>
  )
}
