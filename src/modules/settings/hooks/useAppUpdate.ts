import { use } from 'react'
import { AppUpdateContext } from '@/modules/settings/context/appUpdateContext'
import type { AppUpdateContextValue } from '../types/updates'

// Estado del updater (ADR-0027). Es global —un solo chequeo por arranque,
// compartido por el aviso de App y la sección de Ajustes—, por eso se lee
// del contexto y no se pasa por props.
export function useAppUpdate(): AppUpdateContextValue {
  const context = use(AppUpdateContext)
  if (!context)
    throw new Error('useAppUpdate debe usarse dentro de <AppUpdateProvider>')
  return context
}
