import { rm } from 'node:fs/promises'
import {
  readProjectMetadata,
  writeProjectMetadata,
} from '../../project/metadata.ts'
import {
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
} from '../../project/paths.ts'
import { discardNarrationProgress } from '../../providers/tts/chunked-synthesis.ts'
import { resolveTtsProvider } from '../../providers/tts/registry.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { SetProjectVoicePayload } from '../../types/video-project.ts'

// Cambia el proveedor y la voz de un proyecto cuya narración FALLÓ (ADR-0053):
// la UI lo ofrece junto a «Reintentar» y después relanza run-video-pipeline,
// que relee las opciones. Descarta lo que la voz anterior dejó a medias
// (partes, recibos pendientes): el usuario ya fue avisado de que una
// generación pudo haberse cobrado. Una narración ya generada se cambia desde
// el editor (replace-narration), no acá.
export async function setProjectVoice(context: PipelineContext): Promise<null> {
  const payload = context.job.payload as SetProjectVoicePayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )

  const voice = payload.voice
  if (!voice || typeof voice.voiceId !== 'string' || !voice.voiceId.trim())
    throw new PipelineFailure(
      'invalid_payload',
      'payload.voice.voiceId is required',
    )
  if (!resolveTtsProvider(voice.provider))
    throw new PipelineFailure(
      'invalid_payload',
      `payload.voice.provider is not a voice provider: ${String(voice.provider)}`,
    )

  const projectDir = resolveProjectDir(
    projectsRootOf(context),
    payload.projectId,
  )
  const paths = resolveProjectPaths(projectDir, payload.projectId)
  const metadata = await readProjectMetadata(paths)

  if (metadata.completedStages.includes('voice'))
    throw new PipelineFailure(
      'invalid_payload',
      'the narration is already generated; change it from the editor',
    )

  await discardNarrationProgress(paths.narrationFile)
  await rm(paths.narrationFile, { force: true })

  metadata.options.narrationMode = 'tts'
  metadata.options.voiceProvider = voice.provider
  metadata.options.voiceId = voice.voiceId
  metadata.options.voiceName = voice.voiceName
  metadata.options.voiceSettings = voice.settings
  await writeProjectMetadata(paths, metadata)

  return null
}
