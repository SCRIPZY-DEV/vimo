import { useTranslation } from 'react-i18next'
import { Loader2, RefreshCw, X } from 'lucide-react'
import { Alert } from '@/modules/common/components/Alert'
import { Button } from '@/modules/common/ui/button'
import { videosApi } from '@/modules/videos/api'
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
  // Gema ya migrada (solo en la galería): abrirla para revisar sus secciones
  // y descartar el aviso.
  reviewDisabled?: boolean
  onReview?: () => void
  onDismiss?: () => void
}

// Aviso de la actualización automática de una gema vieja a la plantilla (spec
// §4.4): en curso; fallida, con «Reintentar» (mientras tanto la gema sigue
// funcionando por el camino viejo); o hecha, porque se guardó sin que la
// persona viera las secciones. La hecha se avisa solo en la galería: en su
// modal la dice GemAgentWarnings, junto a las secciones. Presentacional.
export function GemMigrationNotice({
  migration,
  named,
  retryDisabled,
  onRetry,
  reviewDisabled,
  onReview,
  onDismiss,
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

  if (migration.status === 'migrated')
    return (
      <Alert
        tone="info"
        title={t('create.gemTemplate.migrationDoneNamed', {
          name: migration.name,
        })}
        actions={
          <>
            {onReview && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reviewDisabled}
                onClick={onReview}
              >
                {t('create.gemTemplate.migrationReviewAction')}
              </Button>
            )}
            {onDismiss && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('create.gemTemplate.migrationDismiss')}
                onClick={onDismiss}
                className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </>
        }
      >
        <p>{t('create.gemTemplate.migrationReview')}</p>
        {migration.warnings.length > 0 && (
          <p className="mt-1">
            {t('create.gemTemplate.migrationWarningsHint')}
          </p>
        )}
      </Alert>
    )

  // Una gema vieja que el agente no reconoce como estilo visual no se arregla
  // reintentando: el aviso solo explica por qué y la gema sigue como antes.
  const retryable = videosApi.gemRebuildErrorRetryable(migration.error)

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
        retryable && (
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
        )
      }
    >
      <GemRebuildErrorText error={migration.error} />
    </Alert>
  )
}
