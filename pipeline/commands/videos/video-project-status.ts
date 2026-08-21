import { readProjectMetadata } from '../../project/metadata.ts'
import {
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
} from '../../project/paths.ts'
import { readScenes, toSceneSummaries } from '../../project/scenes-file.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  VideoProjectStatusPayload,
  VideoProjectStatusResult,
} from '../../types/video-project.ts'

// Lee del disco el estado persistido del proyecto y el resumen de sus escenas.
export async function videoProjectStatus(
  context: PipelineContext,
): Promise<VideoProjectStatusResult> {
  const payload = context.job.payload as VideoProjectStatusPayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )

  const projectDir = resolveProjectDir(
    projectsRootOf(context),
    payload.projectId,
  )
  const paths = resolveProjectPaths(projectDir, payload.projectId)
  const metadata = await readProjectMetadata(paths)
  const scenes = await readScenes(paths)

  return {
    metadata,
    scenes: scenes ? await toSceneSummaries(paths, scenes) : [],
  }
}
