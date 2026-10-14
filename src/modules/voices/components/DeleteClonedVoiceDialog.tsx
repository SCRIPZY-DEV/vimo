import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/modules/common/ui/alert-dialog'
import { Button } from '@/modules/common/ui/button'
import type { VoiceSummary } from '@pipeline/types/voices.ts'

interface DeleteClonedVoiceDialogProps {
  // La voz a borrar; null = cerrado.
  voice: VoiceSummary | null
  deleting: boolean
  errorKey: string | null
  onCancel(): void
  onConfirm(): void
}

// Confirmación antes de borrar una voz clonada de la cuenta de ai33: no se
// puede deshacer y los videos que la usen ya no podrán regenerar su voz.
// Presentacional.
export function DeleteClonedVoiceDialog({
  voice,
  deleting,
  errorKey,
  onCancel,
  onConfirm,
}: DeleteClonedVoiceDialogProps) {
  const { t } = useTranslation()

  return (
    <AlertDialog
      open={voice !== null}
      onOpenChange={(next) => !next && !deleting && onCancel()}
    >
      <AlertDialogContent className="rounded-2xl sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">
            {t('voices.clonacion.borrar.titulo', { name: voice?.name ?? '' })}
          </AlertDialogTitle>
          <AlertDialogDescription className="font-body">
            {t('voices.clonacion.borrar.descripcion')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={deleting}
            className="rounded-xl font-display"
          >
            {t('voices.clonacion.borrar.cancelar')}
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={onConfirm}
            className="rounded-xl font-display"
          >
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('voices.clonacion.borrar.confirmar')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
