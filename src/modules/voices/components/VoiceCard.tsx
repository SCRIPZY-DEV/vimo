import { useTranslation } from 'react-i18next'
import { Heart, Pause, Play } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import type { VoiceSummary } from '@pipeline/types/voices.ts'

interface VoiceCardProps {
  voice: VoiceSummary
  isSelected: boolean
  isFavorite: boolean
  isPlaying: boolean
  onSelect: (voice: VoiceSummary) => void
  onTogglePreview: (voice: VoiceSummary) => void
  onToggleFavorite: (voice: VoiceSummary) => void
}

// Tarjeta de seleccionar para el probador, escuchar el preview
// del proveedor (si lo expone; Edge no trae) y marcar favorita. Reutilizable
// por el futuro selector de voz de Create/Library.
export function VoiceCard({
  voice,
  isSelected,
  isFavorite,
  isPlaying,
  onSelect,
  onTogglePreview,
  onToggleFavorite,
}: VoiceCardProps) {
  const { t } = useTranslation()

  const details = [voice.language, voice.gender, voice.accent, voice.category]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border-2 bg-card p-3 transition-colors',
        isSelected
          ? 'border-saffron bg-saffron/10'
          : 'border-border hover:border-saffron/40',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(voice)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate font-display text-sm font-bold text-foreground">
          {voice.name}
          {voice.isClone && (
            <span className="ml-1.5 rounded-full bg-coral/15 px-1.5 py-0.5 font-body text-[10px] font-semibold text-coral-text">
              {t('voices.tarjeta.clon')}
            </span>
          )}
          {voice.libraryOwnerId && (
            <span className="ml-1.5 rounded-full bg-saffron/20 px-1.5 py-0.5 font-body text-[10px] font-semibold text-foreground">
              {t('voices.tarjeta.biblioteca')}
            </span>
          )}
        </p>
        {details && (
          <p className="truncate font-body text-xs text-muted-foreground">
            {details}
          </p>
        )}
      </button>

      {voice.previewUrl && (
        <button
          type="button"
          onClick={() => onTogglePreview(voice)}
          aria-label={
            isPlaying
              ? t('voices.tarjeta.pausar')
              : t('voices.tarjeta.reproducir')
          }
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors',
            isPlaying
              ? 'border-saffron bg-saffron text-charcoal'
              : 'border-border text-muted-foreground hover:border-saffron/50 hover:text-foreground',
          )}
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      <button
        type="button"
        onClick={() => onToggleFavorite(voice)}
        aria-label={
          isFavorite
            ? t('voices.tarjeta.quitarFavorito')
            : t('voices.tarjeta.favorito')
        }
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
          isFavorite
            ? 'text-coral-text'
            : 'text-muted-foreground hover:text-coral-text',
        )}
      >
        <Heart className={cn('h-4 w-4', isFavorite && 'fill-current')} />
      </button>
    </div>
  )
}
