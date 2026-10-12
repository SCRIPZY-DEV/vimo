import { flowSetupPreparation } from '@/modules/extension/utilities/flowSetupPreparation'
import { useTranslation } from 'react-i18next'
import { Unplug } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { FlowAccountIdentity } from '@/modules/common/components/FlowAccountIdentity'
import { FlowConnectionAvailability } from '@/modules/common/components/FlowConnectionAvailability'
import { shortFlowReference } from '@/modules/common/utilities/shortFlowReference'
import { FLOW_CURRENT_PROFILE_LIMIT } from '@/modules/extension/constants'
import {
  flowSetupAccountKey,
  flowSetupAccountHelpKey,
} from '@/modules/extension/utilities/flowSetupState'
import type { FlowSetupAccountsProps } from '@/modules/extension/types/flowSetup'

export function FlowSetupAccounts({
  sectionRef,
  connections,
  status,
  capacity,
  confirmed,
  busy,
  onRevoke,
}: FlowSetupAccountsProps) {
  const { t } = useTranslation()
  if (connections.length === 0) return null
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label={t('extension.accountsTitle')}
      className="space-y-2"
    >
      {connections.map((connection) => {
        const profile = capacity?.profiles?.find(
          (candidate) => candidate.connectionId === connection.connectionId,
        )
        const preparation = flowSetupPreparation(
          connection,
          status,
          capacity,
          confirmed,
        )
        const stateKey = flowSetupAccountKey(
          connection,
          profile,
          confirmed && preparation !== 'unconfirmed',
        )
        return (
          <article
            key={connection.connectionId}
            className="space-y-3 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <FlowAccountIdentity
                identity={connection.identity}
                connected={connection.connected}
                lastVerifiedIdentity={connection.lastVerifiedIdentity}
                reference={connection.connectionId}
                heading="h3"
              />
              <div className="space-y-1 text-sm sm:text-right">
                <p className="font-semibold">
                  {t(`extension.setupPreparation_${preparation}`)}
                </p>
                <p className="text-muted-foreground">{t(stateKey)}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t(flowSetupAccountHelpKey(stateKey))}
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {t('extension.setupAccountDetails')}
              </summary>
              <div className="mt-3 space-y-3">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">
                      {t('extension.project')}
                    </dt>
                    <dd>
                      {connection.binding
                        ? connection.binding.alias?.trim() ||
                          t('extension.projectLabel', {
                            reference: shortFlowReference(
                              connection.binding.projectId,
                            ),
                          })
                        : t('extension.noProject')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t('extension.localUsage')}
                    </dt>
                    <dd>
                      {connection.accountPolicy
                        ? t(
                            connection.scheduling
                              ? 'extension.usage'
                              : 'extension.usageWithoutActivity',
                            {
                              used: connection.accountPolicy.used,
                              limit: connection.accountPolicy.limit,
                              active: connection.scheduling?.activeCount,
                            },
                          )
                        : t('extension.usageUnknown')}
                    </dd>
                  </div>
                </dl>
                <FlowConnectionAvailability
                  connection={connection}
                  status={status}
                />
                <p className="text-xs text-muted-foreground">
                  {t('extension.setupPreparationOnly')}
                </p>
                {connection.accountPolicy?.limit != null &&
                  connection.accountPolicy.limit <
                    FLOW_CURRENT_PROFILE_LIMIT && (
                    <p className="text-xs">
                      {t('extension.policyUpdateNeeded', {
                        current: connection.accountPolicy.limit,
                        expected: FLOW_CURRENT_PROFILE_LIMIT,
                      })}
                    </p>
                  )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onRevoke(connection.connectionId)}
                >
                  <Unplug className="mr-1.5 h-4 w-4" />
                  {t('extension.unlink')}
                </Button>
              </div>
            </details>
          </article>
        )
      })}
    </section>
  )
}
