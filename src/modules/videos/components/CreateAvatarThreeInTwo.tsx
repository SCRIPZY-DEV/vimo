import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { HelpCircle } from 'lucide-react'
import { CheckboxRow } from '@/modules/common/components/CheckboxRow'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import {
  AVATAR_EARLY_APPEARANCES,
  AVATAR_EARLY_MAX_SECONDS,
} from '@pipeline/types/avatar.ts'

interface CreateAvatarThreeInTwoProps {
  // Lo que eligió la persona (CreateFormValue.avatarThreeInTwoMinutes).
  checked: boolean
  // Lo que eligió con los controles de arriba: deciden qué avisos salen.
  appearances: number
  secondsPerAppearance: number
  disabled: boolean
  onChange(avatarThreeInTwoMinutes: boolean): void
}

// La casilla «3 veces en 2 minutos» de la tarjeta del avatar en Crear (entrega
// 2f, diseño §22.2, pedido del dueño del 2026-10-12): el avatar sale al menos 3
// veces en los primeros 2 minutos, contando la apertura. Va debajo de «Empieza
// con el avatar», con la misma casilla (CheckboxRow) y, al lado, una ayuda en
// un tooltip como la de «Movimiento más expresivo». Prendida, avisa lo que
// cambia en lo que la persona eligió: con menos de 3 apariciones salen 3
// (R-2f-2) y con más de AVATAR_EARLY_MAX_SECONDS por aparición las tres
// primeras se acortan para entrar en la ventana (R-2f-3); el costo de la
// tarjeta ya cuenta esas duraciones (createAvatarSeconds). Los avisos que están
// a la vista son la descripción de la casilla (`aria-describedby`, en el orden
// en que se ven), así que un lector de pantalla los lee con ella. La ayuda va
// fuera de la etiqueta: tocarla no marca la casilla. Presentacional.
export function CreateAvatarThreeInTwo({
  checked,
  appearances,
  secondsPerAppearance,
  disabled,
  onChange,
}: CreateAvatarThreeInTwoProps) {
  const { t } = useTranslation()
  const noteId = useId()
  const minimumId = `${noteId}-minimum`
  const cappedId = `${noteId}-capped`
  const showMinimum = checked && appearances < AVATAR_EARLY_APPEARANCES
  const showCapped = checked && secondsPerAppearance > AVATAR_EARLY_MAX_SECONDS

  // Solo los avisos que se ven: un id que no está en la página no describe.
  const noteIds: string[] = []
  if (showMinimum) noteIds.push(minimumId)
  if (showCapped) noteIds.push(cappedId)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <CheckboxRow
          label={t('create.avatar.threeInTwo')}
          checked={checked}
          disabled={disabled}
          describedBy={noteIds.length > 0 ? noteIds.join(' ') : undefined}
          onChange={onChange}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Botón y no ícono suelto, como en CreateAvatarExpressive: el
                tooltip también se abre con el teclado. */}
            <button
              type="button"
              aria-label={t('create.avatar.threeInTwoHelpAria')}
              className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-amethyst"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs font-body text-xs">
            {t('create.avatar.threeInTwoTooltip')}
          </TooltipContent>
        </Tooltip>
      </div>
      {showMinimum && (
        <p id={minimumId} className="font-body text-xs text-muted-foreground">
          {t('create.avatar.threeInTwoMinimum')}
        </p>
      )}
      {showCapped && (
        <p id={cappedId} className="font-body text-xs text-muted-foreground">
          {t('create.avatar.threeInTwoCapped', {
            seconds: AVATAR_EARLY_MAX_SECONDS,
          })}
        </p>
      )}
    </div>
  )
}
