import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { isCharacterStyleId } from '../../prompts/visual-styles.ts'
import { validateYouTubeUrl } from '../../providers/ytdlp/download.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { MAX_WOVEN_IDENTITY_CHARS } from '../../stages/scene-prompts/verbatim/subject-weaver.ts'
import {
  COLOR_FILTER_IDS,
  GEM_SECTION_KEYS,
  GEM_TEMPLATE_VERSION,
  type AiCloneGemOrigin,
  type ColorFilterId,
  type CustomStyleSummary,
  type GemOrigin,
  type GemSectionKey,
  type GemSections,
  type StyleCharacter,
  type StyleSample,
} from '../../types/styles.ts'

// Galería de estilos propios: `<projectsRoot>/_styles/<id>/` con style.json y
// sample-N.jpg — espejo de `estilos-propios/<id>/` del origen y del patrón
// `_history/` de música (la raíz la elige el usuario, ADR-0009).
export const STYLES_SUBDIRECTORY = '_styles'
export const STYLE_FILE = 'style.json'
export const SAMPLE_FILE_PATTERN = /^sample-(\d+)\.jpg$/

// Límites portados del origen (rutas/estilos.ts + util/estilosPropios.ts).
// Desviación deliberada: una gema admite hasta 100 000 caracteres, no los
// 30 000 del origen, porque hay gemas más largas (ADR-0048).
export const STYLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/
export const SYSTEM_PROMPT_CHAR_LIMIT = 100_000
export const MAX_SHOTS = 20
export const MAX_SAMPLES = 8
export const MAX_SAMPLE_BYTES = 4 * 1024 * 1024
// El origen no capaba el nombre; acá se espeja PROJECT_NAME_LIMIT (desviación
// deliberada: un nombre sin tope rompe las tarjetas de la galería).
export const STYLE_NAME_LIMIT = 80
export const DEFAULT_CHARACTER_ID_LIMIT = 120

// Límites de una gema de plantilla (spec §4.1, ADR-0048): cada sección hasta
// 12 000 y la suma hasta 30 000, porque las secciones van en cada pedido de
// prompts; una gema pegada más larga la condensa el agente. `character` se
// teje entera en cada escena, así que su tope es el de la identidad tejida;
// el inicio y el final fijos se pegan en cada prompt de imagen.
export const GEM_SECTION_CHAR_LIMIT = 12_000
export const GEM_SECTIONS_TOTAL_CHAR_LIMIT = 30_000
export const CHARACTER_SECTION_CHAR_LIMIT = MAX_WOVEN_IDENTITY_CHARS
// Tope del inicio fijo (`promptStart`).
export const FIXED_PHRASE_CHAR_LIMIT = 600
// Tope del final fijo (`promptEnd`). Es mayor que el del inicio porque el
// cierre de un estilo clonado con IA lleva su ficha de estilo, igual en cada
// imagen: es lo que hace que salgan parecidas (ADR-0050). No puede ser más
// largo: el cuerpo de un prompt final tiene 2 106 caracteres
// (FINAL_PROMPT_BODY_BUDGET) para la escena, la identidad del personaje (hasta
// 700) y este cierre; con 1 000 a la escena le quedan al menos 400.
export const PROMPT_END_CHAR_LIMIT = 1_000
// El texto original que se mandó al agente (solo respaldo): el mismo tope
// que acepta el agente.
export const SOURCE_PROMPT_CHAR_LIMIT = SYSTEM_PROMPT_CHAR_LIMIT

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

function sectionCharLimit(key: GemSectionKey): number {
  if (key === 'character') return CHARACTER_SECTION_CHAR_LIMIT
  if (key === 'promptStart') return FIXED_PHRASE_CHAR_LIMIT
  if (key === 'promptEnd') return PROMPT_END_CHAR_LIMIT
  return GEM_SECTION_CHAR_LIMIT
}

// Lectura tolerante de las secciones: sin `visualStyle` no hay gema de
// plantilla; una sección que no es texto, o que quedó vacía, no está.
export function readGemSections(value: unknown): GemSections | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const visualStyle =
    typeof record.visualStyle === 'string' ? record.visualStyle.trim() : ''
  if (!visualStyle) return undefined

  const sections: GemSections = { visualStyle }
  for (const key of GEM_SECTION_KEYS) {
    if (key === 'visualStyle') continue
    const text = record[key]
    if (typeof text === 'string' && text.trim()) sections[key] = text.trim()
  }
  return sections
}

// Validación estricta de las secciones que llegan del webview. Devuelve las
// secciones normalizadas: recortadas, sin las vacías y sin claves ajenas.
export function assertGemSections(value: unknown, field: string): GemSections {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PipelineFailure('invalid_payload', `${field} must be an object`)
  const record = value as Record<string, unknown>

  const sections: Partial<GemSections> = {}
  let total = 0
  for (const key of GEM_SECTION_KEYS) {
    const text = record[key]
    if (text === undefined) continue
    if (typeof text !== 'string')
      throw new PipelineFailure(
        'invalid_payload',
        `${field}.${key} must be a string`,
      )
    const trimmed = text.trim()
    if (!trimmed) continue
    const limit = sectionCharLimit(key)
    if (trimmed.length > limit)
      throw new PipelineFailure(
        'invalid_payload',
        `${field}.${key} exceeds ${limit} characters`,
      )
    total += trimmed.length
    sections[key] = trimmed
  }

  if (!sections.visualStyle)
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.visualStyle is required`,
    )
  if (total > GEM_SECTIONS_TOTAL_CHAR_LIMIT)
    throw new PipelineFailure(
      'invalid_payload',
      `${field} exceed ${GEM_SECTIONS_TOTAL_CHAR_LIMIT} characters in total`,
    )
  return { ...sections, visualStyle: sections.visualStyle }
}

export function assertTemplateVersion(
  value: unknown,
  field: string,
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > GEM_TEMPLATE_VERSION
  )
    throw new PipelineFailure(
      'invalid_payload',
      `${field} must be an integer between 1 and ${GEM_TEMPLATE_VERSION}`,
    )
}

function readTemplateVersion(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
    return undefined
  return value
}

// Ausente o fuera de la lista = sin preset (se lee como `none`).
export function readColorFilter(value: unknown): ColorFilterId | undefined {
  return COLOR_FILTER_IDS.find((id) => id === value)
}

export function assertColorFilter(
  value: unknown,
  field: string,
): asserts value is ColorFilterId {
  if (readColorFilter(value) === undefined)
    throw new PipelineFailure(
      'invalid_payload',
      `${field} must be one of ${COLOR_FILTER_IDS.join(', ')}`,
    )
}

// Id de un estilo del catálogo dentro de una copia o de un snapshot: uno de
// los 5 heredados (`isCharacterStyleId`, propiedad propia de VISUAL_STYLES:
// `constructor` cumple el patrón de la galería pero no es un estilo) o uno
// nuevo con el patrón de la galería (spec §8).
export function isCatalogStyleId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (STYLE_ID_PATTERN.test(value)) return true
  return isCharacterStyleId(value)
}

// El link de un video de YouTube, o undefined si no lo es: el origen de un
// estilo clonado solo guarda links que la app puede volver a abrir.
function youtubeUrlOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    return validateYouTubeUrl(value)
  } catch {
    return undefined
  }
}

function readAiCloneOrigin(record: {
  source?: unknown
  videoUrl?: unknown
}): AiCloneGemOrigin | undefined {
  if (record.source === 'images') return { kind: 'ai-clone', source: 'images' }
  if (record.source !== 'youtube') return undefined
  const videoUrl = youtubeUrlOf(record.videoUrl)
  return { kind: 'ai-clone', source: 'youtube', ...(videoUrl && { videoUrl }) }
}

export function readGemOrigin(value: unknown): GemOrigin | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as {
    kind?: unknown
    catalogStyleId?: unknown
    name?: unknown
    source?: unknown
    videoUrl?: unknown
  }
  if (record.kind === 'ai-clone') return readAiCloneOrigin(record)
  if (record.kind !== 'catalog') return undefined
  if (!isCatalogStyleId(record.catalogStyleId)) return undefined
  if (typeof record.name !== 'string' || !record.name.trim()) return undefined
  return {
    kind: 'catalog',
    catalogStyleId: record.catalogStyleId,
    name: record.name.trim(),
  }
}

function assertAiCloneOrigin(
  record: { source?: unknown; videoUrl?: unknown },
  field: string,
): void {
  if (record.source !== 'youtube' && record.source !== 'images')
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.source must be youtube or images`,
    )
  if (record.videoUrl === undefined) return
  if (record.source !== 'youtube')
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.videoUrl only applies to source youtube`,
    )
  if (youtubeUrlOf(record.videoUrl) !== record.videoUrl)
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.videoUrl must be a normalized https YouTube link`,
    )
}

export function assertGemOrigin(
  value: unknown,
  field: string,
): asserts value is GemOrigin {
  if (!value || typeof value !== 'object')
    throw new PipelineFailure('invalid_payload', `${field} must be an object`)
  const record = value as {
    kind?: unknown
    catalogStyleId?: unknown
    name?: unknown
    source?: unknown
    videoUrl?: unknown
  }
  if (record.kind === 'ai-clone') {
    assertAiCloneOrigin(record, field)
    return
  }
  if (record.kind !== 'catalog')
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.kind must be catalog or ai-clone`,
    )
  if (!isCatalogStyleId(record.catalogStyleId))
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.catalogStyleId is not a valid style id`,
    )
  if (
    typeof record.name !== 'string' ||
    !record.name.trim() ||
    record.name.trim().length > STYLE_NAME_LIMIT
  )
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.name must be a non-empty string of at most ${STYLE_NAME_LIMIT} characters`,
    )
}

// Guard anti path-traversal: el id viene del webview (patrón de music).
export function assertValidStyleId(id: string): void {
  if (!STYLE_ID_PATTERN.test(id))
    throw new PipelineFailure('invalid_payload', `invalid style id "${id}"`)
}

// Id de un estilo propio nuevo con el formato de la app (`newCustomStyleId`
// de src/modules/videos/constants.ts): `st-<timestamp36>-<rand>`, cronológico
// y dentro de STYLE_ID_PATTERN. Lo usa la copia de «Pasar a mi estilo», que
// crea el estilo del lado del sidecar.
export function newCustomStyleId(): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `st-${Date.now().toString(36)}-${random}`
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
// al leer, así la carpeta puede moverse. Una gema es VIEJA (`systemPrompt`) o
// de PLANTILLA (`sections`), nunca las dos (ADR-0048).
export interface StoredStyle {
  name: string
  systemPrompt?: string
  sections?: GemSections
  templateVersion?: number
  // Respaldo del texto que se mandó al agente: no se usa para generar.
  sourcePrompt?: string
  colorFilter?: ColorFilterId
  origin?: GemOrigin
  shots: string[]
  // Se escribe solo si hay: una gema sin bloque sigue siendo un JSON
  // idéntico al de ADR-0018 y se lee como `generic`.
  character?: StyleCharacter
  createdAt: string
  updatedAt?: string
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

// Los tres primeros bytes de todo JPEG (SOI y el primer marcador).
const JPEG_MAGIC = [0xff, 0xd8, 0xff]
// El base64 más largo que puede traer una muestra de MAX_SAMPLE_BYTES: se
// rechaza antes de decodificar un texto enorme.
const MAX_SAMPLE_BASE64_LENGTH = Math.ceil(MAX_SAMPLE_BYTES / 3) * 4

/** Una muestra que llegó en base64, ya validada y lista para escribir. */
export interface SampleUploadBytes {
  file: string
  bytes: Buffer
}

// Una muestra que llega del webview como `{ file, base64 }` (la copia de
// «Pasar a mi estilo»). El nombre es el de una muestra de la galería
// (`sample-<n>.jpg`, n = 1..sampleLimit y sin ceros a la izquierda: el nombre
// es la ruta del archivo), el base64 es el canónico (sin prefijo `data:` ni
// saltos de línea) y los bytes son un JPEG de hasta MAX_SAMPLE_BYTES.
export function assertSampleUpload(
  value: unknown,
  field: string,
  sampleLimit: number,
): SampleUploadBytes {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PipelineFailure('invalid_payload', `${field} must be an object`)
  const record = value as { file?: unknown; base64?: unknown }

  if (!isSampleFile(record.file, sampleLimit))
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.file must be one of sample-1.jpg to sample-${sampleLimit}.jpg`,
    )
  if (
    typeof record.base64 !== 'string' ||
    record.base64.length > MAX_SAMPLE_BASE64_LENGTH
  )
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.base64 must be the base64 of at most ${MAX_SAMPLE_BYTES} bytes`,
    )

  // Node decodifica sin quejarse de lo que no entiende: el texto vale solo si
  // la vuelta a base64 lo reproduce igual.
  const bytes = Buffer.from(record.base64, 'base64')
  if (bytes.toString('base64') !== record.base64)
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.base64 is not valid base64`,
    )
  if (bytes.length > MAX_SAMPLE_BYTES)
    throw new PipelineFailure(
      'invalid_payload',
      `${field} exceeds ${MAX_SAMPLE_BYTES} bytes`,
    )
  if (!JPEG_MAGIC.every((byte, index) => bytes[index] === byte))
    throw new PipelineFailure('invalid_payload', `${field} is not a JPEG image`)
  return { file: record.file, bytes }
}

function isSampleFile(file: unknown, sampleLimit: number): file is string {
  if (typeof file !== 'string') return false
  const number = sampleNumber(file)
  return number >= 1 && number <= sampleLimit && file === `sample-${number}.jpg`
}

// null = carpeta ajena o style.json corrupto: se ignora sin romper el listado
// (patrón de music-history y del listado de proyectos). Si un archivo trae
// secciones Y systemPrompt, mandan las secciones: el resumen nunca lleva los
// dos.
export async function readStyleEntry(
  context: PipelineContext,
  id: string,
): Promise<CustomStyleSummary | null> {
  const directory = styleDirectory(context, id)

  let stored: StoredStyle | null
  try {
    stored = JSON.parse(
      await readFile(join(directory, STYLE_FILE), 'utf8'),
    ) as StoredStyle | null
  } catch {
    return null
  }
  // JSON válido que no es un objeto (`null`, una lista, un número): corrupto.
  if (!stored || typeof stored !== 'object') return null
  if (typeof stored.name !== 'string') return null
  const sections = readGemSections(stored.sections)
  if (!sections && typeof stored.systemPrompt !== 'string') return null

  const templateVersion = sections
    ? readTemplateVersion(stored.templateVersion)
    : undefined
  const sourcePrompt =
    typeof stored.sourcePrompt === 'string' && stored.sourcePrompt.trim()
      ? stored.sourcePrompt
      : undefined
  const colorFilter = readColorFilter(stored.colorFilter)
  const origin = readGemOrigin(stored.origin)
  const character = readStyleCharacter(stored.character)
  return {
    id,
    name: stored.name,
    ...(sections ? { sections } : { systemPrompt: stored.systemPrompt }),
    ...(templateVersion ? { templateVersion } : {}),
    ...(sourcePrompt ? { sourcePrompt } : {}),
    ...(colorFilter ? { colorFilter } : {}),
    ...(origin ? { origin } : {}),
    shots: Array.isArray(stored.shots)
      ? stored.shots.filter((shot) => typeof shot === 'string')
      : [],
    ...(character ? { character } : {}),
    createdAt: typeof stored.createdAt === 'string' ? stored.createdAt : '',
    ...(typeof stored.updatedAt === 'string'
      ? { updatedAt: stored.updatedAt }
      : {}),
    samples: await readStyleSamples(directory),
  }
}
