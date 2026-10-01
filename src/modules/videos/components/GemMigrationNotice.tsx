import { useTranslation } from 'react-i18next'
import { Loader2, RefreshCw } from 'lucide-react'
import { Alert } from '@/modules/common/components/Alert'
import { Button } from '@/modules/common/ui/button'
import { GemRebuildErrorText } from '@/modules/videos/components/GemRebuildErrorText'
import type { GemMigrationState } from '@/modules/videos/types/styles'

interface GemMigrationNoticeProps {
  migration: GemMigrationState
  // En la galería se nombra la gema; en su propio modal no hace falta.
  named: boolean
  // El modal lo apaga mientras guarda o genera muestras: una migración que
  // termina vuelve a sembrar el modal y cortaría ese trabajo a la vista.
  retryDisabled?: boolean
  onRetry: () => void
}

// Aviso de la actualización automática de una gema vieja a la plantilla (spec
// §4.4): en curso, o fallida con «Reintentar». Mientras falla, la gema sigue
// funcionando por el camino viejo. Presentacional.
export function GemMigrationNotice({
  migration,
  named,
  retryDisabled,
  onRetry,
}: GemMigrationNoticeProps) {
  const { t } = useTranslation()

  if (migration.status === 'pending')
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-xl border-2 border-saffron/30 bg-saffron/5 px-4 py-3 font-body text-sm text-foreground"
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-saffron" />
        {named
          ? t('create.gemTemplate.migrationPendingNamed', {
              name: migration.name,
            })
          : t('create.gemTemplate.migrationPending')}
      </p>
    )

  return (
    <Alert
      tone="warning"
      title={
        named
          ? t('create.gemTemplate.migrationFailedNamed', {
              name: migration.name,
            })
          : t('create.gemTemplate.migrationFailed')
      }
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={retryDisabled}
          onClick={onRetry}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('create.gemTemplate.retry')}
        </Button>
      }
    >
      <GemRebuildErrorText error={migration.error} />
    </Alert>
  )
}
