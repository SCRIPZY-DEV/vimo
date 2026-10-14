import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { PipelineFailure } from '../../runner/failure.ts'
import type { PipelineContext } from '../../runner/context.ts'
import type { VoiceHistoryEntry } from '../../types/voices.ts'
import { newNamedEntryId } from '../../utils/named-entry-id.ts'

// Historial persistente de voces: `<projectsRoot>/_history/voices/<id>/` con
// audio.mp3 y metadata.json. Misma convención que el historial de música
// (carpeta raíz de proyectos, ADR-0009); la inyecta Rust en el job.
export const VOICE_HISTORY_SUBDIRECTORY = '_history/voices'
export const HISTORY_AUDIO_FILE = 'audio.mp3'
export const HISTORY_METADATA_FILE = 'metadata.json'

// Ids `<slug-del-nombre-de-la-voz>-<aleatorio>`, como los personajes: la
// carpeta se reconoce al abrirla. Las entradas viejas (`v-<timestamp36>-…`)
// se siguen listando: el orden sale de createdAt, no del id.
export function newHistoryId(voiceName: string | undefined): string {
  return newNamedEntryId(voiceName, 'voice')
}

const HISTORY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

// Guard anti path-traversal: el id viene del webview.
export function assertValidHistoryId(id: string): void {
  if (!HISTORY_ID_PATTERN.test(id))
    throw new PipelineFailure('invalid_payload', `invalid history id "${id}"`)
}

export function voiceHistoryRoot(context: PipelineContext): string {
  const projectsRoot = context.job.projectsRoot
  if (!projectsRoot)
    throw new PipelineFailure(
      'missing_projects_root',
      'the job did not include projectsRoot',
    )

  return join(projectsRoot, VOICE_HISTORY_SUBDIRECTORY)
}

// Metadata persistida en disco: la entrada sin la ruta absoluta, que se
// deriva al listar (así la carpeta puede moverse sin romper el historial).
export type StoredVoiceMetadata = Omit<VoiceHistoryEntry, 'audioPath'>

export async function writeHistoryMetadata(
  entryDirectory: string,
  metadata: StoredVoiceMetadata,
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
): Promise<VoiceHistoryEntry | null> {
  const entryDirectory = join(historyRoot, id)
  let metadata: StoredVoiceMetadata
  try {
    const raw = await readFile(
      join(entryDirectory, HISTORY_METADATA_FILE),
      'utf8',
    )
    metadata = JSON.parse(raw) as StoredVoiceMetadata
  } catch {
    // Carpeta ajena o metadata corrupta: se ignora, no rompe el listado.
    return null
  }

  const audioPath = join(entryDirectory, HISTORY_AUDIO_FILE)
  if (!(await fileExists(audioPath))) return null

  return { ...metadata, id, audioPath }
}

export async function listHistoryEntries(
  historyRoot: string,
): Promise<VoiceHistoryEntry[]> {
  let ids: string[]
  try {
    ids = await readdir(historyRoot)
  } catch {
    // El historial todavía no existe: lista vacía, no error.
    return []
  }

  const entries: VoiceHistoryEntry[] = []
  for (const id of ids) {
    if (!HISTORY_ID_PATTERN.test(id)) continue
    const entry = await readHistoryEntry(historyRoot, id)
    if (entry) entries.push(entry)
  }

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
