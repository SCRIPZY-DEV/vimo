import { rm } from 'node:fs/promises'

import { readProjectMetadata } from '../../project/metadata.ts'
import {
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
} from '../../project/paths.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { UploadNarrationPayload } from '../../types/video-project.ts'
import { writeProjectAudioFile } from './audio-file.ts'

// Guarda la narración del usuario como narration.mp3 durante la CREACIÓN:
// invalida transcripción y escenas porque el proyecto aún no generó nada que
// valga conservar. El reemplazo post-creación es `replace-narration`, que
// PRESERVA las escenas y re-transcribe (ADR-0014) — dos comandos a propósito.
export async function uploadNarration(context: PipelineContext): Promise<null> {
  const payload = context.job.payload as UploadNarrationPayload | undefined
  if (!payload?.projectId || !payload.audioPath)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId and payload.audioPath are required',
    )

  const projectDir = resolveProjectDir(
    projectsRootOf(context),
    payload.projectId,
  )
  const paths = resolveProjectPaths(projectDir, payload.projectId)
  // Valida que el proyecto exista antes de escribirle adentro.
  await readProjectMetadata(paths)

  await writeProjectAudioFile(
    paths.narrationFile,
    payload.audioPath,
    context.job.binaryPaths.ffmpeg,
    context.signal,
  )

  await rm(paths.wordsFile, { force: true })
  await rm(paths.scenesFile, { force: true })

  return null
}
