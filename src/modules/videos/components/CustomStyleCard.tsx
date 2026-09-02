import { useTranslation } from 'react-i18next'
import { Check, PenLine, Sparkles, Trash2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { useSampleCarousel } from '@/modules/videos/hooks/useSampleCarousel'
import type { CustomStyleSummary } from '@pipeline/types/styles.ts'

interface CustomStyleCardProps {
  style: CustomStyleSummary
  selected: boolean
  disabled: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}

// Tarjeta de un estilo propio (port reducido de TarjetaEstilo): las muestras
// rotan al hover como en el catálogo, pill «En uso» y acciones
// editar/eliminar visibles (el menú de 3 puntos del origen requeriría un
// dropdown que el kit no trae).
export function CustomStyleCard({
  style,
  selected,
  disabled,
  onSelect,
  onEdit,
  onDelete,
}: CustomStyleCardProps) {
  const { t } = useTranslation()
  const carousel = useSampleCarousel(style.samples.length)

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border-2 bg-card transition-all',
        selected
          ? 'border-saffron shadow-md shadow-saffron/20'
          : 'border-border hover:border-saffron/60',
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        onMouseEnter={carousel.activate}
        onMouseLeave={carousel.deactivate}
        onFocus={carousel.activate}
        onBlur={carousel.deactivate}
        className="relative block aspect-video w-full bg-muted focus:outline-none focus:ring-2 focus:ring-saffron/50"
      >
        {style.samples.length > 0 ? (
          <>
            {style.samples.map((sample, index) => (
              <img
                key={sample.file}
                src={videosApi.imageSource(sample.path, sample.mtimeMs)}
                alt={index === 0 ? style.name : ''}
                loading="lazy"
                className={cn(
                  'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
                  index === carousel.index ? 'opacity-100' : 'opacity-0',
                )}
              />
            ))}
            {style.samples.length > 1 && (
              <span className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
                {style.samples.map((sample, index) => (
                  <span
                    key={sample.file}
                    className={cn(
                      'h-1.5 rounded-full shadow transition-all duration-300',
                      index === carousel.index
                        ? 'w-4 bg-white'
                        : 'w-1.5 bg-white/60',
                    )}
                  />
                ))}
              </span>
            )}
          </>
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center">
            <Sparkles className="h-6 w-6 text-muted-foreground" />
            <span className="font-body text-xs text-muted-foreground">
              {t('create.customStyles.noSamples')}
            </span>
          </span>
        )}
        {selected && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-saffron px-2 py-0.5 font-display text-[10px] font-bold text-charcoal shadow">
            <Check className="h-3 w-3" />
            {t('create.style.inUse')}
          </span>
        )}
      </button>

      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold text-foreground">
            {style.name}
          </p>
          <p className="truncate font-body text-xs text-muted-foreground">
            {t('create.customStyles.charsCount', {
              chars: style.systemPrompt.length.toLocaleString(),
            })}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('create.customStyles.edit')}
          onClick={onEdit}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <PenLine className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('create.customStyles.delete')}
          onClick={onDelete}
          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
