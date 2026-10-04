import { useTranslation } from 'react-i18next'
import { CircleAlert, Loader2, MessageCircleQuestion } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import type { StyleCloneCardState } from '@/modules/videos/types/styleClone'

interface StyleCloneStatusTagProps {
  state: StyleCloneCardState
  className?: string
}

// Cada tono con su color e ícono: trabajando (neutro, girando), esperando una
// respuesta (saffron, lo que más tiene que verse) o detenida (coral).
const TONES = {
  working: { container: 'bg-background/90 text-foreground', Icon: Loader2 },
  attention: {
    container: 'bg-saffron text-charcoal',
    Icon: MessageCircleQuestion,
  },
  error: { container: 'bg-coral text-white', Icon: CircleAlert },
} as const

// La etiqueta de estado de una clonación de estilo: va en su tarjeta de Mi
// estilo y en la cabecera de su modal. Presentacional.
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
        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 font-display text-[10px] font-bold shadow',
        container,
        className,
      )}
    >
      <Icon className={cn('h-3 w-3 shrink-0', state.busy && 'animate-spin')} />
      <span className="truncate">{t(state.labelKey)}</span>
    </span>
  )
}
