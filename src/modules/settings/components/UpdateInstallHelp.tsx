import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { useAppUpdate } from '@/modules/settings/hooks/useAppUpdate'
import { updateInstallFailureKey } from '@/modules/settings/utilities/updateInstallFailureKey'
import { UpdateInstallFailure } from '../types/updates'

// Salida cuando el updater no puede instalar (ADR-0027): explica la causa
// —ubicación no instalable o el último fallo— y ofrece bajar el instalador.
// No renderiza nada si no hay nada que explicar.
export function UpdateInstallHelp() {
  const { t } = useTranslation()
  const { update, canInstallInPlace, installFailure, downloadInstaller } =
    useAppUpdate()

  if (!update) return null
  if (canInstallInPlace && !installFailure) return null

  // La ubicación manda: si la app no se puede reemplazar, ese es el mensaje.
  const messageKey = canInstallInPlace
    ? updateInstallFailureKey(
        installFailure?.failure ?? UpdateInstallFailure.unknown,
      )
    : 'settings.updatesMoveToApplications'

  return (
    <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <p className="font-body text-sm text-foreground">{t(messageKey)}</p>
      {installFailure && (
        <p className="break-words font-body text-xs text-muted-foreground">
          {t('settings.updatesErrorDetail', { detail: installFailure.detail })}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={downloadInstaller}
        className="rounded-lg font-display"
      >
        <ExternalLink className="mr-1.5 h-4 w-4" />
        {t('settings.updatesManualDownload')}
      </Button>
    </div>
  )
}
