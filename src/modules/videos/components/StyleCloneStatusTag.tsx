import { useTranslation } from 'react-i18next'
import { CircleAlert, Loader2, MessageCircleQuestion } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import type { StyleCloneCardState } from '@/modules/videos/types/styleClone'

interface StyleCloneStatusTagProps {
  state: StyleCloneCardState
  className?: string
}

// Cada tono con su color y su ícono: trabajando (blanca, girando), detenida
// (coral) o esperando una respuesta (saffron, con borde: es la que la persona
// tiene que encontrar si cerró el modal sin aprobar). Colores fijos y no los
// del tema: la etiqueta va siempre sobre el velo oscuro de la tarjeta.
const TONES = {
  working: { container: 'bg-white text-charcoal', Icon: Loader2 },
  attention: {
    container: 'bg-saffron text-charcoal ring-2 ring-white/80',
    Icon: MessageCircleQuestion,
  },
  error: { container: 'bg-coral text-white', Icon: CircleAlert },
} as const

// La etiqueta de estado de una clonación de estilo, en el centro de su tarjeta
// de Mi estilo. En una tarjeta angosta un texto largo («Sin saldo · Recargá y
// continuá») baja a dos líneas en vez de cortarse, y el separador se queda
// con la primera parte: la segunda línea no empieza con el punto.
// Presentacional.
export function StyleCloneStatusTag({
  state,
  className,
}: StyleCloneStatusTagProps) {
  const { t } = useTranslation()
  const { container, Icon } = TONES[state.tone]

  return (
    <span
      role="status"
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-2xl px-3 py-2 font-display text-sm font-bold leading-tight shadow-lg',
        container,
        className,
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', state.busy && 'animate-spin')} />
      <span className="text-center">
        {t(state.labelKey).replace(' · ', '\u00A0· ')}
      </span>
    </span>
  )
}
