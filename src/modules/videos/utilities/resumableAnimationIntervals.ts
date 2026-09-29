import {
  animationUnitFromBlock,
  overlapsShortFinalAnimationScene,
} from '@pipeline/animation/planner.ts'
import { sceneAnimationBlocks } from '@pipeline/animation/scene-blocks.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// Un recibo histórico que alcanza la cola corta protege todo su grupo, incluso
// la escena anterior: omitir la cola no autoriza comprar de nuevo esa parte.
export function shortTailPendingAnimationUnits(scenes: SceneDetail[]) {
  return scenes.flatMap((scene) => {
    const animations = [
      ...sceneAnimationBlocks(scene).filter(
        (animation) => animation.status !== 'ready' || !animation.clipPath,
      ),
      ...(scene.animationPending ?? []),
    ]
    return animations
      .map((animation) => animationUnitFromBlock(scene.id, animation, scenes))
      .filter((unit) => overlapsShortFinalAnimationScene(scenes, unit))
  })
}

// Reanudar una tarea ya cobrada no exige presupuesto para otra generación.
// La descarga y normalización pendientes permanecen disponibles con saldo cero.
export function resumableAnimationIntervals(scenes: SceneDetail[]) {
  return scenes.flatMap((scene) => {
    const animations = [
      ...sceneAnimationBlocks(scene).filter(
        (animation) => animation.status !== 'ready' || !animation.clipPath,
      ),
      ...(scene.animationPending ?? []),
    ]
    return animations
      .filter((animation) => animation.canResumeTask)
      .flatMap((animation) => {
        const startSeconds =
          animation.startSeconds ??
          scenes.find((item) => item.id === animation.sceneIds[0])?.startSeconds
        const endSeconds =
          animation.endSeconds ??
          scenes.find((item) => item.id === animation.sceneIds.at(-1))
            ?.endSeconds
        if (startSeconds === undefined || endSeconds === undefined) return []
        if (
          !Number.isFinite(startSeconds) ||
          !Number.isFinite(endSeconds) ||
          endSeconds <= startSeconds
        )
          return []
        if (
          overlapsShortFinalAnimationScene(scenes, { startSeconds, endSeconds })
        )
          return []
        return [
          {
            startSeconds,
            endSeconds,
            canRecoverLocally: animation.canRecoverLocally === true,
          },
        ]
      })
  })
}
