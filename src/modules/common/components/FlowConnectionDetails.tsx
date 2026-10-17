import { flowGenerationState } from '@/modules/common/utilities/flowGenerationState'
import type { FlowConnectionControlsProps } from '@/modules/common/types/flowConnectionControls'
import { FlowAccountCounts } from '@/modules/common/components/FlowAccountCounts'
import { FlowGenerationControls } from '@/modules/common/components/FlowGenerationControls'
import { FlowAccountIdentity } from '@/modules/common/components/FlowAccountIdentity'
import { useTranslation } from 'react-i18next'
import { useFlowStatus } from '@/modules/common/hooks/useFlowStatus'
import { FlowConnectionAvailability } from '@/modules/common/components/FlowConnectionAvailability'

export function FlowConnectionDetails({
  showGenerationControls = true,
  progress,
}: FlowConnectionControlsProps) {
  const { t } = useTranslation()
  const flow = useFlowStatus()
  const { hasLimitedProfiles } = flowGenerationState(flow.status)
  const connections =
    flow.status?.connections.filter((connection) => !connection.revoked) ?? []
  const guidanceKey = () => {
    if (!flow.native) return 'extension.helpDesktop'
    if (flow.isLoading) return 'extension.helpChecking'
    if (flow.isError) return flow.errorKey ?? 'extension.helpUnavailable'
    if (flow.status?.manualPaused) return 'extension.helpManualPause'
    if (flow.status?.paused) return 'extension.helpProviderHold'
    if (flow.ready && hasLimitedProfiles) return 'extension.helpAllReadyLimited'
    if (flow.ready) return 'extension.helpAllReady'
    if (!connections.length) return 'extension.helpNoAccounts'
    return 'extension.helpMinimum'
  }

  return (
    <div className="space-y-3 font-body text-xs leading-relaxed">
      <FlowAccountCounts
        ready={flow.status?.readyProfiles}
        linked={flow.status?.linkedCount}
        minimum={flow.minimumProfiles}
      />
      {progress && (
        <dl className="space-y-1 border-t border-border pt-3">
          {(['total', 'ready', 'generating', 'pending'] as const).map((key) => (
            <div key={key} className="flex justify-between gap-3">
              <dt>{t(`extension.runImages.${key}`)}</dt>
              <dd className="font-semibold tabular-nums">
                {progress[key] ?? '—'}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p>{t(guidanceKey(), { minimum: flow.minimumProfiles })}</p>
      {showGenerationControls && <FlowGenerationControls size="sm" />}
      {(!flow.ready || hasLimitedProfiles) && connections.length > 0 && (
        <ul className="space-y-2">
          {connections.map((connection) => (
            <li
              key={connection.connectionId}
              className="space-y-0.5 border-t border-border pt-2"
            >
              <FlowAccountIdentity
                identity={connection.identity}
                connected={connection.connected}
                lastVerifiedIdentity={connection.lastVerifiedIdentity}
                reference={connection.connectionId}
              />
              <FlowConnectionAvailability
                connection={connection}
                status={flow.status}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
