import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { decodeImageDataUri } from '../../providers/image/download.ts'
import { isCharacterStyleId } from '../../prompts/visual-styles.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  CharacterPreview,
  CharacterSummary,
  NewCharacterPreview,
} from '../../types/characters.ts'
import { sanitizeFileName } from '../../utils/sanitize-file-name.ts'

// Biblioteca de personajes: `<projectsRoot>/characters/<id>/` con metadata.json
// y un preview por estilo. A diferencia del origen no hay index.json: una
// carpeta por personaje hace que una metadata corrupta se lleve solo a ese
// personaje y que borrar sea un rm recursivo (mismo criterio que el historial
// de música).
export const CHARACTERS_SUBDIRECTORY = 'characters'
export const CHARACTER_METADATA_FILE = 'metadata.json'

const PREVIEW_FILE_PREFIX = 'preview.'
const ID_NAME_LIMIT = 32

export const NAME_LIMIT = 80
export const DESCRIPTION_LIMIT = 1200
export const MIN_DESCRIPTION_LENGTH = 10
export const AGE_LIMIT = 40
export const ROLE_LIMIT = 80
export const MAX_PREVIEW_BYTES = 6 * 1024 * 1024
export const MAX_PREVIEWS = 8

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

  return entry
}

export async function readCharacterEntry(
  charactersDirectory: string,
  id: string,
): Promise<CharacterSummary | null> {
  const entryDirectory = join(charactersDirectory, id)
  const metadata = await readCharacterMetadata(entryDirectory)
  if (!metadata?.name) return null

  return toCharacterSummary(entryDirectory, id, metadata)
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
    if (!isCharacterStyleId(preview.styleId)) continue
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
