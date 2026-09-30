import { effectiveAnimationMinutes } from '@pipeline/animation/scope.ts'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ViewSpinner } from '@/modules/common/components/ViewSpinner'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { usePromptModels } from '@/modules/common/hooks/usePromptModels'
import { resolvePromptModel } from '@/modules/common/utilities/resolvePromptModel'
import { Button } from '@/modules/common/ui/button'
import { ConfirmScenesDialog } from '@/modules/videos/components/ConfirmScenesDialog'
import { GenerationProgress } from '@/modules/videos/components/GenerationProgress'
import { LibraryViewHeader } from '@/modules/videos/components/LibraryViewHeader'
import { NoCreditsResumePanel } from '@/modules/videos/components/NoCreditsResumePanel'
import { SecondsPerSceneStep } from '@/modules/videos/components/SecondsPerSceneStep'
import {
  UNKNOWN_CREATE_ERROR_KEY,
  VideosRoutes,
  libraryEditorPath,
  libraryPlayerPath,
  videosQueryKeys,
} from '@/modules/videos/constants'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { useProjectStatus } from '@/modules/videos/hooks/useProjectStatus'
import { vendorOfProvider } from '@/modules/voices/utilities/vendorOfProvider'
import type {
  ProjectRunOptions,
  SceneConfirmationView,
  SceneCutChoice,
} from '@/modules/videos/types/create'

// Progreso de un proyecto de la biblioteca. Con tarea viva del store muestra
// el progreso real (mismos paneles que Create); sin ella, rehidrata desde
// disco: interrumpido/pausado → reanudar, pausa de confirmación → confirmar.
export function LibraryProgress() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { projectId = '' } = useParams()
  const {
    task,
    cancel,
    confirmScenes,
    confirmScenesForProject,
    discardTask,
    startPipelineForProject,
    reportPromptModelIssue,
    snoozePromptModelIssue,
    switchPromptModel,
  } = useCreateTask()
  const { models, defaultId } = usePromptModels()

  // La tarea del store pertenece a ESTE proyecto (viva o recién terminada).
  const ownTask = task?.projectId === projectId ? task : null
  const { status, isLoading, errorKey } = useProjectStatus(
    projectId,
    ownTask === null,
  )

  usePageTitle(t('library.progress.pageTitle'))

  // Al completar el job se invalida lo leído de disco y se sigue de largo:
  // con video, al player. Sin video (sin auto-export, ADR-0016) el proyecto
  // quedó en borrador con todo generado y el destino es el editor, igual que
  // en Create; antes iba al player, que solo ofrecía «Continuar editando».
  const completed = ownTask?.status === 'completed'
  const completedWithVideo =
    ownTask?.status === 'completed' && ownTask.videoPath !== null
  useEffect(() => {
    if (!completed) return
    void queryClient.invalidateQueries({ queryKey: videosQueryKeys.projects })
    void queryClient.invalidateQueries({
      queryKey: videosQueryKeys.projectStatus(projectId),
    })
    if (completedWithVideo) {
      void navigate(libraryPlayerPath(projectId), { replace: true })
      return
    }
    discardTask()
    void navigate(libraryEditorPath(projectId), { replace: true })
  }, [
    completed,
    completedWithVideo,
    discardTask,
    navigate,
    projectId,
    queryClient,
  ])

  const projectName = ownTask?.projectName ?? status?.metadata.name ?? projectId
  // Semilla desde disco (origen: `hidratar`): al reanudar, las fases hechas y
  // la grilla aparecen al toque en vez de vacías hasta el primer evento.
  // El carril y el modelo salen de project.json (ADR-0028): el modelo se
  // resuelve como en Crear (null = el de la casa) para saber a quién bloquear.
  const usesCustomStyle = status?.metadata.options.customStyle !== undefined
  const runOptions: ProjectRunOptions = {
    videoFormat: status?.metadata.options.videoFormat,
    seed: status
      ? {
          scenes: status.scenes,
          completedStages: status.metadata.completedStages,
          audioDurationSeconds: status.metadata.audioDurationSeconds ?? null,
        }
      : undefined,
    usesCustomStyle,
    promptModel: usesCustomStyle
      ? resolvePromptModel(
          status?.metadata.options.promptModel ?? null,
          models,
          defaultId,
        )
      : null,
    imageProvider: status?.metadata.options.imageProvider ?? null,
    voiceVendor: status?.metadata.options.voiceProvider
      ? vendorOfProvider(status.metadata.options.voiceProvider)
      : null,
  }
  const resume = () =>
    void startPipelineForProject(projectId, projectName, runOptions)
  const confirmFromDisk = (choice: SceneCutChoice) => {
    void confirmScenesForProject(projectId, projectName, choice, runOptions)
  }
  const backToLibrary = () => void navigate(VideosRoutes.library)
  // Cancelar no es un error (origen v0.35.0): a la biblioteca en el acto; el
  // proyecto queda ahí como cancelado. En la pausa no hay job que cancelar.
  const cancelToLibrary = () => {
    cancel()
    backToLibrary()
  }

  // ── Con tarea del store: la pantalla de progreso entera (origen), con la
  // pausa, el error y el completado dentro ──
  if (ownTask) {
    return (
      <GenerationProgress
        task={ownTask}
        back={{
          labelKey: 'library.player.backToLibrary',
          onClick: backToLibrary,
        }}
        onCancel={cancelToLibrary}
        onRetryPipeline={resume}
        onContinueInEditor={() => void navigate(libraryEditorPath(projectId))}
        onConfirmScenes={(choice) => void confirmScenes(choice)}
        onDismissConfirmation={backToLibrary}
        onPromptModelStall={() => reportPromptModelIssue(ownTask.id, 'stalled')}
        onSnoozePromptModelIssue={snoozePromptModelIssue}
        onSwitchPromptModel={(modelId) => void switchPromptModel(modelId)}
      />
    )
  }

  // ── Rehidratación desde disco (sin tarea viva) ──
  if (isLoading) return <ViewSpinner />

  if (!status) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-8 py-10">
        <LibraryViewHeader title={projectName} />
        <ErrorMessage>{t(errorKey ?? UNKNOWN_CREATE_ERROR_KEY)}</ErrorMessage>
      </div>
    )
  }

  const metadata = status.metadata

  if (metadata.state === 'completed')
    return <Navigate to={libraryPlayerPath(projectId)} replace />
  if (metadata.state === 'draft')
    return <Navigate to={libraryEditorPath(projectId)} replace />
  if (metadata.state === 'error')
    return <Navigate to={libraryPlayerPath(projectId)} replace />

  if (metadata.state === 'awaiting-confirmation') {
    // El mismo objeto que guarda task.confirmation, reconstruido desde disco.
    // La pausa de un estilo propio con carril de segundos vuelve como el
    // paso inline también desde disco; el resto, con el diálogo de conteo.
    const confirmation: SceneConfirmationView = {
      suggestedScenes: metadata.sceneCount ?? status.scenes.length,
      audioDurationSeconds: metadata.audioDurationSeconds ?? 0,
      wordCount: metadata.wordCount ?? 0,
      animationMinutes: effectiveAnimationMinutes(
        metadata.options,
        metadata.audioDurationSeconds ?? 0,
      ),
      ...(metadata.options.customStyle &&
      metadata.options.secondsPerScene !== undefined
        ? { secondsPerScene: metadata.options.secondsPerScene }
        : {}),
    }

    return (
      <div className="mx-auto max-w-5xl space-y-6 px-8 py-10">
        <LibraryViewHeader title={projectName} />
        {confirmation.secondsPerScene !== undefined ? (
          <SecondsPerSceneStep
            projectId={projectId}
            confirmation={confirmation}
            onConfirm={confirmFromDisk}
          />
        ) : (
          <ConfirmScenesDialog
            open
            confirmation={confirmation}
            onConfirm={confirmFromDisk}
            onCancel={backToLibrary}
          />
        )}
      </div>
    )
  }

  // Pausado por saldo (ADR-0031): saldo actual, recargar y reanudar recién
  // cuando alcance; las fases hechas son cache-hit igual que al cancelar.
  if (
    metadata.state === 'paused' &&
    metadata.pauseReason === 'insufficient-credits'
  )
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-8 py-10">
        <LibraryViewHeader title={projectName} />
        <NoCreditsResumePanel status={status} onResume={resume} />
      </div>
    )

  // generating (job muerto con la app) o paused (cancelado por la persona):
  // mismo remedio — reanudar; las fases hechas son cache-hit y el disco se
  // corrige. Cambia solo el texto: cancelar no fue un error.
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-8 py-10">
      <LibraryViewHeader title={projectName} />
      <div className="space-y-3 rounded-2xl border-2 border-saffron/30 bg-saffron/5 p-6">
        <p className="font-body text-sm text-muted-foreground">
          {metadata.state === 'paused'
            ? t('library.progress.cancelled')
            : t('library.progress.interrupted')}
        </p>
        <Button onClick={resume} className="rounded-xl font-display font-bold">
          <RotateCcw className="mr-1.5 h-4 w-4" />
          {t('common.resume')}
        </Button>
      </div>
    </div>
  )
}
