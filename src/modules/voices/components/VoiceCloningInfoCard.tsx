import { useTranslation } from 'react-i18next'
import { Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { voicesApi } from '@/modules/voices/api'

export function VoiceCloningInfoCard() {
  const { t } = useTranslation()

  if (!voicesApi.isNative()) return null

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-border bg-card p-6 shadow-card">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-saffron/20">
          <Copy className="h-5 w-5 text-saffron" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">
            {t('voices.clonacion.titulo')}
          </h2>
          <p className="font-body text-sm text-muted-foreground">
            {t('voices.clonacion.descripcion')}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        onClick={() => void voicesApi.openCloningDashboard()}
        className="rounded-xl font-display"
      >
        <ExternalLink className="mr-2 h-4 w-4" />
        {t('voices.clonacion.abrirDashboard')}
      </Button>
    </section>
  )
}
