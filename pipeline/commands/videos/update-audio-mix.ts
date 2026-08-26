import {
  readProjectMetadata,
  writeProjectMetadata,
} from '../../project/metadata.ts'
import {
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
} from '../../project/paths.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { UpdateAudioMixPayload } from '../../types/video-project.ts'

// Mezcla de audio del proyecto: escritura ligera de metadata. NO marca el
// video como desactualizado (paridad con el origen): los volúmenes aplican
// en el próximo render que el usuario decida.
export async function updateAudioMix(context: PipelineContext): Promise<null> {
  const payload = context.job.payload as UpdateAudioMixPayload | undefined
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
  const options = metadata.options

  if (payload.voiceVolume !== undefined)
    options.voiceVolume = clamp(payload.voiceVolume, 0, 2)
  if (payload.musicVolume !== undefined)
    options.musicVolume = clamp(payload.musicVolume, 0, 2)
  if (payload.bgmOffsetSeconds !== undefined)
    options.bgmOffsetSeconds = clamp(
      payload.bgmOffsetSeconds,
      0,
      Number.MAX_SAFE_INTEGER,
    )

  await writeProjectMetadata(paths, metadata)
  return null
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value))
    throw new PipelineFailure('invalid_payload', 'mix values must be numbers')
  return Math.max(min, Math.min(max, value))
}
