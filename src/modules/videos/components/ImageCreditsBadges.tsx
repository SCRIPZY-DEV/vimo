import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { CreditsBadge } from '@/modules/videos/components/CreditsBadge'
import { formatCompact } from '@/modules/videos/utilities/formatCompact'
import type { ImageCreditsResult } from '@pipeline/types/video-project.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

interface ImageCreditsBadgesProps {
  credits: ImageCreditsResult | null
  // Primera carga: las pills muestran un spinner en vez del saldo.
  loading: boolean
  // Refetch con saldo previo en pantalla: solo gira el botón de refrescar.
  refreshing: boolean
  // Pista visual: el proveedor elegido (en el formulario o para la escena).
  active: ImageProviderId
  onRefresh: () => void
}

// Pills con el saldo de cada proveedor de imagen + botón de refresco. El
// saldo de Fal llega en USD; el de Evolink, en créditos propios.
export function ImageCreditsBadges({
  credits,
  loading,
  refreshing,
  active,
  onRefresh,
}: ImageCreditsBadgesProps) {
  const { t } = useTranslation()
  const busy = loading || refreshing

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CreditsBadge
        provider="fal.ai"
        status={credits?.fal ?? null}
        loading={loading}
        active={active === 'fal'}
        formatBalance={(remaining, currency) =>
          `$${remaining.toFixed(2)} ${currency ?? 'USD'}`
        }
      />
      <CreditsBadge
        provider="evolink.ai"
        status={credits?.evolink ?? null}
        loading={loading}
        active={active === 'evolink'}
        formatBalance={(remaining) =>
          t('create.credits.balance', { amount: formatCompact(remaining) })
        }
      />
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        title={t('create.credits.refresh')}
        aria-label={t('create.credits.refresh')}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted transition-colors hover:bg-saffron/20 hover:text-saffron disabled:opacity-40"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
      </button>
    </div>
  )
}
