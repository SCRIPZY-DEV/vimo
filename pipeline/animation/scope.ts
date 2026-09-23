import type { VideoProjectOptions } from '../types/video-project.ts'

type AnimationScope = Pick<
  VideoProjectOptions,
  'animationMinutes' | 'animateWholeVideo' | 'videoFormat'
>

// La intención «todo» se conserva hasta conocer el audio; no se convierte
// en un número arbitrario de minutos al crear el proyecto.
export function animatesWholeVideo(options: AnimationScope): boolean {
  return options.videoFormat === '9:16' && options.animateWholeVideo === true
}

export function hasAutomaticAnimation(options: AnimationScope): boolean {
  return animatesWholeVideo(options) || (options.animationMinutes ?? 0) > 0
}

// El cortador y su confirmación ya trabajan con minutos. Resolverlos aquí,
// con el audio medido, permite reutilizarlos y conservar las seis fases.
export function effectiveAnimationMinutes(
  options: AnimationScope,
  durationSeconds: number,
): number {
  if (animatesWholeVideo(options)) return Math.ceil(durationSeconds / 60)
  return options.animationMinutes ?? 0
}

export function animationRangeEnd(
  minutes?: number,
  durationSeconds?: number,
): number {
  const end = minutes === undefined ? Number.POSITIVE_INFINITY : minutes * 60
  if (durationSeconds === undefined || !Number.isFinite(durationSeconds))
    return end
  return Math.min(end, Math.max(0, durationSeconds))
}
