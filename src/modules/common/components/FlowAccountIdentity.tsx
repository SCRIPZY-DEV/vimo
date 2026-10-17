import { useTranslation } from 'react-i18next'
import { shortFlowReference } from '@/modules/common/utilities/shortFlowReference'
import type { FlowAccountIdentityProps } from '@/modules/common/types/flowIdentity'

export function FlowAccountIdentity({
  identity,
  connected = true,
  lastVerifiedIdentity,
  reference,
  heading: Heading = 'p',
}: FlowAccountIdentityProps) {
  const { t } = useTranslation()
  const currentVerified = connected && identity?.verified === true
  const historicalIdentity =
    lastVerifiedIdentity?.verified === true
      ? lastVerifiedIdentity
      : !connected && identity?.verified === true
        ? identity
        : null
  const historical = !currentVerified && historicalIdentity !== null
  const displayedIdentity = currentVerified
    ? identity
    : historical
      ? historicalIdentity
      : null
  const name =
    displayedIdentity?.email?.trim() || displayedIdentity?.maskedEmail?.trim()
  const statusKey = () => {
    if (currentVerified) return 'extension.accountVerified'
    if (historical && name) return 'extension.lastVerifiedAccount'
    return 'extension.accountVerificationPending'
  }

  return (
    <div className="space-y-1">
      <Heading className="break-all font-display font-semibold">
        {name ||
          t('extension.accountUnknown', {
            reference: shortFlowReference(reference),
          })}
      </Heading>
      <p className="text-xs text-muted-foreground">{t(statusKey())}</p>
    </div>
  )
}
