import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'

interface TaskErrorCardProps {
  message: string
  onRetry(): void
  // Etiqueta del botón de reintento; por defecto «Reanudar».
  retryLabel?: string
  onDiscard?(): void
}

// Tarjeta de un job que falló, con reintento y (opcional) descarte.
export function TaskErrorCard({
  message,
  onRetry,
  retryLabel,
  onDiscard,
}: TaskErrorCardProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3 rounded-2xl border-2 border-destructive/30 bg-destructive/10 p-4">
      <p className="font-body text-sm text-destructive">{message}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={onRetry}
          className="rounded-lg font-display font-bold"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          {retryLabel ?? t('common.resume')}
        </Button>
        {onDiscard && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            className="rounded-lg font-display text-muted-foreground"
          >
            {t('create.errors.discard')}
          </Button>
        )}
      </div>
    </div>
  )
}
