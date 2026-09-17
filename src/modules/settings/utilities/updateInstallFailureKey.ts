import { UpdateInstallFailure } from '../types/updates'

// Clave i18n del mensaje que explica un fallo al instalar.
export function updateInstallFailureKey(failure: UpdateInstallFailure): string {
  if (failure === UpdateInstallFailure.readOnlyLocation)
    return 'settings.updatesInstallReadOnly'

  if (failure === UpdateInstallFailure.permissionDenied)
    return 'settings.updatesInstallPermission'

  if (failure === UpdateInstallFailure.installerBlocked)
    return 'settings.updatesInstallBlocked'

  if (failure === UpdateInstallFailure.signature)
    return 'settings.updatesInstallSignature'

  if (failure === UpdateInstallFailure.network)
    return 'settings.updatesInstallNetwork'

  if (failure === UpdateInstallFailure.jobRunning)
    return 'settings.updatesInstallJobRunning'

  return 'settings.updatesInstallError'
}
