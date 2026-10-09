import { join } from 'node:path'

import type { HeyGenClient } from '../../providers/avatar/heygen.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  AvatarRefreshPayload,
  AvatarRefreshResult,
  HeyGenLook,
} from '../../types/avatar.ts'
import {
  assertValidAvatarId,
  avatarsRoot,
  readAvatarMetadata,
  toAvatarSummary,
  writeAvatarMetadata,
} from './avatar-library.ts'
import type { StoredAvatarMetadata } from './avatar-library.ts'
import { requireHeyGenClient } from './heygen-client.ts'

// Un avatar creado sin look todavía: HeyGen lo cuelga de un grupo y el look
// aparece cuando termina de entrenar.
async function currentLook(
  client: HeyGenClient,
  metadata: StoredAvatarMetadata,
): Promise<HeyGenLook | null> {
  if (metadata.lookId) return client.getLook(metadata.lookId)
  if (!metadata.groupId) return null
  const page = await client.listLooks({
    ownership: 'private',
    groupId: metadata.groupId,
  })
  return page.looks[0] ?? null
}

// Consulta a HeyGen cómo va el entrenamiento de un avatar propio y guarda lo
// que cambió. Uno ya listo no se consulta: no hay nada que actualizar.
export async function avatarRefresh(
  context: PipelineContext,
): Promise<AvatarRefreshResult> {
  const payload = context.job.payload as AvatarRefreshPayload | undefined
  if (!payload?.id)
    throw new PipelineFailure('invalid_payload', 'payload.id is required')
  assertValidAvatarId(payload.id)

  const entryDirectory = join(avatarsRoot(context), payload.id)
  const metadata = await readAvatarMetadata(entryDirectory)
  if (!metadata?.name)
    throw new PipelineFailure(
      'avatar_not_found',
      `avatar "${payload.id}" is not in the library`,
    )
  if (metadata.status === 'ready')
    return {
      entry: await toAvatarSummary(entryDirectory, payload.id, metadata),
    }

  const look = await currentLook(requireHeyGenClient(context), metadata)
  if (!look)
    return {
      entry: await toAvatarSummary(entryDirectory, payload.id, metadata),
    }

  const next: StoredAvatarMetadata = {
    ...metadata,
    lookId: look.lookId,
    supportedEngines:
      look.supportedEngines.length > 0
        ? look.supportedEngines
        : metadata.supportedEngines,
    status: look.status ?? 'processing',
  }
  if (look.groupId) next.groupId = look.groupId
  if (look.preferredOrientation)
    next.preferredOrientation = look.preferredOrientation
  if (look.gender) next.gender = look.gender
  if (next.status === 'failed') next.errorCode = 'avatar_training_failed'
  else delete next.errorCode

  await writeAvatarMetadata(entryDirectory, next)

  return { entry: await toAvatarSummary(entryDirectory, payload.id, next) }
}
