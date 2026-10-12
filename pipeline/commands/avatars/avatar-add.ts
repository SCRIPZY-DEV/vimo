import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { AVATAR_GENDERS, AVATAR_NAME_LIMIT } from '../../types/avatar.ts'
import type {
  AvatarAddPayload,
  AvatarAddResult,
  HeyGenLook,
} from '../../types/avatar.ts'
import { ensureDirectory } from '../../utils/atomic-fs.ts'
import {
  avatarsRoot,
  cardLookIds,
  findAvatarByGroup,
  isUsableLook,
  newAvatarId,
  storedLookOf,
  toAvatarSummary,
  writeAvatarMetadata,
  writeLookPreviewFile,
  writePreviewFile,
} from './avatar-library.ts'
import type { StoredAvatarMetadata } from './avatar-library.ts'
import {
  downloadLookPreviews,
  downloadPreview,
  listGroupLooks,
  previewTargetsOf,
  previewUrlsOf,
} from './avatar-looks.ts'
import { requireHeyGenClient } from './heygen-client.ts'

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

// El look principal al agregar: el que eligió la persona si está listo y
// admite algún motor con tarifa (isUsableLook, entrega 2e); si no, el primero
// que cumpla.
function chooseMainLook(
  looks: HeyGenLook[],
  requestedLookId: string | undefined,
): HeyGenLook | undefined {
  const requested = looks.find((look) => look.lookId === requestedLookId)
  if (requested && isUsableLook(requested)) return requested

  return looks.find(isUsableLook)
}

// Guarda un avatar de HeyGen (un grupo con todos sus looks) en la biblioteca,
// con la vista previa de su look principal y de los que muestra la tarjeta. Un
// avatar ya agregado devuelve la entrada existente: la biblioteca no duplica.
export async function avatarAdd(
  context: PipelineContext,
): Promise<AvatarAddResult> {
  const payload = context.job.payload as Partial<AvatarAddPayload> | undefined
  const groupId = isText(payload?.groupId) ? payload.groupId : undefined
  if (!groupId)
    throw new PipelineFailure('invalid_payload', 'payload.groupId is required')
  const ownership = payload?.ownership === 'own' ? 'own' : 'stock'
  const requestedLookId = isText(payload?.mainLookId)
    ? payload.mainLookId
    : undefined

  const directory = avatarsRoot(context)
  const existing = await findAvatarByGroup(directory, groupId)
  if (existing)
    return {
      entry: await toAvatarSummary(
        existing.entryDirectory,
        existing.id,
        existing.metadata,
      ),
    }

  const client = requireHeyGenClient(context)
  const group = await client.getGroup(groupId)
  const looks = await listGroupLooks(client, groupId, ownership)
  const main = chooseMainLook(looks, requestedLookId)
  // Código propio de la biblioteca: `avatar_look_unsupported` es el rechazo
  // de HeyGen a un look o motor (un 400), no «este avatar no tiene un look
  // que Vimo pueda usar».
  if (!main)
    throw new PipelineFailure(
      'avatar_no_compatible_look',
      `avatar group ${groupId} has no ready look with an engine Vimo can use`,
    )

  // El nombre se valida ya recortado: uno de solo espacios dejaría una entrada
  // sin nombre, que el listado oculta.
  const name =
    group.name.trim().slice(0, AVATAR_NAME_LIMIT) ||
    main.name.trim().slice(0, AVATAR_NAME_LIMIT)
  const id = newAvatarId(name)
  const entryDirectory = join(directory, id)

  // Las vistas previas se bajan ANTES de crear la carpeta: si la persona
  // cancela durante la descarga no queda una carpeta huérfana sin metadata.
  const urls = previewUrlsOf(looks)
  const cardLooks = cardLookIds(looks, main.lookId, (lookId) =>
    urls.has(lookId),
  )
  const previews = await downloadLookPreviews(
    context,
    id,
    previewTargetsOf(cardLooks, urls),
  )
  // La vista previa propia del avatar es la de su look principal; sin ella,
  // la portada del grupo.
  const cover =
    previews.get(main.lookId) ??
    (await downloadPreview(context, id, group.previewImageUrl))

  await ensureDirectory(entryDirectory)
  for (const [lookId, image] of previews)
    await writeLookPreviewFile(entryDirectory, lookId, image)

  const now = new Date().toISOString()
  const metadata: StoredAvatarMetadata = {
    name,
    groupId,
    ownership,
    status: 'ready',
    mainLookId: main.lookId,
    looks: looks.map((look) => storedLookOf(look, 'heygen', now)),
    createdAt: now,
    syncedAt: now,
  }
  // `GET /v3/avatars/{id}` de un grupo público no trae el género: queda el del
  // listado, que viaja en el payload (solo male o female).
  const gender =
    group.gender ?? AVATAR_GENDERS.find((value) => value === payload?.gender)
  if (gender) metadata.gender = gender
  if (cover)
    metadata.previewFile = await writePreviewFile(entryDirectory, cover)

  await writeAvatarMetadata(entryDirectory, metadata)

  return { entry: await toAvatarSummary(entryDirectory, id, metadata) }
}
