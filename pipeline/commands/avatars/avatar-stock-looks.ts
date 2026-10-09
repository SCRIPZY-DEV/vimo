import type { PipelineContext } from '../../runner/context.ts'
import { AVATAR_LOOK_TYPES } from '../../types/avatar.ts'
import type {
  AvatarStockLooksPayload,
  AvatarStockLooksResult,
} from '../../types/avatar.ts'
import { requireHeyGenClient } from './heygen-client.ts'

// Una página de looks de HeyGen: el stock público por defecto, o los propios
// de la cuenta del usuario. El filtro de tipo se ignora si no es conocido.
export async function avatarStockLooks(
  context: PipelineContext,
): Promise<AvatarStockLooksResult> {
  const payload = context.job.payload as AvatarStockLooksPayload | undefined
  const client = requireHeyGenClient(context)
  const ownership = payload?.ownership === 'private' ? 'private' : 'public'
  const lookType = AVATAR_LOOK_TYPES.find((type) => type === payload?.lookType)
  const token =
    typeof payload?.token === 'string' && payload.token
      ? payload.token
      : undefined

  return client.listLooks({ ownership, lookType, token })
}
