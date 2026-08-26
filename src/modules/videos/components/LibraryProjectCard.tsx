import { useTranslation } from 'react-i18next'
import { Clapperboard, Images } from 'lucide-react'
import { formatDateTime } from '@/modules/common/utilities/formatDateTime'
import { videosApi } from '@/modules/videos/api'
import { ProjectStateBadge } from '@/modules/videos/components/ProjectStateBadge'
import type { ProjectBadge } from '@/modules/videos/types/library'
import type { VideoProjectListItem } from '@pipeline/types/video-project.ts'

interface LibraryProjectCardProps {
  project: VideoProjectListItem
  badge: ProjectBadge
  selectionMode: boolean
  selected: boolean
  onOpen: () => void
  onToggleSelected: () => void
}

// Tarjeta presentacional de un proyecto: miniatura + estado + metadatos. En
// modo selección el click alterna la marca en vez de navegar.
export function LibraryProjectCard({
  project,
  badge,
  selectionMode,
  selected,
  onOpen,
  onToggleSelected,
}: LibraryProjectCardProps) {
  const { t, i18n } = useTranslation()

  const formattedDate = formatDateTime(project.updatedAt, i18n.resolvedLanguage)

  return (
    <button
      type="button"
      onClick={selectionMode ? onToggleSelected : onOpen}
      className={`group relative w-full overflow-hidden rounded-2xl border-2 bg-card text-left shadow-card transition-colors ${
        selected ? 'border-saffron' : 'border-border hover:border-saffron/50'
      }`}
    >
      <div className="relative aspect-video w-full bg-muted">
        {project.thumbnailPath ? (
          <img
            src={videosApi.imageSource(
              project.thumbnailPath,
              project.thumbnailMtimeMs,
            )}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Clapperboard className="h-10 w-10 text-muted-foreground/50" />
          </div>
        )}
        <div className="absolute left-2 top-2">
          <ProjectStateBadge badge={badge} />
        </div>
        {selectionMode && (
          <span
            aria-hidden
            className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 font-display text-xs font-bold ${
              selected
                ? 'border-saffron bg-saffron text-white'
                : 'border-white/80 bg-black/30 text-transparent'
            }`}
          >
            ✓
          </span>
        )}
      </div>

      <div className="space-y-1 p-3">
        <p className="truncate font-display text-sm font-bold text-foreground">
          {project.name}
        </p>
        <div className="flex items-center justify-between gap-2">
          <p className="font-body text-xs text-muted-foreground">
            {formattedDate}
          </p>
          {project.imageCount > 0 && (
            <p className="flex items-center gap-1 font-body text-xs text-muted-foreground">
              <Images className="h-3.5 w-3.5" />
              {t('library.list.imageCount', { total: project.imageCount })}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}
