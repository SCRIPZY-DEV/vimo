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

// Fase independiente: todas las imágenes ya existen. Reanudar consulta los
// recibos y solo completa intervalos pendientes; nunca recompra los listos.
export const animationStage: Stage<CreateVideoContext> = {
  id: 'animation',
  async skip(context) {
    return !(await hasAnimationWork(context))
  },
  async run(context) {
    context.signal.throwIfAborted()
    if (!hasAutomaticAnimation(context.options) || context.regenerateSceneIds)
      return
    const result = await generateSceneAnimations(context, {
      minutes: animatesWholeVideo(context.options)
        ? undefined
        : context.options.animationMinutes,
      pairPrefixScenes: true,
    })
    context.signal.throwIfAborted()
    if (result.failed.length || result.rejected.length)
      throw new PipelineFailure(
        'animation_incomplete',
        'The requested animated interval still has failed units',
      )
  },
}
