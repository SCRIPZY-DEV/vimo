import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { motion } from 'framer-motion'
import { CheckSquare, RefreshCw, Trash2, X } from 'lucide-react'
import DoodleCamera from '@/modules/common/doodles/DoodleCamera'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ViewSpinner } from '@/modules/common/components/ViewSpinner'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'
import { LibraryProjectCard } from '@/modules/videos/components/LibraryProjectCard'
import {
  libraryEditorPath,
  libraryPlayerPath,
  libraryProgressPath,
} from '@/modules/videos/constants'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { useLibraryProjects } from '@/modules/videos/hooks/useLibraryProjects'
import {
  badgeNavigatesToProgress,
  projectBadge,
} from '@/modules/videos/utilities/projectBadge'
import type { VideoProjectListItem } from '@pipeline/types/video-project.ts'

// Biblioteca de videos: grilla de proyectos con selección múltiple para
// borrar en lote. El click navega según el estado del proyecto.
export function Library() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    isNative,
    projects,
    isLoading,
    isFetching,
    errorKey,
    refresh,
    deleteProjects,
    deleting,
  } = useLibraryProjects()
  const { task } = useCreateTask()

  const [selectionMode, setSelectionMode] = useState(false)
  const [selection, setSelection] = useState<Set<string>>(new Set())

  usePageTitle(t('library.pageTitle'))

  const badgeOf = (project: VideoProjectListItem) => {
    const liveTask =
      task?.projectId === project.id &&
      (task.status === 'generating' || task.status === 'creating')
    return projectBadge(project, liveTask)
  }

  const openProject = (project: VideoProjectListItem) => {
    const badge = badgeOf(project)
    if (badge === 'draft') return void navigate(libraryEditorPath(project.id))
    if (badgeNavigatesToProgress(badge))
      return void navigate(libraryProgressPath(project.id))
    return void navigate(libraryPlayerPath(project.id))
  }

  const toggleSelected = (projectId: string) => {
    setSelection((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  const exitSelection = () => {
    setSelectionMode(false)
    setSelection(new Set())
  }

  const deleteSelected = () => {
    if (selection.size === 0) return
    if (
      !window.confirm(
        t('library.list.confirmDelete', { total: selection.size }),
      )
    )
      return
    deleteProjects([...selection])
    exitSelection()
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <DoodleCamera size={48} delay={100} />
          <div>
            <h1 className="font-display text-3xl font-extrabold text-foreground">
              {t('library.title')}
            </h1>
            <p className="font-handwritten text-lg text-muted-foreground">
              {t('library.tagline')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                disabled={selection.size === 0 || deleting}
                onClick={deleteSelected}
                className="rounded-lg font-display"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                {t('library.list.deleteSelected', { total: selection.size })}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={exitSelection}
                className="rounded-lg font-display text-muted-foreground"
              >
                <X className="mr-1.5 h-4 w-4" />
                {t('library.list.cancelSelection')}
              </Button>
            </>
          ) : (
            <>
              {projects.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectionMode(true)}
                  className="rounded-lg font-display text-muted-foreground"
                >
                  <CheckSquare className="mr-1.5 h-4 w-4" />
                  {t('library.list.select')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={refresh}
                aria-label={t('library.list.refresh')}
                className="h-8 w-8 rounded-lg"
              >
                <RefreshCw
                  className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
                />
              </Button>
            </>
          )}
        </div>
      </motion.div>

      {!isNative && (
        <p className="font-body text-sm text-saffron">
          {t('library.desktopOnly')}
        </p>
      )}

      {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

      {isLoading && <ViewSpinner />}

      {isNative && !isLoading && projects.length === 0 && !errorKey && (
        <p className="py-16 text-center font-body text-sm text-muted-foreground">
          {t('library.list.empty')}
        </p>
      )}

      {projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <LibraryProjectCard
              key={project.id}
              project={project}
              badge={badgeOf(project)}
              selectionMode={selectionMode}
              selected={selection.has(project.id)}
              onOpen={() => openProject(project)}
              onToggleSelected={() => toggleSelected(project.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
