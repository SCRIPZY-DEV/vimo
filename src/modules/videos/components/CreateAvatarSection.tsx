import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { UserRound } from 'lucide-react'
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
import { CreateAvatarPicker } from '@/modules/videos/components/CreateAvatarPicker'
import { CREATE_AVATAR_LIBRARY_STALE_TIME_MS } from '@/modules/videos/constants'
import { firstSelectableAvatar } from '@/modules/videos/utilities/selectableAvatar'
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
// para el formato del video, cuántas veces y cuánto sale, si abre el video,
// el costo con la tarifa de Avatar III, el saldo de HeyGen y el aviso de
// moderación. Sin clave de HeyGen avisa y lleva a Claves API, con el
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
          <p className="font-body text-xs text-coral">
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
          <p className="font-body text-xs text-muted-foreground">
            {t('create.avatar.moderationHint')}
          </p>
        </>
      )}
    </section>
  )
}
