import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { runStages } from '../../runner/run-stages.ts'
import { buildCreateVideoContext } from '../../stages/context.ts'
import { renderStage } from '../../stages/render/render.ts'
import type {
  RenderVideoPayload,
  RenderVideoResult,
} from '../../types/video-project.ts'

// Re-render (solo la fase render) desde el editor: depura `render` de
// completedStages para que la stage no se saltee y deja que el cache por
// manifest de chunks re-renderice SOLO lo que cambió. Sobreescribe
// `<slug>.mp4` (sin versiones anteriores, decisión de ADR-0014).
//
// Un fallo NO marca el proyecto en error ni persiste errorCode: el mp4
// anterior sigue intacto (mezcla a temporal + rename atómico) y el estado en
// disco ya cuenta la verdad — completedStages quedó sin `render`.
export async function renderVideo(
  context: PipelineContext,
): Promise<RenderVideoResult> {
  const payload = context.job.payload as RenderVideoPayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )

  const videoContext = await buildCreateVideoContext(context, payload.projectId)

  videoContext.metadata.completedStages =
    videoContext.metadata.completedStages.filter(
      (stageId) => stageId !== 'render',
    )
  await videoContext.saveMetadata()

  await runStages([renderStage], videoContext, {
    async onStageCompleted(stageId) {
      if (!videoContext.metadata.completedStages.includes(stageId))
        videoContext.metadata.completedStages.push(stageId)
      await videoContext.saveMetadata()
    },
  })

  videoContext.metadata.state = 'completed'
  videoContext.metadata.errorCode = undefined
  videoContext.metadata.videoOutdated = false
  await videoContext.saveMetadata()

  return { videoPath: videoContext.paths.videoFile }
}
