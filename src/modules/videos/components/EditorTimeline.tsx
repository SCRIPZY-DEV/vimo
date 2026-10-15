import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus, Shuffle } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { ANIMATION_FPS } from '@pipeline/animation/timing.ts'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { clamp } from '@/modules/common/utilities/clamp'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { TimelineClipItem } from '@/modules/videos/components/TimelineClipItem'
import { TimelineAvatarItem } from '@/modules/videos/components/TimelineAvatarItem'
import { TimelineSceneItem } from '@/modules/videos/components/TimelineSceneItem'
import { TimelineTrackHeader } from '@/modules/videos/components/TimelineTrackHeader'
import { TimelineSoundEffectItem } from '@/modules/videos/components/TimelineSoundEffectItem'
import { boundSoundEffectStart } from '@/modules/videos/utilities/soundEffectPlayback'
import type { SoundEffectInstance } from '@pipeline/types/sound-effects.ts'
import { TimelineWaveform } from '@/modules/videos/components/TimelineWaveform'
import { timelineTransitionFrames } from '@/modules/videos/utilities/timelineTransitionFrames'
import {
  EDITOR_SOUND_EFFECT_MIME,
  AUTOSCROLL_EDGE_PX,
  AUTOSCROLL_MANUAL_PAUSE_MS,
  MIN_SCENE_SECONDS,
  NO_SEEK_PROPS,
  NO_SEEK_SELECTOR,
  PLAYHEAD_EDGE_DRAG_MAX_SPEED,
  PLAYHEAD_EDGE_DRAG_MIN_SPEED,
  PLAYHEAD_EDGE_DRAG_PX,
  RULER_MAJOR_STEPS,
  TIMELINE_END_SNAP_SECONDS,
  TIMELINE_RULER_HEIGHT,
  TIMELINE_SIDEBAR_WIDTH,
  TIMELINE_TRACK_DRAG_ACTIVATION_PX,
  TIMELINE_TRACK_HEIGHT,
  TIMELINE_TRANSITION_BASE_WIDTH,
  TIMELINE_TRANSITION_HEIGHT,
  TIMELINE_TRANSITION_MIN_WIDTH,
  TIMELINE_TRIM_INSET,
  TIMELINE_TRIM_WIDTH,
  TIMELINE_TRACK_ICONS,
  TIMELINE_TRACK_LABEL_KEYS,
  TIMELINE_ZOOM_LEVELS,
  WHEEL_LINE_PX,
} from '@/modules/videos/constants'
import { useAudioPeaks } from '@/modules/videos/hooks/useAudioPeaks'
import { clampBoundarySeconds } from '@/modules/videos/utilities/clampBoundarySeconds'
import { sceneTimingLocked } from '@/modules/videos/utilities/sceneTimingLocked'
import {
  firstSceneOf,
  lastSceneOf,
  timelineBlockKey,
  timelineBlocks,
} from '@/modules/videos/utilities/timelineBlocks'
import { isTimelineTrackId } from '@/modules/videos/utilities/timelineLayout'
import { trackReorderAnnouncements } from '@/modules/videos/utilities/trackReorderAnnouncements'
import type {
  SceneAnimationActivity,
  SceneAnimationFailure,
  SceneAnimationProgress,
  SceneAvatarRendering,
  TimelineLayout,
  TimelineTrackId,
} from '@/modules/videos/types/library'
import type { SceneImageReviewRequest } from '@/modules/videos/types/sceneImageReview'
import type { SceneDetail } from '@pipeline/types/video-project.ts'
import type { EditorSceneImageStatus } from '@/modules/videos/types/library'

interface EditorTimelineProps {
  scenes: SceneDetail[]
  timingBusy: boolean
  durationSeconds: number
  playheadSeconds: number
  selectedSceneId: number | null
  revealScene?: SceneImageReviewRequest
  sceneStatus: Record<number, EditorSceneImageStatus>
  // Motivo (clave i18n) del último fallo de regeneración por escena.
  sceneErrors: Record<number, string>
  sceneVersions: Record<number, number>
  // Animación en curso y último fallo de animación por escena (ADR-0047).
  sceneAnimationStatus: Record<number, SceneAnimationActivity>
  sceneAnimationProgress: Record<number, SceneAnimationProgress>
  sceneAnimationErrors: Record<number, SceneAnimationFailure>
  // Escenas que absorbería el clip de la escena seleccionada (ADR-0041).
  plannedSceneIds: number[]
  // Renders de HeyGen en curso desde el editor (entrega 3); sin él, ninguno.
  sceneAvatarRendering?: Record<number, SceneAvatarRendering>
  narrationSrc: string | null
  musicSrc: string | null
  soundEffects?: SoundEffectInstance[]
  soundEffectDurationSeconds?: number
  soundEffectsBusy?: boolean
  onAddSoundEffect?(seconds: number): void
  onMoveSoundEffect?(id: string, seconds: number): void
  onRemoveSoundEffect?(id: string): void
  // Orden, silencio en el visor y candado de las pistas (ADR-0056).
  layout: TimelineLayout
  onReorderTracks(activeId: TimelineTrackId, overId: TimelineTrackId): void
  onToggleMuted(id: TimelineTrackId): void
  onToggleLocked(id: TimelineTrackId): void
  zoomIndex: number
  onZoomChange(index: number): void
  onSelectScene(sceneId: number): void
  // Click en zona vacía del carril: seek CON reproducción.
  onSeek(seconds: number): void
  // Drag del playhead: seek SIN reproducir.
  onScrub(seconds: number): void
  onScrubStart(): void
  onScrubEnd(): void
  // Drag en vivo de la frontera COMPARTIDA: mueve end[izq] y start[der].
  onBoundaryDrag(leftId: number, rightId: number, boundarySeconds: number): void
  // Al soltar: persistir el par tocado en un solo batch, con la frontera
  // final (el mouseup corre con la clausura del mousedown: no puede leerla
  // de ningún estado).
  onBoundaryCommit(
    leftId: number,
    rightId: number,
    boundarySeconds: number,
  ): void
  onOpenAudio(): void
  onOpenMusic(): void
}

// Timeline del editor, port 1:1 del TimelineEditor del origen: escala en
// px/segundo con zoom discreto, scroll horizontal con autoscroll que sigue
// al playhead, regla adaptativa, playhead arrastrable con edge-autoscroll y
// drag de fronteras compartidas. Las formas de onda son una MEJORA sobre el
// origen (que pintaba barras planas).
export function EditorTimeline({
  scenes,
  timingBusy,
  durationSeconds,
  playheadSeconds,
  selectedSceneId,
  revealScene,
  sceneStatus,
  sceneErrors,
  sceneVersions,
  sceneAnimationStatus,
  sceneAnimationProgress,
  sceneAnimationErrors,
  plannedSceneIds,
  sceneAvatarRendering = {},
  narrationSrc,
  musicSrc,
  soundEffects = [],
  soundEffectDurationSeconds = 0,
  soundEffectsBusy = false,
  onAddSoundEffect,
  onMoveSoundEffect,
  onRemoveSoundEffect,
  layout,
  onReorderTracks,
  onToggleMuted,
  onToggleLocked,
  zoomIndex,
  onZoomChange,
  onSelectScene,
  onSeek,
  onScrub,
  onScrubStart,
  onScrubEnd,
  onBoundaryDrag,
  onBoundaryCommit,
  onOpenAudio,
  onOpenMusic,
}: EditorTimelineProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(800)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [hoverSeconds, setHoverSeconds] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [activeTrimHandle, setActiveTrimHandle] = useState<string | null>(null)

  // Última interacción manual: pausa el follow-playhead un rato para no
  // pelearle el scroll al usuario.
  const manualInteractionAtRef = useRef(0)
  // Un drag recién terminado no debe disparar el click-to-seek del carril.
  const suppressClickRef = useRef(false)

  const narrationPeaks = useAudioPeaks(narrationSrc)
  const musicPeaks = useAudioPeaks(musicSrc)

  const pxPerSecond = TIMELINE_ZOOM_LEVELS[zoomIndex]
  const timedScenes = scenes.filter(
    (scene) =>
      scene.startSeconds !== undefined && scene.endSeconds !== undefined,
  )
  const mediaDuration = Math.max(
    durationSeconds,
    ...timedScenes.map((scene) => scene.endSeconds ?? 0),
    0,
  )
  const duration = Math.max(mediaDuration, 1)
  const totalWidth = Math.max(duration * pxPerSecond + 16, viewportWidth)
  const visibleOrder = layout.order.filter(
    (id) => id !== 'sfx' || soundEffects.length > 0,
  )
  const tracksHeight =
    TIMELINE_RULER_HEIGHT + visibleOrder.length * TIMELINE_TRACK_HEIGHT
  const soundEffectsDisabled =
    timingBusy ||
    soundEffectsBusy ||
    layout.locked.sfx ||
    soundEffectDurationSeconds <= 0 ||
    mediaDuration < soundEffectDurationSeconds
  // Un clip que cubre varias escenas es UN bloque del largo del hueco entero
  // (ADR-0041) y una escena de avatar es un bloque propio (ADR-0057); las
  // fronteras arrastrables quedan solo entre bloques.
  const blocks = timelineBlocks(
    timedScenes,
    sceneAnimationProgress,
    sceneAvatarRendering,
  )
  // Candado de la pista de escenas (ADR-0056): sin arrastre de fronteras.
  const scenesLocked = layout.locked.scenes
  // La transición conserva su frontera real. Su ancho visual se acota al
  // espacio vecino; las asas quedan en el borde interior y por encima.
  const transitions = timelineBlocks(timedScenes, {}).flatMap(
    (block, index, visualBlocks) => {
      const previous = visualBlocks[index - 1]
      const frames = timelineTransitionFrames(previous, block)
      if (!previous || frames === 0) return []
      // Normalizar sólo píxeles evita ocultar 14px representados como 13.999…
      // por la resta de tiempos. La frontera temporal permanece intacta.
      const width = Number(
        Math.min(
          Math.max(
            TIMELINE_TRANSITION_BASE_WIDTH,
            (frames / ANIMATION_FPS) * pxPerSecond,
          ),
          ((previous.endSeconds - previous.startSeconds) * pxPerSecond) / 2,
          ((block.endSeconds - block.startSeconds) * pxPerSecond) / 2,
        ).toFixed(2),
      )
      // A zoom mínimo prima el recorte; ocultar el icono no cambia el fundido.
      if (width < TIMELINE_TRANSITION_MIN_WIDTH) return []
      return [
        {
          seconds: block.startSeconds,
          width,
          from: lastSceneOf(previous).id,
          to: firstSceneOf(block).id,
        },
      ]
    },
  )

  const xOfSeconds = (seconds: number) => seconds * pxPerSecond
  const markManualInteraction = () => {
    manualInteractionAtRef.current = Date.now()
  }

  const secondsAtClientX = (clientX: number) => {
    const rect = contentRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const seconds = (clientX - rect.left) / pxPerSecond
    return clamp(seconds, 0, duration)
  }

  // ── Viewport y scroll ──

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      setViewportWidth(element.clientWidth)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Rueda: Cmd/Ctrl + rueda = zoom (estilo CapCut); rueda vertical sola =
  // desplazamiento horizontal, 1 px por 1 px, como VidRush (el gesto que baja
  // una página adelanta el timeline, y respeta la dirección configurada en el
  // sistema). El gesto horizontal del trackpad sigue siendo nativo. Listener
  // nativo: React registra wheel como pasivo y el preventDefault no
  // funcionaría.
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const handleWheel = (event: WheelEvent) => {
      markManualInteraction()
      setHoverSeconds(null)
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault()
        const direction = event.deltaY < 0 ? 1 : -1
        const next = Math.max(
          0,
          Math.min(TIMELINE_ZOOM_LEVELS.length - 1, zoomIndex + direction),
        )
        if (next !== zoomIndex) onZoomChange(next)
        return
      }
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

      // Sin desborde horizontal no hay nada que desplazar: la rueda sigue
      // siendo de la página (por debajo de lg el editor scrollea en vertical).
      if (element.scrollWidth <= element.clientWidth) return

      event.preventDefault()
      // Algunos mouses mandan líneas en vez de píxeles: una línea ≈ 16 px.
      const delta =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * WHEEL_LINE_PX
          : event.deltaY
      element.scrollLeft += delta
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [zoomIndex, onZoomChange])

  // Follow-playhead: reencuadra si el cursor se acerca a los bordes, salvo
  // que el usuario haya interactuado hace poco.
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    if (
      Date.now() - manualInteractionAtRef.current <
      AUTOSCROLL_MANUAL_PAUSE_MS
    )
      return

    const cursorX = playheadSeconds * pxPerSecond
    const visibleStart = element.scrollLeft
    if (cursorX > visibleStart + viewportWidth - AUTOSCROLL_EDGE_PX) {
      element.scrollTo({
        left: cursorX - viewportWidth * 0.25,
        behavior: 'smooth',
      })
    } else if (cursorX < visibleStart + AUTOSCROLL_EDGE_PX) {
      element.scrollTo({
        left: Math.max(0, cursorX - viewportWidth * 0.5),
        behavior: 'smooth',
      })
    }
  }, [playheadSeconds, pxPerSecond, viewportWidth])

  // Un salto explícito desde la galería debe verse incluso si el usuario
  // acaba de scrollear manualmente. No cambia el reloj ni el follow-playhead.
  const revealStart = scenes.find(
    (scene) => scene.id === revealScene?.sceneId,
  )?.startSeconds
  useEffect(() => {
    if (!revealScene || revealStart === undefined) return
    scrollRef.current?.scrollTo({
      left: Math.max(0, revealStart * pxPerSecond - viewportWidth * 0.25),
      behavior: 'instant',
    })
  }, [revealScene, revealStart, pxPerSecond, viewportWidth])

  // ── Drag del playhead (seek sin play) con autoscroll por borde ──

  const startPlayheadDrag = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    markManualInteraction()
    onScrubStart()
    setDragging(true)
    setHoverSeconds(null)
    suppressClickRef.current = true

    let lastClientX = event.clientX
    let edgeFrame: number | null = null

    const scrubAt = (clientX: number) => {
      onScrub(secondsAtClientX(clientX))
    }

    // Arrastrar contra el borde del viewport scrollea con velocidad lineal
    // a la penetración, re-aplicando el seek en cada frame.
    const edgeStep = () => {
      const element = scrollRef.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      let speed = 0
      if (lastClientX > rect.right - PLAYHEAD_EDGE_DRAG_PX) {
        const depth = Math.min(
          1,
          (lastClientX - (rect.right - PLAYHEAD_EDGE_DRAG_PX)) /
            PLAYHEAD_EDGE_DRAG_PX,
        )
        speed =
          PLAYHEAD_EDGE_DRAG_MIN_SPEED +
          depth * (PLAYHEAD_EDGE_DRAG_MAX_SPEED - PLAYHEAD_EDGE_DRAG_MIN_SPEED)
      } else if (lastClientX < rect.left + PLAYHEAD_EDGE_DRAG_PX) {
        const depth = Math.min(
          1,
          (rect.left + PLAYHEAD_EDGE_DRAG_PX - lastClientX) /
            PLAYHEAD_EDGE_DRAG_PX,
        )
        speed = -(
          PLAYHEAD_EDGE_DRAG_MIN_SPEED +
          depth * (PLAYHEAD_EDGE_DRAG_MAX_SPEED - PLAYHEAD_EDGE_DRAG_MIN_SPEED)
        )
      }

      if (speed !== 0) {
        const before = element.scrollLeft
        element.scrollLeft = before + speed
        if (element.scrollLeft !== before) scrubAt(lastClientX)
      }
      edgeFrame = requestAnimationFrame(edgeStep)
    }
    edgeFrame = requestAnimationFrame(edgeStep)

    const handleMove = (moveEvent: MouseEvent) => {
      lastClientX = moveEvent.clientX
      markManualInteraction()
      scrubAt(moveEvent.clientX)
    }
    const handleUp = () => {
      if (edgeFrame !== null) cancelAnimationFrame(edgeFrame)
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      setDragging(false)
      onScrubEnd()
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  // ── Drag de fronteras compartidas ──

  const startBoundaryDrag = (
    event: React.MouseEvent,
    handleId: string,
    left: SceneDetail,
    right: SceneDetail,
  ) => {
    if (
      timingBusy ||
      scenesLocked ||
      sceneTimingLocked(scenes, [left.id, right.id])
    )
      return
    event.preventDefault()
    event.stopPropagation()
    markManualInteraction()
    suppressClickRef.current = true

    setDragging(true)
    setHoverSeconds(null)
    setActiveTrimHandle(handleId)

    const startX = event.clientX
    const initialBoundary = left.endSeconds ?? 0
    // La frontera vigente vive en esta variable y no en estado de React: el
    // mouseup corre con la clausura del mousedown y no vería nada que el
    // drag hubiera cambiado por setState.
    let boundary = initialBoundary

    const handleMove = (moveEvent: MouseEvent) => {
      // Delta directo sobre px/seg — NUNCA vía secondsAtClientX, que clampea
      // en 0 y rompía el drag cerca del inicio (bug pagado en el origen).
      const delta = (moveEvent.clientX - startX) / pxPerSecond
      // Piso duro de 1s por escena, a ambos lados de la frontera.
      boundary = clampBoundarySeconds(left, right, initialBoundary + delta)
      onBoundaryDrag(left.id, right.id, boundary)
    }
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      setDragging(false)
      setActiveTrimHandle(null)
      // Un clic sin movimiento no guarda nada (y no marca el video como
      // desactualizado).
      if (boundary !== initialBoundary)
        onBoundaryCommit(left.id, right.id, boundary)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  const handleBoundaryKey = (
    event: React.KeyboardEvent,
    left: SceneDetail,
    right: SceneDetail,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    if (
      timingBusy ||
      scenesLocked ||
      sceneTimingLocked(scenes, [left.id, right.id])
    )
      return
    markManualInteraction()
    const step = event.shiftKey ? 1 : 0.1
    const initial = left.endSeconds ?? 0
    const boundary = clampBoundarySeconds(
      left,
      right,
      initial + (event.key === 'ArrowRight' ? step : -step),
    )
    if (boundary === initial) return
    onBoundaryDrag(left.id, right.id, boundary)
    onBoundaryCommit(left.id, right.id, boundary)
  }

  const seekSecondsAtClientX = (clientX: number) => {
    const seconds = secondsAtClientX(clientX)
    if (duration - seconds < TIMELINE_END_SNAP_SECONDS) return duration
    return seconds
  }

  const handleTrackHover = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    if (dragging || event.buttons !== 0 || target.closest(NO_SEEK_SELECTOR)) {
      setHoverSeconds(null)
      return
    }
    setHoverSeconds(seekSecondsAtClientX(event.clientX))
  }

  // ── Click en zona vacía del carril: seek con play ──

  const handleTrackClick = (event: React.MouseEvent) => {
    // El flag se consume SIEMPRE: un drag que suelta sobre un elemento
    // noseek no debe dejarlo armado y comerse el próximo click legítimo.
    const wasSuppressed = suppressClickRef.current
    suppressClickRef.current = false

    const target = event.target as HTMLElement
    if (target.closest(NO_SEEK_SELECTOR)) return
    if (wasSuppressed) return

    onSeek(seekSecondsAtClientX(event.clientX))
  }

  // ── Orden de las pistas ──

  // Reordenar pistas: puntero (con tolerancia, para no robarle el clic a los
  // botones) y teclado (espacio + flechas sobre el asa).
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: TIMELINE_TRACK_DRAG_ACTIVATION_PX },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const handleTrackDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    if (!isTimelineTrackId(active.id) || !isTimelineTrackId(over.id)) return

    onReorderTracks(active.id, over.id)
  }

  // Lo que dnd-kit le dice al lector de pantalla (instrucciones del asa y
  // anuncios del arrastre), traducido y con el nombre de cada pista. Se
  // memoriza por idioma: dnd-kit vuelve a registrar su monitor de anuncios
  // cada vez que cambia la identidad de `announcements`, y el timeline se
  // re-renderiza unas 30 veces por segundo durante la reproducción.
  const announcements = useMemo(() => trackReorderAnnouncements(t), [t])
  const accessibility = useMemo(
    () => ({
      screenReaderInstructions: {
        draggable: t('library.editor.timeline.dragInstructions'),
      },
      announcements,
    }),
    [t, announcements],
  )

  // ── Regla adaptativa ──

  const majorStep =
    RULER_MAJOR_STEPS.find((step) => step * pxPerSecond >= 50) ??
    RULER_MAJOR_STEPS[RULER_MAJOR_STEPS.length - 1]
  const minorStep = majorStep / 5
  const showMinor = minorStep * pxPerSecond >= 6 && duration < 1800

  const majorMarks: number[] = []
  for (let seconds = 0; seconds <= duration; seconds += majorStep)
    majorMarks.push(seconds)
  const minorMarks: number[] = []
  if (showMinor) {
    for (let seconds = 0; seconds <= duration; seconds += minorStep) {
      if (Math.round(seconds / minorStep) % 5 !== 0) minorMarks.push(seconds)
    }
  }

  const rulerLabel = (seconds: number) =>
    seconds < 60 ? `${seconds}s` : formatTime(seconds)

  if (timedScenes.length === 0) return null

  const canZoomOut = zoomIndex > 0
  const canZoomIn = zoomIndex < TIMELINE_ZOOM_LEVELS.length - 1
  const trackTop = (index: number) =>
    TIMELINE_RULER_HEIGHT + index * TIMELINE_TRACK_HEIGHT
  const trackIndex = (id: TimelineTrackId) => visibleOrder.indexOf(id)

  return (
    <div className="select-none overflow-hidden rounded-2xl border-2 border-border bg-card">
      {/* Header: título · zoom · reloj */}
      <div className="flex h-9 items-center justify-between border-b border-border px-3">
        <span
          style={{ width: TIMELINE_SIDEBAR_WIDTH - 12 }}
          className="truncate font-display text-xs font-bold uppercase tracking-wide text-muted-foreground"
        >
          {t('library.editor.timeline.title')}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canZoomOut}
            onClick={() => onZoomChange(zoomIndex - 1)}
            aria-label={t('library.editor.timeline.zoomOut')}
            title={t('library.editor.timeline.zoomOut')}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-center font-mono text-[10px] text-muted-foreground">
            {pxPerSecond}px/s
          </span>
          <button
            type="button"
            disabled={!canZoomIn}
            onClick={() => onZoomChange(zoomIndex + 1)}
            aria-label={t('library.editor.timeline.zoomIn')}
            title={t('library.editor.timeline.zoomIn')}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="w-[140px] text-right font-mono text-xs tabular-nums text-muted-foreground">
          {formatTime(playheadSeconds)} / {formatTime(duration)}
        </span>
      </div>

      <div className="flex">
        {/* Sidebar fijo de labels (no scrollea) */}
        <div
          style={{ width: TIMELINE_SIDEBAR_WIDTH }}
          className="shrink-0 border-r border-border"
        >
          <div
            style={{ height: TIMELINE_RULER_HEIGHT }}
            className="border-b border-border/50"
          />
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            accessibility={accessibility}
            onDragEnd={handleTrackDragEnd}
          >
            <SortableContext
              items={visibleOrder}
              strategy={verticalListSortingStrategy}
            >
              {visibleOrder.map((id) => (
                <TimelineTrackHeader
                  key={id}
                  id={id}
                  Icon={TIMELINE_TRACK_ICONS[id]}
                  label={t(TIMELINE_TRACK_LABEL_KEYS[id])}
                  muted={layout.muted[id]}
                  locked={layout.locked[id]}
                  onToggleMuted={onToggleMuted}
                  onToggleLocked={onToggleLocked}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Carril scrolleable */}
        <div
          ref={scrollRef}
          onScroll={(event) => {
            setScrollLeft(event.currentTarget.scrollLeft)
            setHoverSeconds(null)
          }}
          onMouseDown={() => {
            // Una pulsación nueva no hereda el clic suprimido de un drag
            // que terminó fuera del carril. Los drags detienen el bubbling.
            suppressClickRef.current = false
            markManualInteraction()
          }}
          onTouchStart={markManualInteraction}
          className="cursor-crosshair overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div
            ref={contentRef}
            onDragOver={(event) => {
              if (
                !onAddSoundEffect ||
                soundEffectsDisabled ||
                !event.dataTransfer.types.includes(EDITOR_SOUND_EFFECT_MIME)
              )
                return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={(event) => {
              if (
                !onAddSoundEffect ||
                soundEffectsDisabled ||
                event.dataTransfer.getData(EDITOR_SOUND_EFFECT_MIME) !== 'click'
              )
                return
              event.preventDefault()
              event.stopPropagation()
              onAddSoundEffect(
                boundSoundEffectStart(
                  secondsAtClientX(event.clientX),
                  mediaDuration,
                  soundEffectDurationSeconds,
                ),
              )
            }}
            onClick={handleTrackClick}
            onMouseMove={handleTrackHover}
            onMouseLeave={() => setHoverSeconds(null)}
            style={{ width: totalWidth, height: tracksHeight }}
            className="relative"
          >
            {/* Regla */}
            <svg
              width={totalWidth}
              height={TIMELINE_RULER_HEIGHT}
              className="pointer-events-none absolute left-0 top-0 text-muted-foreground"
            >
              {minorMarks.map((seconds) => (
                <line
                  key={`minor-${seconds}`}
                  x1={xOfSeconds(seconds)}
                  x2={xOfSeconds(seconds)}
                  y1={TIMELINE_RULER_HEIGHT - 6}
                  y2={TIMELINE_RULER_HEIGHT}
                  stroke="currentColor"
                  strokeWidth={0.5}
                  opacity={0.4}
                />
              ))}
              {majorMarks.map((seconds) => (
                <g key={`major-${seconds}`}>
                  <line
                    x1={xOfSeconds(seconds)}
                    x2={xOfSeconds(seconds)}
                    y1={TIMELINE_RULER_HEIGHT - 12}
                    y2={TIMELINE_RULER_HEIGHT}
                    stroke="currentColor"
                    strokeWidth={1}
                    opacity={0.7}
                  />
                  <text
                    x={xOfSeconds(seconds)}
                    y={TIMELINE_RULER_HEIGHT - 16}
                    textAnchor="middle"
                    fill="currentColor"
                    className="font-mono text-[10px]"
                  >
                    {rulerLabel(seconds)}
                  </text>
                </g>
              ))}
            </svg>

            {/* Pista V1: escenas */}
            <div
              style={{
                top: trackTop(trackIndex('scenes')),
                height: TIMELINE_TRACK_HEIGHT,
              }}
              className="absolute left-0 w-full border-b border-border/50"
            >
              {blocks.map((block, index) => {
                const left = xOfSeconds(block.startSeconds)
                const width = Math.max(xOfSeconds(block.endSeconds) - left, 4)
                const previous = blocks[index - 1]
                const next = blocks[index + 1]
                const boundaries = [
                  { edge: 'left', before: previous, after: block },
                  { edge: 'right', before: block, after: next },
                ] as const
                const handleWidth = Math.min(
                  TIMELINE_TRIM_WIDTH,
                  Math.max(2, (width - TIMELINE_TRIM_INSET * 2 - 2) / 2),
                )
                // Los tiempos cambian al recortar. La identidad usa la escena
                // y el clip anterior para conservar foco y distinguir sus restos.
                const key = timelineBlockKey(block, previous)
                return (
                  <div
                    key={key}
                    style={{ left, width }}
                    className="group/timeline-block absolute top-0 h-full"
                  >
                    {block.kind === 'clip' && (
                      <TimelineClipItem
                        block={block}
                        selected={block.scenes.some(
                          (scene) => scene.id === selectedSceneId,
                        )}
                        progress={sceneAnimationProgress[block.lead.id]}
                        errorKey={sceneAnimationErrors[block.lead.id]?.key}
                        versions={sceneVersions}
                        onSelect={() => onSelectScene(block.lead.id)}
                      />
                    )}
                    {block.kind === 'avatar' && (
                      <TimelineAvatarItem
                        block={block}
                        selected={block.scene.id === selectedSceneId}
                        rendering={sceneAvatarRendering[block.scene.id]}
                        version={sceneVersions[block.scene.id]}
                        onSelect={() => onSelectScene(block.scene.id)}
                      />
                    )}
                    {block.kind === 'scene' && (
                      <TimelineSceneItem
                        scene={block.scene}
                        selected={block.scene.id === selectedSceneId}
                        transientStatus={sceneStatus[block.scene.id]}
                        errorKey={sceneErrors[block.scene.id]}
                        animationActivity={sceneAnimationStatus[block.scene.id]}
                        animationProgress={
                          sceneAnimationProgress[block.scene.id]
                        }
                        animationErrorKey={
                          sceneAnimationErrors[block.scene.id]?.key
                        }
                        planned={plannedSceneIds.includes(block.scene.id)}
                        version={sceneVersions[block.scene.id]}
                        onSelect={() => onSelectScene(block.scene.id)}
                      />
                    )}
                    {boundaries.map(({ edge, before, after }) => {
                      if (!before || !after) return null
                      const leftScene = lastSceneOf(before)
                      const rightScene = firstSceneOf(after)
                      if (
                        scenesLocked ||
                        leftScene.id === rightScene.id ||
                        sceneTimingLocked(scenes, [leftScene.id, rightScene.id])
                      )
                        return null
                      // Los dos lados comparten tiempos, pero sólo el asa que
                      // inició el gesto debe permanecer visible al arrastrar.
                      const handleId = `${key}-${edge}`
                      return (
                        <button
                          key={edge}
                          type="button"
                          role="separator"
                          aria-orientation="vertical"
                          aria-disabled={timingBusy}
                          data-timeline-trim-edge={edge}
                          style={{
                            width: handleWidth,
                            [edge]: TIMELINE_TRIM_INSET,
                          }}
                          aria-valuenow={leftScene.endSeconds}
                          aria-valuemin={
                            (leftScene.startSeconds ?? 0) + MIN_SCENE_SECONDS
                          }
                          aria-valuemax={
                            (rightScene.endSeconds ?? 0) - MIN_SCENE_SECONDS
                          }
                          aria-valuetext={formatTime(leftScene.endSeconds ?? 0)}
                          aria-label={t('library.editor.timeline.boundary')}
                          title={t('library.editor.timeline.boundary')}
                          {...NO_SEEK_PROPS}
                          onMouseDown={(event) =>
                            startBoundaryDrag(
                              event,
                              handleId,
                              leftScene,
                              rightScene,
                            )
                          }
                          onKeyDown={(event) =>
                            handleBoundaryKey(event, leftScene, rightScene)
                          }
                          className={cn(
                            'absolute top-1/2 z-40 flex h-6 -translate-y-1/2 items-center justify-center rounded-[3px] bg-gradient-to-b from-[#FFF1C2] via-[#FFE5A3] to-[#F5D582] text-[#725516] shadow-[inset_0_0_0_1px_rgba(161,119,31,0.2),inset_0_1px_0_rgba(255,255,255,0.7)] outline-none hover:brightness-105 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#A77B20]',
                            timingBusy ? 'cursor-wait' : 'cursor-ew-resize',
                            activeTrimHandle === handleId
                              ? 'opacity-100'
                              : 'opacity-0',
                            activeTrimHandle === null &&
                              'transition-[opacity,filter] duration-150 hover:opacity-100 focus-visible:opacity-100',
                          )}
                        >
                          <span
                            aria-hidden
                            className="h-3 w-px rounded-full bg-current"
                          />
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* El marcador queda en la frontera; el recorte visible tiene prioridad. */}
            {transitions.map((transition) => (
              <div
                key={'transition-' + transition.seconds}
                data-transition-start={transition.seconds}
                style={{
                  left: xOfSeconds(transition.seconds) - transition.width / 2,
                  width: transition.width,
                  top:
                    trackTop(trackIndex('scenes')) +
                    (TIMELINE_TRACK_HEIGHT - TIMELINE_TRANSITION_HEIGHT) / 2,
                  height: TIMELINE_TRANSITION_HEIGHT,
                }}
                className="pointer-events-none absolute z-30 rounded-[4px] border border-slate-300/70 bg-slate-100/85 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-100 focus-within:border-[#C9A251] focus-within:bg-[#FFF4D6] dark:border-white/20 dark:bg-zinc-200/85 dark:hover:bg-zinc-100"
              >
                <button
                  type="button"
                  {...NO_SEEK_PROPS}
                  aria-label={t('library.editor.transitions.marker', {
                    from: transition.from,
                    to: transition.to,
                  })}
                  title={t('library.editor.transitions.marker', {
                    from: transition.from,
                    to: transition.to,
                  })}
                  onClick={() => onSelectScene(transition.to)}
                  className="pointer-events-auto flex h-full w-full items-center justify-center overflow-hidden rounded-[3px] text-slate-700 outline-none"
                >
                  <Shuffle aria-hidden className="h-3 w-3 shrink-0" />
                </button>
              </div>
            ))}

            {/* Pista A1: narración */}
            <div
              style={{
                top: trackTop(trackIndex('narration')),
                height: TIMELINE_TRACK_HEIGHT,
              }}
              className="absolute left-0 w-full border-b border-border/50"
            >
              {narrationSrc && (
                <button
                  type="button"
                  {...NO_SEEK_PROPS}
                  disabled={layout.locked.narration}
                  onClick={onOpenAudio}
                  aria-label={t('library.editor.timeline.openAudio')}
                  style={{ width: xOfSeconds(duration) }}
                  className="absolute bottom-1 top-1 left-0 overflow-hidden rounded-md border-2 border-ocean/60 bg-ocean/20 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                />
              )}
              {narrationPeaks && (
                <TimelineWaveform
                  audio={narrationPeaks}
                  loop={false}
                  timelineSeconds={duration}
                  pxPerSecond={pxPerSecond}
                  scrollLeft={scrollLeft}
                  viewportWidth={viewportWidth}
                  colorVariable="--ocean"
                />
              )}
            </div>

            {/* Pista A2: música */}
            <div
              style={{
                top: trackTop(trackIndex('music')),
                height: TIMELINE_TRACK_HEIGHT,
              }}
              className="absolute left-0 w-full border-b border-border/50"
            >
              {musicSrc ? (
                <>
                  <button
                    type="button"
                    {...NO_SEEK_PROPS}
                    disabled={layout.locked.music}
                    onClick={onOpenMusic}
                    aria-label={t('library.editor.timeline.openMusic')}
                    style={{ width: xOfSeconds(duration) }}
                    className="absolute bottom-1 top-1 left-0 overflow-hidden rounded-md border-2 border-lavender/70 bg-lavender/25 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  {musicPeaks && (
                    <TimelineWaveform
                      audio={musicPeaks}
                      loop
                      timelineSeconds={mediaDuration}
                      pxPerSecond={pxPerSecond}
                      scrollLeft={scrollLeft}
                      viewportWidth={viewportWidth}
                      colorVariable="--lavender"
                    />
                  )}
                </>
              ) : (
                <button
                  type="button"
                  {...NO_SEEK_PROPS}
                  disabled={layout.locked.music}
                  onClick={onOpenMusic}
                  style={{ left: 8, width: Math.max(totalWidth - 16, 80) }}
                  className="absolute bottom-1 top-1 rounded-md border-2 border-dashed border-border font-body text-xs text-muted-foreground hover:border-lavender/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('library.editor.timeline.noMusic')}
                </button>
              )}
            </div>

            {/* Efectos: duración fija del asset, movimiento sin recorte. */}
            {soundEffects.length > 0 && (
              <div
                data-timeline-track="sfx"
                style={{
                  top: trackTop(trackIndex('sfx')),
                  height: TIMELINE_TRACK_HEIGHT,
                }}
                className="absolute left-0 w-full border-b border-border/50"
              >
                {soundEffects.map((instance) => (
                  <TimelineSoundEffectItem
                    key={instance.id}
                    instance={instance}
                    durationSeconds={soundEffectDurationSeconds}
                    timelineSeconds={mediaDuration}
                    pxPerSecond={pxPerSecond}
                    disabled={
                      soundEffectsDisabled ||
                      !onMoveSoundEffect ||
                      !onRemoveSoundEffect
                    }
                    muted={layout.muted.sfx}
                    onMove={(id, seconds) => onMoveSoundEffect?.(id, seconds)}
                    onRemove={(id) => onRemoveSoundEffect?.(id)}
                  />
                ))}
              </div>
            )}

            {/* Azul: anticipa el seek de una zona navegable sin alterar el reloj. */}
            {hoverSeconds !== null && !dragging && (
              <div
                aria-hidden
                data-timeline-hover-seconds={hoverSeconds}
                style={{ left: xOfSeconds(hoverSeconds) }}
                className="pointer-events-none absolute top-1 bottom-0 z-40 w-0 text-blue-500"
              >
                <svg
                  viewBox="0 0 18 16"
                  className="absolute -left-[9px] top-0 h-4 w-[18px] fill-current"
                >
                  <path d="M2 0h14a2 2 0 0 1 1.72 3L10.72 15a2 2 0 0 1-3.44 0L.28 3A2 2 0 0 1 2 0Z" />
                </svg>
                <span className="absolute -left-px top-5 bottom-0 w-0.5 rounded-t bg-blue-500/60" />
              </div>
            )}

            {/* Rojo: posición de reproducción y arrastre real del playhead. */}
            <div
              {...NO_SEEK_PROPS}
              data-timeline-playhead-seconds={playheadSeconds}
              onMouseDown={startPlayheadDrag}
              style={{ left: xOfSeconds(playheadSeconds) - 9 }}
              className="absolute top-1 bottom-0 z-50 w-[18px] cursor-ew-resize text-red-500"
            >
              <svg
                aria-hidden
                viewBox="0 0 18 16"
                className="absolute left-0 top-0 h-4 w-[18px] fill-current"
              >
                <path d="M2 0h14a2 2 0 0 1 1.72 3L10.72 15a2 2 0 0 1-3.44 0L.28 3A2 2 0 0 1 2 0Z" />
              </svg>
              <span
                aria-hidden
                className="absolute left-2 top-5 bottom-0 w-0.5 rounded-t bg-red-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
