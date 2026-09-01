import type { VideoFormat } from '@pipeline/types/video-format.ts'

// Espejo cliente de pipeline/types/video-format.ts (el alias @pipeline es
// solo import type: los helpers runtime viven acá; port de formatoVideo.ts
// del origen).

export function isVertical(format: VideoFormat): boolean {
  return format === '9:16'
}

// Clase de aspecto para contenedores de media según el formato.
export function aspectClass(format: VideoFormat): string {
  return isVertical(format) ? 'aspect-[9/16]' : 'aspect-video'
}

// Ancho exacto del video dentro de un contenedor con `container-type: size`:
// llena alto o ancho sin recortar (port de anchoExactoEnContenedor).
export function exactWidthInContainer(format: VideoFormat): string {
  return isVertical(format)
    ? 'min(100cqw, calc(100cqh * 9 / 16))'
    : 'min(100cqw, calc(100cqh * 16 / 9))'
}
