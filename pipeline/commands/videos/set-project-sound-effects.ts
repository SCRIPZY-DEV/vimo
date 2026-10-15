import {
  resolveSoundEffects,
  soundEffectsTimelineSeconds,
} from '../../audio/sound-effects.ts'
import {
  readProjectMetadata,
  writeProjectMetadata,
} from '../../project/metadata.ts'
import {
  isValidFile,
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
} from '../../project/paths.ts'
import { readScenes } from '../../project/scenes-file.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  SetProjectSoundEffectsPayload,
  SetProjectSoundEffectsResult,
} from '../../types/sound-effects.ts'

// El registro de videos toma el lease exclusivo del proyecto para todo el
// comando. Las opciones y su invalidación se guardan en el mismo rename.
export async function setProjectSoundEffects(
  context: PipelineContext,
): Promise<SetProjectSoundEffectsResult> {
  const payload = context.job.payload as
    SetProjectSoundEffectsPayload | undefined
  if (!payload || typeof payload.projectId !== 'string')
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )
  const paths = resolveProjectPaths(
    resolveProjectDir(projectsRootOf(context), payload.projectId),
    payload.projectId,
  )
  const metadata = await readProjectMetadata(paths)
  const scenes = (await readScenes(paths)) ?? []
  const instances = resolveSoundEffects(
    payload.instances,
    scenes,
    soundEffectsTimelineSeconds(metadata, scenes),
    true,
  )
  if (
    JSON.stringify(metadata.options.soundEffects ?? []) ===
    JSON.stringify(instances)
  )
    return { instances }

  context.signal.throwIfAborted()
  metadata.options.soundEffects = instances
  if (await isValidFile(paths.videoFile)) metadata.videoOutdated = true
  metadata.completedStages = metadata.completedStages.filter(
    (stage) => stage !== 'render',
  )
  await writeProjectMetadata(paths, metadata)
  return { instances }
}
