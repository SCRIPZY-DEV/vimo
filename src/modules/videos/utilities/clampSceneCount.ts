import { MAX_SCENE_COUNT } from '@/modules/videos/constants'

// El input es texto libre: vacío, negativo o cero vuelven al fallback (0 en
// el formulario, que significa automático; la sugerencia al confirmar).
export function clampSceneCount(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback

  return Math.min(parsed, MAX_SCENE_COUNT)
}
