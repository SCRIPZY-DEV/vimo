import { useId } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus, Timer } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { EditorAvatarHelpTooltip } from '@/modules/videos/components/EditorAvatarHelpTooltip'
import {
  AVATAR_DURATION_LOCK_KEYS,
  AVATAR_DURATION_STEP_SECONDS,
} from '@/modules/videos/constants'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
import type { AvatarDurationControl } from '@/modules/videos/types/avatarDuration'

interface EditorAvatarDurationProps {
  duration: AvatarDurationControl
  // Otra tarea del proyecto en curso, un recorte en vuelo o la demo: los
  // controles esperan.
  disabled: boolean
}

// «Duración» de una escena de avatar en el panel y en la tarjeta desplegada
// de la vista ampliada (entrega 2g, diseño §23.3): «−» y «+» de a un segundo
// entre el mínimo y lo más largo que entra en ese lugar (`limits`), con la
// duración elegida en el medio y, al lado, cuánto dura ahora de verdad (con un
// decimal: el corte cae en la pausa más cercana). La ayuda («termina en la
// pausa más cercana a ese largo, sin cortar una palabra») va en un tooltip
// junto al título, así la tarjeta desplegada entra sin scroll. Debajo, lo que
// pasa con lo elegido: si la escena que sigue está animada o es el final del
// video, que la duración no se puede cambiar y por qué (R-2g-18); si llegó a
// un límite, entre qué valores se puede elegir; y
// si es más larga que hoy, hasta qué hora de la narración toma y que se
// genera de nuevo. Los botones que llegaron a un límite, o todo el selector
// cuando otra tarea o la demo lo frenan, se apagan con `aria-disabled` y no
// con `disabled`: el que se aprieta hasta el límite tiene el foco, y un botón
// deshabilitado con el foco lo suelta fuera del diálogo de la vista ampliada
// (ERRORES-CONOCIDOS: dialogo-radix-con-controles-y-x-deshabilitados-deja-
// escapar-el-foco). Presentacional.
export function EditorAvatarDuration({
  duration,
  disabled,
}: EditorAvatarDurationProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'es'
  const titleId = useId()
  const { limits, seconds, initialSeconds, lock, endSeconds } = duration

  const canShorten = !disabled && seconds > limits.minSeconds
  const canLengthen = !disabled && seconds < limits.maxSeconds
  const atLimit = seconds <= limits.minSeconds || seconds >= limits.maxSeconds

  const shorten = () => {
    if (canShorten) duration.onChange(seconds - AVATAR_DURATION_STEP_SECONDS)
  }

  const lengthen = () => {
    if (canLengthen) duration.onChange(seconds + AVATAR_DURATION_STEP_SECONDS)
  }

  return (
    <div role="group" aria-labelledby={titleId} className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Timer aria-hidden className="h-4 w-4 text-amethyst" />
        <p
          id={titleId}
          className="font-display text-sm font-bold text-foreground"
        >
          {t('library.editor.avatar.duracion')}
        </p>
        <EditorAvatarHelpTooltip
          label={t('library.editor.avatar.duracionAyuda')}
        >
          {t('library.editor.avatar.duracionAyuda')}
        </EditorAvatarHelpTooltip>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <StepButton
            label={t('library.editor.avatar.duracionMenos')}
            blocked={!canShorten}
            onClick={shorten}
            firstControl
          >
            <Minus aria-hidden className="h-4 w-4" />
          </StepButton>
          {/* <output> es una región viva: el lector anuncia el valor nuevo. */}
          <output className="min-w-12 text-center font-mono text-sm font-semibold tabular-nums text-foreground">
            {t('library.editor.avatar.duracionValor', { seconds })}
          </output>
          <StepButton
            label={t('library.editor.avatar.duracionMas')}
            blocked={!canLengthen}
            onClick={lengthen}
          >
            <Plus aria-hidden className="h-4 w-4" />
          </StepButton>
        </div>
        <p className="font-body text-xs text-muted-foreground">
          {t('library.editor.avatar.duracionActual', {
            seconds: formatSlotSeconds(limits.currentSeconds, language),
          })}
        </p>
      </div>

      {lock && (
        <p className="font-body text-[11px] leading-snug text-foreground">
          {t(AVATAR_DURATION_LOCK_KEYS[lock])}
        </p>
      )}
      {!lock && atLimit && (
        <p className="font-body text-[11px] leading-snug text-foreground">
          {t('library.editor.avatar.duracionLimite', {
            min: limits.minSeconds,
            max: limits.maxSeconds,
          })}
        </p>
      )}
      {seconds > initialSeconds && (
        <p className="font-body text-[11px] leading-snug text-foreground">
          {t('library.editor.avatar.duracionMasLarga', {
            time: formatTime(endSeconds),
          })}
        </p>
      )}
    </div>
  )
}

interface StepButtonProps {
  label: string
  // Llegó a un límite o todo el selector espera: sigue con el foco y no hace
  // nada.
  blocked: boolean
  onClick(): void
  // El control donde cae el foco al desplegar la tarjeta del avatar en la
  // vista ampliada (AVATAR_CARD_FIRST_CONTROL_SELECTORS).
  firstControl?: boolean
  children: ReactNode
}

// Un botón del selector. Apagado con `aria-disabled` y nunca con `disabled`:
// el que se aprieta hasta el límite (o el que tiene el foco cuando otra tarea
// arranca) lo conserva, y un botón deshabilitado con el foco lo suelta fuera
// del diálogo de la vista ampliada.
function StepButton({
  label,
  blocked,
  onClick,
  firstControl = false,
  children,
}: StepButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      aria-disabled={blocked}
      data-first-control={firstControl ? '' : undefined}
      onClick={onClick}
      className={cn(
        'h-8 w-8 rounded-lg',
        blocked && 'cursor-not-allowed opacity-50',
      )}
    >
      {children}
    </Button>
  )
}
