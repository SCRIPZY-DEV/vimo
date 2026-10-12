import { renderAvatarScenes } from '../../avatar/render-scenes.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { buildCreateVideoContext } from '../../stages/context.ts'
import type {
  AvatarRenderScenesPayload,
  AvatarRenderScenesResult,
} from '../../types/avatar.ts'

// «Generar» / «Regenerar» el avatar de escenas puntuales desde el editor
// (ADR-0057, diseño §8; lo usa la entrega 3): el mismo carril y los mismos
// recibos que la fase `avatar`. Como las pide la persona, también vuelve a
// pedir una escena cuyo último pedido HeyGen rechazó para siempre (moderación,
// look), que la fase no repite sola. Corre con el lease de animación
// (subcommands.ts): las lecturas del proyecto siguen disponibles mientras
// espera a HeyGen. Este borde solo exige el proyecto; los ids los valida
// renderAvatarScenes (una lista no vacía de escenas de avatar del proyecto)
// antes de hablar con HeyGen. Sin `sceneIds` el pedido es una lista vacía,
// nunca «todas las pendientes»: eso es la fase.
// Desde la entrega 2e (§21.4) también viajan, tal como llegan, las listas que
// la persona pidió regenerar (`regenerateSceneIds`, un render nuevo pagado) y
// los ajustes de movimiento (`motion`): renderAvatarScenes los valida antes de
// hablar con HeyGen y los guarda en la escena antes de pedir.
export async function avatarRenderScenes(
  context: PipelineContext,
): Promise<AvatarRenderScenesResult> {
  const payload = context.job.payload as AvatarRenderScenesPayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )

  const videoContext = await buildCreateVideoContext(context, payload.projectId)
  const outcome = await renderAvatarScenes(videoContext, {
    sceneIds: payload.sceneIds ?? [],
    regenerateSceneIds: payload.regenerateSceneIds,
    motion: payload.motion,
  })
  return { rendered: outcome.rendered, failed: outcome.failed }
}
