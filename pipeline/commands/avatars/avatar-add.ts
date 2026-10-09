import { join } from 'node:path'

import { downloadImage } from '../../providers/image/download.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import {
  AVATAR_ENGINES,
  AVATAR_LIBRARY_STATUSES,
  AVATAR_LOOK_TYPES,
  AVATAR_NAME_LIMIT,
} from '../../types/avatar.ts'
import type {
  AvatarAddPayload,
  AvatarAddResult,
  AvatarEngine,
  HeyGenLook,
} from '../../types/avatar.ts'
import type { DecodedImage } from '../../types/images.ts'
import { ensureDirectory } from '../../utils/atomic-fs.ts'
import {
  avatarsRoot,
  listAvatarEntries,
  newAvatarId,
  toAvatarSummary,
  writeAvatarMetadata,
  writePreviewFile,
} from './avatar-library.ts'
import type { StoredAvatarMetadata } from './avatar-library.ts'

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

// El look viene del webview: se queda solo con lo que tiene forma conocida.
export function sanitizeLook(raw: unknown): HeyGenLook {
  const look = (raw ?? {}) as Partial<Record<keyof HeyGenLook, unknown>>
  const lookType = AVATAR_LOOK_TYPES.find((type) => type === look.lookType)
  // El nombre se valida ya recortado: uno de solo espacios dejaría una entrada
  // sin nombre, que el listado oculta.
  const name = isString(look.name)
    ? look.name.trim().slice(0, AVATAR_NAME_LIMIT)
    : ''
  if (!isString(look.lookId) || !name || !lookType)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.look needs lookId, name and a known lookType',
    )

  const supportedEngines = Array.isArray(look.supportedEngines)
    ? look.supportedEngines.filter((engine): engine is AvatarEngine =>
        AVATAR_ENGINES.includes(engine as AvatarEngine),
      )
    : []
  const result: HeyGenLook = {
    lookId: look.lookId,
    name,
    lookType,
    supportedEngines,
  }
  if (isString(look.groupId)) result.groupId = look.groupId
  if (
    isString(look.previewImageUrl) &&
    /^https:\/\//.test(look.previewImageUrl)
  )
    result.previewImageUrl = look.previewImageUrl
  if (isString(look.gender)) result.gender = look.gender
  // El estado de entrenamiento viaja con el look: un look propio que HeyGen
  // todavía entrena se guarda «processing», no «ready».
  const status = AVATAR_LIBRARY_STATUSES.find((value) => value === look.status)
  if (status) result.status = status
  const orientation = look.preferredOrientation
  if (
    orientation === 'portrait' ||
    orientation === 'landscape' ||
    orientation === 'square'
  )
    result.preferredOrientation = orientation

  return result
}

// Baja la vista previa del look. Best-effort: sin ella el avatar sigue
// sirviendo para generar, así que un fallo de descarga solo avisa; una
// cancelación pedida por la persona sí se propaga.
async function downloadPreview(
  context: PipelineContext,
  id: string,
  previewImageUrl: string | undefined,
): Promise<DecodedImage | null> {
  if (!previewImageUrl) return null

  try {
    return await downloadImage(previewImageUrl, context.signal)
  } catch (error) {
    if (context.signal.aborted) throw error
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `avatar ${id}: preview download failed, saved without it`,
    })
    return null
  }
}

// Guarda un look de HeyGen en la biblioteca con su vista previa. Un look ya
// agregado devuelve la entrada existente: la biblioteca no duplica.
export async function avatarAdd(
  context: PipelineContext,
): Promise<AvatarAddResult> {
  const payload = context.job.payload as AvatarAddPayload | undefined
  const look = sanitizeLook(payload?.look)
  const ownership = payload?.ownership === 'own' ? 'own' : 'stock'

  const directory = avatarsRoot(context)
  const existing = (await listAvatarEntries(directory)).find(
    (entry) => entry.lookId === look.lookId,
  )
  if (existing) return { entry: existing }

  const id = newAvatarId(look.name)
  const entryDirectory = join(directory, id)

  // La vista previa se baja ANTES de crear la carpeta: si la persona cancela
  // durante la descarga no queda una carpeta huérfana sin metadata.
  const preview = await downloadPreview(context, id, look.previewImageUrl)
  await ensureDirectory(entryDirectory)

  const metadata: StoredAvatarMetadata = {
    name: look.name,
    lookId: look.lookId,
    lookType: look.lookType,
    ownership,
    supportedEngines: look.supportedEngines,
    status: look.status ?? 'ready',
    createdAt: new Date().toISOString(),
  }
  if (look.groupId) metadata.groupId = look.groupId
  if (look.preferredOrientation)
    metadata.preferredOrientation = look.preferredOrientation
  if (look.gender) metadata.gender = look.gender
  if (preview)
    metadata.previewFile = await writePreviewFile(entryDirectory, preview)

  await writeAvatarMetadata(entryDirectory, metadata)

  return { entry: await toAvatarSummary(entryDirectory, id, metadata) }
}
