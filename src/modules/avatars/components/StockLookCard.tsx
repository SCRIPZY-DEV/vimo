import { useState } from 'react'
import type { FocusEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Check, Loader2, Star } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import { VIMO_AVATAR_ENGINE } from '@/modules/avatars/constants'
import type { AvatarLookSummary, HeyGenLook } from '@pipeline/types/avatar.ts'

interface StockLookCardProps {
  // Un look del stock de HeyGen (segundo nivel del diálogo de stock) o de un
  // avatar de la biblioteca (su detalle).
  look: HeyGenLook | AvatarLookSummary
  imageUrl?: string
  videoUrl?: string
  // La vista previa remota todavía se está pidiendo: esqueleto.
  previewLoading?: boolean
  // Elegir el look principal al agregar: con `onSelect` la ficha entera es un
  // botón; `selectable` es falso cuando el contexto no deja elegir (el avatar
  // ya está en la biblioteca o hay un alta en vuelo).
  selected?: boolean
  selectable?: boolean
  onSelect?: (lookId: string) => void
  // Detalle de la biblioteca: el principal lleva su chip y los demás looks
  // listos y compatibles ofrecen «Usar como principal» al pasar el mouse.
  main?: boolean
  busy?: boolean
  disabled?: boolean
  onMakeMain?: (lookId: string) => void
}

// Ficha de un look: vista previa vertical (video al pasar el mouse), nombre y
// chips de tipo, orientación y motor («Avatar III» o «No compatible con
// Vimo»). Un look que se está generando es un esqueleto con «Generando…»; uno
// que falló lo dice. Un look no listo o sin el motor de Vimo no se elige ni
// pasa a principal. Todo el marcado son `span` (en bloque o flex): en modo
// selección la ficha entera es un `<button>`, que no admite `div` ni `p`.
// Presentacional.
export function StockLookCard({
  look,
  imageUrl,
  videoUrl,
  previewLoading = false,
  selected = false,
  selectable = false,
  onSelect,
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
  const compatible = look.supportedEngines.includes(VIMO_AVATAR_ENGINE)
  const usable = status === 'ready' && compatible
  const canSelect = selectable && usable
  const canMakeMain = onMakeMain !== undefined && usable && !main

  // La tarjeta entera cuenta como «activa» para el video: el mouse encima o
  // el foco en ella o en su botón.
  const activity = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setFocused(true),
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

  const tile = (
    <span
      className={cn(
        'relative block overflow-hidden rounded-2xl bg-muted shadow-sm ring-1 ring-border transition-shadow duration-300 group-hover:shadow-lg',
        onSelect &&
          'group-focus-visible:ring-2 group-focus-visible:ring-saffron',
        selected && 'ring-2 ring-saffron ring-offset-2 ring-offset-background',
      )}
    >
      {media()}

      {main && (
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-saffron px-2.5 py-1 font-display text-[11px] font-bold text-charcoal shadow-sm">
          <Star aria-hidden className="h-3 w-3 fill-current" />
          {t('avatars.detalle.principal')}
        </span>
      )}

      {selected && (
        <span
          aria-hidden
          className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-saffron text-charcoal shadow-md"
        >
          <Check strokeWidth={3} className="h-4 w-4" />
        </span>
      )}

      {/* Sobre la imagen, abajo: aparece con el mouse o con el foco del
          teclado, y queda a la vista mientras el cambio está en vuelo. El
          botón nombra al look para el lector de pantalla (hay uno por
          ficha). */}
      {canMakeMain && (
        <span
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 flex bg-gradient-to-t from-black/70 via-black/25 to-transparent p-2.5 pt-12 transition-opacity duration-200',
            busy
              ? 'opacity-100'
              : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
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
  )

  const caption = (
    <span className="block space-y-1.5 px-0.5">
      <span className="block truncate font-display text-sm font-bold text-foreground">
        {look.name}
      </span>
      <span className="flex flex-wrap gap-1">
        <span className="rounded bg-muted px-1.5 py-0.5 font-display text-[10px] font-bold text-muted-foreground">
          {t(`avatars.types.${look.lookType}`)}
        </span>
        {look.preferredOrientation && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-display text-[10px] font-bold text-muted-foreground">
            {t(`avatars.stock.orientacion.${look.preferredOrientation}`)}
          </span>
        )}
        {compatible && (
          <span className="rounded bg-saffron/15 px-1.5 py-0.5 font-display text-[10px] font-bold text-foreground">
            {t(`avatars.engines.${VIMO_AVATAR_ENGINE}`)}
          </span>
        )}
        {/* Mientras se genera todavía no se saben sus motores: «No
            compatible» solo se afirma de un look listo. */}
        {!compatible && status === 'ready' && (
          <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-display text-[10px] font-bold text-foreground">
            {t('avatars.tarjeta.noCompatible')}
          </span>
        )}
      </span>
    </span>
  )

  if (onSelect) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        aria-disabled={!canSelect}
        onClick={() => {
          if (canSelect) onSelect(look.lookId)
        }}
        {...activity}
        className={cn(
          'group flex w-full flex-col gap-2.5 text-left focus-visible:outline-none',
          canSelect ? 'cursor-pointer' : 'cursor-default',
        )}
      >
        {tile}
        {caption}
      </button>
    )
  }

  return (
    <article {...activity} className="group flex flex-col gap-2.5">
      {tile}
      {caption}
    </article>
  )
}
