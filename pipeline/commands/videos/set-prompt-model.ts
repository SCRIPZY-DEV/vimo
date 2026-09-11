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
import type { SetPromptModelPayload } from '../../types/video-project.ts'
import { PROMPT_MODEL_ID_LIMIT } from './create-video-project.ts'

// Cambia el modelo del carril verbatim de un proyecto YA existente. Solo
// reescribe options.promptModel en project.json: scenes.json queda intacto —
// los prompts válidos se conservan (la stage los saltea) y el modelo nuevo
// escribe únicamente los que faltan cuando la UI relanza run-video-pipeline.
export async function setPromptModel(context: PipelineContext): Promise<null> {
  const payload = context.job.payload as SetPromptModelPayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )

  const requested = payload.promptModel
  if (requested !== null && typeof requested !== 'string')
    throw new PipelineFailure(
      'invalid_payload',
      'payload.promptModel must be a string or null',
    )
  const promptModel = requested?.trim() ?? ''
  if (promptModel.length > PROMPT_MODEL_ID_LIMIT)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.promptModel must be at most ${PROMPT_MODEL_ID_LIMIT} characters`,
    )

  const projectDir = resolveProjectDir(
    projectsRootOf(context),
    payload.projectId,
  )
  const paths = resolveProjectPaths(projectDir, payload.projectId)
  const metadata = await readProjectMetadata(paths)

  // Sin estilo propio los prompts los escribe la casa con sus tiers fijos:
  // no hay modelo que cambiar.
  if (!metadata.options.customStyle)
    throw new PipelineFailure(
      'invalid_payload',
      'promptModel requires a project with options.customStyle',
    )

  if (promptModel) metadata.options.promptModel = promptModel
  else delete metadata.options.promptModel
  await writeProjectMetadata(paths, metadata)

  return null
}
