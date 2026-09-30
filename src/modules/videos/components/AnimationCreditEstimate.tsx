import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'
import { animationCostEstimate } from '@/modules/videos/utilities/animationCostEstimate'

interface AnimationCreditEstimateProps {
  requestedSeconds: number
  slotSeconds?: number
  clipCount?: number
}

// Solo el próximo encargo: el coste histórico queda fuera de este recuadro.
export function AnimationCreditEstimate({
  requestedSeconds,
  slotSeconds,
  clipCount,
}: AnimationCreditEstimateProps) {
  const { t, i18n } = useTranslation()
  const format = new Intl.NumberFormat(i18n.resolvedLanguage, {
    maximumFractionDigits: 2,
  })
  const credits = animationCostEstimate('kie', requestedSeconds).estimated

  return (
    <div
      role="note"
      aria-label={t('create.animation.estimateTitle')}
      className="rounded-lg border border-sky/40 bg-sky/10 p-3"
    >
      <p className="flex items-center gap-1.5 font-display text-xs font-semibold text-foreground">
        <Coins aria-hidden className="h-3.5 w-3.5 text-sky" />
        {t('create.animation.estimateTitle')}
      </p>
      <p className="mt-1 font-display text-lg font-bold tabular-nums text-foreground">
        {t('create.animation.estimate', { credits: format.format(credits) })}
      </p>
      <p className="mt-1 font-body text-xs text-muted-foreground">
        {requestedSeconds === 0
          ? t('create.animation.noNewCharge')
          : t('create.animation.secondsQuoted', {
              seconds: format.format(requestedSeconds),
            })}
      </p>
      {slotSeconds !== undefined &&
        Math.abs(slotSeconds - requestedSeconds) > 0.01 && (
          <p className="mt-1 font-body text-xs text-muted-foreground">
            {t('create.animation.slotDuration', {
              seconds: format.format(slotSeconds),
            })}
          </p>
        )}
      {clipCount !== undefined && clipCount > 0 && (
        <p className="mt-1 font-body text-xs text-muted-foreground">
          {t('create.animation.clipsQuoted', { count: clipCount })}
        </p>
      )}
    </div>
  )
}
