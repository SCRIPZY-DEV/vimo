import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ViewSpinner } from '@/modules/common/components/ViewSpinner'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'
import { videosApi } from '@/modules/videos/api'
import { LibraryVideoPlayer } from '@/modules/videos/components/LibraryVideoPlayer'
import { LibraryViewHeader } from '@/modules/videos/components/LibraryViewHeader'
import { OutdatedVideoBanner } from '@/modules/videos/components/OutdatedVideoBanner'
import { TaskErrorCard } from '@/modules/videos/components/TaskErrorCard'
import { VideoFileActions } from '@/modules/videos/components/VideoFileActions'
import {
  EDITOR_RESCUE_ERROR_CODES,
  UNKNOWN_CREATE_ERROR_KEY,
  VideosRoutes,
  libraryEditorPath,
  libraryProgressPath,
} from '@/modules/videos/constants'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { useLibraryProjectDetail } from '@/modules/videos/hooks/useLibraryProjectDetail'
import { useLibraryProjects } from '@/modules/videos/hooks/useLibraryProjects'
import { isTaskLiveFor } from '@/modules/videos/utilities/isTaskLiveFor'
import { projectBadge } from '@/modules/videos/utilities/projectBadge'

// Detalle/reproductor de un proyecto: video final con velocidades, aviso de
// desactualizado, reintento tras error y acciones (editar, abrir, eliminar).
export function LibraryPlayer() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projectId = '' } = useParams()
  const { detail, isLoading, errorKey } = useLibraryProjectDetail(projectId)
  const { deleteProjects, deleting } = useLibraryProjects()
  const { task, startPipelineForProject } = useCreateTask()

  usePageTitle(detail?.metadata.name ?? t('library.pageTitle'))

  if (isLoading || (!detail && !errorKey)) return <ViewSpinner />

  if (!detail) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-8 py-10">
        <ErrorMessage>{t(errorKey ?? UNKNOWN_CREATE_ERROR_KEY)}</ErrorMessage>
        <Button asChild variant="ghost" className="rounded-lg font-display">
          <Link to={VideosRoutes.library}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {t('library.player.backToLibrary')}
          </Link>
        </Button>
      </div>
    )
  }

  const metadata = detail.metadata
  const badge = projectBadge(
    {
      state: metadata.state,
      hasVideo: Boolean(detail.videoPath),
      videoOutdated: metadata.videoOutdated === true,
    },
    isTaskLiveFor(task, projectId),
  )

  // Un proyecto con job en curso (o pausado a mitad) se mira en Progress.
  if (badge === 'generating' || badge === 'awaitingConfirmation')
    return <Navigate to={libraryProgressPath(projectId)} replace />

  const retry = async () => {
    const started = await startPipelineForProject(projectId, metadata.name, {
      videoFormat: metadata.options.videoFormat,
    })
    if (started) void navigate(libraryProgressPath(projectId))
  }

  const removeProject = () => {
    if (!window.confirm(t('library.list.confirmDelete', { total: 1 }))) return
    deleteProjects([projectId])
    void navigate(VideosRoutes.library)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-8 py-10">
      <LibraryViewHeader title={metadata.name}>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="rounded-lg font-display"
        >
          <Link to={libraryEditorPath(projectId)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            {t('library.player.edit')}
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={deleting}
          onClick={removeProject}
          className="rounded-lg font-display text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          {t('library.player.delete')}
        </Button>
      </LibraryViewHeader>

      {badge === 'outdated' && <OutdatedVideoBanner projectId={projectId} />}

      {metadata.state === 'error' && (
        <TaskErrorCard
          message={`${t('library.player.errorIntro')} ${t(
            metadata.errorCode
              ? videosApi.errorMessageKey({ code: metadata.errorCode })
              : UNKNOWN_CREATE_ERROR_KEY,
          )}`}
          retryLabel={t('library.player.retry')}
          onRetry={() => void retry()}
          // Con imágenes faltantes el proyecto se repara también desde el
          // editor (regenerar escena por escena); el resto de los fallos solo
          // ofrece reanudar.
          onContinueInEditor={
            metadata.errorCode &&
            EDITOR_RESCUE_ERROR_CODES.has(metadata.errorCode)
              ? () => void navigate(libraryEditorPath(projectId))
              : undefined
          }
        />
      )}

      {detail.videoPath ? (
        <>
          <LibraryVideoPlayer
            src={videosApi.videoSource(detail.videoPath, detail.videoMtimeMs)}
            videoFormat={metadata.options.videoFormat}
          />
          <VideoFileActions videoPath={detail.videoPath} />
        </>
      ) : (
        metadata.state !== 'error' && (
          <div className="space-y-3 rounded-2xl border-2 border-saffron/30 bg-saffron/5 p-6 text-center">
            <p className="font-body text-sm text-muted-foreground">
              {t('library.player.noVideo')}
            </p>
            <Button asChild className="rounded-xl font-display font-bold">
              <Link to={libraryEditorPath(projectId)}>
                <Pencil className="mr-1.5 h-4 w-4" />
                {t('library.player.noVideoCta')}
              </Link>
            </Button>
          </div>
        )
      )}
    </div>
  )
}
