import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { projectsRootOf } from '../../project/paths.ts'
import { validateImageBytes } from '../../providers/image/download.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { PipelineContext } from '../../runner/context.ts'
import {
  AVATAR_ENGINES,
  AVATAR_LIBRARY_STATUSES,
  AVATAR_LOOK_TYPES,
  AVATAR_OWNERSHIPS,
} from '../../types/avatar.ts'
import type {
  AvatarEngine,
  AvatarLibraryStatus,
  AvatarLookType,
  AvatarOrientation,
  AvatarOwnership,
  AvatarSummary,
} from '../../types/avatar.ts'
import type { DecodedImage } from '../../types/images.ts'
import { readTextWithRetry, writeFileAtomic } from '../../utils/atomic-fs.ts'
import { sanitizeFileName } from '../../utils/sanitize-file-name.ts'

// Biblioteca de avatares (ADR-0057): `<projectsRoot>/avatars/<id>/` con
// metadata.json y, si hay, `preview.<ext>`. Mismo criterio que la de
// personajes (una carpeta por entrada, sin índice): una metadata corrupta se
// lleva solo a ese avatar y borrar es un rm recursivo. A diferencia de los
// personajes, la metadata se escribe atómica: `avatar-refresh` la reescribe
// mientras HeyGen entrena.
export const AVATARS_SUBDIRECTORY = 'avatars'
export const AVATAR_METADATA_FILE = 'metadata.json'
const PREVIEW_FILE_PREFIX = 'preview.'
const ID_NAME_LIMIT = 32
// Tope de la foto subida, como los personajes (12 MB). HeyGen admite 32 MB.
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024

const AVATAR_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

// Metadata persistida: sin id ni rutas absolutas (se derivan al listar, así la
// carpeta raíz puede moverse sin romper la biblioteca).
export interface StoredAvatarMetadata {
  name: string
  // null mientras HeyGen entrena un avatar desde foto sin look todavía.
  lookId: string | null
  lookType: AvatarLookType
  ownership: AvatarOwnership
  groupId?: string
  supportedEngines: AvatarEngine[]
  preferredOrientation?: AvatarOrientation
  gender?: string
  status: AvatarLibraryStatus
  errorCode?: string
  previewFile?: string
  createdAt: string
}

// Id `<slug-del-nombre>-<aleatorio>`: carpetas legibles y estables.
export function newAvatarId(name: string): string {
  const slug = sanitizeFileName(name).toLowerCase().slice(0, ID_NAME_LIMIT)
  const random = Math.random().toString(36).slice(2, 8)
  return `${slug || 'avatar'}-${random}`
}

// Guard anti path-traversal: el id viene del webview.
export function assertValidAvatarId(id: string): void {
  if (!AVATAR_ID_PATTERN.test(id))
    throw new PipelineFailure('invalid_payload', `invalid avatar id "${id}"`)
}

export function avatarsRoot(context: PipelineContext): string {
  return join(projectsRootOf(context), AVATARS_SUBDIRECTORY)
}

export async function writeAvatarMetadata(
  entryDirectory: string,
  metadata: StoredAvatarMetadata,
): Promise<void> {
  await writeFileAtomic(
    join(entryDirectory, AVATAR_METADATA_FILE),
    `${JSON.stringify(metadata, null, 2)}\n`,
  )
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function readAvatarMetadata(
  entryDirectory: string,
): Promise<StoredAvatarMetadata | null> {
  try {
    // Con reintento: `avatar-refresh` corre en otro proceso y puede estar
    // reemplazando el archivo; en Windows el lector choca con ese lock.
    const raw = await readTextWithRetry(
      join(entryDirectory, AVATAR_METADATA_FILE),
    )
    return JSON.parse(raw) as StoredAvatarMetadata
  } catch {
    // Carpeta ajena o metadata corrupta: se ignora, no rompe el listado.
    return null
  }
}

export async function toAvatarSummary(
  entryDirectory: string,
  id: string,
  metadata: StoredAvatarMetadata,
): Promise<AvatarSummary> {
  // La metadata es JSON del disco, editable a mano o escrito por otra versión
  // de la app: lo que sale hacia la interfaz se valida acá en vez de confiar en
  // el tipo. Un valor fuera de rango cae al caso común (un avatar de stock,
  // listo, sin motores) y no tumba ni al listado ni a la tarjeta.
  const supportedEngines = Array.isArray(metadata.supportedEngines)
    ? metadata.supportedEngines.filter((engine) =>
        AVATAR_ENGINES.includes(engine),
      )
    : []
  const entry: AvatarSummary = {
    id,
    name: metadata.name,
    lookId: metadata.lookId ?? null,
    lookType: metadata.lookType,
    ownership:
      AVATAR_OWNERSHIPS.find((value) => value === metadata.ownership) ??
      'stock',
    supportedEngines,
    status:
      AVATAR_LIBRARY_STATUSES.find((value) => value === metadata.status) ??
      'ready',
    createdAt: metadata.createdAt,
  }
  if (metadata.groupId) entry.groupId = metadata.groupId
  if (metadata.preferredOrientation)
    entry.preferredOrientation = metadata.preferredOrientation
  if (metadata.gender) entry.gender = metadata.gender
  if (metadata.errorCode) entry.errorCode = metadata.errorCode
  // Un `previewFile` que no es texto (metadata editada a mano) cuenta como
  // ausente: `join` lanzaría y el listado completo se caería por una entrada.
  if (typeof metadata.previewFile === 'string' && metadata.previewFile) {
    const previewPath = join(entryDirectory, metadata.previewFile)
    if (await fileExists(previewPath)) entry.previewPath = previewPath
  }

  return entry
}

export async function readAvatarEntry(
  avatarsDirectory: string,
  id: string,
): Promise<AvatarSummary | null> {
  const entryDirectory = join(avatarsDirectory, id)
  const metadata = await readAvatarMetadata(entryDirectory)
  if (!metadata?.name) return null

  // Sin un `createdAt` de texto no hay con qué ordenar el listado: la entrada
  // se trata como una metadata ilegible, igual que una sin nombre.
  if (typeof metadata.createdAt !== 'string') return null

  // Un tipo de look que esta versión no conoce no tiene tarjeta ni motores con
  // los que usarse: también se trata como ilegible, no se inventa uno.
  if (!AVATAR_LOOK_TYPES.includes(metadata.lookType)) return null

  return toAvatarSummary(entryDirectory, id, metadata)
}

export async function listAvatarEntries(
  avatarsDirectory: string,
): Promise<AvatarSummary[]> {
  let ids: string[]
  try {
    ids = await readdir(avatarsDirectory)
  } catch {
    // La biblioteca todavía no existe: lista vacía, no error.
    return []
  }

  const entries: AvatarSummary[] = []
  for (const id of ids) {
    if (!AVATAR_ID_PATTERN.test(id)) continue
    const entry = await readAvatarEntry(avatarsDirectory, id)
    if (entry) entries.push(entry)
  }

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function unreadablePhoto(sourcePath: string): PipelineFailure {
  return new PipelineFailure(
    'avatar_photo_invalid',
    `could not read the photo at "${sourcePath}"`,
  )
}

// Lee y valida la foto elegida con el dialog nativo: por magic bytes, nunca
// por extensión, y con tope de tamaño. Sin foto válida no hay avatar. Solo
// JPEG y PNG: `POST /v3/assets` de HeyGen no acepta WEBP (su OpenAPI lista
// png, jpeg, mp4, webm, mp3, wav, pdf y srt), así que un WEBP se rechaza acá,
// gratis, y no se descubre después de subirlo.
export async function readAvatarPhoto(
  sourcePath: string,
): Promise<DecodedImage> {
  // El tope sale del `stat`, antes de leer: una foto enorme no se carga en
  // memoria solo para rechazarla.
  let size: number
  try {
    size = (await stat(sourcePath)).size
  } catch {
    throw unreadablePhoto(sourcePath)
  }

  if (!size || size > MAX_PHOTO_BYTES)
    throw new PipelineFailure(
      'avatar_photo_invalid',
      `the photo must be between 1 byte and ${MAX_PHOTO_BYTES} bytes`,
    )

  let bytes: Buffer
  try {
    bytes = await readFile(sourcePath)
  } catch {
    throw unreadablePhoto(sourcePath)
  }

  const image = validateImageBytes(bytes)
  if (!image)
    throw new PipelineFailure(
      'avatar_photo_invalid',
      'the photo must be a JPEG or PNG image',
    )

  if (image.ext === 'webp')
    throw new PipelineFailure(
      'avatar_photo_invalid',
      'HeyGen only accepts JPEG or PNG photos',
    )

  return image
}

// Guarda el preview con su extensión real y devuelve el nombre del archivo.
export async function writePreviewFile(
  entryDirectory: string,
  image: DecodedImage,
): Promise<string> {
  const file = `${PREVIEW_FILE_PREFIX}${image.ext}`
  await writeFileAtomic(join(entryDirectory, file), image.bytes)
  return file
}
