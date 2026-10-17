import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ShieldAlert, UserRound } from 'lucide-react'
import { apiKeysFocusPath } from '@/modules/api-keys/constants'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { AvatarBalanceBadge } from '@/modules/avatars/components/AvatarBalanceBadge'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import { useAvatars } from '@/modules/avatars/hooks/useAvatars'
import { useProcessingAvatarsRefresh } from '@/modules/avatars/hooks/useProcessingAvatarsRefresh'
import { CheckboxRow } from '@/modules/common/components/CheckboxRow'
import { SliderRow } from '@/modules/common/components/SliderRow'
import { Button } from '@/modules/common/ui/button'
import { Label } from '@/modules/common/ui/label'
import { Switch } from '@/modules/common/ui/switch'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { CreateAvatarCost } from '@/modules/videos/components/CreateAvatarCost'
import { CreateAvatarEngine } from '@/modules/videos/components/CreateAvatarEngine'
import { CreateAvatarExpressive } from '@/modules/videos/components/CreateAvatarExpressive'
import { CreateAvatarPicker } from '@/modules/videos/components/CreateAvatarPicker'
import { CreateAvatarThreeInTwo } from '@/modules/videos/components/CreateAvatarThreeInTwo'
import {
  AVATAR_ENGINE_LABEL_KEYS,
  AVATAR_LOOK_FRAME_CLASSES,
  CREATE_AVATAR_LIBRARY_STALE_TIME_MS,
} from '@/modules/videos/constants'
import { createAvatarSeconds } from '@/modules/videos/utilities/avatarCostEstimate'
import {
  firstSelectableAvatar,
  selectedAvatarEngine,
} from '@/modules/videos/utilities/selectableAvatar'
import {
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MAX_APPEARANCES,
  AVATAR_MIN_APPEARANCE_SECONDS,
  AVATAR_MIN_APPEARANCES,
} from '@pipeline/types/avatar.ts'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { DemoAvatar } from '@pipeline/types/demo.ts'

interface CreateAvatarSectionProps {
  value: CreateFormValue
  disabled: boolean
  // La demo (spec demo v4 §2): el avatar de la historia del pack, fijo, o
  // null si el pack no trae ninguno («Próximamente», con el switch bloqueado).
  // Ausente fuera de la demo.
  demoAvatar?: DemoAvatar | null
  // Quien resuelve el switch si no es la tarjeta: en la demo, el formulario
  // (encenderlo cambia de estilo y de formato). Sin él, encenderlo elige el
  // primer avatar de la biblioteca que sirve.
  onToggle?: (useAvatar: boolean) => void
  onChange(patch: Partial<CreateFormValue>): void
}

// La tarjeta «Avatar presentador» de Crear (spec §9), con el molde de
// CreateAnimationSection: interruptor, el avatar de la biblioteca y su look
// para el formato del video, el motor y el movimiento (entrega 2e, §21.3:
// derivados del look elegido; elegir un look nunca toca el motor; desde la 2g,
// §23.1, «Movimiento más expresivo» solo existe con IV y un look de foto),
// cuántas veces y cuánto sale, si abre el video y si sale al menos 3 veces en
// los primeros 2 minutos (entrega 2f, §22.2), el costo con la tarifa del
// motor, el saldo de HeyGen y, destacado, el aviso de moderación. Sin clave
// de HeyGen avisa y lleva a Claves API, con el
// interruptor apagado (Crear le pasa el formulario con el avatar apagado:
// withAvatarKey). Es dueña de su lectura de la biblioteca —y, encendida, del
// sondeo de lo que entrena o genera un look, para que un escenario pedido con
// «Crear escenario» aparezca acá al terminar—; el saldo lo trae
// AvatarBalanceBadge.
//
// En la demo (spec demo v4 §2) muestra el avatar de la historia, fijo: su
// nombre, la vista de su look, sus apariciones y su motor. No lee la
// biblioteca de la persona ni depende de su clave de HeyGen, y no hay
// selector, costo, saldo ni aviso de clave.
export function CreateAvatarSection({
  value,
  disabled,
  demoAvatar,
  onToggle,
  onChange,
}: CreateAvatarSectionProps) {
  const { t } = useTranslation()
  const { configuredProviders } = useRequiredApiKeys()
  const demo = demoAvatar !== undefined
  const heygenConfigured = configuredProviders.has('heygen')
  const library = useAvatars({
    enabled: heygenConfigured && !demo,
    staleTime: CREATE_AVATAR_LIBRARY_STALE_TIME_MS,
  })
  const enabled = value.useAvatar && (heygenConfigured || demo)
  // El motor con el que sale el look elegido (el preferido si lo admite).
  const engine = selectedAvatarEngine(value)

  useProcessingAvatarsRefresh(enabled && !demo ? library.entries : [])

  // Sin fricción: al encender se elige solo el primer avatar que sirve en el
  // formato del video, con su look por defecto (la persona lo cambia con un
  // clic); al apagar, la elección se conserva.
  const toggle = (useAvatar: boolean) => {
    if (onToggle) {
      onToggle(useAvatar)
      return
    }

    if (!useAvatar) {
      onChange({ useAvatar: false })
      return
    }

    onChange({
      useAvatar: true,
      avatar:
        value.avatar ??
        firstSelectableAvatar(library.entries, value.videoFormat),
    })
  }

  return (
    <section className="space-y-3 rounded-xl border-2 border-amethyst/40 bg-amethyst/5 p-4">
      <Label
        htmlFor="create-avatar"
        className="flex cursor-pointer items-center gap-2 rounded-lg py-1"
      >
        <UserRound className="h-4 w-4 text-amethyst" />
        <span className="flex-1 font-display">{t('create.avatar.title')}</span>
        {demoAvatar === null && (
          <span className="font-body text-xs text-muted-foreground">
            {t('common.proximamente')}
          </span>
        )}
        <Switch
          id="create-avatar"
          className="data-[state=checked]:bg-amethyst"
          checked={enabled}
          disabled={
            disabled || (demo ? demoAvatar === null : !heygenConfigured)
          }
          onCheckedChange={toggle}
        />
      </Label>
      {enabled && demoAvatar && (
        <div className="flex items-center gap-3">
          <LookPreview
            imageUrl={videosApi.imageSource(demoAvatar.previewFile)}
            alt={t('create.avatar.demoLookAlt', { name: demoAvatar.name })}
            focus="top"
            doodleSize={32}
            className={cn(
              'w-32 shrink-0 rounded-lg',
              AVATAR_LOOK_FRAME_CLASSES[value.videoFormat],
            )}
          />
          <div className="min-w-0 space-y-0.5">
            <p className="truncate font-display text-sm font-bold text-foreground">
              {demoAvatar.name}
            </p>
            <p className="font-body text-xs text-muted-foreground">
              {t('create.avatar.demoAppearances', {
                count: demoAvatar.appearances,
                seconds: demoAvatar.secondsPerAppearance,
              })}
            </p>
            <p className="font-body text-xs text-muted-foreground">
              {t(AVATAR_ENGINE_LABEL_KEYS[demoAvatar.engine])}
            </p>
          </div>
        </div>
      )}
      {!heygenConfigured && !demo && (
        <div className="space-y-2">
          <p className="font-body text-xs text-coral-text">
            {t('create.avatar.noKey')}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to={apiKeysFocusPath(['heygen'])}>
              {t('create.avatar.goToApiKeys')}
            </Link>
          </Button>
        </div>
      )}
      {enabled && !demo && (
        <>
          <p className="font-body text-xs text-muted-foreground">
            {t('create.avatar.hint')}
          </p>
          <CreateAvatarPicker
            entries={library.entries}
            loading={library.isLoading}
            errorKey={library.errorKey}
            selected={value.avatar}
            videoFormat={value.videoFormat}
            disabled={disabled}
            onSelect={(avatar) => onChange({ avatar })}
          />
          {value.avatar && (
            <CreateAvatarEngine
              avatar={value.avatar}
              preferred={value.avatarEngine}
              seconds={createAvatarSeconds(value)}
              disabled={disabled}
              onSelect={(avatarEngine) => onChange({ avatarEngine })}
            />
          )}
          {value.avatar && engine && (
            <CreateAvatarExpressive
              avatar={value.avatar}
              engine={engine}
              checked={value.avatarExpressive}
              disabled={disabled}
              onChange={(avatarExpressive) => onChange({ avatarExpressive })}
            />
          )}
          <SliderRow
            id="create-avatar-appearances"
            label={t('create.avatar.appearances')}
            min={AVATAR_MIN_APPEARANCES}
            max={AVATAR_MAX_APPEARANCES}
            step={1}
            value={value.avatarAppearances}
            disabled={disabled}
            onChange={(avatarAppearances) => onChange({ avatarAppearances })}
          />
          <SliderRow
            id="create-avatar-seconds"
            label={t('create.avatar.secondsPerAppearance')}
            min={AVATAR_MIN_APPEARANCE_SECONDS}
            max={AVATAR_MAX_APPEARANCE_SECONDS}
            step={1}
            value={value.avatarSecondsPerAppearance}
            disabled={disabled}
            formatValue={(seconds) =>
              t('create.avatar.secondsValue', { seconds })
            }
            onChange={(avatarSecondsPerAppearance) =>
              onChange({ avatarSecondsPerAppearance })
            }
          />
          <CheckboxRow
            label={t('create.avatar.startWithAvatar')}
            checked={value.avatarStartsVideo}
            disabled={disabled}
            onChange={(avatarStartsVideo) => onChange({ avatarStartsVideo })}
          />
          <CreateAvatarThreeInTwo
            checked={value.avatarThreeInTwoMinutes}
            appearances={value.avatarAppearances}
            secondsPerAppearance={value.avatarSecondsPerAppearance}
            disabled={disabled}
            onChange={(avatarThreeInTwoMinutes) =>
              onChange({ avatarThreeInTwoMinutes })
            }
          />
          <CreateAvatarCost value={value} />
          <AvatarBalanceBadge />
          {/* Destacado desde la entrega 2b (spec §9, pedido del dueño): un
              recuadro con título e ícono en vez de una línea gris. El nombre
              de la nota es su título, como el del costo. */}
          <div
            role="note"
            aria-label={t('create.avatar.moderationTitle')}
            className="flex items-start gap-2.5 rounded-xl border border-saffron/50 bg-saffron/10 px-3.5 py-3"
          >
            <ShieldAlert
              aria-hidden
              className="mt-0.5 h-4 w-4 shrink-0 text-foreground"
            />
            <div className="space-y-0.5">
              <p className="font-display text-xs font-bold text-foreground">
                {t('create.avatar.moderationTitle')}
              </p>
              <p className="font-body text-xs leading-relaxed text-foreground/80">
                {t('create.avatar.moderationHint')}
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
