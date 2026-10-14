import { useTranslation } from 'react-i18next'
import { TimelineBlockCard } from '@/modules/videos/components/TimelineBlockCard'
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
// duración. Desde ADR-0057 usa la tarjeta compartida (TimelineBlockCard):
// borde celeste, blanco al elegirla o pasar el cursor, y la claqueta junto a las
// escenas que fusiona. Clic: selecciona la escena que encabeza.
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
  const seconds = formatSlotSeconds(
    block.endSeconds - block.startSeconds,
    i18n.resolvedLanguage ?? 'es',
  )
  const retrying = progress?.phase === 'retrying'

  const title = () => {
    if (generating)
      return t(
        retrying
          ? 'library.editor.panel.animation.retrying'
          : 'library.editor.panel.animation.animating',
        { attempt: progress?.attempt, maxAttempts: progress?.maxAttempts },
      )
    if (errorKey)
      return t('library.editor.panel.animation.lastError', {
        reason: t(errorKey),
      })

    return t('library.editor.panel.animation.ready', {
      count: block.scenes.length,
      ids: block.scenes.map((scene) => scene.id).join(', '),
      seconds,
    })
  }
  const progressLabel =
    percent === undefined
      ? undefined
      : t(
          retrying
            ? 'library.editor.timeline.retryingPercent'
            : 'library.editor.timeline.animatingPercent',
          { percent },
        )

  return (
    <TimelineBlockCard
      kind="clip"
      selected={selected}
      title={title()}
      sceneLabel={block.scenes.map((scene) => scene.id).join(' · ')}
      durationLabel={t('library.editor.timeline.clipDuration', { seconds })}
      generating={generating}
      progressLabel={progressLabel}
      failed={Boolean(errorKey)}
      onSelect={onSelect}
    >
      {/* Las miniaturas se reparten el ancho según lo que dura cada escena. */}
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
    </TimelineBlockCard>
  )
}
