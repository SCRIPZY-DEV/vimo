import { useTranslation } from 'react-i18next'
import { Loader2, PlayCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'

interface DemoGateCardProps {
  // Clave i18n del estado en curso (revisando, descargando, preparando).
  messageKey: string
  // Porcentaje de la descarga; null = sin barra (revisando o preparando).
  percent: number | null
  // Clave i18n del fallo; con ella la tarjeta muestra «Reintentar».
  errorKey: string | null
  onRetry(): void
}

// Puerta de la demo (ADR-0029): una sola tarjeta centrada con el estado de la
// preparación del pack. Presentacional: la vista decide qué mostrar.
export function DemoGateCard({
  messageKey,
  percent,
  errorKey,
  onRetry,
}: DemoGateCardProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border-2 border-border bg-card p-8 text-center">
        <PlayCircle className="mx-auto h-10 w-10 text-saffron" />
        <h1 className="mt-3 font-display text-xl font-extrabold text-foreground">
          {t('createDemo.title')}
        </h1>

        {errorKey ? (
          <>
            <p className="mt-2 font-body text-sm text-muted-foreground">
              {t(errorKey)}
            </p>
            <Button
              onClick={onRetry}
              className="mt-4 rounded-xl bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('createDemo.retry')}
            </Button>
          </>
        ) : (
          <>
            <p className="mt-2 font-body text-sm text-muted-foreground">
              {t(messageKey)}
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              {percent !== null && (
                <span className="font-display text-sm font-bold tabular-nums text-foreground">
                  {percent}%
                </span>
              )}
            </div>
            {percent !== null && (
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-saffron transition-all"
                  style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
                />
              </div>
            )}
            <p className="mt-4 font-body text-xs text-muted-foreground/80">
              {t('createDemo.onceNote')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
