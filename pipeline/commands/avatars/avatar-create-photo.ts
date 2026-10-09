import { createHash } from 'node:crypto'
import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { AVATAR_NAME_LIMIT } from '../../types/avatar.ts'
import type {
  AvatarCreatePhotoPayload,
  AvatarCreatePhotoResult,
  AvatarSummary,
  HeyGenLook,
} from '../../types/avatar.ts'
import { ensureDirectory } from '../../utils/atomic-fs.ts'
import {
  avatarsRoot,
  listAvatarEntries,
  newAvatarId,
  readAvatarPhoto,
  toAvatarSummary,
  writeAvatarMetadata,
  writePreviewFile,
} from './avatar-library.ts'
import type { StoredAvatarMetadata } from './avatar-library.ts'
import { requireHeyGenClient } from './heygen-client.ts'

// Misma foto y mismo nombre → misma clave: si la respuesta del POST se perdió,
// repetir no crea (ni cobra) otro avatar. Solo caracteres que HeyGen admite.
export function photoIdempotencyKey(name: string, bytes: Buffer): string {
  const digest = createHash('sha256')
    .update(name)
    .update('\n')
    .update(bytes)
    .digest('hex')
    .slice(0, 32)
  return `vimo-avatar-photo-${digest}`
}

// ¿Es esta entrada el avatar que HeyGen acaba de devolver? Con look se compara
// por `lookId`; si HeyGen solo devolvió el grupo, por `groupId`.
function isSameAvatar(
  entry: AvatarSummary,
  look: HeyGenLook | null,
  groupId: string | undefined,
): boolean {
  if (look) return entry.lookId === look.lookId
  if (!groupId) return false

  return entry.groupId === groupId
}

// Crea un avatar en HeyGen desde la foto elegida (1,32 USD, diseño §12.2). Lo
// que no cuesta y puede fallar (el payload, la foto, la clave y la carpeta
// raíz) se comprueba ANTES de hablar con HeyGen, para no descubrirlo después
// de pagar; la carpeta del avatar se crea DESPUÉS, así un fallo de HeyGen no
// deja nada a medias. La foto queda como vista previa del avatar, que nace
// «processing» hasta que `avatar-refresh` lo ve entrenado.
export async function avatarCreatePhoto(
  context: PipelineContext,
): Promise<AvatarCreatePhotoResult> {
  const payload = context.job.payload as AvatarCreatePhotoPayload | undefined
  const name = payload?.name?.trim().slice(0, AVATAR_NAME_LIMIT)
  if (!name)
    throw new PipelineFailure('invalid_payload', 'payload.name is required')
  const photoPath = payload?.photoPath?.trim()
  if (!photoPath)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.photoPath is required',
    )

  const photo = await readAvatarPhoto(photoPath)
  const client = requireHeyGenClient(context)
  const directory = avatarsRoot(context)

  const assetId = await client.uploadAsset(
    photo.bytes,
    `avatar.${photo.ext}`,
    photo.mime,
  )
  const created = await client.createPhotoAvatar({
    name,
    assetId,
    idempotencyKey: photoIdempotencyKey(name, photo.bytes),
  })

  const look = created.look
  const groupId = created.groupId ?? look?.groupId

  // Repetir el alta manda la misma clave de idempotencia y HeyGen devuelve el
  // mismo avatar sin cobrar otra vez: la biblioteca lo reconoce y no lo
  // duplica, como hace `avatar-add`.
  const existing = (await listAvatarEntries(directory)).find((entry) =>
    isSameAvatar(entry, look, groupId),
  )
  if (existing) return { entry: existing }

  const id = newAvatarId(name)
  const entryDirectory = join(directory, id)
  await ensureDirectory(entryDirectory)
  const previewFile = await writePreviewFile(entryDirectory, photo)

  const metadata: StoredAvatarMetadata = {
    name,
    lookId: look?.lookId ?? null,
    lookType: 'photo_avatar',
    ownership: 'own',
    supportedEngines: look?.supportedEngines ?? [],
    status: look?.status ?? 'processing',
    previewFile,
    createdAt: new Date().toISOString(),
  }
  if (groupId) metadata.groupId = groupId
  if (look?.preferredOrientation)
    metadata.preferredOrientation = look.preferredOrientation
  if (look?.gender) metadata.gender = look.gender

  await writeAvatarMetadata(entryDirectory, metadata)

  return { entry: await toAvatarSummary(entryDirectory, id, metadata) }
}
