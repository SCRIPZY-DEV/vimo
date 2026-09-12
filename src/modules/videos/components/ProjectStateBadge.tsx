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
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import type { ProjectBadge } from '@/modules/videos/types/library'

interface ProjectStateBadgeProps {
  badge: ProjectBadge
}

interface BadgeLook {
  background: string
  Icon: LucideIcon
  spin?: boolean
}

// Píldora de color PLENO con ícono y texto blanco, un tono por estado: es el
// diseño que el dueño aprobó el 2026-09-11 sobre la vista previa. Las
// versiones anteriores (fondo al 15 % de opacidad, después pastel mezclado
// con blanco) se perdían sobre portadas claras o cálidas; el pleno se lee
// sobre cualquier portada. Todos los fondos pasan AA (≥ 4,5:1) con el blanco.
// «Exportado» y «Generando» comparten el verde y los distingue el ícono
// girando; «Desactualizado» va en violeta porque el coral no aguanta texto
// blanco y, oscurecido, era otro rojo al lado de «Cancelado» y «Error».
const BADGE_LOOKS: Record<ProjectBadge, BadgeLook> = {
  ready: { background: 'bg-mint', Icon: Check },
  outdated: { background: 'bg-iris', Icon: History },
  generating: { background: 'bg-mint', Icon: Loader2, spin: true },
  awaitingConfirmation: { background: 'bg-ocean-deep', Icon: Clock },
  interrupted: { background: 'bg-ember', Icon: Pause },
  paused: { background: 'bg-cherry', Icon: Ban },
  // Pausado por saldo agotado (ADR-0031, viene de dev): frambuesa con la
  // billetera como ícono.
  noCredits: { background: 'bg-raspberry', Icon: Wallet },
  error: { background: 'bg-wine', Icon: AlertCircle },
  draft: { background: 'bg-graphite', Icon: Pencil },
}

export function ProjectStateBadge({ badge }: ProjectStateBadgeProps) {
  const { t } = useTranslation()
  const { background, Icon, spin } = BADGE_LOOKS[badge]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-xs font-bold text-white shadow-md ring-1 ring-black/5',
        background,
      )}
    >
      <Icon aria-hidden className={cn('h-3.5 w-3.5', spin && 'animate-spin')} />
      {t(`library.list.badge.${badge}`)}
    </span>
  )
}
