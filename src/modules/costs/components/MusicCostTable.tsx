import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'
import { MUSIC_PROVIDERS } from '../catalog'

export function MusicCostTable() {
  const { t } = useTranslation()

  if (!MUSIC_PROVIDERS.length) {
    return (
      <p className="py-8 text-center font-body text-sm text-muted-foreground">
        {t('costs.musicaVacio')}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {MUSIC_PROVIDERS.map((provider) => (
        <div
          key={provider.id}
          className="space-y-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold">{provider.label}</h3>
            <span className="rounded bg-lavender/20 px-2 py-0.5 font-mono text-xs text-foreground">
              {provider.defaultModel}
            </span>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-saffron/30 bg-saffron/10 px-3 py-2.5">
            <Coins className="mt-0.5 h-4 w-4 shrink-0 text-saffron" />
            <p className="font-body text-xs leading-relaxed text-foreground">
              {t(provider.estimatedCreditsKey)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 font-body text-xs text-muted-foreground">
            <span>{t('costs.musicaVariaciones')}</span>
            <span className="font-semibold text-foreground">
              {provider.variations}
            </span>
          </div>

          <p className="border-t border-border/50 pt-2 font-body text-xs text-muted-foreground/80">
            {t(provider.notesKey)}
          </p>
        </div>
      ))}
    </div>
  )
}
