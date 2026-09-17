import { useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { settingsApi } from '@/modules/settings/api'
import { AppUpdateContext } from '@/modules/settings/context/appUpdateContext'
import { classifyUpdateInstallFailure } from '@/modules/settings/utilities/classifyUpdateInstallFailure'
import { errorDetail } from '@/modules/settings/utilities/errorDetail'
import { updateInstallFailureKey } from '@/modules/settings/utilities/updateInstallFailureKey'
import { UPDATE_CHECK_STALE_TIME_MS, settingsQueryKeys } from '../constants'
import {
  UpdateInstallLocation,
  UpdateInstallStage,
  UpdatePhase,
  type AppUpdateInfo,
  type UpdateDownloadProgress,
  type UpdateInstallFailureReport,
} from '../types/updates'

interface AppUpdateProviderProps {
  children: ReactNode
}

interface ResolvePhaseInput {
  isNative: boolean
  installStage: UpdateInstallStage | null
  checking: boolean
  failed: boolean
  checked: boolean
  update: AppUpdateInfo | null
}

function resolvePhase({
  isNative,
  installStage,
  checking,
  failed,
  checked,
  update,
}: ResolvePhaseInput): UpdatePhase {
  if (!isNative) return UpdatePhase.unavailable
  if (installStage === UpdateInstallStage.downloading)
    return UpdatePhase.downloading

  if (installStage === UpdateInstallStage.installing)
    return UpdatePhase.installing

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
  const [stage, setStage] = useState<UpdateInstallStage>(
    UpdateInstallStage.downloading,
  )
  const [installFailure, setInstallFailure] =
    useState<UpdateInstallFailureReport | null>(null)

  const checkQuery = useQuery({
    queryKey: settingsQueryKeys.appUpdate,
    queryFn: () => settingsApi.checkForUpdate(),
    enabled: native,
    staleTime: UPDATE_CHECK_STALE_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
  })

  // La ubicación no cambia mientras la app corre: se consulta una vez.
  const locationQuery = useQuery({
    queryKey: settingsQueryKeys.updateInstallLocation,
    queryFn: () => settingsApi.getUpdateInstallLocation(),
    enabled: native,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  })

  const installMutation = useMutation({
    mutationFn: async () => {
      setStage(UpdateInstallStage.downloading)
      await settingsApi.downloadUpdate(setProgress)
      setStage(UpdateInstallStage.installing)
      await settingsApi.installUpdate()
    },
    // Windows ya cerró la app al lanzar el instalador; acá solo llega macOS.
    onSuccess: () => settingsApi.relaunchApp(),
    onError: (error) => {
      const detail = errorDetail(error)
      const failure = classifyUpdateInstallFailure(detail)

      setProgress(null)
      setInstallFailure({ failure, detail })
      void settingsApi.reportUpdateInstallFailure(detail)
      toast({
        description: t(updateInstallFailureKey(failure)),
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
    installStage: installMutation.isPending ? stage : null,
    checking: checkQuery.isFetching,
    failed: checkQuery.isError,
    checked: checkQuery.isSuccess,
    update,
  })
  // Si Rust no contesta, no se bloquea: decide el intento de instalar.
  const canInstallInPlace =
    (locationQuery.data ?? UpdateInstallLocation.installable) ===
    UpdateInstallLocation.installable

  function checkNow() {
    setDismissed(false)
    setInstallFailure(null)
    void checkQuery.refetch()
  }

  function install() {
    if (phase !== UpdatePhase.available) return
    if (!canInstallInPlace) return

    setProgress(null)
    setInstallFailure(null)
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
        canInstallInPlace,
        installFailure,
        downloadInstaller: () => void settingsApi.openInstallerDownload(),
        checkNow,
        install,
        dismiss: () => setDismissed(true),
      }}
    >
      {children}
    </AppUpdateContext>
  )
}
