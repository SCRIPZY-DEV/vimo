import type {
  GEM_SECTION_KEYS as PIPELINE_GEM_SECTION_KEYS,
  GEM_TEMPLATE_VERSION as PIPELINE_GEM_TEMPLATE_VERSION,
  GemSectionKey,
  GemSections,
  StyleCharacterMode,
} from '@pipeline/types/styles.ts'
import type {
  GemRebuildOrigin,
  GemRebuildRequest,
  GemRebuildResponse,
} from '@/modules/videos/types/gemRebuild'

// La gema por secciones del lado de la app (ADR-0048, spec §4 y §6.1). Módulo
// puro, sin imports de runtime, como utilities/promptCost.ts (ADR-0020): así
// los guards scripts/test/check-app-gem-*.mjs lo corren con Node, sin bundler.
// Por eso sus constantes viven acá y no en constants.ts.

// Espejos de pipeline/types/styles.ts. `src/` solo importa TIPOS de
// `pipeline/` (ADR-0010: el alias @pipeline no existe en runtime), así que los
// valores se repiten; la anotación con `typeof` obliga a que coincidan
// elemento por elemento: si el sidecar cambia el orden o la versión, esto deja
// de compilar.
export const GEM_SECTION_KEYS: typeof PIPELINE_GEM_SECTION_KEYS = [
  'visualStyle',
  'character',
  'dynamism',
  'camera',
  'rules',
  'promptStart',
  'promptEnd',
]
export const GEM_TEMPLATE_VERSION: typeof PIPELINE_GEM_TEMPLATE_VERSION = 1

// Límites de la spec §4.1: cada sección hasta 12 000 caracteres, `character`
// hasta 700 (la identidad tejida), las frases fijas hasta 600 y la suma hasta
// 30 000 (el tope de siempre de una gema).
export const GEM_SECTION_LIMITS: Record<GemSectionKey, number> = {
  visualStyle: 12_000,
  character: 700,
  dynamism: 12_000,
  camera: 12_000,
  rules: 12_000,
  promptStart: 600,
  promptEnd: 600,
}
export const GEM_TOTAL_CHAR_LIMIT = 30_000

/**
 * Las secciones como se guardan: sin espacios en los bordes y sin las
 * opcionales vacías (una sección vacía no existe). `visualStyle` queda
 * siempre, aunque esté vacía: decide quien valida.
 */
export function cleanGemSections(sections: GemSections): GemSections {
  const cleaned: GemSections = { visualStyle: sections.visualStyle.trim() }
  for (const key of GEM_SECTION_KEYS) {
    if (key === 'visualStyle') continue
    const value = sections[key]?.trim()
    if (value) cleaned[key] = value
  }

  return cleaned
}

/** Caracteres de todas las secciones, tal como están. */
export function gemSectionsLength(sections: GemSections): number {
  return GEM_SECTION_KEYS.reduce(
    (total, key) => total + (sections[key] ?? '').length,
    0,
  )
}

/** Cada sección dentro de su límite y la suma dentro del total. */
export function gemSectionsWithinLimits(sections: GemSections): boolean {
  if (gemSectionsLength(sections) > GEM_TOTAL_CHAR_LIMIT) return false
  return GEM_SECTION_KEYS.every(
    (key) => (sections[key] ?? '').length <= GEM_SECTION_LIMITS[key],
  )
}

// El idioma de la app como lo pide el contrato. Uno fuera de es/en/pt (o
// ninguno todavía) cae al de respaldo de i18next: inglés.
function rebuildLocaleOf(
  language: string | undefined,
): GemRebuildRequest['locale'] {
  const base = language?.slice(0, 2).toLowerCase()
  if (base === 'es' || base === 'pt') return base
  return 'en'
}

/**
 * El pedido al agente reconstructor: la gema sin espacios en los bordes, de
 * dónde viene, la versión de la app y su idioma (el agente escribe los avisos
 * en ese idioma).
 */
export function gemRebuildRequest(
  text: string,
  origin: GemRebuildOrigin,
  appVersion: string,
  language: string | undefined,
): GemRebuildRequest {
  return {
    text: text.trim(),
    origin,
    appVersion,
    locale: rebuildLocaleOf(language),
  }
}

function isStyleCharacterMode(value: unknown): value is StyleCharacterMode {
  return value === 'own' || value === 'generic' || value === 'none'
}

function readGemSections(value: unknown): GemSections | null {
  if (typeof value !== 'object' || value === null) return null
  const visualStyle: unknown = Reflect.get(value, 'visualStyle')
  if (typeof visualStyle !== 'string' || !visualStyle.trim()) return null

  const sections: GemSections = { visualStyle }
  for (const key of GEM_SECTION_KEYS) {
    if (key === 'visualStyle') continue
    const section: unknown = Reflect.get(value, key)
    if (section === undefined || section === null) continue
    if (typeof section !== 'string') return null
    sections[key] = section
  }

  const cleaned = cleanGemSections(sections)
  if (!gemSectionsWithinLimits(cleaned)) return null
  return cleaned
}

function readSuggestions(value: unknown): GemRebuildResponse['suggestions'] {
  if (typeof value !== 'object' || value === null) return {}
  const allowedModes: unknown = Reflect.get(value, 'allowedModes')
  const characterMode: unknown = Reflect.get(value, 'characterMode')

  return {
    ...(Array.isArray(allowedModes)
      ? { allowedModes: allowedModes.filter(isStyleCharacterMode) }
      : {}),
    ...(isStyleCharacterMode(characterMode) ? { characterMode } : {}),
  }
}

function readWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const warnings = value
    .filter((warning): warning is string => typeof warning === 'string')
    .map((warning) => warning.trim())
    .filter(Boolean)
  return [...new Set(warnings)]
}

/**
 * La respuesta 200 del agente, revisada antes de usarla (un servidor a medio
 * desplegar puede mandar otra cosa): la versión de plantilla que entiende esta
 * app, un `visualStyle` con texto, cada sección presente como texto y todo
 * dentro de los límites. Las secciones salen limpias y los avisos sin
 * repetidos. null = no se usa: la app lo muestra como error del servidor.
 */
export function readGemRebuildResponse(
  body: unknown,
): GemRebuildResponse | null {
  if (typeof body !== 'object' || body === null) return null
  if (Reflect.get(body, 'templateVersion') !== GEM_TEMPLATE_VERSION) return null

  const sections = readGemSections(Reflect.get(body, 'sections'))
  if (!sections) return null

  return {
    templateVersion: GEM_TEMPLATE_VERSION,
    sections,
    suggestions: readSuggestions(Reflect.get(body, 'suggestions')),
    warnings: readWarnings(Reflect.get(body, 'warnings')),
  }
}
