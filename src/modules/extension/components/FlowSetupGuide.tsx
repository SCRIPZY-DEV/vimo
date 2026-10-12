import { useTranslation } from 'react-i18next'
import type { FlowSetupGuideProps } from '@/modules/extension/types/flowSetup'

export function FlowSetupGuide({ detailsRef }: FlowSetupGuideProps) {
  const { t } = useTranslation()
  return (
    <details
      ref={detailsRef}
      className="rounded-2xl border border-border bg-card p-5"
    >
      <summary className="cursor-pointer font-display font-bold">
        {t('extension.setupGuideTitle')}
      </summary>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
        <li>{t('extension.setupGuideProfile')}</li>
        <li>{t('extension.setupGuideTools')}</li>
        <li>{t('extension.setupGuidePrepare')}</li>
        <li>{t('extension.setupGuideReady')}</li>
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">
        {t('extension.setupGuideNoGeneration')}
      </p>
    </details>
  )
}
