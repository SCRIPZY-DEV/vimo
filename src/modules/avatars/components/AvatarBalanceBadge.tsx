import { useTranslation } from 'react-i18next'
import { AlertCircle, RefreshCw, Wallet } from 'lucide-react'
import { Skeleton } from '@/modules/common/ui/skeleton'
import { cn } from '@/modules/common/utilities/cn'
import { formatCompact } from '@/modules/common/utilities/formatCompact'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import { useAvatarBalance } from '@/modules/avatars/hooks/useAvatarBalance'

// Saldo de HeyGen en una píldora (el molde de CreditsBadge, a la altura de
// los botones de la cabecera) con su botón de refrescar, que gira mientras
// relee. Se actualiza solo tras cada cobro; el botón es para los casos
// especiales. Sin la app nativa o sin la clave de HeyGen no se muestra; si
// HeyGen no da el saldo, dice «saldo no disponible» sin romper la vista. Es
// dueño de su consulta: se monta tal cual donde haga falta ver el saldo.
export function AvatarBalanceBadge() {
  const { t, i18n } = useTranslation()
  const { status, loading, refreshing, refresh } = useAvatarBalance()

  if (!status && !loading) return null

  const failed = status !== null && !status.available

  // La billetera verificada viene en dólares (`usd`); la OpenAPI de HeyGen
  // admite también `credits`, que no es una moneda: va como créditos.
  const amount = () => {
    if (!status || status.remaining === undefined) return '—'
    if (status.currency === undefined || status.currency === 'usd')
      return formatUsd(status.remaining, i18n.resolvedLanguage ?? 'es')

    return t('avatars.saldo.creditos', {
      amount: formatCompact(status.remaining),
    })
  }

  const content = () => {
    if (!status) {
      return (
        <Skeleton className="h-3.5 w-14 rounded-full bg-muted-foreground/20" />
      )
    }

    if (failed) {
      return (
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <AlertCircle aria-hidden className="h-3.5 w-3.5 text-coral" />
          {t('avatars.saldo.noDisponible')}
        </span>
      )
    }

    return (
      <span className="text-sm font-extrabold tabular-nums text-foreground">
        {amount()}
      </span>
    )
  }

  return (
    <div
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-full border-2 pl-4 pr-1.5 font-display text-xs transition-colors',
        failed
          ? 'border-coral/50 bg-coral/10'
          : 'border-saffron/50 bg-saffron/10',
      )}
    >
      <Wallet aria-hidden className="h-4 w-4 shrink-0 text-saffron" />
      <span className="font-bold text-muted-foreground">
        {providerLabel('heygen')}
      </span>
      <span aria-hidden className="text-muted-foreground/50">
        ·
      </span>
      <span aria-live="polite" className="flex items-center">
        {content()}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        aria-label={t('avatars.saldo.refrescar')}
        title={t('avatars.saldo.refrescar')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron disabled:cursor-default disabled:hover:bg-transparent"
      >
        <RefreshCw
          aria-hidden
          className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
        />
      </button>
    </div>
  )
}
