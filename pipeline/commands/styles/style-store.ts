import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  CustomStyleSummary,
  StyleCharacter,
  StyleSample,
} from '../../types/styles.ts'

// Galería de estilos propios: `<projectsRoot>/_styles/<id>/` con style.json y
// sample-N.jpg — espejo de `estilos-propios/<id>/` del origen y del patrón
// `_history/` de música (la raíz la elige el usuario, ADR-0009).
export const STYLES_SUBDIRECTORY = '_styles'
export const STYLE_FILE = 'style.json'
export const SAMPLE_FILE_PATTERN = /^sample-(\d+)\.jpg$/

// Límites portados del origen (rutas/estilos.ts + util/estilosPropios.ts).
export const STYLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/
export const SYSTEM_PROMPT_CHAR_LIMIT = 30_000
export const MAX_SHOTS = 20
export const MAX_SAMPLES = 8
export const MAX_SAMPLE_BYTES = 4 * 1024 * 1024
// El origen no capaba el nombre; acá se espeja PROJECT_NAME_LIMIT (desviación
// deliberada: un nombre sin tope rompe las tarjetas de la galería).
export const STYLE_NAME_LIMIT = 80
export const DEFAULT_CHARACTER_ID_LIMIT = 120

const STYLE_CHARACTER_MODES: readonly string[] = ['own', 'generic', 'none']

// Lectura tolerante del bloque de personaje: modo fuera de la lista → como si
// no estuviera (= genérico); el puntero solo cuenta con `own`.
export function readStyleCharacter(value: unknown): StyleCharacter | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as { mode?: unknown; defaultCharacterId?: unknown }
  if (
    typeof record.mode !== 'string' ||
    !STYLE_CHARACTER_MODES.includes(record.mode)
  )
    return undefined
  const mode = record.mode as StyleCharacter['mode']
  const id =
    mode === 'own' &&
    typeof record.defaultCharacterId === 'string' &&
    record.defaultCharacterId.trim().length > 0 &&
    record.defaultCharacterId.length <= DEFAULT_CHARACTER_ID_LIMIT
      ? record.defaultCharacterId.trim()
      : undefined
  return id ? { mode, defaultCharacterId: id } : { mode }
}

// Validación estricta del bloque que llega del webview (style-save y el
// snapshot inline de create-video-project): lo que el lector tolera, el
// escritor lo rechaza — un modo inventado es un llamador roto.
export function assertStyleCharacter(
  value: unknown,
  field: string,
): asserts value is StyleCharacter {
  if (!value || typeof value !== 'object')
    throw new PipelineFailure('invalid_payload', `${field} must be an object`)
  const record = value as { mode?: unknown; defaultCharacterId?: unknown }
  if (
    typeof record.mode !== 'string' ||
    !STYLE_CHARACTER_MODES.includes(record.mode)
  )
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.mode must be one of ${STYLE_CHARACTER_MODES.join(', ')}`,
    )
  if (record.defaultCharacterId === undefined) return
  if (record.mode !== 'own')
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.defaultCharacterId only applies to mode own`,
    )
  if (
    typeof record.defaultCharacterId !== 'string' ||
    !record.defaultCharacterId.trim() ||
    record.defaultCharacterId.length > DEFAULT_CHARACTER_ID_LIMIT
  )
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.defaultCharacterId must be a non-empty string of at most ${DEFAULT_CHARACTER_ID_LIMIT} characters`,
    )
}

// Guard anti path-traversal: el id viene del webview (patrón de music).
export function assertValidStyleId(id: string): void {
  if (!STYLE_ID_PATTERN.test(id))
    throw new PipelineFailure('invalid_payload', `invalid style id "${id}"`)
}

export function stylesRoot(context: PipelineContext): string {
  const projectsRoot = context.job.projectsRoot
  if (!projectsRoot)
    throw new PipelineFailure(
      'missing_projects_root',
      'the job did not include projectsRoot',
    )

  return join(projectsRoot, STYLES_SUBDIRECTORY)
}

export function styleDirectory(context: PipelineContext, id: string): string {
  return join(stylesRoot(context), id)
}

// Lo persistido en style.json: sin rutas absolutas ni muestras — se derivan
// al leer, así la carpeta puede moverse.
export interface StoredStyle {
  name: string
  systemPrompt: string
  shots: string[]
  // Se escribe solo si hay: una gema sin bloque sigue siendo un JSON
  // idéntico al de ADR-0018 y se lee como `generic`.
  character?: StyleCharacter
  createdAt: string
}

export async function readStyleSamples(
  directory: string,
): Promise<StyleSample[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }

  const samples: StyleSample[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!SAMPLE_FILE_PATTERN.test(entry.name)) continue
    const path = join(directory, entry.name)
    try {
      const info = await stat(path)
      samples.push({
        file: entry.name,
        path,
        mtimeMs: Math.round(info.mtimeMs),
      })
    } catch {
      // Borrada entre el readdir y el stat: se salta.
    }
  }

  samples.sort((a, b) => sampleNumber(a.file) - sampleNumber(b.file))
  return samples
}

function sampleNumber(file: string): number {
  const match = file.match(SAMPLE_FILE_PATTERN)
  return match ? parseInt(match[1], 10) : 0
}

// null = carpeta ajena o style.json corrupto: se ignora sin romper el listado
// (patrón de music-history y del listado de proyectos).
export async function readStyleEntry(
  context: PipelineContext,
  id: string,
): Promise<CustomStyleSummary | null> {
  const directory = styleDirectory(context, id)

  let stored: StoredStyle
  try {
    stored = JSON.parse(
      await readFile(join(directory, STYLE_FILE), 'utf8'),
    ) as StoredStyle
  } catch {
    return null
  }
  if (typeof stored.name !== 'string') return null
  if (typeof stored.systemPrompt !== 'string') return null

  return {
    id,
    name: stored.name,
    systemPrompt: stored.systemPrompt,
    shots: Array.isArray(stored.shots)
      ? stored.shots.filter((shot) => typeof shot === 'string')
      : [],
    ...(readStyleCharacter(stored.character)
      ? { character: readStyleCharacter(stored.character) }
      : {}),
    createdAt: typeof stored.createdAt === 'string' ? stored.createdAt : '',
    samples: await readStyleSamples(directory),
  }
}
