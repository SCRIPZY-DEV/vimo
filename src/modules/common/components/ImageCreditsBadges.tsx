import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { CreditsBadge } from '@/modules/common/components/CreditsBadge'
import { cn } from '@/modules/common/utilities/cn'
import { formatCompact } from '@/modules/common/utilities/formatCompact'
import type { ImageCreditsResult } from '@pipeline/types/video-project.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

interface ImageCreditsBadgesProps {
  credits: ImageCreditsResult | null
  // Primera carga: las pills muestran un spinner en vez del saldo.
  loading: boolean
  // Refetch con saldo previo en pantalla: solo gira el botón de refrescar.
  refreshing: boolean
  // Pista visual: el proveedor elegido (en el formulario, para la escena o
  // para las muestras de un estilo); null = ninguno resaltado.
  active: ImageProviderId | null
  // Solo la pill del proveedor activo (el panel del editor, donde el resto
  // sería ruido); por defecto se ven las dos.
  onlyActive?: boolean
  onRefresh: () => void
}

// Pills con el saldo de cada proveedor de imagen + botón de refresco. El
// saldo de Fal llega en USD; el de Evolink, en créditos propios.
export function ImageCreditsBadges({
  credits,
  loading,
  refreshing,
  active,
  onlyActive = false,
  onRefresh,
}: ImageCreditsBadgesProps) {
  const { t } = useTranslation()
  const busy = loading || refreshing
  const showFal = !onlyActive || active === 'fal'
  const showEvolink = !onlyActive || active === 'evolink'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showFal && (
        <CreditsBadge
          provider="fal.ai"
          status={credits?.fal ?? null}
          loading={loading}
          active={active === 'fal'}
          formatBalance={(remaining, currency) =>
            `$${remaining.toFixed(2)} ${currency ?? 'USD'}`
          }
        />
      )}
      {showEvolink && (
        <CreditsBadge
          provider="evolink.ai"
          status={credits?.evolink ?? null}
          loading={loading}
          active={active === 'evolink'}
          formatBalance={(remaining) =>
            t('create.credits.balance', { amount: formatCompact(remaining) })
          }
        />
      )}
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
