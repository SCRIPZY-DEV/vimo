import { SCENE_REMAINDER_MIN_FRACTION } from '@/modules/videos/constants'

// Cuántas escenas salen de N segundos, sin preguntarle al sidecar (port de
// estimarFragmentos del origen): ventanas enteras de N y el resto final
// cuenta como una más solo si alcanza el 30 % de una ventana. Sirve para que
// la cifra se mueva mientras se arrastra el slider; el valor bueno lo da el
// corte real (preview-scene-cuts) y lo reemplaza apenas llega.
export function estimateSceneCount(
  durationSeconds: number,
  secondsPerScene: number,
): number {
  if (!(durationSeconds > 0) || !(secondsPerScene > 0)) return 0
  const whole = Math.floor(durationSeconds / secondsPerScene)
  const remainder = durationSeconds - whole * secondsPerScene
  return Math.max(
    1,
    remainder >= secondsPerScene * SCENE_REMAINDER_MIN_FRACTION
      ? whole + 1
      : whole,
  )
}
