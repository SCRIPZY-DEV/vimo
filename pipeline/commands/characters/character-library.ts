import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  decodeImageDataUri,
  validateImageBytes,
} from '../../providers/image/download.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  CharacterPreview,
  CharacterSummary,
  NewCharacterPreview,
} from '../../types/characters.ts'
import type { DecodedImage } from '../../types/images.ts'
import { sanitizeFileName } from '../../utils/sanitize-file-name.ts'
import { isPreviewStyleKey } from './preview-style.ts'

// Biblioteca de personajes: `<projectsRoot>/characters/<id>/` con metadata.json,
// un preview por estilo (del catálogo o propio) y, si el personaje es «con
// foto», la foto subida (`photo.<ext>`). A diferencia del origen no hay index.json: una
// carpeta por personaje hace que una metadata corrupta se lleve solo a ese
// personaje y que borrar sea un rm recursivo (mismo criterio que el historial
// de música).
export const CHARACTERS_SUBDIRECTORY = 'characters'
export const CHARACTER_METADATA_FILE = 'metadata.json'

const PREVIEW_FILE_PREFIX = 'preview.'
const PHOTO_FILE_PREFIX = 'photo.'
const ID_NAME_LIMIT = 32

export const NAME_LIMIT = 80
export const DESCRIPTION_LIMIT = 1200
export const MIN_DESCRIPTION_LENGTH = 10
export const AGE_LIMIT = 40
export const ROLE_LIMIT = 80
export const MAX_PREVIEW_BYTES = 6 * 1024 * 1024
export const MAX_PREVIEWS = 8
// Tope de la foto subida, como el origen (12 MB). Se guarda tal cual: sin
// recorte, sin quitar fondo — «solo el personaje, sin fondo» es una
// instrucción al usuario, no un procesamiento.
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024

// Id `<slug-del-nombre>-<aleatorio>`: carpetas legibles y estables (el id no
// cambia al renombrar el personaje).
export function newCharacterId(name: string): string {
  const slug = sanitizeFileName(name).toLowerCase().slice(0, ID_NAME_LIMIT)
  const random = Math.random().toString(36).slice(2, 8)
  return `${slug || 'character'}-${random}`
}

const CHARACTER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

// Guard anti path-traversal: el id viene del webview.
export function assertValidCharacterId(id: string): void {
  if (!CHARACTER_ID_PATTERN.test(id))
    throw new PipelineFailure('invalid_payload', `invalid character id "${id}"`)
}

export function charactersRoot(context: PipelineContext): string {
  const projectsRoot = context.job.projectsRoot
  if (!projectsRoot)
    throw new PipelineFailure(
      'missing_projects_root',
      'the job did not include projectsRoot',
    )

  return join(projectsRoot, CHARACTERS_SUBDIRECTORY)
}

// Metadata persistida: la entrada sin id ni rutas absolutas (se derivan al
// listar, así la carpeta raíz puede moverse sin romper la biblioteca).
export interface StoredCharacterPreview {
  styleId: CharacterPreview['styleId']
  file: string
}

export interface StoredCharacterMetadata {
  name: string
  description: string
  age?: string
  role?: string
  createdAt: string
  previews: StoredCharacterPreview[]
  // `photo.<ext>` dentro de la carpeta: presente = personaje «con foto».
  photoFile?: string
}

export async function writeCharacterMetadata(
  entryDirectory: string,
  metadata: StoredCharacterMetadata,
): Promise<void> {
  await writeFile(
    join(entryDirectory, CHARACTER_METADATA_FILE),
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

export async function readCharacterMetadata(
  entryDirectory: string,
): Promise<StoredCharacterMetadata | null> {
  try {
    const raw = await readFile(
      join(entryDirectory, CHARACTER_METADATA_FILE),
      'utf8',
    )
    return JSON.parse(raw) as StoredCharacterMetadata
  } catch {
    // Carpeta ajena o metadata corrupta: se ignora, no rompe el listado.
    return null
  }
}

export async function toCharacterSummary(
  entryDirectory: string,
  id: string,
  metadata: StoredCharacterMetadata,
): Promise<CharacterSummary> {
  const previews: CharacterPreview[] = []
  for (const preview of metadata.previews ?? []) {
    const imagePath = join(entryDirectory, preview.file)
    if (await fileExists(imagePath))
      previews.push({ styleId: preview.styleId, imagePath })
  }

  const entry: CharacterSummary = {
    id,
    name: metadata.name,
    description: metadata.description,
    createdAt: metadata.createdAt,
    previews,
  }
  if (metadata.age) entry.age = metadata.age
  if (metadata.role) entry.role = metadata.role
  if (metadata.photoFile) {
    const photoPath = join(entryDirectory, metadata.photoFile)
    if (await fileExists(photoPath)) entry.photoPath = photoPath
  }

  return entry
}

export async function readCharacterEntry(
  charactersDirectory: string,
  id: string,
): Promise<CharacterSummary | null> {
  const entryDirectory = join(charactersDirectory, id)
  const metadata = await readCharacterMetadata(entryDirectory)
  if (!metadata?.name) return null

  const entry = await toCharacterSummary(entryDirectory, id, metadata)
  // Un «con foto» que perdió su archivo no se lista (criterio del origen):
  // sin la imagen no tiene identidad que ofrecer, y mostrarlo como «sin
  // foto» con una descripción quizás vacía sería prometer lo que no hay.
  if (metadata.photoFile && !entry.photoPath) return null

  return entry
}

export async function listCharacterEntries(
  charactersDirectory: string,
): Promise<CharacterSummary[]> {
  let ids: string[]
  try {
    ids = await readdir(charactersDirectory)
  } catch {
    // La biblioteca todavía no existe: lista vacía, no error.
    return []
  }

  const entries: CharacterSummary[] = []
  for (const id of ids) {
    if (!CHARACTER_ID_PATTERN.test(id)) continue
    const entry = await readCharacterEntry(charactersDirectory, id)
    if (entry) entries.push(entry)
  }

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Lee y valida la foto elegida con el dialog nativo. A diferencia de los
 * previews no es best-effort: sin foto válida no hay personaje «con foto», así
 * que el fallo es del caller. Ruta del webview → se lee tal cual (el dialog
 * ya la eligió la persona) y se valida por magic bytes, nunca por extensión.
 */
export async function readPhotoFile(sourcePath: string): Promise<DecodedImage> {
  let bytes: Buffer
  try {
    bytes = await readFile(sourcePath)
  } catch {
    throw new PipelineFailure(
      'character_photo_invalid',
      `could not read the photo at "${sourcePath}"`,
    )
  }

  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES)
    throw new PipelineFailure(
      'character_photo_invalid',
      `the photo must be between 1 byte and ${MAX_PHOTO_BYTES} bytes`,
    )

  const image = validateImageBytes(bytes)
  if (!image)
    throw new PipelineFailure(
      'character_photo_invalid',
      'the photo must be a JPEG, PNG or WEBP image',
    )

  return image
}

/** Escribe la foto validada en la carpeta del personaje; devuelve su nombre. */
export async function writePhotoFile(
  entryDirectory: string,
  image: DecodedImage,
): Promise<string> {
  const file = `${PHOTO_FILE_PREFIX}${image.ext}`
  await writeFile(join(entryDirectory, file), image.bytes)
  return file
}

/**
 * Guarda los previews nuevos (data URI) y hace upsert por estilo. Best-effort
 * como el origen: un preview inválido se ignora en vez de tumbar el guardado
 * del personaje.
 */
export async function applyNewPreviews(
  entryDirectory: string,
  current: StoredCharacterPreview[],
  incoming: NewCharacterPreview[],
): Promise<StoredCharacterPreview[]> {
  const previews = [...current]

  for (const preview of incoming.slice(0, MAX_PREVIEWS)) {
    if (!isPreviewStyleKey(preview.styleId)) continue
    const image = decodeImageDataUri(preview.dataUri, MAX_PREVIEW_BYTES)
    if (!image) continue

    const file = `${PREVIEW_FILE_PREFIX}${preview.styleId}.${image.ext}`
    await writeFile(join(entryDirectory, file), image.bytes)

    const existing = previews.findIndex(
      (item) => item.styleId === preview.styleId,
    )
    if (existing < 0) {
      previews.push({ styleId: preview.styleId, file })
      continue
    }

    // Si cambió la extensión, el archivo viejo queda huérfano: se borra.
    const previousFile = previews[existing].file
    if (previousFile !== file)
      await rm(join(entryDirectory, previousFile), { force: true })
    previews[existing] = { styleId: preview.styleId, file }
  }

  return previews.slice(0, MAX_PREVIEWS)
}
