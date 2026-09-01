// Formato del video: horizontal clásico o vertical para shorts. Archivo puro
// y browser-safe: la UI consume el tipo con `import type` y estos helpers no
// tocan APIs de Node. Las dimensiones viajan SIEMPRE por parámetro (nunca una
// variable de módulo mutable): es la decisión del origen que garantiza que un
// proyecto sin formato renderice byte-idéntico a hoy.

export type VideoFormat = '16:9' | '9:16'

export interface FrameSize {
  width: number
  height: number
}

export const DEFAULT_VIDEO_FORMAT: VideoFormat = '16:9'

export const FRAME_SIZES: Record<VideoFormat, FrameSize> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
}

// Ausente = 16:9: los proyectos previos al selector se comportan igual
// (retrocompatibilidad por identidad, sin migración).
export function videoFormatOf(options: {
  videoFormat?: VideoFormat
}): VideoFormat {
  return options.videoFormat ?? DEFAULT_VIDEO_FORMAT
}

export function frameSizeFor(format: VideoFormat): FrameSize {
  return FRAME_SIZES[format]
}

export function isVerticalFormat(format: VideoFormat): boolean {
  return format === '9:16'
}
