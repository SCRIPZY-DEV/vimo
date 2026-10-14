import type { PipelineContext } from '../../runner/context.ts'
import type { AvatarsListResult } from '../../types/avatar.ts'
import { avatarsRoot, listAvatarEntries } from './avatar-library.ts'

// La biblioteca, del más nuevo al más viejo, con la vista previa del avatar y
// la de cada look que está en disco. Una carpeta de la entrega 1 no aparece y
// avisa por el log.
export async function avatarsList(
  context: PipelineContext,
): Promise<AvatarsListResult> {
  const entries = await listAvatarEntries(avatarsRoot(context), context.emitter)
  return { entries }
}
