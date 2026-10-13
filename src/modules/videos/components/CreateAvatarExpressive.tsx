import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { HelpCircle } from 'lucide-react'
import { Label } from '@/modules/common/ui/label'
import { Switch } from '@/modules/common/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { AVATAR_ENGINE_LABEL_KEYS } from '@/modules/videos/constants'
import {
  avatarMotionReferenceMissing,
  selectedAvatarExpressiveAvailable,
} from '@/modules/videos/utilities/selectableAvatar'
import {
  AVATAR_LOOK_TYPES,
  avatarExpressiveAvailable,
  avatarMotionSupport,
} from '@pipeline/types/avatar.ts'
import type { SelectedAvatar } from '@/modules/videos/types/create'
import type { AvatarEngine } from '@pipeline/types/avatar.ts'

interface CreateAvatarExpressiveProps {
  // La elección del formulario (el tipo de su look y si su avatar tiene con
  // qué moverse) y el motor con el que sale: deciden si el interruptor se ve
  // y si hace algo.
  avatar: SelectedAvatar
  engine: AvatarEngine
  // Lo que eligió la persona (CreateFormValue.avatarExpressive).
  checked: boolean
  disabled: boolean
  onChange(avatarExpressive: boolean): void
}

// «Movimiento más expresivo» en la tarjeta del avatar de Crear (entrega 2e,
// §21.3): un interruptor con su ayuda en un tooltip, que dice qué hace y que
// no suma costo (R-2e-3), solo con los motores que mueven el cuerpo (V e IV;
// con Avatar III no se muestra). Con un motor y un look que no lo admiten (IV
// con un gemelo digital o un look de estudio) se ve apagado y dice por qué,
// aunque la persona lo haya prendido: la elección queda en el formulario y no
// viaja (formPayload). Lo mismo con Avatar V y un look de foto de un avatar
// propio sin gemelo digital (entrega 2f, R-2f-1): V no puede moverlo con un
// prompt, su look sale con el movimiento propio de V y el motivo lo dice.
// Debajo, si el motor y el look admiten el prompt de movimiento, la línea que
// dice que Vimo lo escribe para cada aparición (§21.2); sin ese prompt, no
// sale. La ayuda va fuera de la etiqueta: tocarla no prende el interruptor.
// Presentacional.
export function CreateAvatarExpressive({
  avatar,
  engine,
  checked,
  disabled,
  onChange,
}: CreateAvatarExpressiveProps) {
  const { t } = useTranslation()
  const reasonId = useId()

  if (!engineMoves(engine)) return null

  const referenceMissing = avatarMotionReferenceMissing(avatar, engine)
  const available = selectedAvatarExpressiveAvailable(avatar, engine)
  const writesMotion =
    avatarMotionSupport(engine, avatar.lookType).motionPrompt &&
    !referenceMissing

  return (
    <div className="space-y-1.5 rounded-lg border border-amethyst/30 bg-card/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Label
          htmlFor="create-avatar-expressive"
          className="cursor-pointer font-display"
        >
          {t('create.avatar.expressive')}
        </Label>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Botón y no ícono suelto, como en LabeledSelect: el tooltip
                también se abre con el teclado. */}
            <button
              type="button"
              aria-label={t('create.avatar.expressiveHelpAria')}
              className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-amethyst"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs font-body text-xs">
            {t('create.avatar.expressiveTooltip')}
          </TooltipContent>
        </Tooltip>
        <Switch
          id="create-avatar-expressive"
          className="ml-auto data-[state=checked]:bg-amethyst"
          checked={checked && available}
          disabled={disabled || !available}
          aria-describedby={available ? undefined : reasonId}
          onCheckedChange={onChange}
        />
      </div>
      {!available && (
        <p id={reasonId} className="font-body text-xs text-muted-foreground">
          {referenceMissing
            ? t('create.avatar.expressiveNoReference')
            : t('create.avatar.expressiveUnavailable', {
                engine: t(AVATAR_ENGINE_LABEL_KEYS[engine]),
              })}
        </p>
      )}
      {writesMotion && (
        <p className="font-body text-xs text-muted-foreground">
          {t('create.avatar.motionAuto')}
        </p>
      )}
    </div>
  )
}

// ¿El motor mueve el cuerpo con algún tipo de look? V e IV sí; Avatar III,
// que solo sincroniza los labios, no (avatarMotionSupport).
function engineMoves(engine: AvatarEngine): boolean {
  return AVATAR_LOOK_TYPES.some((lookType) =>
    avatarExpressiveAvailable(engine, lookType),
  )
}
