import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2, RefreshCw, Wallet } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { useMusicCredits } from '@/modules/music/hooks/useMusicCredits'

const CONTAINER_CLASS =
  'inline-flex items-center gap-2.5 rounded-2xl border-2 border-saffron/40 bg-saffron/10 px-4 py-2'
const LABEL_CLASS =
  'font-display text-[10px] font-bold uppercase tracking-wide text-muted-foreground'

// Saldo de créditos de Evolink (proveedor de la música). Es dueño de su query.
export function MusicCreditsBadge() {
  const { t } = useTranslation()
  const { isNative, credits, isLoading, isError, isFetching, refresh } =
    useMusicCredits()

  if (!isNative) return null

  if (isLoading)
    return (
      <div className={CONTAINER_CLASS}>
        <Loader2 className="h-4 w-4 animate-spin text-saffron" />
        <p className={LABEL_CLASS}>{t('music.credits.loading')}</p>
      </div>
    )

  const refreshButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={isFetching}
      onClick={() => void refresh()}
      aria-label={t('music.credits.refresh')}
      className="h-7 w-7 rounded-lg text-saffron hover:text-saffron"
    >
      <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
    </Button>
  )

  if (isError || !credits)
    return (
      <div className={CONTAINER_CLASS}>
        <AlertTriangle className="h-4 w-4 text-saffron" />
        <p className={LABEL_CLASS}>{t('music.credits.unavailable')}</p>
        {refreshButton}
      </div>
    )

  return (
    <div className={CONTAINER_CLASS}>
      <Wallet className="h-4 w-4 text-saffron" />
      <div className="text-left">
        <p className={LABEL_CLASS}>{t('music.saldo')}</p>
        <p className="font-display text-base font-extrabold leading-tight tabular-nums text-foreground">
          {credits.unlimited
            ? '∞'
            : Math.floor(credits.remaining).toLocaleString()}
        </p>
      </div>
      {refreshButton}
    </div>
  )
}
