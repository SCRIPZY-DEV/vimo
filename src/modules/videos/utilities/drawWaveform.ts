import type { AudioPeaks } from '@/modules/videos/hooks/useAudioPeaks'
import {
  WAVEFORM_MIN_BAR_HEIGHT,
  WAVEFORM_VERTICAL_PADDING,
} from '@/modules/videos/constants'

export interface DrawWaveformOptions {
  audio: AudioPeaks
  // La pista se repite más allá de su duración (el render la loopea).
  loop: boolean
  // Fin del carril en segundos (hasta dónde pintar).
  timelineSeconds: number
  pxPerSecond: number
  // Ventana visible del carril, en px del timeline.
  scrollLeft: number
  viewportWidth: number
  height: number
}

// Ajusta el backing store del canvas al devicePixelRatio y deja el contexto
// escalado en unidades CSS. setTransform (no scale) para no acumular escalas
// entre redibujos.
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)
}

// Resuelve una variable CSS de color (p. ej. '--ocean') a algo que canvas
// entienda: canvas no interpreta var() ni currentColor, así que el fallback
// es el color computado del elemento.
export function resolveCanvasColor(
  element: HTMLElement,
  colorVariable: string,
): string {
  const computed = getComputedStyle(element)
  const rawColor = computed.getPropertyValue(colorVariable).trim()
  return rawColor ? `hsl(${rawColor})` : computed.color
}

// Pinta una barra de amplitud por píxel visible, leyendo el bucket de picos
// que corresponde a ese instante del timeline.
export function drawWaveform(
  context: CanvasRenderingContext2D,
  options: DrawWaveformOptions,
) {
  const {
    audio,
    loop,
    timelineSeconds,
    pxPerSecond,
    scrollLeft,
    viewportWidth,
    height,
  } = options
  const { peaks, seconds } = audio
  const centerY = height / 2
  const usableHeight = height - WAVEFORM_VERTICAL_PADDING

  for (let x = 0; x < viewportWidth; x++) {
    const timelineTime = (scrollLeft + x) / pxPerSecond
    if (timelineTime > timelineSeconds) break

    const audioTime = loop ? timelineTime % seconds : timelineTime
    if (!loop && audioTime > seconds) break

    const bucket = Math.min(
      peaks.length - 1,
      Math.floor((audioTime / seconds) * peaks.length),
    )
    const barHeight = Math.max(
      WAVEFORM_MIN_BAR_HEIGHT,
      peaks[bucket] * usableHeight,
    )
    context.fillRect(x, centerY - barHeight / 2, 1, barHeight)
  }
}
