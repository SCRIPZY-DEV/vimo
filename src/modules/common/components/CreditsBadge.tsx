import { useTranslation } from 'react-i18next'
import { AlertCircle, Loader2 } from 'lucide-react'
import { NOT_CONFIGURED_CREDITS_CODES } from '@/modules/common/constants'
import { cn } from '@/modules/common/utilities/cn'
import type { ProviderCreditsStatus } from '@pipeline/types/video-project.ts'

interface CreditsBadgeProps {
  provider: string
  status: ProviderCreditsStatus | null
  loading: boolean
  active: boolean
  formatBalance: (remaining: number, currency?: string) => string
}

// Pill con el saldo de un proveedor de imagen: spinner mientras carga, error
// con motivo si el proveedor no está disponible, o el saldo formateado.
export function CreditsBadge({
  provider,
  status,
  loading,
  active,
  formatBalance,
}: CreditsBadgeProps) {
  const { t } = useTranslation()

  const failed = status !== null && !status.available

  const content = () => {
    if (loading || status === null)
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />
    if (failed) {
      // Sin clave o clave rechazada = «Sin configurar»: al cliente no le
      // sirve saber que Fal pide una clave de admin para leer el saldo.
      const reasonKey = NOT_CONFIGURED_CREDITS_CODES.has(status.errorCode ?? '')
        ? 'create.credits.notConfigured'
        : 'create.credits.error'
      return (
        <span className="flex items-center gap-1 text-coral-text">
          <AlertCircle className="h-3.5 w-3.5" />
          {t(reasonKey)}
        </span>
      )
    }
    if (status.remaining === undefined) return <span>—</span>

    return (
      <span className="tabular-nums">
        {formatBalance(status.remaining, status.currency)}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5 font-display text-xs font-bold transition-colors',
        failed
          ? 'border-coral/50 bg-coral/10 text-foreground'
          : active
            ? 'border-saffron/60 bg-saffron/25 text-foreground shadow-sm shadow-saffron/20'
            : 'border-border bg-card/80 text-foreground/80',
      )}
    >
      <span className="font-extrabold">{provider}</span>
      <span className="opacity-50">·</span>
      {content()}
    </span>
  )
}
