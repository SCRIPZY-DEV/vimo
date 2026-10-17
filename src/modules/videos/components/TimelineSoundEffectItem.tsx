import { useRef, useState } from 'react'
import { AudioLines, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import { NO_SEEK_PROPS } from '@/modules/videos/constants'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
import { boundSoundEffectStart } from '@/modules/videos/utilities/soundEffectPlayback'
import type {
  TimelineSoundEffectItemProps,
  TimelineSoundEffectDrag,
} from '@/modules/videos/types/library'

export function TimelineSoundEffectItem({
  instance,
  durationSeconds,
  timelineSeconds,
  pxPerSecond,
  disabled,
  muted,
  onMove,
  onRemove,
}: TimelineSoundEffectItemProps) {
  const { t, i18n } = useTranslation()
  const [previewSeconds, setPreviewSeconds] = useState<number | null>(null)
  const dragRef = useRef<TimelineSoundEffectDrag | null>(null)
  const bound = (seconds: number) =>
    boundSoundEffectStart(seconds, timelineSeconds, durationSeconds)
  const label = t('library.editor.sfx.clip')

  return (
    <div
      {...NO_SEEK_PROPS}
      data-sound-effect-id={instance.id}
      style={{
        // El bloqueo transitorio al guardar no debe devolver el clip a su
        // posición previa; el hook confirma o revierte la posición optimista.
        left: (previewSeconds ?? instance.startSeconds) * pxPerSecond,
        width: Math.max(6, durationSeconds * pxPerSecond),
      }}
      className={cn(
        'group/sfx absolute bottom-1 top-1 rounded-md border-2 border-saffron/80 bg-saffron/30',
        muted && 'opacity-45',
        previewSeconds !== null && !disabled && 'z-20 shadow-md',
      )}
    >
      <button
        type="button"
        aria-disabled={disabled}
        aria-label={t('library.editor.sfx.move', { effect: label })}
        title={`${label} · ${t('library.editor.tools.sfx.duration', {
          seconds: formatSlotSeconds(
            instance.startSeconds,
            i18n.resolvedLanguage ?? 'es',
          ),
        })}`}
        className={cn(
          'flex h-full w-full touch-none items-center justify-center overflow-hidden rounded-sm text-foreground/75 outline-none hover:bg-saffron/30 focus-visible:ring-2 focus-visible:ring-saffron',
          disabled
            ? 'cursor-not-allowed'
            : 'cursor-grab active:cursor-grabbing',
        )}
        // WebKit no enfoca los botones al hacer clic. La selección de este
        // clip vive en el foco: Delete y Backspace llegan al mismo botón.
        onClick={(event) => {
          event.stopPropagation()
          event.currentTarget.focus({ preventScroll: true })
        }}
        onMouseDown={(event) => {
          // Conserva el foco explícito del pointerdown: el mousedown nativo
          // de macOS puede llevarlo de nuevo al body antes del drag.
          event.preventDefault()
        }}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return
          event.stopPropagation()
          event.currentTarget.focus({ preventScroll: true })
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            initialSeconds: instance.startSeconds,
            seconds: instance.startSeconds,
          }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || disabled || drag.pointerId !== event.pointerId) return
          drag.seconds = bound(
            drag.initialSeconds + (event.clientX - drag.clientX) / pxPerSecond,
          )
          setPreviewSeconds(drag.seconds)
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          dragRef.current = null
          setPreviewSeconds(null)
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
          if (!disabled && drag.seconds !== drag.initialSeconds)
            onMove(instance.id, drag.seconds)
        }}
        onLostPointerCapture={() => {
          dragRef.current = null
          setPreviewSeconds(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault()
            event.stopPropagation()
            if (!disabled) onRemove(instance.id)
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            event.stopPropagation()
            if (disabled) return
            const direction = event.key === 'ArrowLeft' ? -1 : 1
            onMove(
              instance.id,
              bound(
                instance.startSeconds + direction * (event.shiftKey ? 1 : 0.05),
              ),
            )
          }
        }}
      >
        <AudioLines aria-hidden className="h-3 w-3 shrink-0" />
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation()
          onRemove(instance.id)
        }}
        aria-label={t('library.editor.sfx.remove', { effect: label })}
        title={t('library.editor.sfx.remove', { effect: label })}
        className="absolute -right-2 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card opacity-0 shadow-sm transition-opacity group-hover/sfx:opacity-100 group-focus-within/sfx:opacity-100 disabled:hidden"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  )
}
