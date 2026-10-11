import { useTranslation } from 'react-i18next'
import { TimelineBlockCard } from '@/modules/videos/components/TimelineBlockCard'
import { useAvatarRenderPercent } from '@/modules/videos/hooks/useAvatarRenderPercent'
import { errorKeyOf } from '@/modules/videos/utilities/errorKeyOf'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
import { sceneImageSource } from '@/modules/videos/utilities/sceneImageSource'
import type { SceneAvatarRendering } from '@/modules/videos/types/library'
import type { TimelineAvatarBlock } from '@/modules/videos/utilities/timelineBlocks'

interface TimelineAvatarItemProps {
  block: TimelineAvatarBlock
  selected: boolean
  // Render en curso desde el editor (entrega 3); undefined = ninguno.
  rendering: SceneAvatarRendering | undefined
  // Cache-buster de la imagen fija de la escena.
  version: number | undefined
  onSelect(): void
}

// Una escena de avatar en la pista de escenas (ADR-0057, spec §10.3): la
// tarjeta morada con la vista previa del look como miniatura (el look ES el
// escenario, cambio de dirección del dueño del 2026-10-10: el sidecar se la
// pone a la escena como imagen fija; sin la copia, un gradiente). Planeado
// (sin clip todavía), generando (avance simulado), listo, fallido (velo rojo
// y el motivo) o desactualizado (etiqueta y franja). Sin asas: en la entrega
// 2 sus fronteras no se mueven.
export function TimelineAvatarItem({
  block,
  selected,
  rendering,
  version,
  onSelect,
}: TimelineAvatarItemProps) {
  const { t, i18n } = useTranslation()
  const generating = block.state === 'generating'
  const percent = useAvatarRenderPercent(generating ? rendering : undefined)
  const seconds = formatSlotSeconds(
    block.endSeconds - block.startSeconds,
    i18n.resolvedLanguage ?? 'es',
  )

  const title = () => {
    if (block.state === 'generating')
      return t('library.editor.timeline.avatarRendering')
    if (block.state === 'failed')
      return t('library.editor.timeline.avatarFailed', {
        reason: t(errorKeyOf(block.avatar.errorCode)),
      })
    if (block.state === 'stale')
      return t('library.editor.timeline.avatarStaleHint')
    if (block.state === 'planned')
      return t('library.editor.timeline.avatarPlanned')

    return t('library.editor.timeline.avatarTitle', {
      name: block.avatar.lookName,
      seconds,
    })
  }

  return (
    <TimelineBlockCard
      kind="avatar"
      selected={selected}
      title={title()}
      sceneLabel={String(block.scene.id)}
      durationLabel={t('library.editor.timeline.avatarDuration', { seconds })}
      generating={generating}
      progressLabel={
        percent === undefined
          ? undefined
          : t('library.editor.timeline.avatarRenderingPercent', { percent })
      }
      failed={block.state === 'failed'}
      staleLabel={
        block.state === 'stale'
          ? t('library.editor.timeline.avatarStale')
          : undefined
      }
      onSelect={onSelect}
    >
      {block.scene.imagePath ? (
        <img
          src={sceneImageSource(block.scene, version)}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <span className="block h-full w-full bg-gradient-to-br from-muted to-muted/60" />
      )}
    </TimelineBlockCard>
  )
}
