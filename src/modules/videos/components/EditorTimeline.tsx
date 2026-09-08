import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Film, Mic, Minus, Music2, Plus } from 'lucide-react'
import { clamp } from '@/modules/common/utilities/clamp'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { TimelineSceneItem } from '@/modules/videos/components/TimelineSceneItem'
import { TimelineWaveform } from '@/modules/videos/components/TimelineWaveform'
import {
  AUTOSCROLL_EDGE_PX,
  AUTOSCROLL_MANUAL_PAUSE_MS,
  NO_SEEK_PROPS,
  NO_SEEK_SELECTOR,
  PLAYHEAD_EDGE_DRAG_MAX_SPEED,
  PLAYHEAD_EDGE_DRAG_MIN_SPEED,
  PLAYHEAD_EDGE_DRAG_PX,
  RULER_MAJOR_STEPS,
  TIMELINE_END_SNAP_SECONDS,
  TIMELINE_RULER_HEIGHT,
  TIMELINE_SIDEBAR_WIDTH,
  TIMELINE_TRACK_HEIGHT,
  TIMELINE_ZOOM_LEVELS,
} from '@/modules/videos/constants'
import { useAudioPeaks } from '@/modules/videos/hooks/useAudioPeaks'
import { clampBoundarySeconds } from '@/modules/videos/utilities/clampBoundarySeconds'
import type { SceneDetail } from '@pipeline/types/video-project.ts'
import type { SceneImageStatus } from '@pipeline/types/scenes.ts'

interface EditorTimelineProps {
  scenes: SceneDetail[]
  durationSeconds: number
  playheadSeconds: number
  selectedSceneId: number | null
  sceneStatus: Record<number, SceneImageStatus>
  // Motivo (clave i18n) del último fallo de regeneración por escena.
  sceneErrors: Record<number, string>
  sceneVersions: Record<number, number>
  narrationSrc: string | null
  musicSrc: string | null
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
  durationSeconds,
  playheadSeconds,
  selectedSceneId,
  sceneStatus,
  sceneErrors,
  sceneVersions,
  narrationSrc,
  musicSrc,
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
  const duration = Math.max(
    durationSeconds,
    ...timedScenes.map((scene) => scene.endSeconds ?? 0),
    1,
  )
  const totalWidth = Math.max(duration * pxPerSecond + 16, viewportWidth)
  const tracksHeight = TIMELINE_RULER_HEIGHT + 3 * TIMELINE_TRACK_HEIGHT

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

  // Cmd/Ctrl + rueda = zoom (estilo CapCut). Listener nativo: React registra
  // wheel como pasivo y el preventDefault no funcionaría.
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const handleWheel = (event: WheelEvent) => {
      markManualInteraction()
      if (!event.metaKey && !event.ctrlKey) return
      event.preventDefault()
      const direction = event.deltaY < 0 ? 1 : -1
      const next = Math.max(
        0,
        Math.min(TIMELINE_ZOOM_LEVELS.length - 1, zoomIndex + direction),
      )
      if (next !== zoomIndex) onZoomChange(next)
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

  // ── Drag del playhead (seek sin play) con autoscroll por borde ──

  const startPlayheadDrag = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    markManualInteraction()
    onScrubStart()
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
      onScrubEnd()
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  // ── Drag de fronteras compartidas ──

  const startBoundaryDrag = (
    event: React.MouseEvent,
    left: SceneDetail,
    right: SceneDetail,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    markManualInteraction()
    suppressClickRef.current = true

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
      // Un clic sin movimiento no guarda nada (y no marca el video como
      // desactualizado).
      if (boundary !== initialBoundary)
        onBoundaryCommit(left.id, right.id, boundary)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
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

    let seconds = secondsAtClientX(event.clientX)
    // Snap al final: clickear la cola lleva exactamente al cierre.
    if (duration - seconds < TIMELINE_END_SNAP_SECONDS) seconds = duration
    onSeek(seconds)
  }

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
          {[
            { Icon: Film, label: t('library.editor.timeline.scenes') },
            { Icon: Mic, label: t('library.editor.timeline.narration') },
            { Icon: Music2, label: t('library.editor.timeline.music') },
          ].map(({ Icon, label }) => (
            <div
              key={label}
              style={{ height: TIMELINE_TRACK_HEIGHT }}
              className="flex items-center gap-1.5 border-b border-border/50 px-2 last:border-b-0"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-display text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Carril scrolleable */}
        <div
          ref={scrollRef}
          onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
          onMouseDown={markManualInteraction}
          onTouchStart={markManualInteraction}
          className="cursor-crosshair overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div
            ref={contentRef}
            onClick={handleTrackClick}
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
              style={{ top: trackTop(0), height: TIMELINE_TRACK_HEIGHT }}
              className="absolute left-0 w-full border-b border-border/50"
            >
              {timedScenes.map((scene, index) => {
                const left = xOfSeconds(scene.startSeconds ?? 0)
                const width = Math.max(
                  xOfSeconds(scene.endSeconds ?? 0) - left,
                  4,
                )
                const next = timedScenes[index + 1]
                return (
                  <div
                    key={scene.id}
                    style={{ left, width }}
                    className="absolute top-0 h-full"
                  >
                    <TimelineSceneItem
                      scene={scene}
                      selected={scene.id === selectedSceneId}
                      transientStatus={sceneStatus[scene.id]}
                      errorKey={sceneErrors[scene.id]}
                      version={sceneVersions[scene.id]}
                      onSelect={() => onSelectScene(scene.id)}
                    />
                    {next && (
                      <div
                        role="separator"
                        aria-label={t('library.editor.timeline.boundary')}
                        {...NO_SEEK_PROPS}
                        onMouseDown={(event) =>
                          startBoundaryDrag(event, scene, next)
                        }
                        className="absolute -right-1.5 top-0 z-30 h-full w-3 cursor-ew-resize hover:bg-saffron/50"
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Pista A1: narración */}
            <div
              style={{ top: trackTop(1), height: TIMELINE_TRACK_HEIGHT }}
              className="absolute left-0 w-full border-b border-border/50"
            >
              {narrationSrc && (
                <button
                  type="button"
                  {...NO_SEEK_PROPS}
                  onClick={onOpenAudio}
                  aria-label={t('library.editor.timeline.openAudio')}
                  style={{ width: xOfSeconds(duration) }}
                  className="absolute bottom-1 top-1 left-0 overflow-hidden rounded-md border-2 border-ocean/60 bg-ocean/20 hover:brightness-110"
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
              style={{ top: trackTop(2), height: TIMELINE_TRACK_HEIGHT }}
              className="absolute left-0 w-full"
            >
              {musicSrc ? (
                <>
                  <button
                    type="button"
                    {...NO_SEEK_PROPS}
                    onClick={onOpenMusic}
                    aria-label={t('library.editor.timeline.openMusic')}
                    style={{ width: xOfSeconds(duration) }}
                    className="absolute bottom-1 top-1 left-0 overflow-hidden rounded-md border-2 border-lavender/70 bg-lavender/25 hover:brightness-110"
                  />
                  {musicPeaks && (
                    <TimelineWaveform
                      audio={musicPeaks}
                      loop
                      timelineSeconds={duration}
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
                  onClick={onOpenMusic}
                  style={{ left: 8, width: Math.max(totalWidth - 16, 80) }}
                  className="absolute bottom-1 top-1 rounded-md border-2 border-dashed border-border font-body text-xs text-muted-foreground hover:border-lavender/60 hover:text-foreground"
                >
                  {t('library.editor.timeline.noMusic')}
                </button>
              )}
            </div>

            {/* Playhead: línea coral con cabezal rombo, arrastrable */}
            <div
              {...NO_SEEK_PROPS}
              onMouseDown={startPlayheadDrag}
              style={{ left: xOfSeconds(playheadSeconds) - 6 }}
              className="absolute top-0 z-40 h-full w-3 cursor-ew-resize"
            >
              <span className="absolute left-[4.5px] top-0 h-full w-[3px] bg-coral" />
              <span className="absolute -left-0.5 top-0 h-4 w-4 rotate-45 rounded-[2px] bg-coral" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
