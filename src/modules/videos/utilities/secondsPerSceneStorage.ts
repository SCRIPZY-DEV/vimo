import {
  SECONDS_PER_SCENE_DEFAULT,
  SECONDS_PER_SCENE_MAX,
  SECONDS_PER_SCENE_MIN,
  SECONDS_PER_SCENE_STORAGE_KEY,
} from '@/modules/videos/constants'

// El último valor de segundos-por-escena elegido en el diálogo, recordado
// entre videos (port del default en localStorage del origen). Lecturas y
// escrituras defensivas: sin valor (o con basura) vale el default.

export function readStoredSecondsPerScene(): number {
  try {
    const raw = window.localStorage.getItem(SECONDS_PER_SCENE_STORAGE_KEY)
    if (raw === null) return SECONDS_PER_SCENE_DEFAULT
    const parsed = Math.round(Number(raw))
    if (!Number.isFinite(parsed)) return SECONDS_PER_SCENE_DEFAULT
    return Math.min(
      SECONDS_PER_SCENE_MAX,
      Math.max(SECONDS_PER_SCENE_MIN, parsed),
    )
  } catch {
    return SECONDS_PER_SCENE_DEFAULT
  }
}

export function storeSecondsPerScene(seconds: number): void {
  try {
    window.localStorage.setItem(SECONDS_PER_SCENE_STORAGE_KEY, String(seconds))
  } catch {
    // Storage bloqueado: el default vuelve la próxima vez, nada que romper.
  }
}
