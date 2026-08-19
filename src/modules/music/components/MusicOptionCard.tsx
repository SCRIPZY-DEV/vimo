import { useTranslation } from 'react-i18next'
import { Check, Loader2, Music2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { OPTION_GRADIENTS } from '@/modules/music/constants'
import { MusicAudioPlayer } from '@/modules/music/components/MusicAudioPlayer'
import type { MusicOption } from '@pipeline/types/music.ts'

interface MusicOptionCardProps {
  option: MusicOption
  index: number
  choosing: boolean
  isChosen: boolean
  onChoose: (option: MusicOption) => void
}

/** Fondo estable por opción cuando Evolink no devuelve cover (casi siempre). */
function gradientFor(key: string): string {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return OPTION_GRADIENTS[Math.abs(hash) % OPTION_GRADIENTS.length]
}

export function MusicOptionCard({
  option,
  index,
  choosing,
  isChosen,
  onChoose,
}: MusicOptionCardProps) {
  const { t } = useTranslation()
  const title = option.title ?? t('music.chooser.opcion', { n: index })

  return (
    <div className="space-y-3 rounded-2xl border-2 border-border bg-card p-4 shadow-card">
      <div className="relative aspect-square overflow-hidden rounded-xl">
        {option.coverUrl ? (
          <img
            src={option.coverUrl}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: gradientFor(`${option.audioUrl}-${index}`) }}
          >
            <Music2 className="h-16 w-16 text-white/80" />
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-charcoal/70 px-2 py-0.5 font-display text-xs font-bold text-white">
          #{index}
        </span>
      </div>

      <p className="truncate font-display text-sm font-bold text-foreground">
        {title}
      </p>

      {/* Las opciones se escuchan desde la URL remota de Evolink (dura 72 h);
          recién la elegida se descarga al historial. */}
      <MusicAudioPlayer src={option.audioUrl} />

      <Button
        onClick={() => onChoose(option)}
        disabled={choosing}
        className="w-full rounded-xl bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
      >
        {choosing && isChosen ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Check className="mr-2 h-4 w-4" />
        )}
        {t('music.chooser.usar')}
      </Button>
    </div>
  )
}
