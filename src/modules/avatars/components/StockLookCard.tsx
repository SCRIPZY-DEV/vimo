import { useState } from 'react'
import type { FocusEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Loader2, Star } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { LookChips } from '@/modules/avatars/components/LookChips'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import type { DisplayedLook } from '@/modules/avatars/types/look'
import { lookUnusableReasonKey } from '@/modules/avatars/utilities/lookUsability'

interface StockLookCardProps {
  // Un look del stock de HeyGen (segundo nivel del diálogo de stock) o de un
  // avatar de la biblioteca (su detalle, con las medidas de HeyGen si las hay).
  look: DisplayedLook
  imageUrl?: string
  videoUrl?: string
  // La vista previa remota todavía se está pidiendo: esqueleto.
  previewLoading?: boolean
  // Abre el reproductor del look: con él, toda la ficha es un botón, también
  // si el look no sirve o todavía se genera (el reproductor explica por qué).
  onOpen?: (lookId: string) => void
  // Detalle de la biblioteca: el principal lleva su chip y los demás looks
  // listos y compatibles ofrecen «Usar como principal» al pasar el mouse.
  main?: boolean
  busy?: boolean
  disabled?: boolean
  onMakeMain?: (lookId: string) => void
}

// Ficha de un look: vista previa vertical (video al pasar el mouse), nombre y
// chips de tipo, formato (16:9, 9:16…) y motor («Avatar III» o «No compatible
// con Vimo»). Un look que se está generando es un esqueleto con «Generando…»; uno
// que falló lo dice. Un clic abre su reproductor; un look no listo o sin el
// motor de Vimo no pasa a principal. El botón que abre es una capa que cubre
// toda la ficha, debajo del resto (que deja pasar el mouse): así convive con
// «Usar como principal», que no puede ir adentro de otro botón. Presentacional.
export function StockLookCard({
  look,
  imageUrl,
  videoUrl,
  previewLoading = false,
  onOpen,
  main = false,
  busy = false,
  disabled = false,
  onMakeMain,
}: StockLookCardProps) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  // Los looks del stock público no traen `status`: están listos.
  const status = look.status ?? 'ready'
  const usable = lookUnusableReasonKey(look) === null
  const canMakeMain = onMakeMain !== undefined && usable && !main

  // La ficha cuenta como «activa» para el video con el mouse encima o con el
  // foco del teclado. Solo el foco visible (`:focus-visible`): el que vuelve
  // a la ficha al cerrar el reproductor con el mouse no la activa lejos del
  // puntero.
  const activity = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: (event: FocusEvent<HTMLElement>) =>
      setFocused(event.target.matches(':focus-visible')),
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (event.currentTarget.contains(event.relatedTarget)) return

      setFocused(false)
    },
  }

  const media = () => {
    if (status === 'processing') {
      return (
        <span className="relative block aspect-[4/5] w-full">
          <span
            aria-hidden
            className="absolute inset-0 animate-pulse bg-muted-foreground/15"
          />
          <span className="absolute inset-0 flex items-center justify-center gap-1.5 font-display text-xs font-semibold text-muted-foreground">
            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
            {t('avatars.detalle.lookGenerando')}
          </span>
        </span>
      )
    }

    if (status === 'failed') {
      return (
        <span className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 bg-muted px-4 text-center">
          <AlertCircle aria-hidden className="h-5 w-5 text-destructive-text" />
          <span className="font-display text-xs font-semibold text-foreground">
            {t('avatars.detalle.lookFallido')}
          </span>
        </span>
      )
    }

    return (
      <LookPreview
        imageUrl={imageUrl}
        videoUrl={videoUrl}
        alt={t('avatars.stock.previewAria', { name: look.name })}
        active={hovered || focused}
        loading={previewLoading}
        className="aspect-[4/5] w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]"
      />
    )
  }

  return (
    <article {...activity} className="group relative flex flex-col gap-2.5">
      {/* La capa que abre el reproductor (`peer`: el anillo de foco se pinta
          en la imagen, que la tapa). `data-look-id`: el diálogo devuelve el
          foco acá al cerrar el reproductor. */}
      {onOpen && (
        <button
          type="button"
          data-look-id={look.lookId}
          aria-label={t('avatars.stock.abrirLookAria', { name: look.name })}
          onClick={() => onOpen(look.lookId)}
          className="peer absolute inset-0 cursor-pointer rounded-2xl focus-visible:outline-none"
        />
      )}

      <span className="pointer-events-none relative block overflow-hidden rounded-2xl bg-muted shadow-sm ring-1 ring-border transition-shadow duration-300 group-hover:shadow-lg peer-focus-visible:ring-2 peer-focus-visible:ring-saffron peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
        {media()}

        {main && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-saffron px-2.5 py-1 font-display text-[11px] font-bold text-charcoal shadow-sm">
            <Star aria-hidden className="h-3 w-3 fill-current" />
            {t('avatars.detalle.principal')}
          </span>
        )}

        {/* Sobre la imagen, abajo: aparece con el mouse o con el foco del
            teclado, y queda a la vista mientras el cambio está en vuelo. El
            botón nombra al look para el lector de pantalla (hay uno por
            ficha). */}
        {canMakeMain && (
          <span
            className={cn(
              'absolute inset-x-0 bottom-0 flex bg-gradient-to-t from-black/70 via-black/25 to-transparent p-2.5 pt-12 transition-opacity duration-200',
              busy
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100',
            )}
          >
            <button
              type="button"
              disabled={disabled || busy}
              aria-label={t('avatars.detalle.usarPrincipalAria', {
                name: look.name,
              })}
              onClick={() => onMakeMain?.(look.lookId)}
              className="pointer-events-auto inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full bg-white/90 px-3 font-display text-xs font-bold text-charcoal shadow-sm backdrop-blur-md transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy && (
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              )}
              {t('avatars.detalle.usarPrincipal')}
            </button>
          </span>
        )}
      </span>

      <span className="pointer-events-none block space-y-1.5 px-0.5">
        <span className="block truncate font-display text-sm font-bold text-foreground">
          {look.name}
        </span>
        <LookChips look={look} />
      </span>
    </article>
  )
}
