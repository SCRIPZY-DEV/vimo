import { useEffect, useRef } from 'react'
import type { AudioPeaks } from '@/modules/videos/hooks/useAudioPeaks'
import {
  drawWaveform,
  prepareCanvas,
  resolveCanvasColor,
} from '@/modules/videos/utilities/drawWaveform'

interface TimelineWaveformProps {
  audio: AudioPeaks
  // La música se repite más allá de su duración (el render la loopea).
  loop: boolean
  // Fin del carril en segundos (hasta dónde pintar).
  timelineSeconds: number
  pxPerSecond: number
  // Ventana visible del carril (ver el comentario del componente).
  scrollLeft: number
  viewportWidth: number
  // Variable CSS del color (p. ej. '--ocean'): canvas no resuelve var().
  colorVariable: string
}

// Forma de onda de una pista de audio, pintada en canvas desde los picos
// pre-decodificados. Solo dibuja la ventana visible y se redibuja al
// scrollear/zoomear: un canvas del ancho total reventaría el límite del
// navegador (10 min a 240 px/s = 144.000 px).
export function TimelineWaveform({
  audio,
  loop,
  timelineSeconds,
  pxPerSecond,
  scrollLeft,
  viewportWidth,
  colorVariable,
}: TimelineWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || viewportWidth <= 0) return

    const context = canvas.getContext('2d')
    if (!context) return

    const height = canvas.clientHeight
    prepareCanvas(canvas, context, viewportWidth, height)
    context.fillStyle = resolveCanvasColor(canvas, colorVariable)
    drawWaveform(context, {
      audio,
      loop,
      timelineSeconds,
      pxPerSecond,
      scrollLeft,
      viewportWidth,
      height,
    })
  }, [
    audio,
    loop,
    timelineSeconds,
    pxPerSecond,
    scrollLeft,
    viewportWidth,
    colorVariable,
  ])

  if (audio.seconds <= 0) return null

  return (
    // pointer-events-none: el hit-area del click vive en la pista contenedora.
    <canvas
      ref={canvasRef}
      style={{ left: scrollLeft, width: viewportWidth }}
      className="pointer-events-none absolute top-1 h-[calc(100%-8px)] opacity-80"
    />
  )
}
