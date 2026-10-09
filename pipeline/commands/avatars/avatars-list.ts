import type { PipelineContext } from '../../runner/context.ts'
import type { AvatarsListResult } from '../../types/avatar.ts'
import { avatarsRoot, listAvatarEntries } from './avatar-library.ts'

export async function avatarsList(
  context: PipelineContext,
): Promise<AvatarsListResult> {
  const entries = await listAvatarEntries(avatarsRoot(context))
  return { entries }
}
