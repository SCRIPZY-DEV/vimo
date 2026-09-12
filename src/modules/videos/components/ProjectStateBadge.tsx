import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import type { ProjectBadge } from '@/modules/videos/types/library'

interface ProjectStateBadgeProps {
  badge: ProjectBadge
}

// Fondos OPACOS: el badge va encima de la portada, y con un fondo al 15 % el
// «Listo» amarillo desaparecía sobre portadas claras o cálidas (QA del
// 2026-09-11). Texto oscuro sobre color pleno o blanco sobre oscuro, siempre
// con sombra y un filo fino para despegarse de cualquier imagen.
const BADGE_CLASSES: Record<ProjectBadge, string> = {
  ready: 'bg-saffron text-charcoal',
  outdated: 'bg-coral text-charcoal',
  generating: 'bg-lavender text-charcoal',
  awaitingConfirmation: 'bg-saffron text-charcoal',
  interrupted: 'bg-charcoal text-white',
  paused: 'bg-charcoal text-white',
  error: 'bg-destructive text-white',
  draft: 'bg-charcoal text-white',
}

export function ProjectStateBadge({ badge }: ProjectStateBadgeProps) {
  const { t } = useTranslation()

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-display text-xs font-bold shadow-md ring-1 ring-black/10 ${BADGE_CLASSES[badge]}`}
    >
      {badge === 'generating' && <Loader2 className="h-3 w-3 animate-spin" />}
      {t(`library.list.badge.${badge}`)}
    </span>
  )
}
