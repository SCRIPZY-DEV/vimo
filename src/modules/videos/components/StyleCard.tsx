import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'

const CAROUSEL_INTERVAL_MS = 1200

interface StyleCardProps {
  images: string[]
  title: string
  description: string
  selected: boolean
  disabled: boolean
  onSelect: () => void
}

// Tarjeta de un estilo del catálogo. Maneja su propio carrusel: al hacer
// hover (o foco por teclado) rota las muestras; al salir vuelve a la #1.
export function StyleCard({
  images,
  title,
  description,
  selected,
  disabled,
  onSelect,
}: StyleCardProps) {
  const { t } = useTranslation()
  const [imageIndex, setImageIndex] = useState(0)
  const [active, setActive] = useState(false)

  // Al salir (mouse o foco) el carrusel vuelve a la muestra #1.
  const deactivate = () => {
    setActive(false)
    setImageIndex(0)
  }

  useEffect(() => {
    if (!active || images.length <= 1) return
    const timer = setInterval(
      () => setImageIndex((index) => (index + 1) % images.length),
      CAROUSEL_INTERVAL_MS,
    )
    return () => clearInterval(timer)
  }, [active, images.length])

  return (
    <div
      role="button"
      tabIndex={disabled ? undefined : 0}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={(event) => {
        if (disabled) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={deactivate}
      onFocus={() => setActive(true)}
      onBlur={deactivate}
      className={cn(
        'group overflow-hidden rounded-2xl border-2 bg-card transition-all',
        !disabled &&
          'cursor-pointer hover:shadow-lg hover:shadow-saffron/10 focus:outline-none focus:ring-2 focus:ring-saffron/50',
        selected
          ? 'border-saffron shadow-md shadow-saffron/20'
          : 'border-border hover:border-saffron/60',
      )}
    >
      <div className="relative aspect-video bg-muted">
        {/* Imágenes apiladas con crossfade — solo la #imageIndex visible. */}
        {images.map((source, index) => (
          <img
            key={source}
            src={source}
            alt={index === 0 ? title : ''}
            loading="lazy"
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
              index === imageIndex ? 'opacity-100' : 'opacity-0',
            )}
          />
        ))}

        {/* Puntitos: en qué muestra va el carrusel. */}
        {images.length > 1 && (
          <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
            {images.map((source, index) => (
              <span
                key={source}
                className={cn(
                  'h-1.5 rounded-full shadow transition-all duration-300',
                  index === imageIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/60',
                )}
              />
            ))}
          </div>
        )}

        {selected && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-saffron px-2 py-0.5 font-display text-[10px] font-bold text-charcoal shadow">
            <Check className="h-3 w-3" />
            {t('create.style.inUse')}
          </span>
        )}
      </div>

      <div className="px-3.5 py-2.5">
        <p className="truncate font-display text-base font-bold text-foreground">
          {title}
        </p>
        <p className="truncate font-body text-xs text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )
}
