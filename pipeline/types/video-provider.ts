import type { VideoFormat } from './video-format.ts'

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
// El prefijo usa dos imágenes de3s por clip de6s. El editor conserva sus cortes.
export const ANIMATION_PREFIX_IMAGE_SECONDS = 3
export const ANIMATION_PREFIX_SCENE_SECONDS = 6
// Compatibilidad de clips históricos de seis segundos.
export const ANIMATION_CLIP_SECONDS = 6
export const MIN_ANIMATION_STRETCH = 0.65
export const MAX_ANIMATION_SPEED_UP = 4 / 3
export const MIN_ANIMATION_SLOT_SECONDS = 3
export const MAX_ANIMATION_SLOT_SECONDS = 12
export const ANIMATION_SLOT_TOLERANCE_SECONDS = 0.04
// Resolución con la que se encarga y se normaliza un clip animado. Los usuarios
// siempre van en 480p: el 720p es un ajuste interno que solo sube el harness del
// pack demo, y las estimaciones de créditos de abajo siguen siendo de 480p.
export type AnimationResolution = '480p' | '720p'
export const DEFAULT_ANIMATION_RESOLUTION: AnimationResolution = '480p'
const ANIMATION_FRAME_HEIGHT: Record<AnimationResolution, number> = {
  '480p': 480,
  '720p': 720,
}
const ANIMATION_FRAME_WIDTH: Record<AnimationResolution, number> = {
  '480p': 854,
  '720p': 1280,
}
// El cuadro de normalización de un clip: horizontal en 16:9, el mismo
// girado en 9:16.
export function animationFrame(
  format: VideoFormat,
  resolution: AnimationResolution,
) {
  const long = ANIMATION_FRAME_WIDTH[resolution]
  const short = ANIMATION_FRAME_HEIGHT[resolution]
  if (format === '9:16') return { width: short, height: long }
  return { width: long, height: short }
}
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
