import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { avatarsApi } from '@/modules/avatars/api'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import { AvatarsRoutes, avatarScenarioPath } from '@/modules/avatars/constants'
import { useStockLooks } from '@/modules/avatars/hooks/useStockLooks'
import { CharacterPortrait } from '@/modules/common/components/CharacterPortrait'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { Button } from '@/modules/common/ui/button'
import { Skeleton } from '@/modules/common/ui/skeleton'
import { cn } from '@/modules/common/utilities/cn'
import { LabeledSelect } from '@/modules/videos/components/LabeledSelect'
import {
  AVATAR_LOOK_FRAME_CLASSES,
  AVATAR_LOOK_PREVIEW_WIDTH_CLASSES,
  AVATAR_NO_LOOK_KEYS,
  AVATAR_PICKER_SKELETONS,
  AVATAR_USABILITY_LABEL_KEYS,
} from '@/modules/videos/constants'
import {
  avatarLooksFor,
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
// look ES el escenario y HeyGen lo renderiza tal cual). Arriba, una ficha por
// avatar con su cara, su nombre y cuántos looks le sirven; abajo (entrega
// 2b), el desplegable «Look» con esos looks —el principal primero y por
// defecto, cada uno con su tipo de nota— y, al lado, la vista previa del
// elegido con la forma del video y su video al pasar el mouse. Las vistas
// previas que no están en disco (la biblioteca baja solo las de su tarjeta) y
// los videos salen del listado de HeyGen, gratis y con la caché del panel de
// la biblioteca. Un avatar sin look para el formato lo dice y, si es propio,
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
  // El mouse está sobre la vista previa del look: pasa su video (mudo).
  const [previewActive, setPreviewActive] = useState(false)

  // Antes de los returns tempranos: la lectura de HeyGen es un hook. Se pide
  // solo con looks que mostrar (un avatar sin look para el formato no tiene
  // vista previa) y por el mismo listado que el panel de la biblioteca: un
  // avatar propio se lista entre los privados de la cuenta.
  const shown = entries.find((entry) => entry.id === (shownId ?? selected?.id))
  const shownLooks = shown ? avatarLooksFor(shown, videoFormat) : []
  const remote = useStockLooks({
    ownership: shown?.ownership === 'own' ? 'private' : 'public',
    groupId: shown?.groupId ?? '',
    enabled: shownLooks.length > 0,
  })

  if (loading) {
    const slots = Array.from(
      { length: AVATAR_PICKER_SKELETONS },
      (_, index) => `slot-${index}`,
    )
    return (
      <div aria-hidden className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {slots.map((slot) => (
          <Skeleton key={slot} className="aspect-[4/5] w-full rounded-xl" />
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
  const shownWithoutLook =
    shown !== undefined && avatarUsability(shown, videoFormat) === 'noLook'
  // El look elegido de este avatar, si la elección vale: el desplegable lo
  // marca y la vista previa lo muestra. Sin él (una elección que ya no sirve
  // en el formato), el desplegable queda vacío y la vista previa con el
  // dibujo, sin sugerir una elección que no hay.
  const chosenLookId =
    current && shown && selected?.id === shown.id ? selected.lookId : undefined
  const chosenLook = shownLooks.find((look) => look.lookId === chosenLookId)
  const remoteLook = chosenLook
    ? remote.looks.find((look) => look.lookId === chosenLook.lookId)
    : undefined
  const previewImage = chosenLook?.previewPath
    ? avatarsApi.imageSource(chosenLook.previewPath)
    : remoteLook?.previewImageUrl
  // Cada opción con su tipo y, la principal, que es la de la biblioteca: la
  // nota sale solo en la lista; el desplegable cerrado muestra el nombre.
  const lookOptions = shownLooks.map((look) => {
    const notes = [t(`avatars.types.${look.lookType}`)]
    if (look.lookId === shown?.mainLookId)
      notes.push(t('create.avatar.lookMainNote'))

    return { id: look.lookId, label: look.name, note: notes.join(' · ') }
  })

  // Mirar un avatar elige su look por defecto (el principal si sirve); uno sin
  // look para el formato deja el formulario sin elección. El que ya está
  // elegido y sigue valiendo no se toca: conserva el look que se eligió.
  const showAvatar = (entry: AvatarSummary) => {
    setShownId(entry.id)
    if (current && selected?.id === entry.id) return

    onSelect(defaultAvatarChoice(entry, videoFormat))
  }

  const chooseLook = (lookId: string) => {
    const look = shownLooks.find((item) => item.lookId === lookId)
    if (!shown || !look) return

    onSelect(selectedAvatarFrom(shown, look))
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
          className="grid grid-cols-3 gap-2 sm:grid-cols-5"
        >
          {entries.map((entry) => {
            const usability = avatarUsability(entry, videoFormat)
            const isShown = shown?.id === entry.id
            return (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={isShown}
                disabled={
                  disabled || usability === 'training' || usability === 'failed'
                }
                onClick={() => showAvatar(entry)}
                className={cn(
                  'overflow-hidden rounded-xl border-2 bg-card text-left transition-colors disabled:cursor-not-allowed',
                  isShown
                    ? 'border-amethyst shadow-[0_0_0_2px_hsl(var(--amethyst)/0.35)]'
                    : 'border-border enabled:hover:border-amethyst/50',
                  usability !== 'usable' && 'opacity-60',
                )}
              >
                <CharacterPortrait
                  src={
                    entry.previewPath
                      ? avatarsApi.imageSource(entry.previewPath)
                      : null
                  }
                  doodleSize={36}
                  focus="top"
                  className="aspect-[4/5] w-full"
                />
                <span className="block truncate px-1.5 pt-1 font-display text-xs font-bold text-foreground">
                  {entry.name}
                </span>
                <span
                  className={cn(
                    'block truncate px-1.5 pb-1.5 font-body text-[10px]',
                    usability === 'usable'
                      ? 'text-amethyst'
                      : 'text-muted-foreground',
                  )}
                >
                  {t(AVATAR_USABILITY_LABEL_KEYS[usability], {
                    count: avatarLooksFor(entry, videoFormat).length,
                  })}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {shown && shownLooks.length > 0 && (
        <div className="flex items-start gap-3">
          {/* El video sale con el mouse sobre la vista previa y queda mudo:
              acá no hay reproductor (spec §18). La `key` por look arranca
              cada vista previa de cero: su imagen y su video son otros. */}
          <div
            onMouseEnter={() => setPreviewActive(true)}
            onMouseLeave={() => setPreviewActive(false)}
            className="shrink-0"
          >
            <LookPreview
              key={chosenLook?.lookId}
              imageUrl={previewImage}
              videoUrl={remoteLook?.previewVideoUrl}
              alt={t('avatars.stock.previewAria', {
                name: chosenLook?.name ?? shown.name,
              })}
              focus="top"
              active={previewActive}
              loading={
                chosenLook !== undefined && !previewImage && remote.isLoading
              }
              doodleSize={40}
              className={cn(
                AVATAR_LOOK_PREVIEW_WIDTH_CLASSES[videoFormat],
                AVATAR_LOOK_FRAME_CLASSES[videoFormat],
                'rounded-xl ring-1 ring-border',
              )}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <LabeledSelect
              label={t('create.avatar.lookLabel')}
              help={t('create.avatar.lookHelp')}
              value={chosenLook?.lookId}
              options={lookOptions}
              disabled={disabled}
              onChange={chooseLook}
            />
            <p className="font-body text-xs text-muted-foreground">
              {t('create.avatar.lookHint')}
            </p>
          </div>
        </div>
      )}

      {shown && shownWithoutLook && (
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
        <p className="font-body text-xs text-coral">
          {t('create.avatar.previousUnavailable')}
        </p>
      )}
    </div>
  )
}
