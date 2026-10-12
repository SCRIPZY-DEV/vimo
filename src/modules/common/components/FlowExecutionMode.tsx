import { useTranslation } from 'react-i18next'

// Único modo disponible para nuevas generaciones. No modifica intentos guardados.
export function FlowExecutionMode() {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      <p className="font-display text-sm font-semibold">
        {t('extension.executionLabel')}
      </p>
      <p className="inline-flex rounded-full bg-saffron px-4 py-1.5 font-display text-sm font-bold text-charcoal">
        {t('extension.executionTools')}
      </p>
    </div>
  )
}
