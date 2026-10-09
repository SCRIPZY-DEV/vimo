import { useSortable } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import {
  GripVertical,
  Lock,
  LockOpen,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { TimelineHeaderToggle } from '@/modules/videos/components/TimelineHeaderToggle'
import { TIMELINE_TRACK_HEIGHT } from '@/modules/videos/constants'
import { isAudioTrack } from '@/modules/videos/utilities/timelineLayout'
import type { TimelineTrackId } from '@/modules/videos/types/library'

interface TimelineTrackHeaderProps {
  id: TimelineTrackId
  Icon: LucideIcon
  label: string
  muted: boolean
  locked: boolean
  onToggleMuted(id: TimelineTrackId): void
  onToggleLocked(id: TimelineTrackId): void
}

// Cabecera de una pista (ADR-0056): asa para reordenar, nombre, silenciar en
// el visor (solo audio) y candado. Vive en la columna fija, fuera del carril
// con scroll, así el arrastre vertical no pelea con el desplazamiento
// horizontal. El asa es el único punto de agarre.
export function TimelineTrackHeader({
  id,
  Icon,
  label,
  muted,
  locked,
  onToggleMuted,
  onToggleLocked,
}: TimelineTrackHeaderProps) {
  const { t } = useTranslation()
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    // El rol que lee el lector de pantalla (dnd-kit trae «sortable», en inglés).
    attributes: { roleDescription: t('library.editor.timeline.sortableRole') },
  })

  // Etiquetas fijas y con el nombre de la pista (las tres pistas no se
  // anuncian igual). El estado lo dice aria-pressed: una etiqueta que cambia
  // con él se leería «Desbloquear la pista, presionado».
  const dragLabel = t('library.editor.timeline.dragTrack', { track: label })
  const muteLabel = t('library.editor.timeline.mute', { track: label })
  const lockLabel = t('library.editor.timeline.lock', { track: label })

  return (
    <div
      ref={setNodeRef}
      style={{
        height: TIMELINE_TRACK_HEIGHT,
        // Solo el eje vertical: el modificador del DndContext ya anula x.
        transform: transform
          ? `translate3d(0, ${Math.round(transform.y)}px, 0)`
          : undefined,
        transition,
      }}
      className={cn(
        'relative flex items-center gap-0.5 border-b border-border/50 bg-card pl-0.5 pr-1',
        isDragging && 'z-10 shadow-md',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={dragLabel}
        title={dragLabel}
        className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-display text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {isAudioTrack(id) && (
        <TimelineHeaderToggle
          label={muteLabel}
          active={muted}
          onClick={() => onToggleMuted(id)}
        >
          {muted ? (
            <VolumeX className="h-3.5 w-3.5" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
        </TimelineHeaderToggle>
      )}
      <TimelineHeaderToggle
        label={lockLabel}
        active={locked}
        onClick={() => onToggleLocked(id)}
      >
        {locked ? (
          <Lock className="h-3.5 w-3.5" />
        ) : (
          <LockOpen className="h-3.5 w-3.5" />
        )}
      </TimelineHeaderToggle>
    </div>
  )
}
