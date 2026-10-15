import type { SoundEffectInstance } from '@pipeline/types/sound-effects.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// Las anclas siguen la copia de trabajo durante un recorte; el sidecar vuelve
// a resolverlas contra disco antes de guardar o exportar.
export function resolvePreviewSoundEffects(
  instances: SoundEffectInstance[],
  scenes: SceneDetail[],
  durationSeconds: number,
): SoundEffectInstance[] {
  return instances.flatMap((instance) => {
    const startSeconds =
      instance.transitionSceneId === undefined
        ? instance.startSeconds
        : scenes.find((scene) => scene.id === instance.transitionSceneId)
            ?.startSeconds

    if (
      startSeconds === undefined ||
      !Number.isFinite(startSeconds) ||
      startSeconds < 0 ||
      startSeconds >= durationSeconds
    )
      return []
    if (instance.transitionSceneId !== undefined && startSeconds === 0)
      return []

    return [{ ...instance, startSeconds }]
  })
}
