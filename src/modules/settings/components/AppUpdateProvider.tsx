import { useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { settingsApi } from '@/modules/settings/api'
import { AppUpdateContext } from '@/modules/settings/hooks/appUpdateContext'
import { UPDATE_CHECK_STALE_TIME_MS, settingsQueryKeys } from '../constants'
import {
  UpdatePhase,
  type AppUpdateInfo,
  type UpdateDownloadProgress,
} from '../types/updates'

interface AppUpdateProviderProps {
  children: ReactNode
}

interface ResolvePhaseInput {
  isNative: boolean
  installing: boolean
  checking: boolean
  failed: boolean
  checked: boolean
  update: AppUpdateInfo | null
}

function resolvePhase({
  isNative,
  installing,
  checking,
  failed,
  checked,
  update,
}: ResolvePhaseInput): UpdatePhase {
  if (!isNative) return UpdatePhase.unavailable
  if (installing) return UpdatePhase.installing
  if (checking) return UpdatePhase.checking
  if (failed) return UpdatePhase.error
  if (update) return UpdatePhase.available
  if (checked) return UpdatePhase.upToDate
  return UpdatePhase.idle
}

// Contenedor del updater (ADR-0027): dueño del chequeo (una query, un solo
// chequeo por arranque) y de la instalación (mutación con progreso). Se
// monta en App para que el aviso salga en cualquier pantalla.
export function AppUpdateProvider({ children }: AppUpdateProviderProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const native = settingsApi.isNative()
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const checkQuery = useQuery({
    queryKey: settingsQueryKeys.appUpdate,
    queryFn: () => settingsApi.checkForUpdate(),
    enabled: native,
    staleTime: UPDATE_CHECK_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  })

  const installMutation = useMutation({
    mutationFn: () => settingsApi.downloadAndInstallUpdate(setProgress),
    // Windows ya cerró la app al lanzar el instalador; acá solo llega macOS.
    onSuccess: () => settingsApi.relaunchApp(),
    onError: () => {
      setProgress(null)
      toast({
        description: t('settings.updatesInstallError'),
        variant: 'destructive',
      })
    },
  })

  const update = checkQuery.data ?? null
  const progressPercent =
    progress && progress.totalBytes
      ? (progress.downloadedBytes / progress.totalBytes) * 100
      : 0
  const phase = resolvePhase({
    isNative: native,
    installing: installMutation.isPending,
    checking: checkQuery.isFetching,
    failed: checkQuery.isError,
    checked: checkQuery.isSuccess,
    update,
  })

  function checkNow() {
    setDismissed(false)
    void checkQuery.refetch()
  }

  function install() {
    if (phase !== UpdatePhase.available) return
    setProgress(null)
    installMutation.mutate()
  }

  return (
    <AppUpdateContext
      value={{
        isNative: native,
        phase,
        update,
        progress,
        progressPercent,
        dismissed,
        checkNow,
        install,
        dismiss: () => setDismissed(true),
      }}
    >
      {children}
    </AppUpdateContext>
  )
}
