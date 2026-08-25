// Constantes del ensamblado (port de renderer.ts del origen). Los valores
// vienen de mediciones reales del origen — no ajustarlos sin medir.

export const FPS = 25
export const FRAME_WIDTH = 1920
export const FRAME_HEIGHT = 1080

// Movimiento de cámara "evidente pero sutil": TODA escena se mueve con un
// zoom/paneo perceptible (sin marear).
export const ZOOM_MAX = 1.11
export const ZOOM_PAN = 1.1

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

// Colita visual tras el fin del audio: la última imagen no corta en seco.
export const PAD_MARGIN_SECONDS = 0.2

// Versión del cache de chunks: bumpearla invalida todos los manifests.
export const RENDER_CACHE_VERSION = 2
