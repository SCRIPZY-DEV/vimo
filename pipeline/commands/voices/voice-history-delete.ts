import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { VoiceHistoryDeletePayload } from '../../types/voices.ts'
import { assertValidHistoryId, voiceHistoryRoot } from './voice-history.ts'

// Elimina una generación del historial (carpeta completa: audio y metadata).
export async function voiceHistoryDelete(
  context: PipelineContext,
): Promise<null> {
  const payload = context.job.payload as VoiceHistoryDeletePayload | undefined
  if (!payload?.id)
    throw new PipelineFailure('invalid_payload', 'payload.id is required')
  assertValidHistoryId(payload.id)

  await rm(join(voiceHistoryRoot(context), payload.id), {
    recursive: true,
    force: true,
  })

  return null
}
