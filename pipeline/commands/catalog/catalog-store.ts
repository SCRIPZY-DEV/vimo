import {
  CATALOG_TAGS,
  CATALOG_TAG_LABEL_LIMIT,
  CATALOG_TAG_LIMIT,
} from '../../prompts/catalog-gems/tags.ts'
import { fixedPhrasesInLanguage } from '../../prompts/template-frame.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  CatalogGem,
  CatalogSampleMode,
  LocalizedText,
} from '../../types/catalog.ts'
import {
  GEM_TEMPLATE_VERSION,
  type CatalogDraftSamplesSource,
  type GemSections,
  type StyleCharacter,
  type StyleCharacterMode,
} from '../../types/styles.ts'
import {
  MAX_SAMPLE_BYTES,
  SAMPLE_FILE_PATTERN,
  STYLE_NAME_LIMIT,
  assertGemSections,
  assertSampleUpload,
  assertStyleCharacter,
  isCatalogStyleId,
  readColorFilter,
  type SampleUploadBytes,
} from '../styles/style-store.ts'

// El catálogo de estilos de Vimo del lado del sidecar (Entrega 2, spec §8, y
// Entrega 3, ADR-0049). Las gemas empaquetadas viven en
// pipeline/prompts/catalog-gems/ y sus muestras en la app
// (`/style-references/<id>_<n>.jpg`, decisión P1 del plan E2); las del
// catálogo remoto, en la caché de `_catalog/` (catalog-cache.ts). Acá están
// los límites y las validaciones que comparten los subcomandos del catálogo:
// la gema que llega del servidor, el borrador del que se generan muestras y
// la copia de «Pasar a mi estilo». La app copia las constantes con una
// anotación `typeof`.

/** Cuántas muestras trae como máximo cada estilo del catálogo. */
export const CATALOG_SAMPLE_COUNT = 4
/** Tope de cada muestra del catálogo (copia, descarga y subida): el de la galería. */
export const MAX_CATALOG_SAMPLE_BYTES = MAX_SAMPLE_BYTES

const CHARACTER_MODES: readonly StyleCharacterMode[] = [
  'own',
  'generic',
  'none',
]
// Las muestras del catálogo no dependen del personaje de un admin (P17 del
// plan E3): nunca «Mi personaje».
const CATALOG_SAMPLE_MODES: readonly CatalogSampleMode[] = ['generic', 'none']
// Los tres primeros bytes de todo JPEG (SOI y el primer marcador).
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
// Las secciones que se tejen (`character`) o se pegan (inicio y final fijos)
// en cada prompt de imagen: un relleno sin completar llegaría tal cual al
// generador. El marcador del idioma del guion lo completa el código.
const PLACEHOLDER_REGEX = /\[[^\]]*\]/
// El corte de oraciones de `splitOutfit` (subject-weaver.ts): la ropa base se
// separa de la identidad fija por la oración «Outfit:» final.
const SENTENCE_BREAK_REGEX = /(?<=[.!?])\s+/
const OUTFIT_PREFIX = 'Outfit:'
// Las dos etiquetas que describen comportamiento y la sección que lo hace.
const BEHAVIOR_TAGS = [
  [CATALOG_TAGS.dynamism, 'dynamism'],
  [CATALOG_TAGS.fixedCharacter, 'character'],
] as const

// Solo un `remote: true` explícito en el payload pide el catálogo sincronizado
// (lista, copia y retrato, ADR-0049): cualquier otra cosa es el empaquetado.
export function wantsRemoteCatalog(payload: unknown): boolean {
  return isRecord(payload) && payload.remote === true
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// El id de un estilo del catálogo (sección 2 del plan E3): uno de los 5
// heredados o uno con el patrón de la galería, nunca con el prefijo `st-` de
// las copias. Es también el nombre de su carpeta en `_catalog/`.
export function isCatalogEntryId(value: unknown): value is string {
  return isCatalogStyleId(value) && !value.startsWith('st-')
}

// El número de una muestra del catálogo (`sample-<n>.jpg`, n = 1..4, sin
// ceros a la izquierda: el nombre es la ruta del archivo); undefined si el
// nombre no es el de una muestra.
export function catalogSampleNumber(file: unknown): number | undefined {
  if (typeof file !== 'string') return undefined
  const match = SAMPLE_FILE_PATTERN.exec(file)
  if (!match) return undefined
  const number = Number(match[1])
  if (number < 1 || number > CATALOG_SAMPLE_COUNT) return undefined
  if (file !== `sample-${number}.jpg`) return undefined
  return number
}

export function isCatalogSampleFile(file: unknown): file is string {
  return catalogSampleNumber(file) !== undefined
}

/** Cuántos bytes del principio alcanzan para reconocer un JPEG. */
export const JPEG_SIGNATURE_LENGTH = JPEG_SIGNATURE.length

/** Una muestra del catálogo: un JPEG de hasta MAX_CATALOG_SAMPLE_BYTES. */
export function isCatalogSampleBytes(bytes: Uint8Array): boolean {
  if (bytes.length > MAX_CATALOG_SAMPLE_BYTES) return false
  return JPEG_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

// El motivo de un fallo de red para el log de diagnóstico: `fetch` lo esconde
// en `cause` («fetch failed» → «other side closed»).
export function failureReason(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : ''
  return `${error.message}${cause}`
}

export function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

// Un origen permitido que manda la app (sale de la URL de Supabase que ya
// usa; el sidecar no lee el entorno, ADR-0010): `https://host`, exacto y sin
// ruta. Cada URL se compara después con su origen ya parseado, nunca como
// texto: `https://bucket.test.evil` empieza igual que `https://bucket.test`.
export function assertHttpsOrigin(value: unknown, field: string): string {
  const url = typeof value === 'string' ? parseUrl(value) : undefined
  if (!url || url.protocol !== 'https:' || url.origin !== value)
    throw new PipelineFailure(
      'invalid_payload',
      `${field} must be an https origin (https://host)`,
    )
  return url.origin
}

/** Cuántas muestras declara una tanda: 0 a CATALOG_SAMPLE_COUNT. */
export function isCatalogSampleCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= CATALOG_SAMPLE_COUNT
  )
}

/** La tanda de muestras de un estilo: 0 = las de la app; ≥ 1 = `<id>/s<n>/`. */
export function isSamplesRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

// ─── La gema del catálogo remoto ───

/** Lo que una gema del catálogo remoto comparte con una empaquetada (sin muestras). */
export type CatalogGemFields = Omit<CatalogGem, 'sampleCount' | 'samples'>

function syncFailure(message: string): PipelineFailure {
  return new PipelineFailure('catalog_sync_failed', message)
}

// Una validación de la galería (que lanza `invalid_payload`) como fallo de un
// contenido del catálogo remoto.
function contentCheck<T>(check: () => T): T {
  try {
    return check()
  } catch (error) {
    if (error instanceof PipelineFailure) throw syncFailure(error.message)
    throw error
  }
}

// Una gema que llega del catálogo remoto (el contenido publicado de un
// estilo, o una entrada de la caché que se vuelve a leer) con las reglas de la
// sección 5.2 del plan E3, las mismas que el servidor valida con zod: el id;
// el nombre en los tres idiomas (hasta 80); hasta 5 etiquetas de hasta 24 sin
// repetir, con «Dinamismo» y «Personaje fijo» si y solo si existen sus
// secciones; las secciones con los límites de una gema de plantilla, sin
// rellenos en lo que se teje o se pega y con `character` cerrado por su
// oración «Outfit:»; la versión de plantilla; los modos permitidos sin repetir
// e incluyendo `sampleMode` (que nunca es «Mi personaje»); y el filtro de
// color. Nunca más estricta que el servidor: una sola gema que no pasa deja a
// todos sin sincronizar. Devuelve los campos normalizados (texto recortado y
// las secciones como las deja la galería) y lanza `catalog_sync_failed`
// nombrando el campo.
export function assertCatalogGemFields(
  id: unknown,
  value: unknown,
  field: string,
): CatalogGemFields {
  if (!isCatalogEntryId(id))
    throw syncFailure(`${field}.id is not a valid catalog style id`)
  if (!isRecord(value)) throw syncFailure(`${field} must be an object`)

  const name = assertLocalizedText(
    value.name,
    `${field}.name`,
    STYLE_NAME_LIMIT,
  )
  const sections = contentCheck(() =>
    assertGemSections(value.sections, `${field}.sections`),
  )
  assertWovenSections(sections, `${field}.sections`)
  const tags = assertTags(value.tags, `${field}.tags`)
  assertBehaviorTags(tags, sections, `${field}.tags`)

  const templateVersion = value.templateVersion
  if (
    typeof templateVersion !== 'number' ||
    !Number.isInteger(templateVersion) ||
    templateVersion < 1 ||
    templateVersion > GEM_TEMPLATE_VERSION
  )
    throw syncFailure(
      `${field}.templateVersion must be an integer between 1 and ${GEM_TEMPLATE_VERSION}`,
    )

  const allowedModes = assertAllowedModes(
    value.allowedModes,
    `${field}.allowedModes`,
  )
  const sampleMode = CATALOG_SAMPLE_MODES.find(
    (mode) => mode === value.sampleMode,
  )
  if (!sampleMode)
    throw syncFailure(
      `${field}.sampleMode must be one of ${CATALOG_SAMPLE_MODES.join(', ')}`,
    )
  if (!allowedModes.includes(sampleMode))
    throw syncFailure(`${field}.sampleMode must be one of the allowed modes`)

  const colorFilter = readColorFilter(value.colorFilter)
  if (!colorFilter)
    throw syncFailure(`${field}.colorFilter is not a known color filter`)

  return {
    id,
    name,
    tags,
    sections,
    templateVersion,
    allowedModes,
    sampleMode,
    colorFilter,
  }
}

function assertLocalizedText(
  value: unknown,
  field: string,
  limit: number,
): LocalizedText {
  if (!isRecord(value)) throw syncFailure(`${field} must be an object`)
  return {
    es: assertLabel(value.es, `${field}.es`, limit),
    en: assertLabel(value.en, `${field}.en`, limit),
    pt: assertLabel(value.pt, `${field}.pt`, limit),
  }
}

function assertLabel(value: unknown, field: string, limit: number): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > limit)
    throw syncFailure(
      `${field} must be a non-empty text of at most ${limit} characters`,
    )
  return text
}

// Una etiqueta se identifica por su texto en español, como en el servidor.
function assertTags(value: unknown, field: string): LocalizedText[] {
  if (!Array.isArray(value) || value.length > CATALOG_TAG_LIMIT)
    throw syncFailure(
      `${field} must be a list of at most ${CATALOG_TAG_LIMIT} tags`,
    )

  const tags = value.map((tag, index) =>
    assertLocalizedText(tag, `${field}[${index}]`, CATALOG_TAG_LABEL_LIMIT),
  )
  const labels = tags.map((tag) => tag.es)
  const repeated = labels.find(
    (label, index) => labels.indexOf(label) !== index,
  )
  if (repeated !== undefined)
    throw syncFailure(`${field} repeats the tag ${repeated}`)
  return tags
}

function assertBehaviorTags(
  tags: LocalizedText[],
  sections: GemSections,
  field: string,
): void {
  for (const [paletteTag, sectionKey] of BEHAVIOR_TAGS) {
    const hasTag = tags.some((tag) => tag.es === paletteTag.es)
    const hasSection = sections[sectionKey] !== undefined
    if (hasTag !== hasSection)
      throw syncFailure(
        `${field}: the tag ${paletteTag.es} goes if and only if the ${sectionKey} section exists`,
      )
  }
}

// `character` se teje tal cual en cada escena, así que no admite ningún
// marcador; el inicio y el final fijos solo el del idioma del guion, que el
// código completa (se miran como se pegan).
function assertWovenSections(sections: GemSections, field: string): void {
  const pasted = fixedPhrasesInLanguage(sections, '')
  const woven = [
    ['character', sections.character],
    ['promptStart', pasted.promptStart],
    ['promptEnd', pasted.promptEnd],
  ] as const
  for (const [key, text] of woven) {
    if (text === undefined) continue
    const placeholder = PLACEHOLDER_REGEX.exec(text)
    if (placeholder)
      throw syncFailure(`${field}.${key} has the placeholder ${placeholder[0]}`)
  }

  const character = sections.character
  if (character === undefined) return
  const lastSentence = character.split(SENTENCE_BREAK_REGEX).at(-1) ?? ''
  if (!lastSentence.startsWith(OUTFIT_PREFIX))
    throw syncFailure(
      `${field}.character must end with a sentence that starts with ${OUTFIT_PREFIX}`,
    )
}

function assertAllowedModes(
  value: unknown,
  field: string,
): StyleCharacterMode[] {
  if (!Array.isArray(value) || value.length === 0)
    throw syncFailure(`${field} must be a non-empty list`)

  const modes = value.map((candidate) => {
    const mode = CHARACTER_MODES.find((known) => known === candidate)
    if (!mode)
      throw syncFailure(
        `${field} only admits ${CHARACTER_MODES.join(', ')}, not ${String(candidate)}`,
      )
    return mode
  })
  if (new Set(modes).size !== modes.length)
    throw syncFailure(`${field} repeats a mode`)
  return modes
}

// ─── Las muestras de un borrador ───

// El borrador del catálogo del que el admin genera muestras (ADR-0049): el id
// de su carpeta `_catalog/_drafts/<id>/`, el nombre, las secciones con los
// límites de una gema de plantilla (las devuelve normalizadas) y el modo de
// las muestras del catálogo. Las reglas de publicar (nombre en tres idiomas,
// «Outfit:», etiquetas) no van acá: un borrador se prueba antes de estar
// completo, y las valida el servidor al publicar.
export function assertCatalogDraftSource(
  value: unknown,
  field: string,
): CatalogDraftSamplesSource {
  if (!isRecord(value))
    throw new PipelineFailure('invalid_payload', `${field} must be an object`)
  if (!isCatalogEntryId(value.id))
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.id is not a valid catalog style id`,
    )

  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!name || name.length > STYLE_NAME_LIMIT)
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.name must be a non-empty string of at most ${STYLE_NAME_LIMIT} characters`,
    )
  const sections = assertGemSections(value.sections, `${field}.sections`)
  const sampleMode = CATALOG_SAMPLE_MODES.find(
    (mode) => mode === value.sampleMode,
  )
  if (!sampleMode)
    throw new PipelineFailure(
      'invalid_payload',
      `${field}.sampleMode must be one of ${CATALOG_SAMPLE_MODES.join(', ')}`,
    )
  return { id: value.id, name, sections, sampleMode }
}

// ─── La copia de «Pasar a mi estilo» ───

/** La copia ya validada: lo que catalog-style-copy escribe. */
export interface CatalogCopy {
  gem: CatalogGem
  /** El nombre que vio la persona: el de la copia y el de su `origin`. */
  name: string
  character: StyleCharacter
  /**
   * Las muestras que mandó la app. Vacío cuando la gema trae su tanda
   * sincronizada (`gem.samples`): esas se copian del disco y las del payload
   * se ignoran.
   */
  samples: SampleUploadBytes[]
}

// Valida TODO el payload de «Pasar a mi estilo» antes de que la copia toque
// el disco: la gema tiene que estar en el catálogo de este sidecar (el
// sincronizado o el empaquetado, `resolveGem`), el nombre entra en una
// tarjeta de la galería, el personaje es un bloque válido y cada muestra es
// un JPEG con su número.
export async function assertCatalogCopyPayload(
  value: unknown,
  resolveGem: (id: string) => Promise<CatalogGem | undefined>,
): Promise<CatalogCopy> {
  if (!isRecord(value))
    throw new PipelineFailure('invalid_payload', 'payload must be an object')

  if (!isCatalogStyleId(value.catalogStyleId))
    throw new PipelineFailure(
      'invalid_payload',
      'payload.catalogStyleId is not a valid style id',
    )
  const gem = await resolveGem(value.catalogStyleId)
  if (!gem)
    throw new PipelineFailure(
      'style_not_found',
      `catalog style "${value.catalogStyleId}" does not exist`,
    )

  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!name || name.length > STYLE_NAME_LIMIT)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.name must be a non-empty string of at most ${STYLE_NAME_LIMIT} characters`,
    )

  const character = value.character
  assertStyleCharacter(character, 'payload.character')

  return {
    gem,
    name,
    character: storedCharacter(character),
    samples: gem.samples ? [] : assertCatalogSamples(value.samples),
  }
}

// El bloque como lo guarda la galería: sin claves ajenas y con el puntero
// recortado (lo mismo que después lee readStyleCharacter).
function storedCharacter(character: StyleCharacter): StyleCharacter {
  if (character.defaultCharacterId === undefined)
    return { mode: character.mode }
  return {
    mode: character.mode,
    defaultCharacterId: character.defaultCharacterId.trim(),
  }
}

// Hasta CATALOG_SAMPLE_COUNT muestras, cada una con el número que tenía en la
// app (`<id>_<n>.jpg` → `sample-<n>.jpg`) y sin repetir. La app omite la que
// no pudo bajar, así que puede haber huecos; una lista vacía es una copia sin
// muestras.
function assertCatalogSamples(value: unknown): SampleUploadBytes[] {
  if (!Array.isArray(value))
    throw new PipelineFailure(
      'invalid_payload',
      'payload.samples must be a list',
    )
  if (value.length > CATALOG_SAMPLE_COUNT)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.samples allows at most ${CATALOG_SAMPLE_COUNT} samples`,
    )

  const samples = value.map((sample, index) =>
    assertSampleUpload(
      sample,
      `payload.samples[${index}]`,
      CATALOG_SAMPLE_COUNT,
    ),
  )
  const files = samples.map((sample) => sample.file)
  const repeated = files.find((file, index) => files.indexOf(file) !== index)
  if (repeated)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.samples repeats ${repeated}`,
    )
  return samples
}
