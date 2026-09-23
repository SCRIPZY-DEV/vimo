// Lectura compatible y pura: el manifiesto nuevo permite varios intervalos por escena.
export function sceneAnimationBlocks<T>(scene: {
  animation?: T
  animations?: T[]
}): T[] {
  return scene.animations ?? (scene.animation ? [scene.animation] : [])
}
