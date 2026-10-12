import { flowCheckingHelpKey } from '@/modules/common/utilities/flowCheckingHelpKey'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { FlowAccountCounts } from '@/modules/common/components/FlowAccountCounts'
import { FlowGenerationControls } from '@/modules/common/components/FlowGenerationControls'
import { FlowAccountIdentity } from '@/modules/common/components/FlowAccountIdentity'
import { FlowRefreshButton } from '@/modules/common/components/FlowRefreshButton'
import { useFlowCapacity } from '@/modules/common/hooks/useFlowCapacity'
import { flowCapacityMessageKey } from '@/modules/common/utilities/flowCapacityMessageKey'
import { flowCapacityReasonKeys } from '@/modules/common/utilities/flowCapacityReasonKeys'
import type { FlowCapacityNoticeProps } from '@/modules/common/types/flowCapacity'
import { ExtensionRoutes } from '@/modules/extension/constants'

export function FlowCapacityNotice({
  count,
  executionPlan,
}: FlowCapacityNoticeProps) {
  const { t } = useTranslation()
  const requestedCount = count === null ? null : Math.max(1, Math.ceil(count))
  // Conserva la consulta preliminar sin presentar su mínimo como tamaño del lote.
  const flow = useFlowCapacity(requestedCount ?? 1, true, { executionPlan })
  const { capacity, status } = flow
  const linked = capacity?.linkedCount ?? status?.linkedCount
  const minimum = flow.minimumProfiles
  const profiles = (capacity?.profiles ?? []).filter((profile) => {
    return !profile.reasons?.includes('revoked')
  })
  const blockedProfiles = profiles.filter((profile) => profile.available === 0)
  const messageKey = flowCapacityMessageKey({
    ...flow,
    countKnown: requestedCount !== null,
  })

  return (
    <details
      className="rounded-xl border border-ocean/20 bg-ocean/5 p-3 font-body text-xs"
      aria-busy={flow.isLoading}
    >
      <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ocean">
        {t('extension.capacitySummary')}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="font-semibold">
          {t(
            executionPlan
              ? 'extension.executionTools'
              : 'extension.executionRpc',
          )}
        </p>
        {executionPlan && (
          <p className="text-muted-foreground">
            {t('extension.executionProviderSeed')}
          </p>
        )}
        <FlowAccountCounts
          ready={
            capacity?.readyProfiles ??
            (executionPlan ? undefined : status?.readyProfiles)
          }
          linked={linked}
          minimum={minimum}
        />
        <FlowGenerationControls size="sm" />
        <dl className="grid gap-2" aria-live="polite">
          <div className="flex justify-between gap-3">
            <dt>
              {t(
                requestedCount === null
                  ? 'extension.capacityRequestedPending'
                  : 'extension.capacityRequested',
              )}
            </dt>
            <dd className="font-semibold tabular-nums">
              {requestedCount ?? '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>{t('extension.capacityAvailable')}</dt>
            <dd className="font-semibold tabular-nums">
              {capacity?.available ?? '—'}
            </dd>
          </div>
        </dl>
        <p className="font-semibold" role={flow.isError ? 'alert' : 'status'}>
          {t(messageKey, {
            linked,
            minimum,
            ready: capacity?.readyProfiles,
            missingLinked: Math.max(0, (minimum ?? 0) - (linked ?? 0)),
            count: requestedCount ?? undefined,
            available: capacity?.available,
            deficit: capacity?.deficit,
          })}
        </p>
        {flow.isError && flow.errorKey && (
          <p className="text-muted-foreground">{t(flow.errorKey)}</p>
        )}
        {blockedProfiles.length > 0 && (
          <div className="space-y-2 border-t border-ocean/15 pt-2">
            <p className="font-semibold">
              {t('extension.capacityBlockedAccounts')}
            </p>
            <ul className="space-y-3">
              {blockedProfiles.map((profile) => {
                const connection = status?.connections.find(
                  (item) => item.connectionId === profile.connectionId,
                )
                return (
                  <li key={profile.connectionId} className="space-y-1">
                    <FlowAccountIdentity
                      identity={profile.identity}
                      connected={
                        connection?.connected === true && !connection.revoked
                      }
                      lastVerifiedIdentity={connection?.lastVerifiedIdentity}
                      reference={profile.connectionId}
                    />
                    {flowCapacityReasonKeys(profile).map((key) => (
                      <p key={key}>{t(key)}</p>
                    ))}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        <details className="border-t border-ocean/15 pt-2">
          <summary className="cursor-pointer font-semibold">
            {t('extension.capacityDetails')}
          </summary>
          <p className="mt-2 text-muted-foreground">
            {t('extension.capacityExplanation')}
          </p>
          {profiles.length > 0 && (
            <ul className="mt-3 space-y-3">
              {profiles.map((profile) => {
                const connection = status?.connections.find(
                  (item) => item.connectionId === profile.connectionId,
                )
                return (
                  <li key={profile.connectionId} className="space-y-1">
                    <FlowAccountIdentity
                      identity={profile.identity}
                      connected={
                        connection?.connected === true && !connection.revoked
                      }
                      lastVerifiedIdentity={connection?.lastVerifiedIdentity}
                      reference={profile.connectionId}
                    />
                    <p>
                      {t('extension.capacityProfile', {
                        available: profile.available,
                        remaining: profile.quotaRemaining,
                        history: profile.historySlots,
                      })}
                    </p>
                    {(profile.localReserved ?? 0) +
                      (profile.bridgeReserved ?? 0) +
                      (profile.legacyReserved ?? 0) >
                      0 && (
                      <p className="text-muted-foreground">
                        {t('extension.capacityReservations', {
                          worker: profile.localReserved ?? 0,
                          coordinator: profile.bridgeReserved ?? 0,
                          previous: profile.legacyReserved ?? 0,
                        })}
                      </p>
                    )}
                    {profile.profileAvailability?.state === 'checking' && (
                      <p className="text-muted-foreground">
                        {t(
                          flowCheckingHelpKey(profile.profileAvailability) ??
                            'extension.helpAccountCheckingUnconfirmed',
                        )}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </details>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            className="inline-block font-semibold text-ocean underline"
            to={ExtensionRoutes.extension}
          >
            {t('extension.manage')}
          </Link>
          <FlowRefreshButton compact />
        </div>
      </div>
    </details>
  )
}
