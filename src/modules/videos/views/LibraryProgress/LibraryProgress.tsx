import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ViewSpinner } from '@/modules/common/components/ViewSpinner'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'
import { ConfirmScenesDialog } from '@/modules/videos/components/ConfirmScenesDialog'
import { GenerationProgress } from '@/modules/videos/components/GenerationProgress'
import { LibraryViewHeader } from '@/modules/videos/components/LibraryViewHeader'
import { TaskErrorCard } from '@/modules/videos/components/TaskErrorCard'
import {
  UNKNOWN_CREATE_ERROR_KEY,
  VideosRoutes,
  libraryEditorPath,
  libraryPlayerPath,
  videosQueryKeys,
} from '@/modules/videos/constants'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { useProjectStatus } from '@/modules/videos/hooks/useProjectStatus'
import type { SceneCutChoice } from '@/modules/videos/types/create'

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
    startPipelineForProject,
  } = useCreateTask()

  // La tarea del store pertenece a ESTE proyecto (viva o recién terminada).
  const ownTask = task?.projectId === projectId ? task : null
  const { status, isLoading, errorKey } = useProjectStatus(
    projectId,
    ownTask === null,
  )

  usePageTitle(t('library.progress.pageTitle'))

  // Al completar el job se invalida lo leído de disco y se pasa al player.
  const completed = ownTask?.status === 'completed'
  useEffect(() => {
    if (!completed) return
    void queryClient.invalidateQueries({ queryKey: videosQueryKeys.projects })
    void queryClient.invalidateQueries({
      queryKey: videosQueryKeys.projectStatus(projectId),
    })
    void navigate(libraryPlayerPath(projectId), { replace: true })
  }, [completed, navigate, projectId, queryClient])

  const projectName = ownTask?.projectName ?? status?.metadata.name ?? projectId
  const projectFormat = status?.metadata.options.videoFormat
  const resume = () =>
    void startPipelineForProject(projectId, projectName, projectFormat)
  const confirmFromDisk = (choice: SceneCutChoice) => {
    void confirmScenesForProject(projectId, projectName, choice, projectFormat)
  }
  const backToLibrary = () => void navigate(VideosRoutes.library)

  // ── Con tarea del store ──
  if (ownTask) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-8 py-10">
        <LibraryViewHeader title={projectName} />

        {(ownTask.status === 'creating' || ownTask.status === 'generating') && (
          <GenerationProgress task={ownTask} onCancel={cancel} />
        )}

        {ownTask.status === 'error' && (
          <TaskErrorCard
            message={t(ownTask.errorKey ?? UNKNOWN_CREATE_ERROR_KEY)}
            onRetry={resume}
            onContinueInEditor={
              ownTask.completedStages.includes('scene-prompts')
                ? () => navigate(libraryEditorPath(projectId))
                : undefined
            }
          />
        )}

        {ownTask.status === 'awaitingConfirmation' && ownTask.confirmation && (
          <ConfirmScenesDialog
            confirmation={ownTask.confirmation}
            projectId={projectId}
            onConfirm={(choice) => void confirmScenes(choice)}
            onCancel={backToLibrary}
          />
        )}
      </div>
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
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-8 py-10">
        <LibraryViewHeader title={projectName} />
        {/* El mismo objeto que guarda task.confirmation, reconstruido desde disco. */}
        <ConfirmScenesDialog
          confirmation={{
            suggestedScenes: metadata.sceneCount ?? status.scenes.length,
            audioDurationSeconds: metadata.audioDurationSeconds ?? 0,
            wordCount: metadata.wordCount ?? 0,
            // La pausa de un estilo propio con carril de segundos vuelve en
            // modo slider también desde disco.
            ...(metadata.options.customStyle &&
            metadata.options.secondsPerScene !== undefined
              ? { secondsPerScene: metadata.options.secondsPerScene }
              : {}),
          }}
          projectId={projectId}
          onConfirm={confirmFromDisk}
          onCancel={backToLibrary}
        />
      </div>
    )
  }

  // generating (job muerto con la app) o paused: mismo remedio — reanudar;
  // las fases hechas son cache-hit y el disco se corrige.
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-8 py-10">
      <LibraryViewHeader title={projectName} />
      <div className="space-y-3 rounded-2xl border-2 border-saffron/30 bg-saffron/5 p-6">
        <p className="font-body text-sm text-muted-foreground">
          {t('library.progress.interrupted')}
        </p>
        <Button onClick={resume} className="rounded-xl font-display font-bold">
          <RotateCcw className="mr-1.5 h-4 w-4" />
          {t('common.resume')}
        </Button>
      </div>
    </div>
  )
}
