import { useTranslation } from 'react-i18next'
import { Clapperboard, Loader2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { NO_SEEK_PROPS } from '@/modules/videos/constants'
import { useAnimationProgress } from '@/modules/videos/hooks/useAnimationProgress'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
import { sceneImageSource } from '@/modules/videos/utilities/sceneImageSource'
import type { SceneAnimationProgress } from '@/modules/videos/types/library'
import type { TimelineClipBlock } from '@/modules/videos/utilities/timelineBlocks'

interface TimelineClipItemProps {
  block: TimelineClipBlock
  selected: boolean
  // Avance del clip en curso y último fallo (clave i18n) de la que encabeza.
  progress: SceneAnimationProgress | undefined
  errorKey: string | undefined
  versions: Record<number, number>
  onSelect(): void
}

// Un clip en la pista de escenas (ADR-0041): UNA tarjeta del largo del hueco
// entero, con la miniatura de cada escena que cubre en proporción a su
// duración y un borde blanco al pasar el cursor o seleccionarlo. Así se ve de un vistazo que el clip ocupa las dos escenas
// que fusiona. Clic: selecciona la escena que encabeza (donde vive el panel).
export function TimelineClipItem({
  block,
  selected,
  progress,
  errorKey,
  versions,
  onSelect,
}: TimelineClipItemProps) {
  const { t, i18n } = useTranslation()

  const generating = block.state === 'generating'
  const percent = useAnimationProgress(generating ? progress : undefined)
  const slotSeconds = block.endSeconds - block.startSeconds
  const title = generating
    ? t(
        progress?.phase === 'retrying'
          ? 'library.editor.panel.animation.retrying'
          : 'library.editor.panel.animation.animating',
        { attempt: progress?.attempt, maxAttempts: progress?.maxAttempts },
      )
    : errorKey
      ? t('library.editor.panel.animation.lastError', { reason: t(errorKey) })
      : t('library.editor.panel.animation.ready', {
          count: block.scenes.length,
          ids: block.scenes.map((scene) => scene.id).join(', '),
          seconds: formatSlotSeconds(
            slotSeconds,
            i18n.resolvedLanguage ?? 'es',
          ),
        })

  return (
    <button
      type="button"
      {...NO_SEEK_PROPS}
      title={title}
      onClick={onSelect}
      className={cn(
        'absolute inset-x-0 bottom-1 top-1 overflow-hidden rounded-md border-[3px] outline-none transition-[border-color,box-shadow,filter] duration-150 focus-visible:border-white focus-visible:ring-2 focus-visible:ring-blue-500',
        selected
          ? 'border-white shadow-[0_0_0_1px_rgb(15_23_42/0.22)] brightness-110'
          : 'border-sky/70 hover:border-white hover:brightness-110',
      )}
    >
      {/* Las miniaturas se reparten el ancho según lo que dura cada escena. */}
      <span className="flex h-full w-full">
        {block.scenes.map((scene) => {
          const duration = Math.max(
            (scene.endSeconds ?? 0) - (scene.startSeconds ?? 0),
            0.01,
          )
          return scene.imagePath ? (
            <img
              key={scene.id}
              src={sceneImageSource(scene, versions[scene.id])}
              alt=""
              loading="lazy"
              draggable={false}
              style={{ flexGrow: duration, flexBasis: 0 }}
              className="h-full min-w-0 object-cover"
            />
          ) : (
            <span
              key={scene.id}
              style={{ flexGrow: duration, flexBasis: 0 }}
              className="block h-full min-w-0 bg-gradient-to-br from-muted to-muted/60"
            />
          )
        })}
      </span>

      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"
      />

      <span className="absolute bottom-0.5 right-1 rounded bg-charcoal/80 px-1 font-mono text-[10px] tabular-nums text-white">
        {t('library.editor.timeline.clipDuration', {
          seconds: formatSlotSeconds(
            slotSeconds,
            i18n.resolvedLanguage ?? 'es',
          ),
        })}
      </span>

      <span className="absolute left-1 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded bg-charcoal/80 px-1 font-display text-[10px] font-bold tabular-nums text-white">
        {block.scenes.map((scene) => scene.id).join(' · ')}
      </span>

      <span
        aria-hidden
        className="absolute right-1 top-0.5 flex h-4 w-4 items-center justify-center rounded bg-sky text-white"
      >
        <Clapperboard className="h-2.5 w-2.5" />
      </span>

      {errorKey && !generating && (
        <span aria-hidden className="absolute inset-0 bg-destructive/40" />
      )}
      {generating && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/70">
          <Loader2 className="h-5 w-5 animate-spin text-sky" />
          {percent !== undefined && (
            <span className="font-display text-[10px] font-bold tabular-nums text-white">
              {t(
                progress?.phase === 'retrying'
                  ? 'library.editor.timeline.retryingPercent'
                  : 'library.editor.timeline.animatingPercent',
                { percent },
              )}
            </span>
          )}
        </span>
      )}
    </button>
  )
}
