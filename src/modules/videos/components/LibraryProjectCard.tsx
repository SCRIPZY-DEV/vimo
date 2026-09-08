import { Trans, useTranslation } from 'react-i18next'
import { Clapperboard, Images } from 'lucide-react'
import { Brand } from '@/modules/common/brand/brand'
import { cn } from '@/modules/common/utilities/cn'
import { formatDateTime } from '@/modules/common/utilities/formatDateTime'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { videosApi } from '@/modules/videos/api'
import { ProjectStateBadge } from '@/modules/videos/components/ProjectStateBadge'
import { aspectClass, isVertical } from '@/modules/videos/utilities/videoFormat'
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

// Tarjeta presentacional de un proyecto: portada + estado + metadatos. La
// portada toma el aspecto del formato del proyecto (16:9 o 9:16; ausente =
// 16:9) y en un short los metadatos van más compactos para que la tarjeta
// angosta no se cargue. En modo selección el click alterna la marca en vez
// de navegar.
export function LibraryProjectCard({
  project,
  badge,
  selectionMode,
  selected,
  onOpen,
  onToggleSelected,
}: LibraryProjectCardProps) {
  const { t, i18n } = useTranslation()

  const format = project.videoFormat ?? '16:9'
  const vertical = isVertical(format)
  const formattedDate = formatDateTime(project.updatedAt, i18n.resolvedLanguage)
  const imageCountLabel = t('library.list.imageCount', {
    total: project.imageCount,
  })
  const author = project.promptModelLabel ?? Brand.name
  // La tarjeta angosta corta el nombre del modelo: al pasar el cursor se
  // muestra entero, sin espera.
  const showsAuthorTooltip = vertical && project.promptModelLabel !== undefined
  const authorLine = (
    <p
      className={cn(
        'font-body text-xs text-muted-foreground',
        vertical && 'truncate',
      )}
    >
      <Trans
        i18nKey="library.list.promptAuthor"
        values={{ author }}
        components={{
          author: <span className="font-semibold text-foreground" />,
        }}
      />
    </p>
  )

  return (
    <button
      type="button"
      onClick={selectionMode ? onToggleSelected : onOpen}
      className={`group relative w-full overflow-hidden rounded-2xl border-2 bg-card text-left shadow-card transition-colors ${
        selected ? 'border-saffron' : 'border-border hover:border-saffron/50'
      }`}
    >
      <div className={cn('relative w-full bg-muted', aspectClass(format))}>
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
        {/* En el short la cantidad de imágenes va sobre la portada: debajo
            quedan solo nombre, fecha y autor. */}
        {vertical && project.imageCount > 0 && (
          <span
            title={imageCountLabel}
            aria-label={imageCountLabel}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 font-body text-[11px] font-semibold text-white backdrop-blur-sm"
          >
            <Images className="h-3 w-3" />
            {project.imageCount}
          </span>
        )}
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
          {!vertical && project.imageCount > 0 && (
            <p className="flex items-center gap-1 font-body text-xs text-muted-foreground">
              <Images className="h-3.5 w-3.5" />
              {imageCountLabel}
            </p>
          )}
        </div>
        {showsAuthorTooltip ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>{authorLine}</TooltipTrigger>
            <TooltipContent side="bottom" className="font-body text-xs">
              {author}
            </TooltipContent>
          </Tooltip>
        ) : (
          authorLine
        )}
      </div>
    </button>
  )
}
