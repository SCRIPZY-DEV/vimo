import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import { AVATAR_LOOK_FORMAT_LABEL_KEYS } from '@/modules/avatars/constants'
import { cn } from '@/modules/common/utilities/cn'
import {
  AVATAR_LOOK_FRAME_CLASSES,
  AVATAR_LOOK_LETTERBOX_CLASS,
  AVATAR_LOOK_SHAPE_CLASSES,
  AVATAR_LOOK_SHAPE_FILL_CLASSES,
} from '@/modules/videos/constants'
import { usePreviewActivation } from '@/modules/videos/hooks/usePreviewActivation'
import type { AvatarLookFormat } from '@pipeline/avatar/look-orientation.ts'
import type { AvatarLookSummary } from '@pipeline/types/avatar.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

interface CreateLookCardProps {
  look: AvatarLookSummary
  imageUrl?: string
  videoUrl?: string
  // La vista previa remota todavía se está pidiendo: esqueleto.
  loading: boolean
  // El formato del look (`lookFormatOf`); null = no se sabe y no se muestra.
  format: AvatarLookFormat | null
  videoFormat: VideoFormat
  main: boolean
  chosen: boolean
  // Por qué no se puede elegir para este video, ya traducido; null = se puede.
  unavailableReason: string | null
  disabled: boolean
  onChoose(): void
}

// Una ficha de la grilla del botón «Look» (spec §9, entrega 2c): la vista
// previa en una celda con la forma del video —un look de otro formato se ve
// con su forma real adentro, con aire a los costados o arriba y abajo—, su
// video con el mouse quieto encima o el foco del teclado, el formato del look
// abajo a la derecha, «Principal» arriba a la izquierda y la marca del
// elegido. Debajo, el nombre y su tipo o, si no se puede elegir, el motivo
// (hasta en dos líneas): esa ficha se ve atenuada (entera al pasar el mouse,
// para ver su video) y no se elige, pero sigue enfocable (`aria-disabled` y
// una guardia en el clic), así el teclado llega a su motivo y a su video.
// Presentacional, salvo cuándo se activa (`usePreviewActivation`).
export function CreateLookCard({
  look,
  imageUrl,
  videoUrl,
  loading,
  format,
  videoFormat,
  main,
  chosen,
  unavailableReason,
  disabled,
  onChoose,
}: CreateLookCardProps) {
  const { t } = useTranslation()
  const activation = usePreviewActivation()
  const nameId = useId()
  const formatId = useId()
  const mainId = useId()
  const detailId = useId()

  const selectable = unavailableReason === null
  // No se elige: deshabilitado todo Crear (la demo) o un look que no sirve.
  const blocked = disabled || !selectable
  // Un look de otro formato se ve con su forma real, centrado en la celda.
  const letterboxed = format !== null && format !== videoFormat
  const formatLabel = format ? t(AVATAR_LOOK_FORMAT_LABEL_KEYS[format]) : null
  const describedBy = [
    ...(formatLabel ? [formatId] : []),
    ...(main ? [mainId] : []),
    detailId,
  ]

  return (
    <div {...activation.containerProps} className="group/look h-full">
      <button
        type="button"
        role="radio"
        aria-checked={chosen}
        aria-labelledby={nameId}
        aria-describedby={describedBy.join(' ')}
        aria-disabled={blocked}
        onClick={() => {
          if (blocked) return

          onChoose()
        }}
        {...activation.buttonProps}
        className={cn(
          'block h-full w-full rounded-xl border-2 bg-card p-1 text-left shadow-sm transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amethyst focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-disabled:cursor-not-allowed',
          chosen &&
            'border-amethyst shadow-[0_0_0_2px_hsl(var(--amethyst)/0.35)]',
          !chosen && 'border-transparent',
          !chosen && !blocked && 'hover:border-amethyst/60',
        )}
      >
        <span
          className={cn(
            'relative flex w-full items-center justify-center overflow-hidden rounded-lg bg-muted',
            AVATAR_LOOK_FRAME_CLASSES[videoFormat],
            letterboxed && AVATAR_LOOK_LETTERBOX_CLASS,
          )}
        >
          <LookPreview
            imageUrl={imageUrl}
            videoUrl={videoUrl}
            alt={t('avatars.stock.previewAria', { name: look.name })}
            focus="top"
            active={activation.active}
            loading={loading}
            doodleSize={32}
            className={cn(
              letterboxed
                ? [
                    AVATAR_LOOK_SHAPE_CLASSES[format],
                    AVATAR_LOOK_SHAPE_FILL_CLASSES[videoFormat],
                  ]
                : 'h-full w-full',
              !selectable &&
                'opacity-50 transition-opacity duration-200 group-hover/look:opacity-100',
            )}
          />

          {/* Sobre la imagen y su video, cada uno en su capa en WebKit
              (`transform-gpu`, ERRORES-CONOCIDOS: webkit-capa-compuesta-tapa-
              hermanos-con-z-index-en-overflow-hidden-redondeado). */}
          {main && (
            <span
              id={mainId}
              className="absolute left-1.5 top-1.5 transform-gpu rounded-full bg-saffron px-2 py-0.5 font-display text-[10px] font-bold leading-tight text-charcoal shadow-sm"
            >
              {t('create.avatar.mainLook')}
            </span>
          )}
          {chosen && (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 flex h-5 w-5 transform-gpu items-center justify-center rounded-full bg-amethyst text-white shadow-md"
            >
              <Check strokeWidth={3} className="h-3 w-3" />
            </span>
          )}
          {formatLabel && (
            <span className="absolute bottom-1.5 right-1.5 transform-gpu rounded-md bg-black/65 px-1.5 py-0.5 font-display text-[10px] font-bold leading-tight tabular-nums text-white">
              <span aria-hidden>{formatLabel}</span>
              <span id={formatId} className="sr-only">
                {t('avatars.formato.aria', { format: formatLabel })}
              </span>
            </span>
          )}
        </span>

        <span className="block px-1 pb-0.5 pt-1.5">
          <span
            id={nameId}
            className="block truncate font-display text-xs font-bold text-foreground"
          >
            {look.name}
          </span>
          <span
            id={detailId}
            className="line-clamp-2 font-body text-[11px] leading-snug text-muted-foreground"
          >
            {unavailableReason ?? t(`avatars.types.${look.lookType}`)}
          </span>
        </span>
      </button>
    </div>
  )
}
