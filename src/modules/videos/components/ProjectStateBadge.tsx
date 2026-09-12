import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import type { ProjectBadge } from '@/modules/videos/types/library'

interface ProjectStateBadgeProps {
  badge: ProjectBadge
}

// «Exportado» y «Desactualizado» van OPACOS (color pleno, texto oscuro,
// sombra y filo fino): con el fondo al 15 % desaparecían sobre portadas
// claras o cálidas (QA del 2026-09-11). Los demás estados quedan como
// estaban, por pedido del dueño.
const BADGE_CLASSES: Record<ProjectBadge, string> = {
  ready: 'bg-saffron text-charcoal shadow-md ring-1 ring-black/10',
  outdated: 'bg-coral text-charcoal shadow-md ring-1 ring-black/10',
  generating: 'bg-lavender/20 text-foreground',
  awaitingConfirmation: 'bg-saffron/15 text-saffron',
  interrupted: 'bg-muted text-muted-foreground',
  paused: 'bg-muted text-muted-foreground',
  error: 'bg-destructive/10 text-destructive',
  draft: 'bg-muted text-muted-foreground',
}

export function ProjectStateBadge({ badge }: ProjectStateBadgeProps) {
  const { t } = useTranslation()

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-display text-xs font-bold ${BADGE_CLASSES[badge]}`}
    >
      {badge === 'generating' && <Loader2 className="h-3 w-3 animate-spin" />}
      {t(`library.list.badge.${badge}`)}
    </span>
  )
}
