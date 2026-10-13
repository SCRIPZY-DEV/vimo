import type { ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'

interface EditorAvatarHelpTooltipProps {
  // El nombre del botón para un lector de pantalla.
  label: string
  // El texto del tooltip.
  children: ReactNode
}

// El «?» con tooltip de las secciones «Duración» y «Movimiento» del avatar en
// el editor (entrega 2g, §23.3 y §23.4): un botón y no un ícono suelto, así el
// tooltip también se abre con el teclado, como en LabeledSelect.
// Presentacional.
export function EditorAvatarHelpTooltip({
  label,
  children,
}: EditorAvatarHelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-amethyst"
        >
          <HelpCircle aria-hidden className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs font-body text-xs">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}
