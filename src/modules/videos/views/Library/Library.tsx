import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCheck,
  CheckSquare,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import DoodleCamera from '@/modules/common/doodles/DoodleCamera'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { ViewSpinner } from '@/modules/common/components/ViewSpinner'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'
import { LibraryFormatTabs } from '@/modules/videos/components/LibraryFormatTabs'
import { LibraryProjectCard } from '@/modules/videos/components/LibraryProjectCard'
import {
  VideosRoutes,
  libraryEditorPath,
  libraryPlayerPath,
  libraryProgressPath,
} from '@/modules/videos/constants'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { useLibraryProjects } from '@/modules/videos/hooks/useLibraryProjects'
import { useLibraryTab } from '@/modules/videos/hooks/useLibraryTab'
import { isTaskLiveFor } from '@/modules/videos/utilities/isTaskLiveFor'
import { splitProjectsByTab } from '@/modules/videos/utilities/libraryTab'
import {
  badgeNavigatesToProgress,
  projectBadge,
} from '@/modules/videos/utilities/projectBadge'
import type { LibraryTab } from '@/modules/videos/types/library'
import type { VideoProjectListItem } from '@pipeline/types/video-project.ts'

// Los shorts son angostos: entran más por fila sin apretarse (cuatro en el
// ancho máximo de la vista, unos 230 px cada uno).
const GRID_CLASSES: Record<LibraryTab, string> = {
  long: 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3',
  shorts: 'grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4',
}

const EMPTY_KEYS: Record<LibraryTab, string> = {
  long: 'library.tabs.emptyLong',
  shorts: 'library.tabs.emptyShorts',
}

// Biblioteca de videos: una pestaña por formato (largo / shorts), cada una
// con su grilla de proyectos y selección múltiple para borrar en lote. El
// click navega según el estado del proyecto.
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
  const { tab, selectTab } = useLibraryTab()

  const [selectionMode, setSelectionMode] = useState(false)
  const [selection, setSelection] = useState<Set<string>>(new Set())

  usePageTitle(t('library.pageTitle'))

  const projectsByTab = splitProjectsByTab(projects)
  const visibleProjects = projectsByTab[tab]
  const counts = {
    long: projectsByTab.long.length,
    shorts: projectsByTab.shorts.length,
  }

  const badgeOf = (project: VideoProjectListItem) => {
    return projectBadge(project, isTaskLiveFor(task, project.id))
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

  const allVisibleSelected =
    visibleProjects.length > 0 &&
    visibleProjects.every((project) => selection.has(project.id))

  // «Seleccionar todo» marca solo lo visible (la pestaña activa); si ya está
  // todo marcado, lo desmarca.
  const toggleSelectAll = () => {
    if (allVisibleSelected) return void setSelection(new Set())
    setSelection(new Set(visibleProjects.map((project) => project.id)))
  }

  // La selección es de la pestaña visible: cambiarla la descarta para no
  // borrar nada que no esté a la vista.
  const changeTab = (next: LibraryTab) => {
    if (next === tab) return
    exitSelection()
    selectTab(next)
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
                variant="ghost"
                size="sm"
                onClick={toggleSelectAll}
                className="rounded-lg font-display text-muted-foreground"
              >
                <CheckCheck className="mr-1.5 h-4 w-4" />
                {t(
                  allVisibleSelected
                    ? 'library.list.deselectAll'
                    : 'library.list.selectAll',
                )}
              </Button>
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
              {visibleProjects.length > 0 && (
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
              {/* Acceso directo a Crear: mismos colores que la pestaña activa
                  (amarillo de la marca con texto carbón). Recargar va al final. */}
              <Button
                asChild
                size="sm"
                className="rounded-lg bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
              >
                <Link to={VideosRoutes.create}>
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  {t('library.list.create')}
                </Link>
              </Button>
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
        <div className="space-y-5">
          <LibraryFormatTabs value={tab} counts={counts} onChange={changeTab} />

          {/* Cambio de pestaña con un fundido corto: la grilla saliente se va
              antes de que entre la nueva (mode="wait"); el primer montaje no
              se anima. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {visibleProjects.length === 0 ? (
                <p className="py-16 text-center font-body text-sm text-muted-foreground">
                  {t(EMPTY_KEYS[tab])}
                </p>
              ) : (
                <div className={GRID_CLASSES[tab]}>
                  {visibleProjects.map((project) => (
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
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
