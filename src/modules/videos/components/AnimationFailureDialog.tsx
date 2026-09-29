import { useTranslation } from 'react-i18next'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import type { AnimationFailureNotice } from '@/modules/videos/types/library'

interface AnimationFailureDialogProps {
  notice: AnimationFailureNotice | null
  busy: boolean
  onClose: () => void
  // Reintenta SOLO las escenas cuyo fallo puede cambiar al repetir.
  onRetry: (sceneIds: number[]) => void
}

// El job de animación terminó con escenas sin clip (ADR-0047): se dice cuál
// falló, por qué (el mensaje traducido) y el detalle técnico del proveedor
// tal cual llegó, que es lo que permite entender un fallo raro. Las escenas
// quedaron estáticas con el paneo de siempre: no se perdió nada del video.
export function AnimationFailureDialog({
  notice,
  busy,
  onClose,
  onRetry,
}: AnimationFailureDialogProps) {
  const { t } = useTranslation()
  if (!notice) return null

  const retryableIds = notice.failures
    .filter((failure) => failure.retryable)
    .map((failure) => failure.sceneId)

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-coral/15 p-2">
              <AlertCircle className="h-5 w-5 text-coral" />
            </div>
            <div className="flex-1">
              <DialogTitle className="font-display text-lg font-semibold">
                {t('library.editor.animationFailure.title')}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
                {t('library.editor.animationFailure.body')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ul className="mt-2 space-y-2">
          {notice.failures.map((failure) => (
            <li
              key={failure.sceneId}
              className="rounded-lg border border-border bg-muted/40 px-3 py-2.5"
            >
              <p className="font-display text-sm font-bold text-foreground">
                {t('library.editor.animationFailure.scene', {
                  id: failure.sceneId,
                })}
              </p>
              <p className="mt-0.5 font-body text-sm text-foreground/90">
                {t(failure.key)}
              </p>
            </li>
          ))}
        </ul>

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t('library.editor.animationFailure.close')}
          </Button>
          {retryableIds.length > 0 && (
            <Button
              disabled={busy}
              onClick={() => {
                onClose()
                onRetry(retryableIds)
              }}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              {t('library.editor.animationFailure.retry', {
                count: retryableIds.length,
              })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
