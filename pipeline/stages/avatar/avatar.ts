import {
  isAccountFailureCode,
  pendingAvatarScenes,
  renderAvatarScenes,
} from '../../avatar/render-scenes.ts'
import { readScenes } from '../../project/scenes-file.ts'
import { HEYGEN_PROVIDER } from '../../providers/avatar/heygen-errors.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { Stage } from '../../runner/stage.ts'
import type { CreateVideoContext } from '../context.ts'

// Fase `avatar` (ADR-0057, diseño §8): entre las imágenes y la animación de
// Kie. Cada escena de avatar se genera con HeyGen —el look con su propio
// fondo, en el formato del proyecto— y reanudar retoma solo lo que falta: los
// recibos viven en cada escena y nunca se paga dos veces. Una escena lista
// pero desactualizada no se regenera sola: cuesta, y lo decide la persona
// desde el editor (`avatar-render-scenes`).
export const avatarStage: Stage<CreateVideoContext> = {
  id: 'avatar',
  async skip(context) {
    if (context.options.demo || context.regenerateSceneIds) return true

    const scenes = await readScenes(context.paths)
    if (!scenes) return true

    return (await pendingAvatarScenes(context.paths, scenes)).length === 0
  },
  async run(context) {
    context.signal.throwIfAborted()
    if (context.regenerateSceneIds) return undefined

    const outcome = await renderAvatarScenes(context)
    context.signal.throwIfAborted()
    if (outcome.failed.length === 0) return undefined

    const dominant = outcome.dominantCode
    // La cuenta frenó la corrida (la clave dejó de servir a mitad, con un 401
    // al consultar o al pedir; o el saldo): la fase sale con ESE código, que
    // la persona sabe resolver y que el saldo convierte en pausa con recarga,
    // no con «apariciones sin generar» (diseño §14). `dominantCode` ya lo
    // prefiere a cualquier otro fallo de la corrida.
    if (dominant && isAccountFailureCode(dominant))
      throw new PipelineFailure(
        dominant,
        `avatar scenes without a clip: ${outcome.failed.join(', ')} (the HeyGen account stopped them: ${dominant})`,
        { provider: HEYGEN_PROVIDER },
      )

    throw new PipelineFailure(
      'avatar_incomplete',
      `avatar scenes without a clip: ${outcome.failed.join(', ')} (most frequent failure: ${dominant ?? 'unknown'})`,
    )
  },
}
