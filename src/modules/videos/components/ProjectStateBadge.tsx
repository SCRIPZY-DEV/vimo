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

// Píldora pastel OPACA con ícono: el color del estado MEZCLADO CON BLANCO
// (no transparencia) y el texto en el color pleno o en charcoal. Con el fondo
// al 15 % de opacidad, «Listo» y «Desactualizado» desaparecían sobre portadas
// claras o cálidas (QA del 2026-09-11); mezclar con blanco da el mismo tono
// pastel pero la portada nunca se cuela detrás. Colores pedidos por el dueño:
// «Exportado» (el estado que importa) en verde PLENO con texto blanco,
// «Generando» en el mismo verde pastel, «Confirmar escenas» turquesa claro,
// «Interrumpido» naranja claro y «Cancelado» rojo como «Error» (es un freno,
// no un «quedó a medias»); cada uno se distingue además por su ícono.
const BADGE_LOOKS: Record<ProjectBadge, BadgeLook> = {
  ready: { classes: 'bg-mint text-white shadow-md', Icon: Check },
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
      'bg-[color-mix(in_srgb,hsl(var(--ocean))_30%,white)] text-charcoal',
    Icon: Clock,
  },
  interrupted: {
    classes:
      'bg-[color-mix(in_srgb,hsl(var(--tangerine))_30%,white)] text-charcoal',
    Icon: Pause,
  },
  paused: {
    classes:
      'bg-[color-mix(in_srgb,hsl(var(--destructive))_16%,white)] text-destructive',
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
