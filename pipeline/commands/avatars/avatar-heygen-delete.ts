import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  AvatarHeygenDeletePayload,
  AvatarHeygenDeleteResult,
} from '../../types/avatar.ts'
import { avatarsRoot, removeGroupEntries } from './avatar-library.ts'
import { requireHeyGenClient } from './heygen-client.ts'

// Un id de grupo de HeyGen: el alfabeto de los ids de la biblioteca y de los
// looks (`[a-zA-Z0-9_-]`, hasta 128 caracteres, como LOOK_FILE_ID_PATTERN). Sin
// `.` ni `/`: `encodeURIComponent` deja un `..` tal cual y la URL lo resolvería
// como la carpeta de arriba (un `DELETE /v3/`), y este pedido no se deshace.
const GROUP_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

// Borra de verdad un avatar propio de la cuenta de HeyGen (el grupo con todos
// sus looks; entrega 2c, diseño §12.2) y después quita de la biblioteca todas
// las entradas de ese grupo. Todo lo que puede fallar sin costo va antes del
// borrado, que no se deshace: el id, la carpeta raíz y la clave. Si HeyGen
// falla, la biblioteca queda como estaba; si HeyGen ya no tenía el grupo (404),
// cuenta como borrado. HeyGen no deja borrar grupos públicos ni de la
// comunidad: la interfaz solo lo ofrece en «Mis avatares».
export async function avatarHeygenDelete(
  context: PipelineContext,
): Promise<AvatarHeygenDeleteResult> {
  const payload = context.job.payload as
    Partial<AvatarHeygenDeletePayload> | undefined
  const groupId = payload?.groupId
  // El tipo primero: RegExp.test convertiría un arreglo en texto.
  if (typeof groupId !== 'string' || !GROUP_ID_PATTERN.test(groupId))
    throw new PipelineFailure(
      'invalid_payload',
      'payload.groupId must be a HeyGen group id',
    )

  const directory = avatarsRoot(context)
  const client = requireHeyGenClient(context)

  await client.deleteGroup(groupId)
  // HeyGen ya lo borró: la biblioteca lo sigue sin más esperas ni pedidos.
  const removedEntryIds = await removeGroupEntries(
    directory,
    groupId,
    context.emitter,
  )

  return { groupId, removedEntryIds }
}
