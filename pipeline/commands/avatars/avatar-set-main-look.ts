import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { AVATAR_DEFAULT_ENGINE } from '../../types/avatar.ts'
import type {
  AvatarSetMainLookPayload,
  AvatarSetMainLookResult,
} from '../../types/avatar.ts'
import type { DecodedImage } from '../../types/images.ts'
import {
  AVATAR_GROUP_MISSING_CODE,
  assertValidAvatarId,
  avatarStatusOf,
  avatarsRoot,
  isUsableLook,
  previewFileName,
  readLookPreview,
  removeReplacedPreviewFile,
  requireAvatarMetadata,
  toAvatarSummary,
  updateAvatarMetadata,
  writeLookPreviewFile,
  writePreviewFile,
} from './avatar-library.ts'
import type { StoredAvatarMetadata } from './avatar-library.ts'
import { downloadPreview } from './avatar-looks.ts'
import { requireHeyGenClient } from './heygen-client.ts'

// La vista previa del look que pasa a ser el principal y si hubo que bajarla.
interface MainLookPreview {
  image: DecodedImage
  downloaded: boolean
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

// El principal tiene que ser un look del avatar, listo y con el motor de Vimo.
function assertUsableMainLook(
  metadata: StoredAvatarMetadata,
  lookId: string,
): void {
  const look = metadata.looks.find((candidate) => candidate.lookId === lookId)
  if (!look)
    throw new PipelineFailure(
      'invalid_payload',
      `look "${lookId}" is not one of this avatar's looks`,
    )
  if (!isUsableLook(look))
    throw new PipelineFailure(
      'avatar_no_compatible_look',
      `look "${lookId}" is not ready or does not support ${AVATAR_DEFAULT_ENGINE}`,
    )
}

// La vista previa del look: la que está en disco o, si falta, la que da
// HeyGen. Best-effort: sin clave o si HeyGen falla, el look igual pasa a ser
// el principal (con un aviso) y el avatar conserva su vista previa propia.
async function mainLookPreview(
  context: PipelineContext,
  id: string,
  entryDirectory: string,
  lookId: string,
): Promise<MainLookPreview | null> {
  const local = await readLookPreview(entryDirectory, lookId)
  if (local) return { image: local, downloaded: false }

  let url: string | undefined
  try {
    url = (await requireHeyGenClient(context).getLook(lookId)).previewImageUrl
  } catch (error) {
    if (context.signal.aborted) throw error
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `avatar ${id}: look ${lookId} could not be read from HeyGen, main look set without its preview`,
    })
    return null
  }

  const image = await downloadPreview(
    context,
    id,
    url,
    `preview of look ${lookId}`,
  )
  return image ? { image, downloaded: true } : null
}

// Elige el look principal de un avatar (el que usan los videos): baja su
// vista previa si falta y la copia como `preview.<ext>`, la cara del avatar.
// La del look (`looks/<lookId>.<ext>`, que no cambia nada visible) se escribe
// ANTES de releer la metadata, así entre la relectura y la escritura no hay
// E/S que deje pisar lo que otro proceso guarde. La cara del avatar se
// reemplaza recién DESPUÉS de que el cambio se confirma: si el look
// desapareció mientras tanto, el principal no cambia y la cara tampoco. La que
// el avatar deja de usar se borra al final.
export async function avatarSetMainLook(
  context: PipelineContext,
): Promise<AvatarSetMainLookResult> {
  const payload = context.job.payload as
    Partial<AvatarSetMainLookPayload> | undefined
  if (!isText(payload?.id))
    throw new PipelineFailure('invalid_payload', 'payload.id is required')
  assertValidAvatarId(payload.id)
  if (!isText(payload.lookId))
    throw new PipelineFailure('invalid_payload', 'payload.lookId is required')
  const { id, lookId } = payload

  const entryDirectory = join(avatarsRoot(context), id)
  assertUsableMainLook(await requireAvatarMetadata(entryDirectory, id), lookId)
  const preview = await mainLookPreview(context, id, entryDirectory, lookId)

  if (preview?.downloaded) {
    // Solo si el avatar sigue en la biblioteca: no se rehace la carpeta de uno
    // que se borró mientras se bajaba la vista previa.
    await requireAvatarMetadata(entryDirectory, id)
    await writeLookPreviewFile(entryDirectory, lookId, preview.image)
  }
  // El nombre sale de la extensión real de la imagen: se puede anotar en la
  // metadata antes de escribir el archivo.
  const previewFile = preview ? previewFileName(preview.image) : undefined

  let replacedFile: string | undefined
  const next = await updateAvatarMetadata(entryDirectory, id, (current) => {
    // Un refresco pudo cambiar los looks mientras se bajaba la vista previa.
    assertUsableMainLook(current, lookId)
    const updated: StoredAvatarMetadata = { ...current, mainLookId: lookId }
    if (previewFile) {
      replacedFile = current.previewFile
      updated.previewFile = previewFile
    }
    // HeyGen ya no tiene el grupo: otro principal no lo revive. El principal
    // cambia (es un dato local); el estado y el código quedan como estaban.
    if (current.errorCode === AVATAR_GROUP_MISSING_CODE) return updated

    const { status, errorCode } = avatarStatusOf(updated.looks, lookId)
    updated.status = status
    if (errorCode) updated.errorCode = errorCode
    else delete updated.errorCode
    return updated
  })
  // Entre la metadata y este archivo, el listado ya muestra la misma imagen:
  // la cara de un avatar es la vista previa de su principal en `looks/`.
  if (preview) {
    const written = await writePreviewFile(entryDirectory, preview.image)
    await removeReplacedPreviewFile(entryDirectory, replacedFile, written)
  }

  return { entry: await toAvatarSummary(entryDirectory, id, next) }
}
