import { useTranslation } from 'react-i18next'
import { AlertCircle, Loader2, Mic, RefreshCw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import type { ProbeTtsReason } from '@pipeline/types/video-project.ts'

interface TtsProviderDownDialogProps {
  reason: ProbeTtsReason
  // true mientras se vuelve a probar el proveedor: el diálogo sigue abierto
  // y el botón lo muestra.
  retrying: boolean
  onRetry: () => void
  // Cerrar y elegir otra voz en el formulario.
  onClose: () => void
}

// El proveedor de voz no responde antes de arrancar (port de
// ModalProveedorCaido del origen): avisa antes de empezar para no perder
// tiempo esperando un pipeline que iba a fallar.
export function TtsProviderDownDialog({
  reason,
  retrying,
  onRetry,
  onClose,
}: TtsProviderDownDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open onOpenChange={(open) => !open && !retrying && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-coral/15 p-2">
              <AlertCircle className="h-5 w-5 text-coral" />
            </div>
            <div className="flex-1">
              <DialogTitle className="font-display text-lg font-semibold">
                {t(`create.probe.titles.${reason}`)}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
                {t(`create.probe.reason.${reason}`)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          {t('create.probe.hint')}
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <Button variant="outline" disabled={retrying} onClick={onClose}>
            <Mic className="mr-1.5 h-4 w-4" />
            {t('create.probe.changeVoice')}
          </Button>
          <Button disabled={retrying} onClick={onRetry}>
            {retrying ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            {retrying ? t('create.probe.retrying') : t('create.probe.retry')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
