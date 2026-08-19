import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../runner/context.ts'
import { PipelineFailure } from '../runner/failure.ts'
import type { MusicHistoryDeletePayload } from '../types/music.ts'
import { assertValidHistoryId, musicHistoryRoot } from './music-history.ts'

// Elimina una pista del historial (carpeta completa: audio, cover y metadata).
export async function musicHistoryDelete(
  context: PipelineContext,
): Promise<null> {
  const payload = context.job.payload as MusicHistoryDeletePayload | undefined
  if (!payload?.id)
    throw new PipelineFailure('invalid_payload', 'payload.id is required')
  assertValidHistoryId(payload.id)

  await rm(join(musicHistoryRoot(context), payload.id), {
    recursive: true,
    force: true,
  })

  return null
}
