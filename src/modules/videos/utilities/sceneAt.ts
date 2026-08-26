import type { SceneDetail } from '@pipeline/types/video-project.ts'

// Escena cuyo tramo [start, end) contiene el instante dado; pasado el final,
// la última. undefined solo si no hay escenas.
export function sceneAt(
  scenes: SceneDetail[],
  seconds: number,
): SceneDetail | undefined {
  const match = scenes.find(
    (scene) =>
      scene.startSeconds !== undefined &&
      scene.endSeconds !== undefined &&
      seconds >= scene.startSeconds &&
      seconds < scene.endSeconds,
  )
  return match ?? scenes[scenes.length - 1]
}
