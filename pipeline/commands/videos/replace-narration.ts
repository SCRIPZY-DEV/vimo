import { rm } from 'node:fs/promises'

import { isValidFile } from '../../project/paths.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { buildCreateVideoContext } from '../../stages/context.ts'
import { synthesizeNarration } from '../../stages/voice/narration.ts'
import type { ReplaceNarrationPayload } from '../../types/video-project.ts'
import { readTextWithRetry } from '../../utils/atomic-fs.ts'
import { writeProjectAudioFile } from './audio-file.ts'
import { retranscribeAndRedistribute } from './audio-replacement.ts'

// Reemplazo de la narración de un proyecto YA generado (Library): sube un
// audio nuevo o re-sintetiza con otra voz, re-transcribe y redistribuye los
// tiempos preservando escenas/prompts/imágenes. A diferencia de
// upload-narration (Create), NUNCA borra scenes.json.
export async function replaceNarration(
  context: PipelineContext,
): Promise<null> {
  const payload = context.job.payload as ReplaceNarrationPayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )
  if (payload.mode !== 'upload' && payload.mode !== 'resynthesize')
    throw new PipelineFailure(
      'invalid_payload',
      `unknown mode "${String(payload.mode)}"`,
    )

  const videoContext = await buildCreateVideoContext(context, payload.projectId)

  // Modo demo (ADR-0027): la narración es la del pack; sin proveedor de voz.
  if (videoContext.options.demo === true)
    throw new PipelineFailure(
      'demo_project',
      'demo projects cannot replace the narration',
    )

  const options = videoContext.options

  if (payload.mode === 'upload') {
    if (!payload.audioPath)
      throw new PipelineFailure(
        'invalid_payload',
        'mode upload requires payload.audioPath',
      )
    await writeProjectAudioFile(
      videoContext.paths.narrationFile,
      payload.audioPath,
      context.job.binaryPaths.ffmpeg,
      context.signal,
    )
    options.narrationMode = 'own-audio'
    await videoContext.saveMetadata()
  } else {
    // La voz nueva (si viene) se persiste ANTES de sintetizar: un fallo a
    // mitad deja la elección guardada y el retry usa la voz correcta.
    if (payload.voice) {
      options.narrationMode = 'tts'
      options.voiceProvider = payload.voice.provider
      options.voiceId = payload.voice.voiceId
      options.voiceName = payload.voice.voiceName
      options.voiceSettings = payload.voice.settings
      await videoContext.saveMetadata()
    }

    if (!(await isValidFile(videoContext.paths.scriptFile)))
      throw new PipelineFailure(
        'script_missing',
        'resynthesize needs script.txt',
      )
    const script = await readTextWithRetry(videoContext.paths.scriptFile)

    await rm(videoContext.paths.narrationFile, { force: true })
    await synthesizeNarration(videoContext, script)
  }

  await retranscribeAndRedistribute(videoContext)
  return null
}
