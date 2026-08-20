import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { CharacterDeletePayload } from '../../types/characters.ts'
import { assertValidCharacterId, charactersRoot } from './character-library.ts'

// Elimina un personaje de la biblioteca (carpeta completa: metadata y previews).
export async function characterDelete(context: PipelineContext): Promise<null> {
  const payload = context.job.payload as CharacterDeletePayload | undefined
  if (!payload?.id)
    throw new PipelineFailure('invalid_payload', 'payload.id is required')
  assertValidCharacterId(payload.id)

  await rm(join(charactersRoot(context), payload.id), {
    recursive: true,
    force: true,
  })

  return null
}
