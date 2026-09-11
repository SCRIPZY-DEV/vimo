import { runDemoPipeline } from '../demo/run-demo-pipeline.ts'
import { isValidFile } from '../../project/paths.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure, toPipelineFailure } from '../../runner/failure.ts'
import { runStages } from '../../runner/run-stages.ts'
import { STAGE_IDS, type StageId } from '../../runner/stage-id.ts'
import { buildCreateVideoContext } from '../../stages/context.ts'
import { CREATE_VIDEO_STAGES } from '../../stages/registry.ts'
import type {
  RunVideoPipelinePayload,
  RunVideoPipelineResult,
} from '../../types/video-project.ts'

// El job largo de Create: recorre las stages del registro con el runner.
// Retomable por diseño — cada stage saltea su trabajo si el artefacto en
// disco es válido, así que relanzar tras un error, una cancelación o la
// pausa de confirmación continúa donde quedó.
export async function runVideoPipeline(
  context: PipelineContext,
): Promise<RunVideoPipelineResult> {
  const payload = context.job.payload as RunVideoPipelinePayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )
  if (payload.untilStage && !STAGE_IDS.includes(payload.untilStage))
    throw new PipelineFailure(
      'invalid_payload',
      `unknown untilStage "${payload.untilStage}"`,
    )

  const videoContext = await buildCreateVideoContext(context, payload.projectId)

  // Modo demo (ADR-0027): el proyecto nació desde la puerta de la demo y no
  // hay proveedores que llamar — se simulan las fases con el pack pre-hecho.
  // `untilStage` no aplica: la demo siempre corre entera.
  if (videoContext.options.demo === true) return runDemoPipeline(videoContext)

  // autoRender false (ADR-0016): el run completo genera todo MENOS el render
  // y el proyecto queda en borrador para el editor. Un untilStage explícito
  // (harness) manda sobre el filtro.
  const fullRun = !payload.untilStage
  const autoRender = videoContext.metadata.options.autoRender !== false
  let stages = stagesUpTo(payload.untilStage)
  if (fullRun && !autoRender)
    stages = stages.filter((stage) => stage.id !== 'render')

  videoContext.metadata.state = 'generating'
  videoContext.metadata.errorCode = undefined
  await videoContext.saveMetadata()

  try {
    const outcome = await runStages(stages, videoContext, {
      // completedStages persiste el avance: es lo que Library y la UI leen
      // para saber por dónde va un proyecto entre jobs.
      async onStageCompleted(stageId) {
        if (!videoContext.metadata.completedStages.includes(stageId))
          videoContext.metadata.completedStages.push(stageId)
        await videoContext.saveMetadata()
      },
    })

    // Pausa de confirmación: cierre limpio, NO completado (la stage ya dejó
    // state = awaiting-confirmation persistido).
    if (outcome.paused) return { status: 'awaiting-confirmation' }

    // Un run parcial (untilStage, harness de ADR-0010) no marca estado final.
    // Sin auto-render el cierre es 'draft': Library lo lista como borrador y
    // el editor lo abre directo con todo generado.
    if (fullRun) {
      videoContext.metadata.state = autoRender ? 'completed' : 'draft'
      await videoContext.saveMetadata()
    }

    const result: RunVideoPipelineResult = { status: 'completed' }
    if (await isValidFile(videoContext.paths.videoFile))
      result.videoPath = videoContext.paths.videoFile
    return result
  } catch (error) {
    // Cancelación pedida → paused (retomable); cualquier otro fallo → error
    // con su code persistido para que la UI lo muestre al rehidratar.
    if (context.signal.aborted) {
      videoContext.metadata.state = 'paused'
      await videoContext.saveMetadata()
      throw error
    }

    videoContext.metadata.state = 'error'
    videoContext.metadata.errorCode = toPipelineFailure(error).code
    await videoContext.saveMetadata()
    throw error
  }
}

function stagesUpTo(untilStage: StageId | undefined) {
  if (!untilStage) return CREATE_VIDEO_STAGES

  const lastIndex = CREATE_VIDEO_STAGES.findIndex(
    (stage) => stage.id === untilStage,
  )
  // untilStage válido pero aún no registrado (etapas E3-E5 en construcción):
  // se corre todo lo que exista hasta ahí.
  if (lastIndex < 0) return CREATE_VIDEO_STAGES

  return CREATE_VIDEO_STAGES.slice(0, lastIndex + 1)
}
