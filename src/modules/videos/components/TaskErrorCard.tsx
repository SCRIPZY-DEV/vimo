import { useTranslation } from 'react-i18next'
import { Mic, PenLine, RotateCcw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'

interface TaskErrorCardProps {
  message: string
  onRetry(): void
  // Etiqueta del botón de reintento; por defecto «Reanudar».
  retryLabel?: string
  onDiscard?(): void
  // Rescate del origen (v1.32.0): con las escenas ya persistidas, el fallo
  // no bloquea — se sigue en el editor y se regenera desde ahí.
  onContinueInEditor?(): void
  // La narración falló (ADR-0053): elegir otro proveedor y otra voz.
  onSwitchVoice?(): void
}

// Tarjeta de un job que falló, con reintento y (opcional) descarte.
export function TaskErrorCard({
  message,
  onRetry,
  retryLabel,
  onDiscard,
  onContinueInEditor,
  onSwitchVoice,
}: TaskErrorCardProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3 rounded-2xl border-2 border-destructive/30 bg-destructive/10 p-4">
      <p className="font-body text-sm text-destructive-text">{message}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={onRetry}
          className="rounded-lg font-display font-bold"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          {retryLabel ?? t('common.resume')}
        </Button>
        {onSwitchVoice && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSwitchVoice}
            className="rounded-lg font-display"
          >
            <Mic className="mr-1.5 h-3.5 w-3.5" />
            {t('create.progress.error.switchVoice')}
          </Button>
        )}
        {onContinueInEditor && (
          <Button
            variant="outline"
            size="sm"
            onClick={onContinueInEditor}
            className="rounded-lg font-display"
          >
            <PenLine className="mr-1.5 h-3.5 w-3.5" />
            {t('create.errors.continueInEditor')}
          </Button>
        )}
        {onDiscard && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            className="rounded-lg font-display text-foreground/65"
          >
            {t('create.errors.discard')}
          </Button>
        )}
      </div>
    </div>
  )
}
