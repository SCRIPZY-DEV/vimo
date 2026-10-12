import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { projectsRootOf } from '../../project/paths.ts'
import { validateImageBytes } from '../../providers/image/download.ts'
import type { PipelineContext } from '../../runner/context.ts'
import type { PipelineEmitter } from '../../runner/emitter.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import {
  AVATAR_CARD_LOOK_PREVIEWS,
  AVATAR_ENGINES,
  AVATAR_GENDERS,
  AVATAR_LIBRARY_STATUSES,
  AVATAR_LOOK_ORIGINS,
  AVATAR_LOOK_TYPES,
  AVATAR_OWNERSHIPS,
  avatarEngineAvailable,
} from '../../types/avatar.ts'
import type {
  AvatarEngine,
  AvatarGender,
  AvatarLibraryStatus,
  AvatarLookOrigin,
  AvatarLookSummary,
  AvatarLookType,
  AvatarOrientation,
  AvatarOwnership,
  AvatarSummary,
  HeyGenLook,
} from '../../types/avatar.ts'
import type { DecodedImage } from '../../types/images.ts'
import {
  ensureDirectory,
  readTextWithRetry,
  writeFileAtomic,
} from '../../utils/atomic-fs.ts'
import { sanitizeFileName } from '../../utils/sanitize-file-name.ts'

// Biblioteca de avatares (ADR-0057, enmienda del 2026-10-09): un avatar = un
// grupo de HeyGen con sus looks. `<projectsRoot>/avatars/<id>/` con
// metadata.json, la vista previa del avatar (`preview.<ext>`) y la de cada look
// que se bajó (`looks/<lookId>.<ext>`). Mismo criterio que la de personajes
// (una carpeta por entrada, sin índice): una metadata corrupta se lleva solo a
// ese avatar y borrar es un rm recursivo. La metadata se escribe atómica y,
// como `avatar-refresh` la reescribe desde otro proceso mientras HeyGen
// entrena, quien la modifica relee la última versión justo antes de escribir
// (`updateAvatarMetadata`).
export const AVATARS_SUBDIRECTORY = 'avatars'
export const AVATAR_METADATA_FILE = 'metadata.json'
export const AVATAR_LOOKS_SUBDIRECTORY = 'looks'
// HeyGen ya no tiene el grupo del avatar (404 al refrescarlo): la ficha queda
// `failed` con este código y nada local la revive (diseño §14).
export const AVATAR_GROUP_MISSING_CODE = 'avatar_group_missing'
const PREVIEW_FILE_PREFIX = 'preview.'
const ID_NAME_LIMIT = 32
// Tope de la foto subida, como los personajes (12 MB). HeyGen admite 32 MB.
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024

const AVATAR_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
// En Windows, Defender o el indexador pueden tener abierto un archivo de la
// carpeta de un avatar y el `rm` choca con EBUSY/EPERM: se reintenta con
// backoff lineal, con los mismos ocho intentos y 40 ms de `atomic-fs.ts`.
const ENTRY_REMOVE_MAX_RETRIES = 8
const ENTRY_REMOVE_RETRY_DELAY_MS = 40
// La vista previa de un look se guarda con el id de HeyGen como nombre: solo
// si el id no puede salir de la carpeta (sin `.`, `/` ni `\`). Un look con
// otro id se queda sin vista previa local.
const LOOK_FILE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/
// Las extensiones que `validateImageBytes` reconoce.
const PREVIEW_EXTENSIONS = new Set(['png', 'jpg', 'webp'])
const PREVIEW_FILE_PATTERN = /^preview\.(png|jpg|webp)$/

// Un look persistido, sin vista previa: la suya se deriva de `looks/` al listar.
export interface StoredAvatarLook {
  lookId: string
  name: string
  lookType: AvatarLookType
  supportedEngines: AvatarEngine[]
  preferredOrientation?: AvatarOrientation
  status: AvatarLibraryStatus
  origin: AvatarLookOrigin
  createdAt: string
}

// Metadata persistida: sin id ni rutas absolutas (se derivan al listar, así la
// carpeta raíz puede moverse sin romper la biblioteca).
export interface StoredAvatarMetadata {
  name: string
  groupId: string
  ownership: AvatarOwnership
  gender?: AvatarGender
  status: AvatarLibraryStatus
  errorCode?: string
  // null mientras ningún look sirve de principal (un avatar desde foto que
  // HeyGen todavía entrena).
  mainLookId: string | null
  looks: StoredAvatarLook[]
  // Nombre de la vista previa del avatar con su extensión real
  // (`preview.png`), sin ruta.
  previewFile?: string
  createdAt: string
  syncedAt?: string
}

// Lo que hay en la carpeta de un avatar: metadata válida, la de la entrega 1
// (un look por entrada, que esta versión ya no lee) o nada que sirva.
export type StoredAvatarRead =
  | { state: 'valid'; metadata: StoredAvatarMetadata }
  | { state: 'legacy' }
  | { state: 'invalid' }

// Un avatar leído de disco con la carpeta de la que salió.
export interface StoredAvatar {
  id: string
  entryDirectory: string
  metadata: StoredAvatarMetadata
}

// Estado derivado de un avatar y, si falló, por qué.
export interface AvatarStatusResult {
  status: AvatarLibraryStatus
  errorCode?: string
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

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function toOrientation(value: unknown): AvatarOrientation | undefined {
  if (value === 'portrait' || value === 'landscape' || value === 'square')
    return value
  return undefined
}

function toEngines(value: unknown): AvatarEngine[] {
  if (!Array.isArray(value)) return []
  return value.filter((engine): engine is AvatarEngine =>
    AVATAR_ENGINES.includes(engine as AvatarEngine),
  )
}

// Un look guardado, validado campo por campo: null si le falta lo mínimo (id,
// nombre y un tipo conocido); el resto fuera de rango cae al caso común (listo,
// sin motores, venido de HeyGen, con la fecha del avatar).
function toStoredLook(
  raw: unknown,
  fallbackCreatedAt: string,
): StoredAvatarLook | null {
  if (!raw || typeof raw !== 'object') return null
  const look = raw as Partial<Record<keyof StoredAvatarLook, unknown>>
  const lookType = AVATAR_LOOK_TYPES.find((type) => type === look.lookType)
  if (!isText(look.lookId) || !isText(look.name) || !lookType) return null

  const result: StoredAvatarLook = {
    lookId: look.lookId,
    name: look.name,
    lookType,
    supportedEngines: toEngines(look.supportedEngines),
    status:
      AVATAR_LIBRARY_STATUSES.find((value) => value === look.status) ?? 'ready',
    origin:
      AVATAR_LOOK_ORIGINS.find((value) => value === look.origin) ?? 'heygen',
    createdAt: isText(look.createdAt) ? look.createdAt : fallbackCreatedAt,
  }
  const orientation = toOrientation(look.preferredOrientation)
  if (orientation) result.preferredOrientation = orientation

  return result
}

// La metadata es JSON del disco, editable a mano o escrito por otra versión de
// la app: se valida acá en vez de confiar en el tipo. Sin nombre ni
// `createdAt` de texto no hay tarjeta ni con qué ordenar; sin `groupId` ni
// lista de looks no es un avatar de esta versión. Un look mal formado (o
// repetido) se descarta y un valor fuera de rango cae al caso común (stock,
// listo), sin tumbar ni al listado ni a la tarjeta.
export function parseAvatarMetadata(raw: unknown): StoredAvatarRead {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { state: 'invalid' }
  const metadata = raw as Partial<
    Record<keyof StoredAvatarMetadata | 'lookId', unknown>
  >
  if (!isText(metadata.name) || typeof metadata.createdAt !== 'string')
    return { state: 'invalid' }
  // La entrega 1 guardaba un look por entrada (`lookId` suelto, sin `looks`).
  if ('lookId' in metadata && !Array.isArray(metadata.looks))
    return { state: 'legacy' }
  if (!isText(metadata.groupId) || !Array.isArray(metadata.looks))
    return { state: 'invalid' }

  const looks: StoredAvatarLook[] = []
  for (const rawLook of metadata.looks) {
    const look = toStoredLook(rawLook, metadata.createdAt)
    if (look && !looks.some((known) => known.lookId === look.lookId))
      looks.push(look)
  }
  // Un principal que no está entre los looks válidos es «sin principal».
  const mainLookId = looks.some((look) => look.lookId === metadata.mainLookId)
    ? (metadata.mainLookId as string)
    : null

  const result: StoredAvatarMetadata = {
    name: metadata.name,
    groupId: metadata.groupId,
    ownership:
      AVATAR_OWNERSHIPS.find((value) => value === metadata.ownership) ??
      'stock',
    status:
      AVATAR_LIBRARY_STATUSES.find((value) => value === metadata.status) ??
      'ready',
    mainLookId,
    looks,
    createdAt: metadata.createdAt,
  }
  // Un género guardado que no es male ni female (metadata editada a mano) se
  // descarta: la interfaz solo conoce esos dos.
  const gender = AVATAR_GENDERS.find((value) => value === metadata.gender)
  if (gender) result.gender = gender
  if (isText(metadata.errorCode)) result.errorCode = metadata.errorCode
  // Solo un `preview.<ext>` de esta carpeta: un nombre con otra forma no puede
  // apuntar fuera de ella.
  if (
    typeof metadata.previewFile === 'string' &&
    PREVIEW_FILE_PATTERN.test(metadata.previewFile)
  )
    result.previewFile = metadata.previewFile
  if (isText(metadata.syncedAt)) result.syncedAt = metadata.syncedAt

  return { state: 'valid', metadata: result }
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

export async function readStoredAvatar(
  entryDirectory: string,
): Promise<StoredAvatarRead> {
  try {
    // Con reintento: `avatar-refresh` corre en otro proceso y puede estar
    // reemplazando el archivo; en Windows el lector choca con ese lock.
    const raw = await readTextWithRetry(
      join(entryDirectory, AVATAR_METADATA_FILE),
    )
    return parseAvatarMetadata(JSON.parse(raw))
  } catch {
    // Carpeta ajena o metadata corrupta: se ignora, no rompe el listado.
    return { state: 'invalid' }
  }
}

// La metadata válida de un avatar, o null (no existe, está corrupta o es de la
// entrega 1).
export async function readAvatarMetadata(
  entryDirectory: string,
): Promise<StoredAvatarMetadata | null> {
  const stored = await readStoredAvatar(entryDirectory)
  return stored.state === 'valid' ? stored.metadata : null
}

function avatarNotFound(id: string): PipelineFailure {
  return new PipelineFailure(
    'avatar_not_found',
    `avatar "${id}" is not in the library`,
  )
}

// La metadata de un avatar que el job necesita que exista.
export async function requireAvatarMetadata(
  entryDirectory: string,
  id: string,
): Promise<StoredAvatarMetadata> {
  const metadata = await readAvatarMetadata(entryDirectory)
  if (!metadata) throw avatarNotFound(id)
  return metadata
}

// Relee la metadata justo antes de escribir y le aplica el cambio: lo que otro
// proceso guardó mientras este hablaba con HeyGen (un look generado, el
// principal elegido, un refresco) no se pisa. El cambio es PURO (sin E/S ni
// esperas): todo lo lento (bajar o escribir vistas previas) va antes de
// llamar, así entre la relectura y el rename no pasa nada y un look que otro
// proceso guarda en ese hueco no se pierde. Una función async no se acepta
// (el tipo no la admite y, si llega igual, falla en vez de escribir `{}`).
export async function updateAvatarMetadata(
  entryDirectory: string,
  id: string,
  update: (current: StoredAvatarMetadata) => StoredAvatarMetadata,
): Promise<StoredAvatarMetadata> {
  const current = await requireAvatarMetadata(entryDirectory, id)
  const next = update(current)
  if (next instanceof Promise)
    throw new TypeError('updateAvatarMetadata needs a synchronous update')
  await writeAvatarMetadata(entryDirectory, next)
  return next
}

// Las vistas previas de looks que hay en disco: id del look → archivo. Se lee
// la carpeta una vez por avatar en vez de probar cada extensión de cada look.
async function lookPreviewFiles(
  entryDirectory: string,
): Promise<Map<string, string>> {
  let files: string[]
  try {
    files = await readdir(join(entryDirectory, AVATAR_LOOKS_SUBDIRECTORY))
  } catch {
    return new Map()
  }

  const byLook = new Map<string, string>()
  for (const file of files.sort()) {
    const dot = file.lastIndexOf('.')
    if (dot <= 0 || !PREVIEW_EXTENSIONS.has(file.slice(dot + 1))) continue
    const lookId = file.slice(0, dot)
    if (!LOOK_FILE_ID_PATTERN.test(lookId) || byLook.has(lookId)) continue
    byLook.set(lookId, file)
  }

  return byLook
}

// Los ids de los looks que ya tienen vista previa en disco.
export async function lookIdsWithPreview(
  entryDirectory: string,
): Promise<Set<string>> {
  return new Set((await lookPreviewFiles(entryDirectory)).keys())
}

export async function toAvatarSummary(
  entryDirectory: string,
  id: string,
  metadata: StoredAvatarMetadata,
): Promise<AvatarSummary> {
  const lookFiles = await lookPreviewFiles(entryDirectory)
  const looks = metadata.looks.map((look) => {
    const summary: AvatarLookSummary = {
      lookId: look.lookId,
      name: look.name,
      lookType: look.lookType,
      supportedEngines: [...look.supportedEngines],
      status: look.status,
      origin: look.origin,
      createdAt: look.createdAt,
    }
    if (look.preferredOrientation)
      summary.preferredOrientation = look.preferredOrientation
    const file = lookFiles.get(look.lookId)
    if (file)
      summary.previewPath = join(
        entryDirectory,
        AVATAR_LOOKS_SUBDIRECTORY,
        file,
      )
    return summary
  })

  const entry: AvatarSummary = {
    id,
    name: metadata.name,
    groupId: metadata.groupId,
    ownership: metadata.ownership,
    status: metadata.status,
    mainLookId: metadata.mainLookId,
    looks,
    createdAt: metadata.createdAt,
  }
  if (metadata.gender) entry.gender = metadata.gender
  if (metadata.errorCode) entry.errorCode = metadata.errorCode
  if (metadata.syncedAt) entry.syncedAt = metadata.syncedAt

  // La cara del avatar es la de su look principal; mientras no la hay (una
  // foto que HeyGen entrena), la vista previa propia del avatar.
  const mainPreview = looks.find(
    (look) => look.lookId === metadata.mainLookId,
  )?.previewPath
  if (mainPreview) {
    entry.previewPath = mainPreview
    return entry
  }
  if (!metadata.previewFile) return entry

  const ownPreview = join(entryDirectory, metadata.previewFile)
  if (await fileExists(ownPreview)) entry.previewPath = ownPreview
  return entry
}

export async function readAvatarEntry(
  avatarsDirectory: string,
  id: string,
): Promise<AvatarSummary | null> {
  const entryDirectory = join(avatarsDirectory, id)
  const metadata = await readAvatarMetadata(entryDirectory)
  if (!metadata) return null

  return toAvatarSummary(entryDirectory, id, metadata)
}

// Los avatares válidos de la biblioteca, tal como están en disco. Una carpeta
// de la entrega 1 (un look por entrada) no se lee: avisa por el emitter y la
// persona vuelve a agregar ese avatar (no hay videos que dependan de ella).
export async function listStoredAvatars(
  avatarsDirectory: string,
  emitter?: PipelineEmitter,
): Promise<StoredAvatar[]> {
  let ids: string[]
  try {
    ids = await readdir(avatarsDirectory)
  } catch {
    // La biblioteca todavía no existe: lista vacía, no error.
    return []
  }

  const avatars: StoredAvatar[] = []
  for (const id of ids) {
    if (!AVATAR_ID_PATTERN.test(id)) continue
    const entryDirectory = join(avatarsDirectory, id)
    const stored = await readStoredAvatar(entryDirectory)
    if (stored.state === 'legacy')
      emitter?.emit({
        type: 'log',
        level: 'warn',
        message: `avatar ${id}: metadata from delivery 1 (one look per entry) is no longer read; add the avatar again`,
      })
    // Una metadata que falta o no se puede leer saca al avatar del listado:
    // que quede rastro en el log en vez de desaparecer en silencio.
    if (stored.state === 'invalid')
      emitter?.emit({
        type: 'log',
        level: 'warn',
        message: `avatar ${id}: metadata is missing or unreadable, skipped`,
      })
    if (stored.state !== 'valid') continue
    avatars.push({ id, entryDirectory, metadata: stored.metadata })
  }

  return avatars
}

export async function listAvatarEntries(
  avatarsDirectory: string,
  emitter?: PipelineEmitter,
): Promise<AvatarSummary[]> {
  const entries: AvatarSummary[] = []
  for (const avatar of await listStoredAvatars(avatarsDirectory, emitter))
    entries.push(
      await toAvatarSummary(avatar.entryDirectory, avatar.id, avatar.metadata),
    )

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// El avatar de la biblioteca que ya guarda ese grupo de HeyGen, si hay uno:
// la biblioteca no duplica avatares.
export async function findAvatarByGroup(
  avatarsDirectory: string,
  groupId: string,
): Promise<StoredAvatar | null> {
  const avatars = await listStoredAvatars(avatarsDirectory)
  return avatars.find((avatar) => avatar.metadata.groupId === groupId) ?? null
}

// Borra la carpeta de una entrada de la biblioteca, con todo lo que tiene. Solo
// en disco: no habla con HeyGen. Una carpeta que ya no está no es un error.
// La usan `avatar-delete` (quitar de la biblioteca) y `removeGroupEntries`.
export async function removeAvatarFolder(
  entryDirectory: string,
): Promise<void> {
  await rm(entryDirectory, {
    recursive: true,
    force: true,
    maxRetries: ENTRY_REMOVE_MAX_RETRIES,
    retryDelay: ENTRY_REMOVE_RETRY_DELAY_MS,
  })
}

// Quita de la biblioteca todas las entradas de un grupo de HeyGen (las que la
// biblioteca lee, con metadata válida) y devuelve sus ids, ordenados. Lo llama
// `avatar-heygen-delete` cuando HeyGen ya borró el grupo: una carpeta que no se
// puede borrar no frena a las demás ni tumba el job (el borrado en HeyGen ya
// ocurrió); avisa por el log con el código del sistema, sin la ruta, y queda
// fuera de la lista (sigue en la biblioteca y su refresco la marcará
// `avatar_group_missing`).
export async function removeGroupEntries(
  avatarsDirectory: string,
  groupId: string,
  emitter: PipelineEmitter,
): Promise<string[]> {
  const removed: string[] = []
  for (const avatar of await listStoredAvatars(avatarsDirectory)) {
    if (avatar.metadata.groupId !== groupId) continue

    try {
      await removeAvatarFolder(avatar.entryDirectory)
      removed.push(avatar.id)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code
      emitter.emit({
        type: 'log',
        level: 'warn',
        message: `avatar ${avatar.id}: its group was deleted in HeyGen but its folder could not be removed (${code ?? 'unknown'})`,
      })
    }
  }

  return removed.sort()
}

// Un look de HeyGen como look guardado de la biblioteca. Un look público no
// trae estado: está listo; uno recién creado sin estado, `fallbackStatus`.
export function storedLookOf(
  look: HeyGenLook,
  origin: AvatarLookOrigin,
  createdAt: string,
  fallbackStatus: AvatarLibraryStatus = 'ready',
): StoredAvatarLook {
  const stored: StoredAvatarLook = {
    lookId: look.lookId,
    name: look.name,
    lookType: look.lookType,
    supportedEngines: [...look.supportedEngines],
    status: look.status ?? fallbackStatus,
    origin,
    createdAt,
  }
  if (look.preferredOrientation)
    stored.preferredOrientation = look.preferredOrientation
  return stored
}

// Un look con el que Vimo puede generar: listo y con al menos un motor que
// admite y que Vimo sabe cobrar (entrega 2e, §21.3: antes, solo Avatar III).
// El motor de cada video se elige en Crear (avatarEngineFor).
export function isUsableLook(look: {
  status?: AvatarLibraryStatus
  supportedEngines: AvatarEngine[]
  lookType: AvatarLookType
}): boolean {
  if ((look.status ?? 'ready') !== 'ready') return false

  return AVATAR_ENGINES.some((engine) => avatarEngineAvailable(engine, look))
}

// El look principal tras releer el grupo: el que estaba si sigue; si
// desapareció, el primero listo y compatible; si no hay, el primero listo (la
// tarjeta lo marca «No compatible con Vimo»); sin ninguno listo, ninguno.
export function pickMainLookId(
  looks: StoredAvatarLook[],
  currentMainLookId: string | null,
): string | null {
  if (looks.some((look) => look.lookId === currentMainLookId))
    return currentMainLookId

  const usable = looks.find(isUsableLook)
  if (usable) return usable.lookId

  return looks.find((look) => look.status === 'ready')?.lookId ?? null
}

// Estado del avatar según su look principal y el entrenamiento del grupo
// (`groupStatus`, solo en los propios): listo con el principal listo; fallido
// si falló el entrenamiento; procesando mientras algo entrena; y, si no queda
// ningún look listo ni en camino, fallido por no tener un look que sirva.
export function avatarStatusOf(
  looks: StoredAvatarLook[],
  mainLookId: string | null,
  groupStatus?: AvatarLibraryStatus,
): AvatarStatusResult {
  const main = looks.find((look) => look.lookId === mainLookId)
  if (main?.status === 'ready') return { status: 'ready' }

  if (groupStatus === 'failed' || main?.status === 'failed')
    return { status: 'failed', errorCode: 'avatar_training_failed' }

  const training =
    groupStatus === 'processing' ||
    looks.some((look) => look.status === 'processing')
  if (training) return { status: 'processing' }

  return { status: 'failed', errorCode: 'avatar_no_compatible_look' }
}

// Los looks cuya vista previa conviene tener en disco para la tarjeta: el
// principal y los siguientes que pueden mostrarse a su lado (los que tienen
// vista previa, en disco o para bajar), hasta AVATAR_CARD_LOOK_PREVIEWS.
export function cardLookIds(
  looks: Array<{ lookId: string }>,
  mainLookId: string | null,
  hasPreview: (lookId: string) => boolean,
): string[] {
  const ids = mainLookId ? [mainLookId] : []
  for (const look of looks) {
    if (ids.length >= AVATAR_CARD_LOOK_PREVIEWS) break
    if (look.lookId === mainLookId || !hasPreview(look.lookId)) continue
    ids.push(look.lookId)
  }

  return ids
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

// El nombre de la vista previa del avatar para esa imagen: `preview.<ext>`,
// con su extensión real.
export function previewFileName(image: DecodedImage): string {
  return `${PREVIEW_FILE_PREFIX}${image.ext}`
}

// Guarda la vista previa del avatar con su extensión real y devuelve el nombre
// del archivo.
export async function writePreviewFile(
  entryDirectory: string,
  image: DecodedImage,
): Promise<string> {
  const file = previewFileName(image)
  await writeFileAtomic(join(entryDirectory, file), image.bytes)
  return file
}

// Borra la vista previa que el avatar dejó de usar (otra extensión que la
// actual). Se llama DESPUÉS de escribir la metadata que apunta a la nueva: si
// esa escritura falla, la anterior sigue en su lugar.
export async function removeReplacedPreviewFile(
  entryDirectory: string,
  replacedFile: string | undefined,
  currentFile: string,
): Promise<void> {
  if (!replacedFile || replacedFile === currentFile) return

  await rm(join(entryDirectory, replacedFile), { force: true })
}

// Guarda la vista previa de un look en `looks/<lookId>.<ext>`. Devuelve false
// sin escribir nada si el id no sirve como nombre de archivo.
export async function writeLookPreviewFile(
  entryDirectory: string,
  lookId: string,
  image: DecodedImage,
): Promise<boolean> {
  if (!LOOK_FILE_ID_PATTERN.test(lookId)) return false

  const directory = join(entryDirectory, AVATAR_LOOKS_SUBDIRECTORY)
  await ensureDirectory(directory)
  await writeFileAtomic(join(directory, `${lookId}.${image.ext}`), image.bytes)
  return true
}

// La vista previa de un look que ya está en disco, validada como imagen; null
// si no hay o no se puede leer.
export async function readLookPreview(
  entryDirectory: string,
  lookId: string,
): Promise<DecodedImage | null> {
  const file = (await lookPreviewFiles(entryDirectory)).get(lookId)
  if (!file) return null

  try {
    const bytes = await readFile(
      join(entryDirectory, AVATAR_LOOKS_SUBDIRECTORY, file),
    )
    return validateImageBytes(bytes)
  } catch {
    return null
  }
}

// La vista previa propia del avatar —la `preview.<ext>` que declara su
// metadata— que ya está en disco, validada como imagen; null si no hay o no se
// puede leer. No es `AvatarSummary.previewPath`, que prefiere la del look
// PRINCIPAL: es la cara del grupo, y sirve de respaldo para un look que no trae
// una legible.
export async function readAvatarPreview(
  entryDirectory: string,
  metadata: Pick<StoredAvatarMetadata, 'previewFile'>,
): Promise<DecodedImage | null> {
  if (!metadata.previewFile) return null

  try {
    const bytes = await readFile(join(entryDirectory, metadata.previewFile))
    return validateImageBytes(bytes)
  } catch {
    return null
  }
}
