// Contratos compartidos con la UI; PoYo se conserva únicamente para leer proyectos históricos.
export type VideoProviderId = 'kie' | 'poyo'
export const VIDEO_PROVIDER_IDS: VideoProviderId[] = ['kie', 'poyo']
export const GROK_VIDEO_MODEL = 'grok-imagine-video-1-5-preview'
export const SEEDANCE_VIDEO_MODEL = 'bytedance/seedance-1.5-pro'
export const VIDEO_MODELS: Record<VideoProviderId, string> = {
  kie: GROK_VIDEO_MODEL,
  poyo: 'veo3.1-lite-official',
}
export const MIN_REQUESTED_ANIMATION_SECONDS = 4
export const MAX_REQUESTED_ANIMATION_SECONDS = 12
// Duración fija del prefijo animado al crear. El editor conserva los cortes existentes.
export const ANIMATION_PREFIX_SCENE_SECONDS = 6
// Compatibilidad de clips históricos de seis segundos.
export const ANIMATION_CLIP_SECONDS = 6
export const MIN_ANIMATION_STRETCH = 0.65
export const MAX_ANIMATION_SPEED_UP = 4 / 3
export const MIN_ANIMATION_SLOT_SECONDS = 3
export const MAX_ANIMATION_SLOT_SECONDS = 12
export const ANIMATION_SLOT_TOLERANCE_SECONDS = 0.04
export const ANIMATION_RESOLUTION = '480p'
// Catálogo público Kie consultado 2026-09-14. Estimaciones, nunca recibos de cobro.
export const VIDEO_CREDITS_PER_SECOND: Record<VideoProviderId, number> = {
  kie: 2.4,
  poyo: 3.6,
}
export const SEEDANCE_CREDITS_PER_SECOND = 1.75
// La FAQ de Kie declara que las tareas fallidas no se cobran. La estimación
// contempla una generación exitosa, no suma los intentos fallidos del respaldo.
export const VIDEO_CREDIT_USD = 0.005
// Diez carriles locales por proyecto protegen memoria/FFmpeg; no es cuota Kie.
// FAQ Kie verificada 2026-09-16: sin máximo estricto de tareas activas,
// hasta veinte nuevos encargos cada diez segundos (ventana móvil compartida).
export const ANIMATION_CONCURRENCY = 10
export const ANIMATION_CREATES_PER_WINDOW = 20
export const ANIMATION_CREATE_WINDOW_MS = 10000
