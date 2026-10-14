import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { avatarsApi } from '@/modules/avatars/api'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import { cn } from '@/modules/common/utilities/cn'
import {
  AVATAR_LOOK_FRAME_CLASSES,
  AVATAR_USABILITY_LABEL_KEYS,
} from '@/modules/videos/constants'
import { useAvatarRemoteLooks } from '@/modules/videos/hooks/useAvatarRemoteLooks'
import { usePreviewActivation } from '@/modules/videos/hooks/usePreviewActivation'
import {
  avatarLooksFor,
  avatarUsability,
} from '@/modules/videos/utilities/selectableAvatar'
import type {
  AvatarLookSummary,
  AvatarSummary,
} from '@pipeline/types/avatar.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

interface CreateAvatarCardProps {
  entry: AvatarSummary
  // El look de este avatar para el video: el elegido en el avatar elegido y
  // el de por defecto en los demás. Sin él (el avatar no tiene look para el
  // formato, entrena, falló, o su elección ya no sirve), la tarjeta muestra
  // la cara del avatar y el motivo.
  look: AvatarLookSummary | undefined
  videoFormat: VideoFormat
  // Es el avatar que se mira: va marcado, muestra siempre su look y pide de
  // entrada el listado de HeyGen (vista previa y video de su look, y la
  // grilla del botón «Look»).
  checked: boolean
  disabled: boolean
  onSelect(): void
}

// Una tarjeta de la fila «Avatar» de Crear (spec §9, entrega 2c): con la forma
// del video y el look de ese avatar para este video, su imagen (la de disco
// o la del listado de HeyGen, gratis y con la caché del panel de la
// biblioteca) y, con el mouse quieto encima o el foco del teclado, su video.
// Abajo, adentro, en blanco sobre un degradado oscuro: el nombre del look,
// el del avatar y «+N looks» (todos sus looks menos el que se muestra). Al
// montar Crear solo pide el listado de HeyGen la tarjeta que se mira; las
// demás esperan a que la persona se detenga encima o les llegue el foco del
// teclado (`usePreviewActivation`: cruzarlas sin detenerse no lanza un
// proceso del sidecar). Hasta entonces muestran su look si su vista previa
// está en disco y, si no, la cara del avatar. Un avatar sin look no pide
// nunca.
export function CreateAvatarCard({
  entry,
  look,
  videoFormat,
  checked,
  disabled,
  onSelect,
}: CreateAvatarCardProps) {
  const { t } = useTranslation()
  const activation = usePreviewActivation()
  const primaryId = useId()
  const secondaryId = useId()
  const moreId = useId()
  const remote = useAvatarRemoteLooks({
    avatar: entry,
    enabled: look !== undefined && (checked || activation.hoveredOnce),
  })

  // El look que se ve: el de la que se mira siempre; el de otra, de entrada
  // solo si está en disco (no hace falta pedir nada) y si no, recién con la
  // intención de mirarla.
  const shownLook =
    look && (checked || look.previewPath || activation.hoveredOnce)
      ? look
      : undefined
  const usability = avatarUsability(entry, videoFormat)
  // Uno que entrena o que falló no se puede mirar.
  const buttonDisabled =
    disabled || usability === 'training' || usability === 'failed'
  const remoteLook = shownLook
    ? remote.looks.find((item) => item.lookId === shownLook.lookId)
    : undefined
  const face = entry.previewPath
    ? avatarsApi.imageSource(entry.previewPath)
    : undefined
  const lookImage = shownLook?.previewPath
    ? avatarsApi.imageSource(shownLook.previewPath)
    : remoteLook?.previewImageUrl
  const moreLooks = shownLook ? entry.looks.length - 1 : 0
  // Un look que se llama como su avatar («Vic») no repite el nombre.
  const avatarNameShown =
    shownLook !== undefined &&
    shownLook.name.trim().toLocaleLowerCase() !==
      entry.name.trim().toLocaleLowerCase()
  // El lector de pantalla oye primero el avatar: «Ana, Ana oficina, +2
  // looks» (a la vista va primero el look, que es lo que cambia).
  const labelledBy = shownLook
    ? [
        ...(avatarNameShown ? [secondaryId] : []),
        primaryId,
        ...(moreLooks > 0 ? [moreId] : []),
      ]
    : [primaryId, secondaryId]

  // Debajo del nombre: sin look, el motivo (en dos líneas si la tarjeta es
  // angosta); con look, el avatar y «+N looks», que bajan a otra línea si no
  // entran juntos.
  const details = () => {
    if (!shownLook) {
      return (
        <span
          id={secondaryId}
          className="line-clamp-2 font-body text-[11px] font-medium leading-tight text-white/85"
        >
          {t(AVATAR_USABILITY_LABEL_KEYS[usability], {
            count: avatarLooksFor(entry, videoFormat).length,
          })}
        </span>
      )
    }

    if (!avatarNameShown && moreLooks === 0) return null

    return (
      <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-1.5 gap-y-1">
        {avatarNameShown && (
          <span
            id={secondaryId}
            className="min-w-0 truncate font-body text-[11px] font-medium leading-tight text-white/85"
          >
            {entry.name}
          </span>
        )}
        {moreLooks > 0 && (
          <span
            id={moreId}
            className="shrink-0 rounded-full bg-white/20 px-1.5 py-px font-display text-[10px] font-bold leading-tight text-white ring-1 ring-white/25"
          >
            {t('create.avatar.moreLooks', { count: moreLooks })}
          </span>
        )}
      </span>
    )
  }

  return (
    <div
      {...activation.containerProps}
      className={cn(buttonDisabled && 'cursor-not-allowed')}
    >
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        aria-labelledby={labelledBy.join(' ')}
        disabled={buttonDisabled}
        onClick={onSelect}
        {...activation.buttonProps}
        className={cn(
          'relative block w-full overflow-hidden rounded-xl border-2 bg-muted text-left transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amethyst focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none',
          checked
            ? 'border-amethyst shadow-[0_0_0_2px_hsl(var(--amethyst)/0.35)]'
            : 'border-border enabled:hover:border-amethyst/60',
        )}
      >
        {/* La `key` por look arranca la vista previa de cero: su imagen y su
            video son otros. */}
        <LookPreview
          key={shownLook?.lookId ?? 'face'}
          imageUrl={shownLook ? lookImage : face}
          videoUrl={remoteLook?.previewVideoUrl}
          alt={t('avatars.stock.previewAria', {
            name: shownLook?.name ?? entry.name,
          })}
          focus="top"
          active={activation.active}
          loading={shownLook !== undefined && !lookImage && remote.isLoading}
          videoPending={activation.active && remote.isLoading}
          doodleSize={40}
          className={cn(
            'w-full',
            AVATAR_LOOK_FRAME_CLASSES[videoFormat],
            usability !== 'usable' && 'opacity-60',
          )}
        />

        {/* Sobre la imagen y su video: `transform-gpu` los deja en su capa
            en WebKit (ERRORES-CONOCIDOS: webkit-capa-compuesta-tapa-hermanos-
            con-z-index-en-overflow-hidden-redondeado). */}
        {checked && (
          <span
            aria-hidden
            className="absolute right-2 top-2 flex h-5 w-5 transform-gpu items-center justify-center rounded-full bg-amethyst text-white shadow-md"
          >
            <Check strokeWidth={3} className="h-3 w-3" />
          </span>
        )}

        {/* El degradado se queda oscuro (≥ 65 %) hasta pasada la mitad: el
            blanco se lee aun sobre un fondo blanco, con tres líneas. */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex transform-gpu flex-col gap-0.5 bg-gradient-to-t from-black/90 via-black/65 via-55% to-transparent px-2.5 pb-2 pt-9 [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
          <span
            id={primaryId}
            className="truncate font-display text-xs font-bold leading-tight text-white"
          >
            {shownLook ? shownLook.name : entry.name}
          </span>
          {details()}
        </span>
      </button>
    </div>
  )
}
