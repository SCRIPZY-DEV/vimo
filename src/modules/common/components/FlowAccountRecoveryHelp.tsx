import { useTranslation } from 'react-i18next'
import type { FlowAccountRecoveryHelpProps } from '@/modules/common/types/flowAccountRecovery'
import { flowAccountRecoveryGuide } from '@/modules/common/utilities/flowAccountRecoveryGuide'

export function FlowAccountRecoveryHelp({
  availability,
}: FlowAccountRecoveryHelpProps) {
  const { t, i18n } = useTranslation()
  const guide = flowAccountRecoveryGuide(availability)
  if (!guide) return null

  const nextCheckAt = guide.nextCheckAt
  const validTime =
    typeof nextCheckAt === 'number' &&
    Number.isSafeInteger(nextCheckAt) &&
    nextCheckAt >= 0 &&
    nextCheckAt <= 8640000000000000
  const nextCheck = validTime
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(nextCheckAt)
    : null

  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      <p>{t(guide.helpKey)}</p>
      {nextCheck && (
        <p>{t('extension.recoveryNextCheck', { time: nextCheck })}</p>
      )}
      {guide.stepKeys.length > 0 && (
        <ol className="list-decimal space-y-1 pl-5">
          {guide.stepKeys.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ol>
      )}
    </div>
  )
}
