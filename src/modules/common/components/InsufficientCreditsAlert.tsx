import { useTranslation } from 'react-i18next'
import { Coins, ExternalLink, RefreshCw } from 'lucide-react'
import { Alert } from '@/modules/common/components/Alert'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import type {
  CreditsShortfallLine,
  CreditsUnit,
} from '@/modules/common/types/credits'

interface InsufficientCreditsAlertProps {
  lines: CreditsShortfallLine[]
  // Con true el aviso bloquea la acción (tono de peligro); con false solo
  // informa (saldo ilegible o gasto opcional).
  blocking: boolean
  // Abre la página de recarga del proveedor.
  onReload: (providerId: string) => void
  onRefresh?: () => void
  refreshing?: boolean
  className?: string
}

const UNIT_KEYS: Record<CreditsUnit, string> = {
  credits: 'common.credits.unitCredits',
  usd: 'common.credits.unitUsd',
  characters: 'common.credits.unitCharacters',
}

// Aviso de saldo por proveedor: qué se necesita, qué hay y el botón para
// recargar. Presentacional: las filas ya vienen comparadas.
export function InsufficientCreditsAlert({
  lines,
  blocking,
  onReload,
  onRefresh,
  refreshing = false,
  className,
}: InsufficientCreditsAlertProps) {
  const { t, i18n } = useTranslation()

  // Cuando bloquea, solo las cuentas que NO alcanzan: una fila «tenés
  // 536.965 · necesitás 219» bajo el título «Saldo insuficiente» confunde.
  // Sin bloqueo se muestran todas, como información.
  const visibleLines = blocking
    ? lines.filter((line) => line.sufficient === false)
    : lines
  if (visibleLines.length === 0) return null

  const formatAmount = (amount: number, unit: CreditsUnit) => {
    if (!Number.isFinite(amount)) return '∞'
    const rounded = unit === 'usd' ? amount.toFixed(2) : Math.ceil(amount)
    return t(UNIT_KEYS[unit], {
      amount: Number(rounded).toLocaleString(i18n.resolvedLanguage),
    })
  }

  return (
    <Alert
      tone={blocking ? 'danger' : 'warning'}
      icon={Coins}
      title={t(blocking ? 'common.credits.title' : 'common.credits.titleSoft')}
      className={className}
      actions={
        onRefresh && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={refreshing}
            title={t('common.credits.refresh')}
            aria-label={t('common.credits.refresh')}
            className="rounded-lg"
          >
            <RefreshCw
              className={cn('h-4 w-4', refreshing && 'animate-spin')}
            />
          </Button>
        )
      }
    >
      <ul className="mt-1 space-y-1.5">
        {visibleLines.map((line, index) => (
          <li
            key={`${line.providerId}-${index}`}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
          >
            <span className="min-w-0">
              <span className="font-display font-bold">
                {line.providerLabel}
              </span>
              <span className="opacity-60"> · </span>
              {line.estimated !== null && (
                <span>
                  {t('common.credits.needed', {
                    amount: formatAmount(line.estimated, line.unit),
                  })}
                  <span className="opacity-60"> · </span>
                </span>
              )}
              <span
                className={cn(
                  'tabular-nums',
                  line.sufficient === false && 'font-bold text-coral',
                )}
              >
                {line.available === null
                  ? t('common.credits.unavailable')
                  : t('common.credits.available', {
                      amount: formatAmount(line.available, line.unit),
                    })}
              </span>
              {line.informative && (
                <span className="ml-1 text-xs text-muted-foreground">
                  {t('common.credits.optional')}
                </span>
              )}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReload(line.providerId)}
              className="rounded-lg font-display"
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              {t('common.credits.reload')}
            </Button>
          </li>
        ))}
      </ul>
    </Alert>
  )
}
