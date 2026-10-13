import { flowGenerationState } from '@/modules/common/utilities/flowGenerationState'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, PlugZap } from 'lucide-react'
import { useFlowStatus } from '@/modules/common/hooks/useFlowStatus'
import { FlowConnectionDetails } from '@/modules/common/components/FlowConnectionDetails'
import { FlowRefreshButton } from '@/modules/common/components/FlowRefreshButton'
import { cn } from '@/modules/common/utilities/cn'
import type { FlowConnectionControlsProps } from '@/modules/common/types/flowConnectionControls'

export function FlowConnectionBadge({
  showGenerationControls = true,
  progress,
}: FlowConnectionControlsProps) {
  const { t } = useTranslation()
  const flow = useFlowStatus()
  const { hasLimitedProfiles } = flowGenerationState(flow.status)
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const statusLabel = () => {
    if (!flow.native) return 'extension.desktopOnly'
    if (flow.isLoading) return 'extension.checking'
    if (flow.isError) return flow.errorKey ?? 'extension.unavailable'
    if (flow.status?.manualPaused) return 'extension.paused'
    if (flow.status?.paused) return 'extension.providerHold'
    if (flow.ready && hasLimitedProfiles) return 'extension.readyLimited'
    if (flow.ready) return 'extension.ready'
    if (flow.status?.linkedCount) return 'extension.linkedNotReady'
    return 'extension.disconnected'
  }

  return (
    <div className="max-w-full space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((value) => !value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-left font-display font-semibold transition-colors hover:bg-ocean/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            flow.ready
              ? 'border-ocean/40 bg-ocean/10 text-ocean'
              : 'border-saffron/50 bg-saffron/10 text-foreground',
          )}
        >
          <PlugZap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t(statusLabel())}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-transform',
              expanded && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
        <FlowRefreshButton compact />
      </div>
      <div
        id={detailsId}
        role="region"
        aria-label={t('extension.connectionDetails')}
        hidden={!expanded}
        className="max-w-lg rounded-xl border border-border bg-card p-3"
      >
        {expanded && (
          <FlowConnectionDetails
            showGenerationControls={showGenerationControls}
            progress={progress}
          />
        )}
      </div>
    </div>
  )
}
