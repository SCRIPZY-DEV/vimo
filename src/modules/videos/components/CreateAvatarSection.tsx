import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ShieldAlert, UserRound } from 'lucide-react'
import { apiKeysFocusPath } from '@/modules/api-keys/constants'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { AvatarBalanceBadge } from '@/modules/avatars/components/AvatarBalanceBadge'
import { useAvatars } from '@/modules/avatars/hooks/useAvatars'
import { useProcessingAvatarsRefresh } from '@/modules/avatars/hooks/useProcessingAvatarsRefresh'
import { CheckboxRow } from '@/modules/common/components/CheckboxRow'
import { SliderRow } from '@/modules/common/components/SliderRow'
import { Button } from '@/modules/common/ui/button'
import { Label } from '@/modules/common/ui/label'
import { Switch } from '@/modules/common/ui/switch'
import { CreateAvatarCost } from '@/modules/videos/components/CreateAvatarCost'
import { CreateAvatarEngine } from '@/modules/videos/components/CreateAvatarEngine'
import { CreateAvatarExpressive } from '@/modules/videos/components/CreateAvatarExpressive'
import { CreateAvatarPicker } from '@/modules/videos/components/CreateAvatarPicker'
import { CREATE_AVATAR_LIBRARY_STALE_TIME_MS } from '@/modules/videos/constants'
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

interface CreateAvatarSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange(patch: Partial<CreateFormValue>): void
}

// La tarjeta «Avatar presentador» de Crear (spec §9), con el molde de
// CreateAnimationSection: interruptor, el avatar de la biblioteca y su look
// para el formato del video, el motor y «Movimiento más expresivo» (entrega
// 2e, §21.3: derivados del look elegido; elegir un look nunca toca el motor),
// cuántas veces y cuánto sale, si abre el video, el costo con la tarifa del
// motor, el saldo de HeyGen y, destacado, el aviso de moderación. Sin clave
// de HeyGen avisa y lleva a Claves API, con el
// interruptor apagado (Crear le pasa el formulario con el avatar apagado:
// withAvatarKey). Es dueña de su lectura de la biblioteca —y, encendida, del
// sondeo de lo que entrena o genera un look, para que un escenario pedido con
// «Crear escenario» aparezca acá al terminar—; el saldo lo trae
// AvatarBalanceBadge.
export function CreateAvatarSection({
  value,
  disabled,
  onChange,
}: CreateAvatarSectionProps) {
  const { t } = useTranslation()
  const { configuredProviders } = useRequiredApiKeys()
  const heygenConfigured = configuredProviders.has('heygen')
  const library = useAvatars({
    enabled: heygenConfigured,
    staleTime: CREATE_AVATAR_LIBRARY_STALE_TIME_MS,
  })
  const enabled = value.useAvatar && heygenConfigured
  // El motor con el que sale el look elegido (el preferido si lo admite).
  const engine = selectedAvatarEngine(value)

  useProcessingAvatarsRefresh(enabled ? library.entries : [])

  // Sin fricción: al encender se elige solo el primer avatar que sirve en el
  // formato del video, con su look por defecto (la persona lo cambia con un
  // clic); al apagar, la elección se conserva.
  const toggle = (useAvatar: boolean) => {
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
        <Switch
          id="create-avatar"
          className="data-[state=checked]:bg-amethyst"
          checked={enabled}
          disabled={disabled || !heygenConfigured}
          onCheckedChange={toggle}
        />
      </Label>
      {!heygenConfigured && (
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
      {enabled && (
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
              engine={engine}
              lookType={value.avatar.lookType}
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
