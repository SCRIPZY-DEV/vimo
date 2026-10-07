import type {
  COLOR_FILTER_IDS as PIPELINE_COLOR_FILTER_IDS,
  CustomStyleSummary,
  GEM_SECTION_KEYS as PIPELINE_GEM_SECTION_KEYS,
  GEM_TEMPLATE_VERSION as PIPELINE_GEM_TEMPLATE_VERSION,
  GemSectionKey,
  GemSections,
  StyleCharacterMode,
  StyleSavePayload,
} from '@pipeline/types/styles.ts'
import type {
  GemRebuildOrigin,
  GemRebuildRequest,
  GemRebuildResponse,
} from '@/modules/videos/types/gemRebuild'
import type {
  GemTextSource,
  PastedGemDraft,
  StyleContextGem,
  TemplateStyleDraft,
} from '@/modules/videos/types/styles'

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

// Presets de color del estilo (spec §5.5), en el orden en que se ofrecen.
export const COLOR_FILTER_IDS: typeof PIPELINE_COLOR_FILTER_IDS = [
  'none',
  'fantasy',
  'horror-bw',
]

// Límites de la spec §4.1: cada sección hasta 12 000 caracteres, `character`
// hasta 700 (la identidad tejida), el inicio fijo hasta 600 y la suma hasta
// 30 000, porque las secciones van en cada pedido de prompts. El final fijo
// llega a 1 000: el de un estilo clonado con IA lleva su ficha de estilo
// (ADR-0050). La gema que se pega puede ser más larga
// (GEM_REBUILD_TEXT_LIMIT): el agente la condensa.
export const GEM_SECTION_LIMITS: Record<GemSectionKey, number> = {
  visualStyle: 12_000,
  character: 700,
  dynamism: 12_000,
  camera: 12_000,
  rules: 12_000,
  promptStart: 600,
  promptEnd: 1_000,
}
export const GEM_TOTAL_CHAR_LIMIT = 30_000

// El texto más largo que acepta el agente: espejo de LIMITE_TEXTO_GEMA de
// vimo-landing y de CUSTOM_STYLE_PROMPT_LIMIT (lo que se puede pegar).
export const GEM_REBUILD_TEXT_LIMIT = 100_000

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

/**
 * Tope del textarea de una sección: su propio límite o lo que queda del total,
 * lo que llegue primero. Así el modal nunca arma una gema que style-save
 * rechace.
 */
export function sectionMaxLength(
  sections: GemSections,
  key: GemSectionKey,
): number {
  const own = (sections[key] ?? '').length
  const others = gemSectionsLength(sections) - own
  return Math.max(
    0,
    Math.min(GEM_SECTION_LIMITS[key], GEM_TOTAL_CHAR_LIMIT - others),
  )
}

/** ¿Hay estilo escrito? En una gema de plantilla, su estilo visual; en una vieja, su texto. */
export function hasGemText(gem: GemTextSource): boolean {
  if (gem.sections) return gem.sections.visualStyle.trim().length > 0
  return (gem.systemPrompt ?? '').trim().length > 0
}

/**
 * ¿La gema trae su propio personaje? Sí cuando su sección `character` tiene
 * texto: ahí «genérico» es ESE personaje (el sidecar lo teje sin diseñar otro,
 * spec §5.2) y la pantalla lo llama «Personaje del estilo». Una gema vieja no
 * tiene secciones: no se sabe, y «genérico» lo sigue inventando Vimo.
 */
export function gemBringsCharacter(sections: GemSections | undefined): boolean {
  return Boolean(sections?.character?.trim())
}

/**
 * ¿La gema ya se adaptó a la ficha de Vimo? Sí cuando tiene secciones y el
 * respaldo del texto del que salieron: lo guarda la adaptación, sea de una
 * gema pegada o de una vieja. Una copia del catálogo tiene secciones pero no
 * salió de ningún texto (dice «Basado en …»); una gema vieja se adapta la
 * primera vez que se abre o se elige.
 */
export function isAdaptedGem(
  gem: Pick<CustomStyleSummary, 'sections' | 'sourcePrompt'>,
): boolean {
  return gem.sections !== undefined && Boolean(gem.sourcePrompt?.trim())
}

/** Caracteres de la gema: las secciones limpias sumadas, o el texto de una vieja. */
export function gemCharCount(gem: GemTextSource): number {
  if (gem.sections) return gemSectionsLength(cleanGemSections(gem.sections))
  return (gem.systemPrompt ?? '').trim().length
}

/**
 * style-save de una gema de plantilla editada en el modal: las secciones
 * limpias y SIEMPRE su `templateVersion` (la que devolvió el agente o la
 * guardada), sin `systemPrompt` ni `shots` (spec §4.2: los planos los
 * reemplaza la sección `camera`). `sourcePrompt` viaja solo si la gema pasó
 * por el agente en esta apertura; ausente, el sidecar conserva el guardado.
 */
export function templateStyleSavePayload(
  draft: TemplateStyleDraft,
): StyleSavePayload {
  return {
    id: draft.id,
    name: draft.name,
    sections: cleanGemSections(draft.sections),
    templateVersion: draft.templateVersion,
    colorFilter: draft.colorFilter,
    character: draft.character,
    ...(draft.sourcePrompt === null
      ? {}
      : { sourcePrompt: draft.sourcePrompt }),
  }
}

// Los planos de una gema vieja en el formato con que el sidecar se los suma al
// componerla (buildCustomStyleSystemPrompt, pipeline/prompts/custom-style.ts):
// copia literal, porque `src/` no importa valores de `pipeline/`.
function allowedShotsBlock(shots: string[]): string {
  const allowed = shots.filter(Boolean)
  if (allowed.length === 0) return ''
  return `\n\n# ALLOWED SHOTS (use ONLY these framings)\n${allowed
    .map((shot) => `- ${shot}`)
    .join('\n')}`
}

/**
 * El texto que va al agente al migrar una gema vieja (spec §4.4): su
 * `systemPrompt` y, si tiene planos, el bloque «# ALLOWED SHOTS» del sidecar,
 * para que el agente los pase a la sección `camera` (una gema de plantilla no
 * guarda planos). Sin planos, el `systemPrompt` tal cual. Si con los planos
 * pasara lo que acepta el agente, va sin ellos: mejor perder los planos que no
 * poder migrarla nunca.
 */
export function migrationRebuildText(style: CustomStyleSummary): string {
  const systemPrompt = (style.systemPrompt ?? '').trim()
  const withShots = `${systemPrompt}${allowedShotsBlock(style.shots)}`.trim()
  if (withShots.length > GEM_REBUILD_TEXT_LIMIT) return systemPrompt
  return withShots
}

/**
 * style-save de una gema vieja reconstruida sola (spec §4.4): sus secciones,
 * el `templateVersion` que devolvió el agente y, de respaldo, el texto que se
 * le mandó (su `systemPrompt` y sus planos) como `sourcePrompt`. No manda
 * `systemPrompt` (una gema tiene secciones o texto, nunca los dos) ni
 * personaje ni filtro: ausentes, el sidecar conserva los guardados.
 */
export function migrationStyleSavePayload(
  style: CustomStyleSummary,
  response: GemRebuildResponse,
): StyleSavePayload {
  return {
    id: style.id,
    name: style.name,
    sections: cleanGemSections(response.sections),
    templateVersion: response.templateVersion,
    sourcePrompt: migrationRebuildText(style),
  }
}

/**
 * style-save de la gema pegada en un estilo nuevo al tocar «Preparar con IA»:
 * se guarda tal cual, como texto (así no se pierde si se cierra el modal o la
 * app), y la adaptación a la plantilla la reemplaza por secciones en segundo
 * plano. Sin planos (una gema de plantilla no los usa). El personaje y el
 * filtro de color viajan como están en el modal.
 */
export function pastedGemSavePayload(draft: PastedGemDraft): StyleSavePayload {
  return {
    id: draft.id,
    name: draft.name,
    systemPrompt: draft.text.trim(),
    shots: [],
    character: draft.character,
    colorFilter: draft.colorFilter,
  }
}

/**
 * La gema en uso como contexto de «Crear personaje con mi estilo»
 * (design-style-character, ADR-0048): una de plantilla viaja por secciones,
 * limpias, y el sidecar la pasa a texto sin su sección `character` (ahí se
 * diseña OTRO personaje, el de la persona); una vieja viaja como su texto.
 * Nunca las dos.
 */
export function styleContextGemOf(gem: GemTextSource): StyleContextGem {
  if (gem.sections) return { sections: cleanGemSections(gem.sections) }
  return { gem: gem.systemPrompt ?? '' }
}
