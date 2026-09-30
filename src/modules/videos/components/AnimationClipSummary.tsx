import { useTranslation } from 'react-i18next'
import { Clapperboard } from 'lucide-react'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
import type { SceneAnimationView } from '@pipeline/types/animation.ts'

interface AnimationClipSummaryProps {
  animation: SceneAnimationView
}

// El recibo describe lo ya generado. Nunca se sustituye por la estimación
// del próximo intento, aunque la tarifa actual sea distinta.
export function AnimationClipSummary({ animation }: AnimationClipSummaryProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'es'
  const title = t('library.editor.panel.animation.clipTitle', {
    count: animation.sceneIds.length,
    ids: new Intl.ListFormat(locale).format(animation.sceneIds.map(String)),
  })

  return (
    <article
      aria-label={title}
      className="space-y-1.5 rounded-lg border border-sky/20 bg-background/50 p-2.5"
    >
      <p className="flex items-center gap-1.5 font-display text-xs font-semibold">
        <Clapperboard aria-hidden className="h-3.5 w-3.5 shrink-0 text-sky" />
        {title}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 font-body text-xs text-muted-foreground">
        <span>
          {t('library.editor.panel.animation.clipDuration', {
            seconds: formatSlotSeconds(animation.slotSeconds, locale),
          })}
        </span>
        <span>
          {animation.creditsConsumed === undefined
            ? t('library.editor.panel.animation.costUnknown')
            : t('library.editor.panel.animation.readyCost', {
                credits: new Intl.NumberFormat(locale, {
                  maximumFractionDigits: 2,
                }).format(animation.creditsConsumed),
              })}
        </span>
      </div>
    </article>
  )
}
