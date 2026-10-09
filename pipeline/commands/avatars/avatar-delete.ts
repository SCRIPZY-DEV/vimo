import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { AvatarDeletePayload } from '../../types/avatar.ts'
import { assertValidAvatarId, avatarsRoot } from './avatar-library.ts'

// En Windows, Defender o el indexador pueden tener abierto un archivo de la
// carpeta y el `rm` choca con EBUSY/EPERM: se reintenta con backoff lineal,
// con los mismos ocho intentos y 40 ms de `atomic-fs.ts`.
const REMOVE_MAX_RETRIES = 8
const REMOVE_RETRY_DELAY_MS = 40

// Borra solo la carpeta local: el avatar sigue existiendo en HeyGen.
export async function avatarDelete(context: PipelineContext): Promise<null> {
  const payload = context.job.payload as AvatarDeletePayload | undefined
  if (!payload?.id)
    throw new PipelineFailure('invalid_payload', 'payload.id is required')
  assertValidAvatarId(payload.id)

  await rm(join(avatarsRoot(context), payload.id), {
    recursive: true,
    force: true,
    maxRetries: REMOVE_MAX_RETRIES,
    retryDelay: REMOVE_RETRY_DELAY_MS,
  })

  return null
}
