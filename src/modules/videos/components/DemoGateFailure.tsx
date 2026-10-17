import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { demoFailureMessage } from '@/modules/videos/utilities/demoFailureMessage'

interface DemoGateFailureProps {
  // El código del fallo; null o desconocido = el aviso genérico.
  errorCode: string | null
  // Con el disco lleno: el espacio libre que hace falta (los GB del aviso).
  requiredFreeBytes: number | null
  onRetry(): void
}

// Un fallo de la puerta con su porqué y «Reintentar».
export function DemoGateFailure({
  errorCode,
  requiredFreeBytes,
  onRetry,
}: DemoGateFailureProps) {
  const { t, i18n } = useTranslation()
  const message = demoFailureMessage(
    errorCode,
    requiredFreeBytes,
    i18n.resolvedLanguage,
  )

  return (
    <>
      <p className="mt-2 font-body text-sm text-muted-foreground">
        {t(message.key, message.values)}
      </p>
      <Button
        onClick={onRetry}
        className="mt-4 rounded-xl bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
      >
        <RefreshCw aria-hidden className="mr-2 h-4 w-4" />
        {t('createDemo.retry')}
      </Button>
    </>
  )
}
