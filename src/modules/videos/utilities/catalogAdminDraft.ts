// Rutas relativas y con extensión, no `@/`: este módulo corre bajo un guard
// con Node pelado, que no resuelve el alias; los tres son puros y viven juntos.
import {
  DYNAMISM_TAG,
  FIXED_CHARACTER_TAG,
  isBehaviorTag,
  sameCatalogTag,
} from './catalogTagPalette.ts'
import type {
  AdminCatalogStyle,
  CatalogAdminBadge,
  CatalogPublishBlocker,
} from '@/modules/videos/types/catalogRemote'
import type { GemRebuildResponse } from '@/modules/videos/types/gemRebuild'
import type { StyleCloneFinalStyle } from '@/modules/videos/utilities/styleCloneSessions'
import type {
  CatalogGem,
  CatalogSampleMode,
  CatalogStyleContent,
  LocalizedText,
} from '@pipeline/types/catalog.ts'
import type { StyleCharacterMode } from '@pipeline/types/styles.ts'

// El borrador de un estilo del catálogo mientras el admin lo arma (Entrega 3,
// ADR-0049, plan E3 §5.2 y tareas C2 a C4): cómo nace de la respuesta del
// agente, qué etiquetas pone la app sola, el id sugerido, qué le falta para
// publicarse y cómo se ve como gema en la tarjeta. Módulo puro, sin imports
// de runtime: lo corre scripts/test/check-app-catalog-admin.mjs con Node.

// Espejos de constants.ts (Node pelado no resuelve el alias `@/`).
const STYLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/
const STYLE_ID_LIMIT = 40
const TAG_LIMIT = 5
const TAG_LABEL_LIMIT = 24
const NAME_LIMIT = 80
const SAMPLE_COUNT = 4
const SAMPLES_BASE_PATH = '/style-references'
const TEMPLATE_VERSION = 1
const DAY_MS = 24 * 60 * 60 * 1000

const ALL_MODES: readonly StyleCharacterMode[] = ['generic', 'own', 'none']
const SAMPLE_MODES: readonly CatalogSampleMode[] = ['generic', 'none']
// Los 5 estilos de siempre valen como id aunque no cumplan el patrón.
const LEGACY_IDS = new Set([
  'normal',
  'pov_stickman',
  'cartoon',
  'fantasia',
  'terror',
])
// Ids que chocarían con una ruta del servidor (`/api/admin/catalogo/traducir`).
const RESERVED_IDS = new Set(['traducir'])

// Lo mismo que fija check-catalog-gems.mjs para las gemas empaquetadas: el
// único marcador que la plataforma completa es el del idioma del guion, y
// `character` termina con la oración «Outfit: …» que el tejedor separa.
const PLACEHOLDER_REGEX = /\[[^\]]*\]/g
const LANGUAGE_MARKER = '[IDIOMA DEL GUION]'
const SENTENCE_BREAK_REGEX = /(?<=[.!?])\s+/
const OUTFIT_PREFIX = 'Outfit:'

export const EMPTY_LOCALIZED_TEXT: LocalizedText = { es: '', en: '', pt: '' }

function isSampleMode(mode: StyleCharacterMode): mode is CatalogSampleMode {
  return SAMPLE_MODES.includes(mode as CatalogSampleMode)
}

/**
 * Los modos permitidos que sugirió el agente (sin repetidos, en el orden
 * canónico) y el modo de las muestras: el que sugirió si sirve para muestras
 * y está permitido; si no, el primero permitido que sirva. Si no hay ninguno
 * (solo «Mi personaje»), se permite también el genérico: las muestras no
 * dependen del personaje de un admin (plan E3, P17).
 */
export function catalogModesFrom(
  suggestedModes: StyleCharacterMode[] | undefined,
  suggestedSampleMode: StyleCharacterMode | undefined,
): { allowedModes: StyleCharacterMode[]; sampleMode: CatalogSampleMode } {
  const wanted = new Set(suggestedModes?.length ? suggestedModes : ALL_MODES)
  const allowed = ALL_MODES.filter((mode) => wanted.has(mode))
  if (!allowed.some(isSampleMode)) allowed.unshift('generic')

  const sampleMode =
    suggestedSampleMode !== undefined &&
    isSampleMode(suggestedSampleMode) &&
    allowed.includes(suggestedSampleMode)
      ? suggestedSampleMode
      : (allowed.find(isSampleMode) ?? 'generic')
  return { allowedModes: allowed, sampleMode }
}

/**
 * Las etiquetas con las dos de comportamiento puestas por la app: «Dinamismo»
 * si y solo si hay sección `dynamism`, «Personaje fijo» si y solo si hay
 * `character` (plan E3, P7), siempre al frente y en ese orden; las demás
 * siguen como las dejó el admin, sin repetidas.
 */
export function withBehaviorTags(
  content: Pick<CatalogStyleContent, 'tags' | 'sections'>,
): LocalizedText[] {
  const chosen: LocalizedText[] = []
  for (const tag of content.tags) {
    if (isBehaviorTag(tag)) continue
    if (chosen.some((existing) => sameCatalogTag(existing, tag))) continue
    chosen.push(tag)
  }
  const behavior: LocalizedText[] = []
  if (content.sections.dynamism?.trim()) behavior.push(DYNAMISM_TAG)
  if (content.sections.character?.trim()) behavior.push(FIXED_CHARACTER_TAG)
  return [...behavior, ...chosen]
}

/** Cuántas etiquetas puede elegir el admin además de las de comportamiento. */
export function catalogTagSlots(
  content: Pick<CatalogStyleContent, 'tags' | 'sections'>,
): number {
  const behavior = withBehaviorTags(content).filter(isBehaviorTag).length
  return Math.max(0, TAG_LIMIT - behavior)
}

/**
 * El borrador que nace de la respuesta del agente para un estilo nuevo del
 * catálogo: sus secciones, los modos sugeridos, las etiquetas de
 * comportamiento solas, sin nombre todavía, sin filtro y sin muestras.
 */
export function catalogDraftFromRebuild(
  response: GemRebuildResponse,
): CatalogStyleContent {
  const { allowedModes, sampleMode } = catalogModesFrom(
    response.suggestions.allowedModes,
    response.suggestions.characterMode,
  )
  const sections = response.sections
  return {
    name: { ...EMPTY_LOCALIZED_TEXT },
    tags: withBehaviorTags({ tags: [], sections }),
    sections,
    templateVersion: response.templateVersion,
    allowedModes,
    sampleMode,
    colorFilter: 'none',
    samples: { revision: 0, count: 0 },
  }
}

/**
 * El borrador que nace de una clonación con IA aprobada para el catálogo
 * (ADR-0050, nota del 2026-10-06): sus secciones tal cual (una clonación no
 * trae `character`), el nombre que propuso la IA solo en español (los otros
 * dos los completa el admin, con «Traducir con IA»), los tres modos y las
 * muestras en el modo que sugirió el servidor; sin filtro y sin muestras: las
 * genera el admin en el modal, con el carril real, como cualquier borrador.
 */
export function catalogDraftFromStyleClone(
  style: StyleCloneFinalStyle,
): CatalogStyleContent {
  const { allowedModes, sampleMode } = catalogModesFrom(
    undefined,
    style.characterMode ?? undefined,
  )
  const sections = style.sections
  return {
    name: { ...EMPTY_LOCALIZED_TEXT, es: style.name.trim() },
    tags: withBehaviorTags({ tags: [], sections }),
    sections,
    templateVersion: style.templateVersion,
    allowedModes,
    sampleMode,
    colorFilter: 'none',
    samples: { revision: 0, count: 0 },
  }
}

/** Un borrador vacío, para editar a mano sin pasar por el agente. */
export function emptyCatalogDraft(): CatalogStyleContent {
  return {
    name: { ...EMPTY_LOCALIZED_TEXT },
    tags: [],
    sections: { visualStyle: '' },
    templateVersion: TEMPLATE_VERSION,
    allowedModes: [...ALL_MODES],
    sampleMode: 'generic',
    colorFilter: 'none',
    samples: { revision: 0, count: 0 },
  }
}

/**
 * El id sugerido a partir del nombre en español: minúsculas sin acentos,
 * guiones en vez de todo lo demás, hasta 40 caracteres y nunca con el prefijo
 * `st-` de los estilos propios. Vacío si del nombre no sale nada usable.
 */
export function suggestedCatalogStyleId(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, STYLE_ID_LIMIT)
    .replace(/-+$/g, '')
  const safe =
    slug.startsWith('st-') || RESERVED_IDS.has(slug)
      ? `estilo-${slug.replace(/^st-/, '')}`
      : slug
  const trimmed = safe.slice(0, STYLE_ID_LIMIT).replace(/-+$/g, '')
  return STYLE_ID_PATTERN.test(trimmed) ? trimmed : ''
}

export function isCatalogStyleId(id: string): boolean {
  if (LEGACY_IDS.has(id)) return true
  if (RESERVED_IDS.has(id)) return false
  return STYLE_ID_PATTERN.test(id) && !id.startsWith('st-')
}

function hasForbiddenPlaceholder(
  text: string,
  allowLanguage: boolean,
): boolean {
  const markers = text.match(PLACEHOLDER_REGEX) ?? []
  return markers.some(
    (marker) => !(allowLanguage && marker === LANGUAGE_MARKER),
  )
}

function characterEndsWithOutfit(character: string): boolean {
  const lastSentence = character.trim().split(SENTENCE_BREAK_REGEX).at(-1) ?? ''
  return lastSentence.startsWith(OUTFIT_PREFIX)
}

/**
 * Qué le falta al borrador para publicarse (plan E3, P5 y §5.2): el nombre en
 * los tres idiomas, el estilo visual, las 4 muestras, la oración «Outfit:» al
 * final del personaje y ningún marcador `[…]` en lo que se pega tal cual
 * (salvo el del idioma en el inicio y el final fijos). Vacío = se puede
 * publicar. El botón «Publicar» lista estas razones.
 */
export function catalogPublishBlockers(
  content: CatalogStyleContent,
): CatalogPublishBlocker[] {
  const blockers: CatalogPublishBlocker[] = []
  if (!content.name.es.trim()) blockers.push('nameEs')
  if (!content.name.en.trim()) blockers.push('nameEn')
  if (!content.name.pt.trim()) blockers.push('namePt')
  if (!content.sections.visualStyle.trim()) blockers.push('visualStyle')
  if (content.samples.count < SAMPLE_COUNT) blockers.push('samples')

  const character = content.sections.character?.trim()
  if (character && !characterEndsWithOutfit(character))
    blockers.push('characterOutfit')

  const placeholder =
    (character !== undefined && hasForbiddenPlaceholder(character, false)) ||
    hasForbiddenPlaceholder(content.sections.promptStart ?? '', true) ||
    hasForbiddenPlaceholder(content.sections.promptEnd ?? '', true)
  if (placeholder) blockers.push('placeholder')
  return blockers
}

/** Por qué el borrador no se puede ni guardar (el servidor lo rechazaría). */
export type CatalogDraftProblem =
  'id' | 'visualStyle' | 'tags' | 'tagLabel' | 'modes' | 'name'

export function catalogDraftProblems(
  id: string,
  content: CatalogStyleContent,
): CatalogDraftProblem[] {
  const problems: CatalogDraftProblem[] = []
  if (!isCatalogStyleId(id)) problems.push('id')
  if (!content.sections.visualStyle.trim()) problems.push('visualStyle')
  if (content.tags.length > TAG_LIMIT) problems.push('tags')
  if (
    content.tags.some((tag) =>
      (['es', 'en', 'pt'] as const).some(
        (locale) => !tag[locale].trim() || tag[locale].length > TAG_LABEL_LIMIT,
      ),
    )
  )
    problems.push('tagLabel')
  if (
    content.allowedModes.length === 0 ||
    !content.allowedModes.includes(content.sampleMode)
  )
    problems.push('modes')
  if (
    (['es', 'en', 'pt'] as const).some(
      (locale) => content.name[locale].length > NAME_LIMIT,
    )
  )
    problems.push('name')
  return problems
}

/**
 * El borrador como gema, para la tarjeta, «Ver» y «Usar en este video» del
 * admin (plan E3, P6): el id de la fila y su contenido; `sampleCount` es el de
 * la tanda. Sin `samples`: de dónde salen las imágenes lo decide
 * catalogAdminSampleImages.
 */
export function catalogGemFromContent(
  id: string,
  content: CatalogStyleContent,
): CatalogGem {
  return {
    id,
    name: content.name,
    tags: content.tags,
    sections: content.sections,
    templateVersion: content.templateVersion,
    allowedModes: content.allowedModes,
    sampleMode: content.sampleMode,
    colorFilter: content.colorFilter,
    sampleCount: content.samples.count,
  }
}

/** La URL pública de una muestra de una tanda del bucket. */
export function catalogBucketSampleUrl(
  samplesBaseUrl: string,
  id: string,
  revision: number,
  number: number,
): string {
  return `${samplesBaseUrl}/${id}/s${revision}/sample-${number}.jpg`
}

/**
 * Las muestras del borrador de un estilo del admin: desde el bucket si la
 * tanda es ≥ 1, o las empaquetadas de la app si es la 0 (las 38 de hoy).
 */
export function catalogAdminSampleImages(
  id: string,
  content: Pick<CatalogStyleContent, 'samples'>,
  samplesBaseUrl: string,
): string[] {
  const count = Math.min(SAMPLE_COUNT, Math.max(0, content.samples.count))
  return Array.from({ length: count }, (_, index) =>
    content.samples.revision >= 1
      ? catalogBucketSampleUrl(
          samplesBaseUrl,
          id,
          content.samples.revision,
          index + 1,
        )
      : `${SAMPLES_BASE_PATH}/${id}_${index + 1}.jpg`,
  )
}

/**
 * El distintivo de la tarjeta del admin: «Sin publicar» (nunca se publicó),
 * «Oculto» (se publicó y se ocultó), «Cambios sin publicar» o «Se elimina en
 * N días» (archivado); null = publicado y al día.
 */
export function catalogAdminBadge(
  style: Pick<AdminCatalogStyle, 'status' | 'published' | 'unpublishedChanges'>,
): CatalogAdminBadge | null {
  if (style.status === 'archived') return 'archived'
  if (style.status === 'hidden')
    return style.published === null ? 'unpublished' : 'hidden'
  return style.unpublishedChanges ? 'changes' : null
}

/**
 * Los estilos del admin repartidos entre lo que se ve en el catálogo y lo
 * archivado (eliminado, a la espera de la purga), cada lista en el orden en
 * que llegó.
 */
export function splitCatalogAdminStyles(styles: AdminCatalogStyle[]): {
  active: AdminCatalogStyle[]
  archived: AdminCatalogStyle[]
} {
  return {
    active: styles.filter((style) => style.status !== 'archived'),
    archived: styles.filter((style) => style.status === 'archived'),
  }
}

/**
 * Cuántos días enteros faltan para que el servidor purgue un archivado (0 =
 * hoy o ya vencido: lo borra en la próxima pasada); null si no está archivado
 * o la fecha no se entiende. `now` se fija en los guards; la galería lo deja
 * en el reloj (acá y no en el render: el lint de pureza de React no deja
 * llamar a Date.now en un componente).
 */
export function catalogPurgeDaysLeft(
  purgeAt: string | null,
  now = Date.now(),
): number | null {
  if (purgeAt === null) return null
  const purgeMs = Date.parse(purgeAt)
  if (Number.isNaN(purgeMs)) return null
  return Math.max(0, Math.ceil((purgeMs - now) / DAY_MS))
}

/**
 * Si lo que el admin tiene en el modal es lo mismo que lo guardado: el
 * contenido normalizado (lo que se mandaría) y la posición. Es lo que decide
 * si «Guardar borrador» tiene algo que guardar.
 */
export function sameCatalogDraft(
  edited: { content: CatalogStyleContent; position: number },
  saved: { content: CatalogStyleContent; position: number },
): boolean {
  if (edited.position !== saved.position) return false
  return (
    JSON.stringify(normalizedCatalogDraft(edited.content)) ===
    JSON.stringify(normalizedCatalogDraft(saved.content))
  )
}

/** El contenido con sus etiquetas de comportamiento al día, como lo exige el servidor. */
export function normalizedCatalogDraft(
  content: CatalogStyleContent,
): CatalogStyleContent {
  return {
    ...content,
    name: {
      es: content.name.es.trim(),
      en: content.name.en.trim(),
      pt: content.name.pt.trim(),
    },
    tags: withBehaviorTags(content),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readAdminStyle(value: unknown): AdminCatalogStyle | null {
  if (!isRecord(value)) return null
  const {
    id,
    position,
    status,
    draft,
    published,
    publishedVersion,
    publishedAt,
    revision,
    updatedAt,
    updatedBy,
    unpublishedChanges,
    archivedAt,
    purgeAt,
  } = value
  if (typeof id !== 'string' || !id) return null
  if (typeof position !== 'number') return null
  if (status !== 'hidden' && status !== 'published' && status !== 'archived')
    return null
  if (!isRecord(draft)) return null
  if (published !== null && !isRecord(published)) return null
  if (typeof publishedVersion !== 'number') return null
  if (publishedAt !== null && typeof publishedAt !== 'string') return null
  if (typeof revision !== 'number') return null
  if (typeof updatedAt !== 'string') return null
  if (updatedBy !== null && typeof updatedBy !== 'string') return null
  if (typeof unpublishedChanges !== 'boolean') return null
  if (archivedAt !== null && typeof archivedAt !== 'string') return null
  if (purgeAt !== null && typeof purgeAt !== 'string') return null
  // Archivado = con sus dos fechas; en otro estado, sin ninguna.
  const dated =
    status === 'archived'
      ? archivedAt !== null && purgeAt !== null
      : archivedAt === null && purgeAt === null
  if (!dated) return null
  return {
    id,
    position,
    status,
    draft: draft as unknown as CatalogStyleContent,
    published: published as CatalogStyleContent | null,
    publishedVersion,
    publishedAt,
    revision,
    updatedAt,
    updatedBy,
    unpublishedChanges,
    archivedAt,
    purgeAt,
  }
}

/**
 * La lista del admin, revisada antes de usarla: la URL pública de las
 * muestras (https) y cada estilo con su forma. null = no se usa (error del
 * servidor).
 */
export function readAdminCatalogListResponse(
  body: unknown,
): { samplesBaseUrl: string; styles: AdminCatalogStyle[] } | null {
  if (!isRecord(body)) return null
  const { samplesBaseUrl, styles } = body
  if (
    typeof samplesBaseUrl !== 'string' ||
    !samplesBaseUrl.startsWith('https://')
  )
    return null
  if (!Array.isArray(styles)) return null
  const read: AdminCatalogStyle[] = []
  for (const entry of styles) {
    const style = readAdminStyle(entry)
    if (!style) return null
    read.push(style)
  }
  return { samplesBaseUrl, styles: read }
}

export function readAdminCatalogStyleResponse(
  body: unknown,
): AdminCatalogStyle | null {
  if (!isRecord(body)) return null
  return readAdminStyle(body.style)
}
