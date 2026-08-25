import { BIBLE_VERSION_MARKER } from '../prompts/visual-bible.ts'
import { applySafetyReplacements } from './content-safety.ts'

// Época de la historia (port de E19/E28 del parser del origen): la biblia
// visual emite su primera línea como `ERA: <valor>` (machine-readable) y de
// ahí se deriva el PERIOD LOCK que viaja al prompt final. Fail-open total:
// biblia sin línea ERA, o era presente/moderna → "" → sin lock.

// ─── Marcador de versión de la biblia ───
// El marcador VERSIONA el contrato de la biblia y decide si una persistida se
// reusa o se regenera. Regla del origen: si cambia lo que la biblia DEBE
// contener, se bumpea el marcador.
const OBSOLETE_BIBLE_MARKERS = ['__BIBLE_FACTS_V2__']

export function markBible(text: string): string {
  return `${BIBLE_VERSION_MARKER}\n${text}`
}

export function bibleHasCurrentMarker(text: string | undefined): boolean {
  return (text ?? '').startsWith(BIBLE_VERSION_MARKER)
}

export function stripBibleMarker(text: string | undefined): string {
  const value = text ?? ''
  for (const marker of [BIBLE_VERSION_MARKER, ...OBSOLETE_BIBLE_MARKERS]) {
    if (value.startsWith(marker))
      return value.slice(marker.length).replace(/^\r?\n/, '')
  }
  return value
}

// ─── Derivación de la era ───

const ERA_LINE_REGEX = /^\s*ERA\s*:\s*(.+?)\s*$/im

// Wording de "presente" en cualquier posición; "modern" anclado al inicio a
// propósito ("early modern period" es una era histórica legítima).
const PRESENT_ERA_REGEX =
  /^(modern|now|actual)\b|\b(present|today|nowadays|contempor\w*|actualidad|hoy|presente|current)\b/i

// Era declarada por la biblia, ya limpia para interpolar en el prompt final.
// "" = presente/sin línea (sin lock).
export function deriveEraFromBible(bible?: string): string {
  const match = ERA_LINE_REGEX.exec(stripBibleMarker(bible))
  if (!match) return ''

  const era = applySafetyReplacements(
    match[1]
      .replace(/[.;,]+$/, '')
      .replace(/["'`]+/g, '')
      .trim()
      .slice(0, 60),
  ).trim()
  if (!era || PRESENT_ERA_REGEX.test(era)) return ''

  // Un año RECIENTE (>= 1990) es visualmente "hoy": sin lock (un documental
  // de 2018 con infografías modernas es correcto).
  const year = /\b(1[0-9]|20)\d{2}\b/.exec(era)?.[0]
  if (year && parseInt(year, 10) >= 1990) return ''

  return era
}

// ─── Gate E28: el lock SOLO existe si el GUION declara época explícita ───
// Bug real del origen: una fábula sin época recibió "ERA: timeless rural
// setting" y TODO el video salió en estética antigua. La imaginación estética
// de la biblia nunca alcanza para lockear: hace falta evidencia en las
// palabras del propio guion.

const DATED_YEAR_REGEX =
  /\b(?:en|a[ñn]o|hacia|desde|hasta|durante|in|since)\s+((?:1[0-9]|20)\d{2})\b/gi
const HEADLINE_YEAR_REGEX = /(?:^|[.!?¡¿]\s*)((?:1[0-9])\d{2})\b/gm

// Años EN PALABRAS: el gate también corre sobre la transcripción, donde
// "1804" llega como "mil ochocientos cuatro". "novecientos noventa" (años 90)
// y "nineteen ninety" quedan excluidos: visualmente son presente.
const SPELLED_YEAR_REGEX = new RegExp(
  [
    '\\bmil\\s+(?:cien(?:to)?|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos(?!\\s+noventa))\\b',
    '\\b(?:twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen)\\s+hundred\\b',
    '\\bnineteen\\s+(?:oh|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty)\\b',
  ].join('|'),
  'i',
)

const CENTURY_REGEX =
  /\bsiglo\s+(?!XXI\b)[IVX]{1,5}\b|\b(?:1?\d|20)(?:st|nd|rd|th)[- ]century\b/i

const HISTORICAL_LEXICON_REGEX = new RegExp(
  [
    'fara[oó]n(?:es)?|pharaoh',
    'antigu[oa] (?:egipto|roma|grecia)|ancient (?:egypt|rome|greece|world|times)',
    'gladiador(?:es)?|gladiator',
    'medieval(?:es)?|edad media|middle ages',
    'vikingo|viking',
    'samur[aá]i|samurai',
    'dinast[ií]a|dynasty',
    'virreinato|[eé]poca colonial|colonial era',
    'revoluci[oó]n (?:francesa|industrial)|(?:french|industrial) revolution',
    'guerra mundial|world war',
    'prehistori|prehistoric',
    'dinosaurio|dinosaur',
    'hace[\\wáéíóúñ\\s]{0,40}(?:miles|millones) de a[ñn]os|(?:thousands|millions) of years ago',
    'lejano oeste|wild west|far west',
    'renacimiento|renaissance',
    'imperio (?:romano|inca|azteca|otomano)|(?:roman|ottoman) empire',
    'caballeros? medieval|victorian[oa]?s?\\b',
  ].join('|'),
  'i',
)

export function scriptDeclaresExplicitEra(script: string): boolean {
  if (!script?.trim()) return false

  for (const match of script.matchAll(DATED_YEAR_REGEX)) {
    if (parseInt(match[1], 10) < 1990) return true
  }
  for (const match of script.matchAll(HEADLINE_YEAR_REGEX)) {
    if (parseInt(match[1], 10) < 1990) return true
  }
  if (SPELLED_YEAR_REGEX.test(script)) return true
  if (CENTURY_REGEX.test(script)) return true

  return HISTORICAL_LEXICON_REGEX.test(script)
}

// Primer año fechado < 1990 del guion (para el chequeo de coherencia).
function scriptEraYear(script: string): number | null {
  for (const match of script.matchAll(DATED_YEAR_REGEX)) {
    const year = parseInt(match[1], 10)
    if (year < 1990) return year
  }
  for (const match of script.matchAll(HEADLINE_YEAR_REGEX)) {
    const year = parseInt(match[1], 10)
    if (year < 1990) return year
  }
  return null
}

// Neutraliza la línea ERA cuando el guion no sustenta una época (o cuando la
// biblia alucinó otro año a ≥50 años del declarado). Se aplica en los puntos
// de entrada y todo lo de aguas abajo hereda la corrección.
export function neutralizeEraInBible(
  bible: string | undefined,
  script: string,
): string | undefined {
  if (!bible) return bible

  const rawEra = deriveEraFromBible(bible)
  if (!rawEra) return bible

  let supported = scriptDeclaresExplicitEra(script)
  if (supported) {
    const scriptYear = scriptEraYear(script)
    const eraYear = /(?:1[0-9]|20)\d{2}/.exec(rawEra)?.[0]
    if (
      scriptYear &&
      eraYear &&
      Math.abs(parseInt(eraYear, 10) - scriptYear) >= 50
    )
      supported = false
  }
  if (supported) return bible

  return bible.replace(ERA_LINE_REGEX, 'ERA: present day')
}

// ─── Escape multi-época por escena ───
// ¿La narración de ESTA escena declara explícitamente OTRO momento que la era
// global? (el tramo "En 1985..." de un guion de 1912 escapa del lock).

const OTHER_ERA_PHRASE_REGEX =
  /\b(hoy en d[ií]a|en la actualidad|actualmente|en nuestros d[ií]as|al d[ií]a de hoy|en el presente|d[eé]cadas (?:despu[eé]s|m[aá]s tarde)|a[ñn]os (?:despu[eé]s|m[aá]s tarde)|siglo (?:XXI|veintiuno)|nowadays|these days|to this day|present day|decades later|years later)\b/i

// Sin "de|del": "más de 1500 personas" es una CANTIDAD, no una fecha.
const SCENE_DATED_YEAR_REGEX =
  /\b(?:en|a[ñn]o|hacia|desde|hasta|in|since)\s+((?:1[0-9]|20)\d{2})\b/gi

export function sceneDeclaresDifferentEra(
  globalEra: string,
  sceneText: string,
  window = '',
): boolean {
  if (!globalEra.trim()) return false

  const text = `${sceneText} ${window}`
  if (OTHER_ERA_PHRASE_REGEX.test(text)) return true

  const eraYear = /(?:1[0-9]|20)\d{2}/.exec(globalEra)?.[0]
  if (!eraYear) return false

  const base = parseInt(eraYear, 10)
  for (const match of text.matchAll(SCENE_DATED_YEAR_REGEX)) {
    // Umbral 15 años: "de 1907" en una historia de 1912 no escapa.
    if (Math.abs(parseInt(match[1], 10) - base) >= 15) return true
  }
  return false
}

// Ventana ACOTADA para el escape de época: SOLO el texto de la escena
// anterior (una ventana ancha hacía escapar a medio guion — hallazgo crítico
// de la revisión adversarial del origen).
export function eraEscapeWindow(
  orderedSceneTexts: { id: number; text: string }[],
  currentId: number,
): string {
  const index = orderedSceneTexts.findIndex((scene) => scene.id === currentId)
  if (index <= 0) return ''
  return (orderedSceneTexts[index - 1]?.text ?? '').trim()
}
