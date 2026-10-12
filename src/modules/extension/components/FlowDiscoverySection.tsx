import { useTranslation } from 'react-i18next'
import { Link2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { FlowAccountIdentity } from '@/modules/common/components/FlowAccountIdentity'
import type { FlowDiscoverySectionProps } from '@/modules/extension/types/flowSetup'

export function FlowDiscoverySection({
  detailsRef,
  profiles,
  loading,
  failed,
  busy,
  status,
  onLink,
}: FlowDiscoverySectionProps) {
  const { t } = useTranslation()
  const candidates = profiles.filter((profile) => !profile.linked)
  return (
    <details
      ref={detailsRef}
      className="rounded-2xl border border-border bg-card p-5"
    >
      <summary className="cursor-pointer font-display font-bold">
        {t('extension.discoverTitle')}
      </summary>
      <div className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('extension.discoverHint')}
        </p>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t('extension.setupDiscoveryFailed')}
          </p>
        )}
        {loading && (
          <p role="status" className="text-sm">
            {t('extension.discoveryChecking')}
          </p>
        )}
        {!loading && !failed && candidates.length === 0 && (
          <p className="text-sm">{t('extension.noProfiles')}</p>
        )}
        {candidates.map((profile) => (
          <div
            key={profile.discoveryId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
          >
            <div>
              <FlowAccountIdentity
                identity={profile.identity}
                reference={profile.discoveryId}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  profile.duplicateAccount
                    ? 'extension.duplicateAccount'
                    : !profile.trusted
                      ? 'extension.trustRequired'
                      : !profile.hasFlowTab
                        ? 'extension.openFlow'
                        : !profile.identity?.verified
                          ? 'extension.discoveryVerifyIdentity'
                          : status &&
                              status.linkedCount >= status.maxConnections
                            ? 'extension.discoveryLimit'
                            : !profile.canLink
                              ? 'extension.discoveryNotReady'
                              : 'extension.autoLinkHint',
                )}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!profile.canLink || busy || failed}
              onClick={() => onLink(profile.discoveryId)}
            >
              <Link2 className="mr-2 h-4 w-4" />
              {t('extension.link')}
            </Button>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          {t('extension.discoveryPrivacy')}
        </p>
      </div>
    </details>
  )
}
