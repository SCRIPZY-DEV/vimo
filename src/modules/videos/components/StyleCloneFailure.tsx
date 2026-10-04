import { useTranslation } from 'react-i18next'
import { RefreshCw, Trash2, Wallet } from 'lucide-react'
import { Alert } from '@/modules/common/components/Alert'
import { Button } from '@/modules/common/ui/button'
import { videosApi } from '@/modules/videos/api'
import { STYLE_CLONE_FINAL_ERROR_CODES } from '@/modules/videos/constants'
import type { StyleCloneSession } from '@/modules/videos/types/styleClone'

interface StyleCloneFailureProps {
  session: StyleCloneSession
  onRetry: () => void
  onDiscard: () => void
  // Abre la página de recarga del proveedor de imágenes de la sesión.
  onReload: () => void
}

const NO_CREDITS_CODE = 'image_insufficient_credits'

// Una clonación detenida: por un fallo (con su motivo) o porque la app se
// cerró mientras trabajaba. Reintentar o reanudar repite solo el paso que
// estaba corriendo; lo que no tiene arreglo reintentando (otra cuenta, otro
// contenido) solo ofrece descartar. Presentacional.
export function StyleCloneFailure({
  session,
  onRetry,
  onDiscard,
  onReload,
}: StyleCloneFailureProps) {
  const { t } = useTranslation()
  const interrupted = session.status === 'interrupted'
  const noCredits = session.errorCode === NO_CREDITS_CODE
  const retryable =
    interrupted || !STYLE_CLONE_FINAL_ERROR_CODES.has(session.errorCode ?? '')

  return (
    <Alert
      tone={interrupted ? 'warning' : 'danger'}
      title={
        interrupted
          ? t('create.styleClone.interruptedTitle')
          : t('create.styleClone.failedTitle')
      }
    >
      <p>
        {interrupted
          ? t('create.styleClone.interruptedHint')
          : t(videosApi.styleCloneErrorKey(session.errorCode))}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {retryable && (
          <Button type="button" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {interrupted
              ? t('create.styleClone.resume')
              : t('create.styleClone.retry')}
          </Button>
        )}
        {noCredits && (
          <Button type="button" size="sm" variant="outline" onClick={onReload}>
            <Wallet className="mr-2 h-4 w-4" />
            {t('common.credits.reload')}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
          <Trash2 className="mr-2 h-4 w-4" />
          {t('create.styleClone.discard')}
        </Button>
      </div>
    </Alert>
  )
}
