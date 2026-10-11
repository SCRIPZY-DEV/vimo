import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AvatarsRoutes, avatarScenarioPath } from '@/modules/avatars/constants'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { Button } from '@/modules/common/ui/button'
import { Skeleton } from '@/modules/common/ui/skeleton'
import { cn } from '@/modules/common/utilities/cn'
import { CreateAvatarCard } from '@/modules/videos/components/CreateAvatarCard'
import { CreateAvatarLooks } from '@/modules/videos/components/CreateAvatarLooks'
import {
  AVATAR_CARD_GRID_CLASSES,
  AVATAR_LOOK_FRAME_CLASSES,
  AVATAR_NO_LOOK_KEYS,
  AVATAR_PICKER_SKELETONS,
} from '@/modules/videos/constants'
import {
  avatarUsability,
  defaultAvatarChoice,
  isSelectedAvatarCurrent,
  selectedAvatarFrom,
} from '@/modules/videos/utilities/selectableAvatar'
import type { SelectedAvatar } from '@/modules/videos/types/create'
import type { AvatarSummary } from '@pipeline/types/avatar.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

interface CreateAvatarPickerProps {
  entries: AvatarSummary[]
  loading: boolean
  errorKey: string | null
  selected: SelectedAvatar | null
  // Formato del video: decide qué looks se ofrecen (spec §6.2).
  videoFormat: VideoFormat
  disabled: boolean
  // null = el avatar que se mira no tiene un look que sirva: no hay elección.
  onSelect(avatar: SelectedAvatar | null): void
}

// Los avatares de la biblioteca y, del que se mira, su look para el formato
// del video (spec §9, con el cambio de dirección del dueño del 2026-10-10: el
// look ES el escenario y HeyGen lo renderiza tal cual). Desde la entrega 2c,
// una tarjeta por avatar con la forma del video y el look de ese avatar para
// este video (el elegido en el elegido, el de por defecto en los demás), con
// el nombre del look y «+N looks» en blanco sobre la imagen; debajo, el botón
// «Look» despliega las tarjetas de todos los looks del avatar que se mira para
// elegir otro. Un avatar sin look para el formato lo dice y, si es propio,
// lleva a «Crear escenario» abierto en ese formato (los de stock no admiten
// escenarios nuevos). Sin avatares, lleva a crearlos. Qué avatar se mira es
// estado de la vista; la elección del formulario solo existe con un look.
export function CreateAvatarPicker({
  entries,
  loading,
  errorKey,
  selected,
  videoFormat,
  disabled,
  onSelect,
}: CreateAvatarPickerProps) {
  const { t } = useTranslation()
  // El avatar que se mira cuando la elección no lo dice (uno sin look para el
  // formato deja la elección vacía); sin él, el de la elección.
  const [shownId, setShownId] = useState<string | null>(null)

  if (loading) {
    const slots = Array.from(
      { length: AVATAR_PICKER_SKELETONS },
      (_, index) => `slot-${index}`,
    )
    return (
      <div aria-hidden className={AVATAR_CARD_GRID_CLASSES[videoFormat]}>
        {slots.map((slot) => (
          <Skeleton
            key={slot}
            className={cn(
              'w-full rounded-xl',
              AVATAR_LOOK_FRAME_CLASSES[videoFormat],
            )}
          />
        ))}
      </div>
    )
  }

  if (errorKey) return <ErrorMessage>{t(errorKey)}</ErrorMessage>

  if (entries.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed border-amethyst/40 p-3">
        <p className="font-body text-sm text-muted-foreground">
          {t('create.avatar.emptyLibrary')}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to={AvatarsRoutes.avatars}>
            {t('create.avatar.createAvatar')}
          </Link>
        </Button>
      </div>
    )
  }

  // Una elección que ya no vale (avatar borrado, look que perdió Avatar III o
  // de otra orientación) no se marca: CreateForm frena el envío y acá se dice.
  const current =
    selected !== null && isSelectedAvatarCurrent(selected, entries, videoFormat)
  const shown = entries.find((entry) => entry.id === (shownId ?? selected?.id))
  const shownUsability = shown ? avatarUsability(shown, videoFormat) : null
  // El botón «Look» va con todo avatar mirado que tenga looks y no entrene ni
  // haya fallado: con uno sin look para el formato, su grilla muestra todos
  // sus looks sin poder elegirlos (así se ve por qué) y no pide nada a HeyGen
  // hasta abrirse.
  const shownHasLookGrid =
    shown !== undefined &&
    shown.looks.length > 0 &&
    (shownUsability === 'usable' || shownUsability === 'noLook')
  // El look elegido del avatar que se mira, si la elección vale. Sin él (una
  // elección que ya no sirve en el formato) ni su tarjeta ni la grilla
  // sugieren una elección que no hay.
  const chosenLookId =
    current && shown && selected?.id === shown.id ? selected.lookId : undefined

  // El look que muestra la tarjeta de cada avatar: el elegido en el avatar
  // elegido (si la elección vale) y el de por defecto en los demás.
  const lookShownFor = (entry: AvatarSummary) => {
    if (selected?.id === entry.id) {
      if (!current) return undefined

      return entry.looks.find((look) => look.lookId === selected.lookId)
    }

    const choice = defaultAvatarChoice(entry, videoFormat)
    if (!choice) return undefined

    return entry.looks.find((look) => look.lookId === choice.lookId)
  }

  // Mirar un avatar elige su look por defecto (el principal si sirve); uno sin
  // look para el formato deja el formulario sin elección. El que ya está
  // elegido y sigue valiendo no se toca: conserva el look que se eligió.
  const showAvatar = (entry: AvatarSummary) => {
    setShownId(entry.id)
    if (current && selected?.id === entry.id) return

    onSelect(defaultAvatarChoice(entry, videoFormat))
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-sm font-semibold text-foreground">
            {t('create.avatar.avatarLabel')}
          </p>
          <Link
            to={AvatarsRoutes.avatars}
            className="font-display text-xs font-semibold text-amethyst hover:underline"
          >
            {t('create.avatar.manageLibrary')}
          </Link>
        </div>
        <div
          role="radiogroup"
          aria-label={t('create.avatar.chooseAvatar')}
          className={AVATAR_CARD_GRID_CLASSES[videoFormat]}
        >
          {entries.map((entry) => (
            <CreateAvatarCard
              key={entry.id}
              entry={entry}
              look={lookShownFor(entry)}
              videoFormat={videoFormat}
              checked={shown?.id === entry.id}
              disabled={disabled}
              onSelect={() => showAvatar(entry)}
            />
          ))}
        </div>
      </div>

      {/* Sin `key`: la grilla abierta sigue abierta al mirar otro avatar con
          looks (muestra los de ese); con uno sin looks se desmonta y vuelve
          cerrada. El aviso sin look para el formato va debajo. */}
      {shown && shownHasLookGrid && (
        <CreateAvatarLooks
          entry={shown}
          videoFormat={videoFormat}
          chosenLookId={chosenLookId}
          disabled={disabled}
          onChoose={(look) => onSelect(selectedAvatarFrom(shown, look))}
        />
      )}

      {shown && shownUsability === 'noLook' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed border-amethyst/40 p-3">
          <p className="font-body text-sm text-foreground">
            {t(AVATAR_NO_LOOK_KEYS[videoFormat], { name: shown.name })}
          </p>
          {shown.ownership === 'own' ? (
            <Button asChild size="sm" variant="outline">
              <Link to={avatarScenarioPath(shown.id, videoFormat)}>
                {t('create.avatar.createScenario')}
              </Link>
            </Button>
          ) : (
            <p className="font-body text-xs text-muted-foreground">
              {t('create.avatar.stockNoLook')}
            </p>
          )}
        </div>
      )}

      {selected !== null && !current && (
        <p className="font-body text-xs text-coral-text">
          {t('create.avatar.previousUnavailable')}
        </p>
      )}
    </div>
  )
}
