import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Shirt } from 'lucide-react'
import { avatarsApi } from '@/modules/avatars/api'
import { AVATAR_LOOK_FORMAT_LABEL_KEYS } from '@/modules/avatars/constants'
import { cn } from '@/modules/common/utilities/cn'
import { CreateLookCard } from '@/modules/videos/components/CreateLookCard'
import {
  AVATAR_LOOK_GRID_CLASSES,
  AVATAR_LOOK_GRID_MAX_HEIGHT_CLASS,
  LOOK_UNFIT_REASON_KEYS,
} from '@/modules/videos/constants'
import { useAvatarRemoteLooks } from '@/modules/videos/hooks/useAvatarRemoteLooks'
import { lookUnfitReason } from '@/modules/videos/utilities/selectableAvatar'
import type { LookUnfitReason } from '@/modules/videos/utilities/selectableAvatar'
import { lookFormatOf } from '@pipeline/avatar/look-orientation.ts'
import type { AvatarLookFormat } from '@pipeline/avatar/look-orientation.ts'
import type {
  AvatarLookSummary,
  AvatarSummary,
} from '@pipeline/types/avatar.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

interface CreateAvatarLooksProps {
  // El avatar que se mira, con looks. Puede que ninguno sirva para el
  // formato: la grilla los muestra igual, sin poder elegirlos, y sin la ayuda
  // del look.
  entry: AvatarSummary
  videoFormat: VideoFormat
  // El look elegido de este avatar si la elección sigue valiendo; sin él, la
  // grilla no marca ninguno (no sugiere una elección que no hay).
  chosenLookId: string | undefined
  disabled: boolean
  onChoose(look: AvatarLookSummary): void
}

// El botón «Look» de la tarjeta del avatar en Crear y su grilla (spec §9,
// entrega 2c, pedido del dueño: «se despliegan todas las cards de cada look,
// para ver sus previews, y uno va scrolleando»; nunca una lista de nombres).
// La grilla trae TODOS los looks del avatar, el principal primero, cada uno
// con su vista previa, su video al pasar el mouse y su formato; se eligen solo
// los que sirven para el video y los demás se ven atenuados con el motivo, los
// dos según la misma regla (`lookUnfitReason`, selectableAvatar.ts, la que usa
// `avatarLooksFor`). Elegir uno lo pasa al formulario, cierra la grilla y deja
// el foco en el botón. Las vistas previas que no están en disco y los videos
// salen del listado de HeyGen (el mismo, y con la misma caché, que el de la
// tarjeta del avatar y el panel de la biblioteca), pedido al abrir.
export function CreateAvatarLooks({
  entry,
  videoFormat,
  chosenLookId,
  disabled,
  onChoose,
}: CreateAvatarLooksProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const regionId = useId()
  const remote = useAvatarRemoteLooks({ avatar: entry, enabled: open })

  const remoteById = new Map(remote.looks.map((look) => [look.lookId, look]))
  const looks = [
    ...entry.looks.filter((look) => look.lookId === entry.mainLookId),
    ...entry.looks.filter((look) => look.lookId !== entry.mainLookId),
  ]
  const anyChoosable = looks.some(
    (look) => lookUnfitReason(look, videoFormat) === null,
  )

  // El motivo en palabras. El de otro formato lleva el formato del look: la
  // regla solo lo da con la orientación conocida, así que siempre lo hay.
  const reasonText = (
    reason: LookUnfitReason,
    format: AvatarLookFormat | null,
  ) => {
    const formatLabel = format ? t(AVATAR_LOOK_FORMAT_LABEL_KEYS[format]) : ''
    return t(LOOK_UNFIT_REASON_KEYS[reason], { format: formatLabel })
  }

  const choose = (look: AvatarLookSummary) => {
    if (look.lookId !== chosenLookId) onChoose(look)
    setOpen(false)
    toggleRef.current?.focus()
  }

  return (
    <div className="space-y-2.5">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        aria-label={t('create.avatar.looksToggleAria', { name: entry.name })}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-1.5 rounded-full border-2 border-amethyst/40 bg-card px-3.5 py-1.5 font-display text-xs font-bold text-foreground shadow-sm transition-colors hover:border-amethyst hover:bg-amethyst/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amethyst focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-amethyst/40 disabled:hover:bg-card"
      >
        <Shirt aria-hidden className="h-3.5 w-3.5 text-amethyst" />
        {t('create.avatar.lookLabel')}
        <ChevronDown
          aria-hidden
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* La región existe siempre (`aria-controls` la nombra); su contenido
          se monta al abrir, así las vistas previas remotas no se bajan con la
          grilla cerrada. Sin clases de `display` acá: le ganarían a `hidden`. */}
      <div id={regionId} hidden={!open}>
        {open && (
          <div
            className={cn(
              'overflow-y-auto overscroll-contain rounded-xl border border-border bg-muted/50 p-2.5',
              AVATAR_LOOK_GRID_MAX_HEIGHT_CLASS,
            )}
          >
            {/* Dice de quién son los looks, como el botón que la abre. */}
            <div
              role="radiogroup"
              aria-label={t('create.avatar.looksToggleAria', {
                name: entry.name,
              })}
              className={AVATAR_LOOK_GRID_CLASSES[videoFormat]}
            >
              {looks.map((look) => {
                const remoteLook = remoteById.get(look.lookId)
                // Las medidas del listado completan el formato de un look
                // cuya orientación la biblioteca no conoce.
                const format = lookFormatOf({
                  preferredOrientation:
                    look.preferredOrientation ??
                    remoteLook?.preferredOrientation,
                  imageWidth: remoteLook?.imageWidth,
                  imageHeight: remoteLook?.imageHeight,
                })
                const reason = lookUnfitReason(look, videoFormat)
                const imageUrl = look.previewPath
                  ? avatarsApi.imageSource(look.previewPath)
                  : remoteLook?.previewImageUrl
                return (
                  <CreateLookCard
                    key={look.lookId}
                    look={look}
                    imageUrl={imageUrl}
                    videoUrl={remoteLook?.previewVideoUrl}
                    loading={!imageUrl && remote.isLoading}
                    format={format}
                    videoFormat={videoFormat}
                    main={look.lookId === entry.mainLookId}
                    chosen={look.lookId === chosenLookId}
                    unavailableReason={
                      reason === null ? null : reasonText(reason, format)
                    }
                    disabled={disabled}
                    onChoose={() => choose(look)}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* La ayuda habla del look elegido: sin nada que elegir, no va. */}
      {anyChoosable && (
        <p className="font-body text-xs text-muted-foreground">
          {t('create.avatar.lookHint')}
        </p>
      )}
    </div>
  )
}
