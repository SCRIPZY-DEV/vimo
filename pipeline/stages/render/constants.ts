// Constantes del ensamblado (port de renderer.ts del origen). Los valores
// vienen de mediciones reales del origen — no ajustarlos sin medir.

// Las dimensiones del frame ya no viven acá: dependen del formato del
// proyecto y viajan por parámetro (pipeline/types/video-format.ts).
export { ANIMATION_FPS as FPS } from '../../animation/timing.ts'

// Movimiento de cámara "evidente pero sutil": TODA escena se mueve con un
// zoom/paneo perceptible (sin marear).
export { ZOOM_MAX, ZOOM_PAN } from '../../animation/timing.ts'

// Escenas por chunk: evita el pthread_create EAGAIN de FFmpeg con >100 inputs.
export const CHUNK_SIZE = 30

// Watchdog de ESTANCAMIENTO: FFmpeg sano escribe progreso cada ~500ms; si no
// emite NINGÚN byte en este tiempo está muerto. No se mata al primer disparo:
// un wake-up tras suspend congela los timers y parece un cuelgue — período de
// gracia para que el FFmpeg recién despertado vuelva a hablar.
export const STALL_TIMEOUT_MS = 20 * 60_000
export const STALL_GRACE_MS = 90_000
export const STALL_CHECK_MS = 60_000

// Reparto del progreso global, reponderado con TIEMPOS MEDIDOS del origen
// (con la mezcla final en veryfast, chunks y mezcla quedan parejos).
export const CHUNKS_PROGRESS_SHARE = 0.45
export const CONCAT_PROGRESS_SHARE = 0.05

// Subtítulos quemados: blanco con borde negro y sombra, centrados abajo
// (Alignment=2). La fuente sale del lado CORTO del frame para que 16:9 y 9:16
// se lean igual; cada margen sale de SU eje, así el texto queda despegado del
// borde en los dos formatos.
export const SUBTITLE_FONT_NAME = 'Arial'
export const SUBTITLE_FONT_DIVISOR = 22
export const SUBTITLE_MARGIN_VERTICAL_DIVISOR = 18
export const SUBTITLE_MARGIN_HORIZONTAL_DIVISOR = 12
export const SUBTITLE_OUTLINE = 3
export const SUBTITLE_SHADOW = 1

// Colita visual tras el fin del audio: la última imagen no corta en seco.
export const PAD_MARGIN_SECONDS = 0.2

// Cuánto se clona el último cuadro de un clip de animación antes de recortar
// al tramo exacto (ADR-0040): cubre el redondeo de estirar/comprimir para que
// el chunk jamás quede más corto que su hueco.
export const ANIMATION_CLIP_PAD_SECONDS = 1

// Versión del cache de chunks: bumpearla invalida todos los manifests.
export const RENDER_CACHE_VERSION = 4
