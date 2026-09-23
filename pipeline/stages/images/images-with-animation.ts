import {
  generateSceneAnimations,
  hasAnimationWork,
} from '../../animation/generate.ts'
import {
  animatesWholeVideo,
  hasAutomaticAnimation,
} from '../../animation/scope.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { Stage } from '../../runner/stage.ts'
import type { CreateVideoContext } from '../context.ts'
import { imagesStage } from './images.ts'

// Mantiene las seis fases y la implementación de imágenes. La fase no se
// saltea solo porque haya JPG si todavía falta el prefijo animado solicitado.
export const imagesWithAnimationStage: Stage<CreateVideoContext> = {
  id: imagesStage.id,
  async skip(context) {
    return (
      (await imagesStage.skip?.(context)) === true &&
      !(await hasAnimationWork(context))
    )
  },
  async run(context) {
    if (!(await imagesStage.skip?.(context))) {
      const outcome = await imagesStage.run(context)
      if (outcome?.pause) return outcome
    }
    context.signal.throwIfAborted()
    if (!hasAutomaticAnimation(context.options) || context.regenerateSceneIds)
      return
    const result = await generateSceneAnimations(context, {
      minutes: animatesWholeVideo(context.options)
        ? undefined
        : context.options.animationMinutes,
    })
    context.signal.throwIfAborted()
    if (result.failed.length || result.rejected.length)
      throw new PipelineFailure(
        'animation_incomplete',
        'The requested animated interval still has failed units',
      )
  },
}
