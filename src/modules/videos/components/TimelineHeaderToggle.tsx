import type { ReactNode } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { cn } from '@/modules/common/utilities/cn'

interface TimelineHeaderToggleProps {
  // Fija, sin el estado: el estado lo anuncia aria-pressed.
  label: string
  // true = silenciado o bloqueado: el ícono se pinta en coral.
  active: boolean
  onClick(): void
  children: ReactNode
}

// Botón de la cabecera de una pista (silenciar, candado) con tooltip y estado
// visible por color.
export function TimelineHeaderToggle({
  label,
  active,
  onClick,
  children,
}: TimelineHeaderToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted',
            active ? 'text-coral' : 'text-muted-foreground',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
