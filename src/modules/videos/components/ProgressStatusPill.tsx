import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import type { CreateTaskStatus } from '@/modules/videos/types/create'

interface ProgressStatusPillProps {
  status: CreateTaskStatus
}

type PillKind = 'generating' | 'completed' | 'error'

// Solo tres macro estados visuales (port de PillEstado del origen): la pausa
// de confirmación sigue siendo «generando» y la señala el cronómetro.
function pillKind(status: CreateTaskStatus): PillKind {
  if (status === 'completed') return 'completed'
  if (status === 'error') return 'error'
  return 'generating'
}

const PILL_CLASSES: Record<PillKind, string> = {
  generating: 'bg-ocean/20 text-ocean',
  completed: 'bg-saffron/20 text-foreground',
  error: 'bg-destructive/15 text-destructive',
}

export function ProgressStatusPill({ status }: ProgressStatusPillProps) {
  const { t } = useTranslation()
  const kind = pillKind(status)

  return (
    <span
      className={cn(
        'mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 font-display text-xs font-bold',
        PILL_CLASSES[kind],
      )}
    >
      {t(`create.progress.status.${kind}`)}
    </span>
  )
}
