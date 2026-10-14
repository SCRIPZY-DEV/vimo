import type { PipelineContext } from '../../runner/context.ts'
import type {
  AvatarStockGroupsPayload,
  AvatarStockGroupsResult,
} from '../../types/avatar.ts'
import { requireHeyGenClient } from './heygen-client.ts'

// Una página de avatares de HeyGen (grupos de looks): el stock público por
// defecto, o los propios de la cuenta del usuario. Cada grupo trae cuántos
// looks tiene; los looks se piden aparte con `avatar-stock-looks { groupId }`.
export async function avatarStockGroups(
  context: PipelineContext,
): Promise<AvatarStockGroupsResult> {
  const payload = context.job.payload as AvatarStockGroupsPayload | undefined
  const client = requireHeyGenClient(context)
  const ownership = payload?.ownership === 'private' ? 'private' : 'public'
  const token =
    typeof payload?.token === 'string' && payload.token
      ? payload.token
      : undefined

  return client.listGroups({ ownership, token })
}
