import { generateSceneAnimations } from '../../animation/generate.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { buildCreateVideoContext } from '../../stages/context.ts'
import type {
  AnimateScenesPayload,
  AnimateScenesResult,
} from '../../types/animation.ts'

// El editor y Create comparten la operación; este borde solo valida el payload.
export async function animateScenes(
  context: PipelineContext,
): Promise<AnimateScenesResult> {
  const payload = context.job.payload as AnimateScenesPayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )
  if (payload.provider !== undefined && payload.provider !== 'kie')
    throw new PipelineFailure(
      'invalid_payload',
      'Only Kie is available for new animations',
    )
  if (payload.force !== undefined && typeof payload.force !== 'boolean')
    throw new PipelineFailure('invalid_payload', 'force must be boolean')
  if (
    payload.retryFailed !== undefined &&
    typeof payload.retryFailed !== 'boolean'
  )
    throw new PipelineFailure('invalid_payload', 'retryFailed must be boolean')
  if (payload.minutes !== undefined) {
    if (
      !Number.isSafeInteger(payload.minutes) ||
      payload.minutes < 1 ||
      !Number.isSafeInteger(payload.minutes * 60)
    )
      throw new PipelineFailure(
        'invalid_payload',
        'minutes must be a positive integer',
      )
    if (payload.sceneIds !== undefined)
      throw new PipelineFailure('invalid_payload', 'Choose minutes or sceneIds')
  } else if (
    !Array.isArray(payload.sceneIds) ||
    payload.sceneIds.length === 0 ||
    !payload.sceneIds.every((id) => Number.isSafeInteger(id) && id >= 0)
  ) {
    throw new PipelineFailure(
      'invalid_payload',
      'sceneIds must contain valid scene ids',
    )
  }
  const videoContext = await buildCreateVideoContext(context, payload.projectId)
  return generateSceneAnimations(videoContext, {
    sceneIds: payload.sceneIds ? [...new Set(payload.sceneIds)] : undefined,
    minutes: payload.minutes,
    force: payload.force === true,
    retryFailed: payload.retryFailed === true,
  })
}
