import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowLeft, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ViewSpinner } from '@/modules/common/components/ViewSpinner'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { useToast } from '@/modules/common/hooks/useToast'
import { Button } from '@/modules/common/ui/button'
import { videosApi } from '@/modules/videos/api'
import { LibraryVideoPlayer } from '@/modules/videos/components/LibraryVideoPlayer'
import { OutdatedVideoBanner } from '@/modules/videos/components/OutdatedVideoBanner'
import { VideoFileActions } from '@/modules/videos/components/VideoFileActions'
import {
  VideosRoutes,
  libraryEditorPath,
  libraryProgressPath,
} from '@/modules/videos/constants'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { useLibraryProjectDetail } from '@/modules/videos/hooks/useLibraryProjectDetail'
import { useLibraryProjects } from '@/modules/videos/hooks/useLibraryProjects'
import { projectBadge } from '@/modules/videos/utilities/projectBadge'

// Detalle/reproductor de un proyecto: video final con velocidades, aviso de
// desactualizado, reintento tras error y acciones (editar, abrir, eliminar).
export function LibraryPlayer() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { projectId = '' } = useParams()
  const { detail, isLoading, errorKey } = useLibraryProjectDetail(projectId)
  const { deleteProjects, deleting } = useLibraryProjects()
  const { task, startPipelineForProject } = useCreateTask()

  usePageTitle(detail?.metadata.name ?? t('library.pageTitle'))

  if (isLoading || (!detail && !errorKey)) return <ViewSpinner />

  if (!detail) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-8 py-10">
        <ErrorMessage>{t(errorKey ?? 'create.errors.unknown')}</ErrorMessage>
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
  const liveTask =
    task?.projectId === projectId &&
    (task.status === 'generating' || task.status === 'creating')
  const badge = projectBadge(
    {
      state: metadata.state,
      hasVideo: Boolean(detail.videoPath),
      videoOutdated: metadata.videoOutdated === true,
    },
    liveTask,
  )

  // Un proyecto con job en curso (o pausado a mitad) se mira en Progress.
  if (badge === 'generating' || badge === 'awaitingConfirmation')
    return <Navigate to={libraryProgressPath(projectId)} replace />

  const retry = async () => {
    const started = await startPipelineForProject(projectId, metadata.name)
    if (!started) {
      toast({
        description: t('library.errors.projectBusy'),
        variant: 'destructive',
      })
      return
    }
    void navigate(libraryProgressPath(projectId))
  }

  const removeProject = () => {
    if (!window.confirm(t('library.list.confirmDelete', { total: 1 }))) return
    deleteProjects([projectId])
    void navigate(VideosRoutes.library)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="icon"
            aria-label={t('library.player.backToLibrary')}
            className="h-9 w-9 shrink-0 rounded-xl text-muted-foreground"
          >
            <Link to={VideosRoutes.library}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="truncate font-display text-2xl font-extrabold text-foreground">
            {metadata.name}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
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
        </div>
      </motion.div>

      {badge === 'outdated' && <OutdatedVideoBanner projectId={projectId} />}

      {metadata.state === 'error' && (
        <div className="space-y-3 rounded-2xl border-2 border-destructive/30 bg-destructive/10 p-4">
          <p className="font-body text-sm text-destructive">
            {t('library.player.errorIntro')}{' '}
            {t(
              metadata.errorCode
                ? videosApi.errorMessageKey({ code: metadata.errorCode })
                : 'create.errors.unknown',
            )}
          </p>
          <Button
            size="sm"
            onClick={() => void retry()}
            className="rounded-lg font-display font-bold"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {t('library.player.retry')}
          </Button>
        </div>
      )}

      {detail.videoPath ? (
        <>
          <LibraryVideoPlayer
            src={videosApi.videoSource(detail.videoPath, detail.videoMtimeMs)}
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
