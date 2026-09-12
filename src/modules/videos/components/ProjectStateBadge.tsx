import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Ban,
  Check,
  Clock,
  History,
  Loader2,
  Pause,
  Pencil,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import type { ProjectBadge } from '@/modules/videos/types/library'

interface ProjectStateBadgeProps {
  badge: ProjectBadge
}

interface BadgeLook {
  classes: string
  Icon: LucideIcon
  spin?: boolean
}

// Píldora pastel OPACA con ícono: el color del estado al ~18 % MEZCLADO CON
// BLANCO (no transparencia) y el texto en el color pleno. Con el fondo al
// 15 % de opacidad, «Listo» y «Desactualizado» desaparecían sobre portadas
// claras o cálidas (QA del 2026-09-11); mezclar con blanco da el mismo tono
// pastel pero la portada nunca se cuela detrás. «Generando» va en verde y
// «Exportado», el estado que importa, en saffron PLENO como la píldora
// activa de las pestañas (pedidos del dueño).
const BADGE_LOOKS: Record<ProjectBadge, BadgeLook> = {
  ready: { classes: 'bg-saffron text-charcoal shadow-md', Icon: Check },
  outdated: {
    classes: 'bg-[color-mix(in_srgb,hsl(var(--coral))_18%,white)] text-coral',
    Icon: History,
  },
  generating: {
    classes: 'bg-[color-mix(in_srgb,hsl(var(--mint))_16%,white)] text-mint',
    Icon: Loader2,
    spin: true,
  },
  awaitingConfirmation: {
    classes:
      'bg-[color-mix(in_srgb,hsl(var(--saffron))_22%,white)] text-charcoal',
    Icon: Clock,
  },
  interrupted: { classes: 'bg-muted text-muted-foreground', Icon: Pause },
  // «Cancelado» lo frenó la persona: color propio (el turquesa de la app),
  // para no confundirlo con el gris de interrumpido/borrador ni con el rojo
  // de error.
  paused: {
    classes: 'bg-[color-mix(in_srgb,hsl(var(--ocean))_18%,white)] text-ocean',
    Icon: Ban,
  },
  error: {
    classes:
      'bg-[color-mix(in_srgb,hsl(var(--destructive))_16%,white)] text-destructive',
    Icon: AlertCircle,
  },
  draft: { classes: 'bg-muted text-muted-foreground', Icon: Pencil },
}

export function ProjectStateBadge({ badge }: ProjectStateBadgeProps) {
  const { t } = useTranslation()
  const { classes, Icon, spin } = BADGE_LOOKS[badge]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-xs font-bold shadow-sm ring-1 ring-black/5',
        classes,
      )}
    >
      <Icon aria-hidden className={cn('h-3.5 w-3.5', spin && 'animate-spin')} />
      {t(`library.list.badge.${badge}`)}
    </span>
  )
}
