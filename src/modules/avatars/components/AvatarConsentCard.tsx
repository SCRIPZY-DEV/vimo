import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ShieldCheck } from 'lucide-react'
import { Separator } from '@/modules/common/ui/separator'
import { cn } from '@/modules/common/utilities/cn'
import { PHOTO_CONSENT_POINTS } from '@/modules/avatars/constants'

interface AvatarConsentCardProps {
  checked: boolean
  disabled: boolean
  // Se intentó crear sin marcar la casilla: el borde de la tarjeta va en rojo.
  invalid: boolean
  onChange: (checked: boolean) => void
}

// Lo que el proveedor no permite (famosos o personas reconocibles sin su
// consentimiento, contenido político, violento o engañoso) y, debajo, la
// confirmación obligatoria de que se tiene derecho a usar la foto. Toda la
// fila de la confirmación es clickeable: la casilla es un `button` dentro de
// un `label`, así Espacio y Enter la operan con el teclado. Su radio va fijo
// en 6 px: el `rounded-md` del tema mide 10 px y en una caja de 20 px la
// volvería un círculo, que se lee como una opción de radio. Presentacional.
export function AvatarConsentCard({
  checked,
  disabled,
  invalid,
  onChange,
}: AvatarConsentCardProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const detailId = useId()

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border bg-muted/30 transition-colors',
        invalid ? 'border-destructive' : 'border-border',
      )}
    >
      <div className="space-y-3 p-4">
        <h3 className="flex items-center gap-2.5 font-display text-sm font-bold text-foreground">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-saffron/15">
            <ShieldCheck aria-hidden className="h-4 w-4" />
          </span>
          {t('avatars.foto.permisos.titulo')}
        </h3>
        <ul className="space-y-2">
          {PHOTO_CONSENT_POINTS.map(({ labelKey, Icon }) => (
            <li
              key={labelKey}
              className="flex items-start gap-2.5 font-body text-xs leading-relaxed text-muted-foreground"
            >
              <Icon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t(labelKey)}
            </li>
          ))}
        </ul>
      </div>

      <Separator />

      <label
        className={cn(
          'flex select-none items-start gap-3 p-4 transition-colors',
          disabled
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:bg-muted/50',
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-invalid={invalid}
          aria-labelledby={titleId}
          aria-describedby={detailId}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed',
            boxClassName(checked, invalid),
          )}
        >
          {checked && (
            <Check aria-hidden strokeWidth={3} className="h-3.5 w-3.5" />
          )}
        </button>
        <span className="min-w-0 space-y-0.5">
          <span
            id={titleId}
            className="block font-display text-sm font-bold text-foreground"
          >
            {t('avatars.foto.consentimiento.titulo')}
          </span>
          <span
            id={detailId}
            className="block font-body text-xs leading-relaxed text-muted-foreground"
          >
            {t('avatars.foto.consentimiento.detalle')}
          </span>
        </span>
      </label>
    </section>
  )
}

// Marcada: saffron pleno con el tilde oscuro (legible en los dos temas).
function boxClassName(checked: boolean, invalid: boolean) {
  if (checked) return 'border-saffron bg-saffron text-charcoal'
  if (invalid) return 'border-destructive bg-background'
  return 'border-muted-foreground/50 bg-background'
}
