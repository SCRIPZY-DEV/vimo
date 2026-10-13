import { FlowAccountRecoveryHelp } from '@/modules/common/components/FlowAccountRecoveryHelp'
import { flowAccountRecoveryGuide } from '@/modules/common/utilities/flowAccountRecoveryGuide'
import { useTranslation } from 'react-i18next'
import type { FlowConnectionAvailabilityProps } from '@/modules/common/types/flowConnectionAvailability'
import { flowConnectionReadiness } from '@/modules/common/utilities/flowConnectionReadiness'

export function FlowConnectionAvailability({
  connection,
  status,
}: FlowConnectionAvailabilityProps) {
  const { t } = useTranslation()
  const { availabilityKey, helpKey } = flowConnectionReadiness(
    connection,
    status,
  )
  const recovery = flowAccountRecoveryGuide(connection.profileAvailability)
  const showRecovery = recovery?.titleKey === availabilityKey
  const showManualPause =
    status?.manualPaused &&
    availabilityKey !== 'extension.availability_manualPause'

  return (
    <div className="space-y-1">
      <p>{t(availabilityKey)}</p>
      {showRecovery ? (
        <FlowAccountRecoveryHelp
          availability={connection.profileAvailability}
        />
      ) : availabilityKey !== 'extension.availability_ready' ? (
        <p className="text-xs text-muted-foreground">{t(helpKey)}</p>
      ) : null}
      {showManualPause && (
        <p className="text-xs text-muted-foreground">
          {t('extension.availability_manualPause')}.{' '}
          {t('extension.helpManualPause')}
        </p>
      )}
    </div>
  )
}
