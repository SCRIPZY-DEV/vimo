import { useTranslation } from 'react-i18next'
import { CircleAlert, Loader2, MessageCircleQuestion } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import type { StyleCloneCardState } from '@/modules/videos/types/styleClone'

interface StyleCloneStatusTagProps {
  state: StyleCloneCardState
  className?: string
}

const COMPACT_SIZE = 'gap-1 px-2.5 py-1 text-xs shadow'
const COMPACT_ICON = 'h-3.5 w-3.5'

// Cada tono con su color, su tamaño y su ícono: trabajando (neutro, girando),
// detenida (coral) o esperando una respuesta (saffron). Esta última es la que
// más tiene que verse: quien cerró el modal sin aprobar la encuentra por su
// etiqueta, así que va más grande y con borde.
const TONES = {
  working: {
    container: 'bg-background/90 text-foreground',
    size: COMPACT_SIZE,
    icon: COMPACT_ICON,
    Icon: Loader2,
  },
  attention: {
    container: 'bg-saffron text-charcoal ring-2 ring-white/80',
    size: 'gap-1.5 px-3 py-1.5 text-[13px] shadow-md',
    icon: 'h-4 w-4',
    Icon: MessageCircleQuestion,
  },
  error: {
    container: 'bg-coral text-white',
    size: COMPACT_SIZE,
    icon: COMPACT_ICON,
    Icon: CircleAlert,
  },
} as const

// La etiqueta de estado de una clonación de estilo, sobre su tarjeta de Mi
// estilo. Presentacional.
export function StyleCloneStatusTag({
  state,
  className,
}: StyleCloneStatusTagProps) {
  const { t } = useTranslation()
  const { container, size, icon, Icon } = TONES[state.tone]

  return (
    <span
      role="status"
      className={cn(
        'inline-flex max-w-full items-center rounded-full font-display font-bold',
        container,
        size,
        className,
      )}
    >
      <Icon className={cn('shrink-0', icon, state.busy && 'animate-spin')} />
      <span className="truncate">{t(state.labelKey)}</span>
    </span>
  )
}
