import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  demoDownloadGigabytes,
  formatGigabytes,
} from '@/modules/videos/utilities/demoGigabytes'

interface DemoGateOfferProps {
  // Lo que pesa el pack entero; sin partes configuradas (0) no se muestra.
  downloadBytes: number
  onDownload(): void
}

// Antes de bajar varios GB, la puerta dice cuánto pesa la demo y cuánto puede
// tardar, y espera a que la persona la pida (spec demo v4 §3 «Descarga»).
export function DemoGateOffer({
  downloadBytes,
  onDownload,
}: DemoGateOfferProps) {
  const { t, i18n } = useTranslation()
  const gigabytes = formatGigabytes(
    demoDownloadGigabytes(downloadBytes),
    i18n.resolvedLanguage,
  )

  return (
    <>
      {downloadBytes > 0 && (
        <p className="mt-2 font-display text-sm font-bold text-foreground">
          {t('createDemo.download.size', { gb: gigabytes })}
        </p>
      )}
      <p className="mt-2 font-body text-sm text-muted-foreground">
        {t('createDemo.savedNote')}
      </p>
      <p className="mt-2 font-body text-xs text-muted-foreground/80">
        {t('createDemo.download.note')}
      </p>
      <Button
        onClick={onDownload}
        className="mt-4 rounded-xl bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
      >
        <Download aria-hidden className="mr-2 h-4 w-4" />
        {t('createDemo.download.start')}
      </Button>
    </>
  )
}
