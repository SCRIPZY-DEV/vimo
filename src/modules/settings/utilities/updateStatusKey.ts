import { UpdatePhase } from '../types/updates'

// Clave i18n del estado del updater que muestra la sección de Ajustes.
// null = fase sin texto (web, o todavía no se chequeó).
export function updateStatusKey(phase: UpdatePhase): string | null {
  if (phase === UpdatePhase.checking) return 'settings.updatesChecking'
  if (phase === UpdatePhase.upToDate) return 'settings.updatesUpToDate'
  if (phase === UpdatePhase.available) return 'settings.updatesAvailable'
  if (phase === UpdatePhase.installing) return 'settings.updatesInstalling'
  if (phase === UpdatePhase.error) return 'settings.updatesCheckError'
  return null
}
