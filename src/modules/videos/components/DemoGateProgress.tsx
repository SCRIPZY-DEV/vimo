import { useTranslation } from 'react-i18next'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { formatPercent } from '@/modules/videos/utilities/formatPercent'
import type { DemoPrepareProgress } from '@/modules/videos/types/demo'

interface DemoGateProgressProps {
  messageKey: string
  // El avance; null = sin barra (revisando o arrancando).
  progress: DemoPrepareProgress | null
  // Con la descarga en marcha: la nota de que sigue aunque se salga.
  downloading: boolean
  // Solo mientras se espera a otro demo-prepare: relanzar el propio.
  onRetry?: () => void
}

// El avance de la puerta: el porcentaje total con su barra y, si el job lo
// informa, «Parte X de N». El estado y la parte se anuncian sin interrumpir;
// el porcentaje no, que cambia a cada rato: lo da la barra.
export function DemoGateProgress({
  messageKey,
  progress,
  downloading,
  onRetry,
}: DemoGateProgressProps) {
  const { t, i18n } = useTranslation()
  const percent = progress?.percent ?? null
  const part = progress?.part ?? null
  const parts = progress?.parts ?? null

  return (
    <>
      <div aria-live="polite">
        <p className="mt-2 font-body text-sm text-muted-foreground">
          {t(messageKey)}
        </p>
        {part !== null && parts !== null && (
          <p className="mt-1 font-body text-xs tabular-nums text-muted-foreground">
            {t('createDemo.progress.part', { part, parts })}
          </p>
        )}
      </div>
      <div className="mt-4 flex items-center justify-center gap-3">
        <Loader2
          aria-hidden
          className="h-5 w-5 animate-spin text-muted-foreground"
        />
        {percent !== null && (
          <span className="font-display text-sm font-bold tabular-nums text-foreground">
            {formatPercent(percent, i18n.resolvedLanguage)}
          </span>
        )}
      </div>
      {percent !== null && (
        <div
          role="progressbar"
          aria-label={t('createDemo.progress.label')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-saffron transition-all"
            style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
          />
        </div>
      )}
      {downloading && (
        <p className="mt-4 font-body text-xs text-muted-foreground/80">
          {t('createDemo.progress.background')}
        </p>
      )}
      {onRetry && (
        <Button
          variant="outline"
          onClick={onRetry}
          className="mt-4 rounded-xl font-display font-bold"
        >
          <RefreshCw aria-hidden className="mr-2 h-4 w-4" />
          {t('createDemo.retry')}
        </Button>
      )}
    </>
  )
}
