import { useTranslation } from 'react-i18next'
import type { FlowAccountCountsProps } from '@/modules/common/types/flowAccountCounts'

export function FlowAccountCounts({
  ready,
  linked,
  minimum,
}: FlowAccountCountsProps) {
  const { t } = useTranslation()
  return (
    <dl className="grid gap-2 text-sm">
      <div className="flex justify-between gap-3">
        <dt>{t('extension.accountsReadyLabel')}</dt>
        <dd className="font-semibold tabular-nums">
          {t('extension.readyOfLinked', {
            ready: ready ?? '—',
            linked: linked ?? '—',
          })}
        </dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt>{t('extension.minimumReadyAccounts')}</dt>
        <dd className="font-semibold tabular-nums">{minimum}</dd>
      </div>
    </dl>
  )
}
