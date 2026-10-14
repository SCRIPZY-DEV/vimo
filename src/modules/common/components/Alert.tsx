import type { ReactNode, Ref } from 'react'
import { Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'

// Tono de la caja. Coral y no destructive: en oscuro `--destructive` se apaga
// y el aviso se pierde, mientras `--coral` sigue vivo en los dos temas. La caja
// (borde y fondo) lleva el coral pleno; el ícono, que sí se lee, usa
// `text-coral-text`: el coral pleno sobre el fondo claro da 2,86:1.
const ALERT_TONES = {
  warning: {
    container: 'border-saffron/60 bg-saffron/10',
    icon: 'text-saffron',
    defaultIcon: TriangleAlert,
  },
  danger: {
    container: 'border-coral/50 bg-coral/10',
    icon: 'text-coral-text',
    defaultIcon: TriangleAlert,
  },
  info: {
    container: 'border-saffron/30 bg-saffron/5',
    icon: 'text-saffron',
    defaultIcon: Info,
  },
} as const

type AlertTone = keyof typeof ALERT_TONES

interface AlertProps {
  tone?: AlertTone
  icon?: LucideIcon
  title?: ReactNode
  children?: ReactNode
  // Botones o enlaces alineados a la derecha.
  actions?: ReactNode
  className?: string
  id?: string
  ref?: Ref<HTMLDivElement>
}

// Caja de aviso en línea (textos ya traducidos, igual que ErrorMessage). No
// anima: la entrada la decide quien la monta.
export function Alert({
  tone = 'warning',
  icon,
  title,
  children,
  actions,
  className,
  id,
  ref,
}: AlertProps) {
  const styles = ALERT_TONES[tone]
  const Icon = icon ?? styles.defaultIcon

  return (
    <div
      ref={ref}
      id={id}
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-xl border-2 px-4 py-3',
        styles.container,
        className,
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', styles.icon)} />

      <div className="min-w-0 flex-1 font-body text-sm text-foreground">
        {title && (
          <p className="font-display font-bold text-foreground">{title}</p>
        )}
        {children}
      </div>

      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  )
}
