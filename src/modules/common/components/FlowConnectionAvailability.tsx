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
  const showManualPause =
    status?.manualPaused &&
    availabilityKey !== 'extension.availability_manualPause'

  return (
    <div className="space-y-1">
      <p>{t(availabilityKey)}</p>
      {availabilityKey !== 'extension.availability_ready' && (
        <p className="text-xs text-muted-foreground">{t(helpKey)}</p>
      )}
      {showManualPause && (
        <p className="text-xs text-muted-foreground">
          {t('extension.availability_manualPause')}.{' '}
          {t('extension.helpManualPause')}
        </p>
      )}
    </div>
  )
}
