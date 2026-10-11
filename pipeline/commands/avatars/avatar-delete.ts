import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { AvatarDeletePayload } from '../../types/avatar.ts'
import {
  assertValidAvatarId,
  avatarsRoot,
  removeAvatarFolder,
} from './avatar-library.ts'

// Borra solo la carpeta local: el avatar sigue existiendo en HeyGen. El `rm`
// con sus reintentos es el de la biblioteca (`removeAvatarFolder`), el mismo
// que usa `avatar-heygen-delete`.
export async function avatarDelete(context: PipelineContext): Promise<null> {
  const payload = context.job.payload as AvatarDeletePayload | undefined
  if (!payload?.id)
    throw new PipelineFailure('invalid_payload', 'payload.id is required')
  assertValidAvatarId(payload.id)

  await removeAvatarFolder(join(avatarsRoot(context), payload.id))

  return null
}
