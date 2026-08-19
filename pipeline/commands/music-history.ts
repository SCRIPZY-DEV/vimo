import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { PipelineFailure } from '../runner/failure.ts'
import type { PipelineContext } from '../runner/context.ts'
import type { MusicHistoryEntry } from '../types/music.ts'

// Historial persistente de música: `<projectsRoot>/_history/music/<id>/` con
// audio.mp3, cover.jpg (opcional) y metadata.json. La ubicación la decidió el
// usuario (carpeta raíz de proyectos, ADR-0009) y la inyecta Rust en el job.
export const MUSIC_HISTORY_SUBDIRECTORY = '_history/music'
export const HISTORY_AUDIO_FILE = 'audio.mp3'
export const HISTORY_COVER_FILE = 'cover.jpg'
export const HISTORY_METADATA_FILE = 'metadata.json'

// Ids `m-<timestamp36>-<rand>`: orden cronológico y sin caracteres raros.
export function newHistoryId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `m-${Date.now().toString(36)}-${random}`
}

const HISTORY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

// Guard anti path-traversal: el id viene del webview.
export function assertValidHistoryId(id: string): void {
  if (!HISTORY_ID_PATTERN.test(id))
    throw new PipelineFailure('invalid_payload', `invalid history id "${id}"`)
}

export function musicHistoryRoot(context: PipelineContext): string {
  const projectsRoot = context.job.projectsRoot
  if (!projectsRoot)
    throw new PipelineFailure(
      'missing_projects_root',
      'the job did not include projectsRoot',
    )

  return join(projectsRoot, MUSIC_HISTORY_SUBDIRECTORY)
}

// Metadata persistida en disco: la entrada sin las rutas absolutas, que se
// derivan al listar (así la carpeta puede moverse sin romper el historial).
type StoredMusicMetadata = Omit<MusicHistoryEntry, 'audioPath' | 'coverPath'>

export async function writeHistoryMetadata(
  entryDirectory: string,
  metadata: StoredMusicMetadata,
): Promise<void> {
  await writeFile(
    join(entryDirectory, HISTORY_METADATA_FILE),
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

export async function readHistoryEntry(
  historyRoot: string,
  id: string,
): Promise<MusicHistoryEntry | null> {
  const entryDirectory = join(historyRoot, id)
  let metadata: StoredMusicMetadata
  try {
    const raw = await readFile(
      join(entryDirectory, HISTORY_METADATA_FILE),
      'utf8',
    )
    metadata = JSON.parse(raw) as StoredMusicMetadata
  } catch {
    // Carpeta ajena o metadata corrupta: se ignora, no rompe el listado.
    return null
  }

  const audioPath = join(entryDirectory, HISTORY_AUDIO_FILE)
  if (!(await fileExists(audioPath))) return null

  const coverPath = join(entryDirectory, HISTORY_COVER_FILE)
  const entry: MusicHistoryEntry = { ...metadata, id, audioPath }
  if (await fileExists(coverPath)) entry.coverPath = coverPath

  return entry
}

export async function listHistoryEntries(
  historyRoot: string,
): Promise<MusicHistoryEntry[]> {
  let ids: string[]
  try {
    ids = await readdir(historyRoot)
  } catch {
    // El historial todavía no existe: lista vacía, no error.
    return []
  }

  const entries: MusicHistoryEntry[] = []
  for (const id of ids) {
    if (!HISTORY_ID_PATTERN.test(id)) continue
    const entry = await readHistoryEntry(historyRoot, id)
    if (entry) entries.push(entry)
  }

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
