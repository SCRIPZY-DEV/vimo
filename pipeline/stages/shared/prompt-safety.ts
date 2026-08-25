import { MAX_PROMPT_CHARS } from '../../prompts/prompt-limits.ts'
import {
  ANONYMITY_CLAUSE,
  IMAGE_TEXT_LANGUAGE_CLAUSE,
  IMMERSIVE_DIAGRAM_CLAUSE,
  IMMERSIVE_DIAGRAM_PHOTO_CLAUSE,
  IMMERSIVE_DIAGRAM_PHOTO_PERIOD_CLAUSE,
} from '../../prompts/scene-prompt-blocks.ts'
import { applySafetyReplacements } from '../../utils/content-safety.ts'
import { sceneDeclaresDifferentEra } from '../../utils/story-era.ts'

// Chokepoint ÚNICO de seguridad del prompt final (port de sanitizarPromptFinal
// del origen): TODO prompt — venga del LLM, del rescate o del fallback — pasa
// por acá justo antes de cualquier proveedor de imagen. Neutraliza términos
// marcables y ANEXA por código las cláusulas duras (época, diagrama diegético,
// texto-en-imagen, anonimato), recortando siempre el CUERPO y jamás una
// cláusula. Los TEXTOS de las cláusulas viven en prompts/scene-prompt-blocks
// (datos editables); acá vive solo la mecánica de anexado y dedupe: cada
// cláusula tiene su substring de dedupe, así re-sanitizar un prompt persistido
// no la duplica.

// Lock de época con la era CONCRETA adentro (el modelo de imagen no ve la
// biblia ni la narración — regla E11 del origen: la garantía va por código).
export function periodLockClause(era: string): string {
  return `PERIOD LOCK — this story is set in ${era}: settings, clothing, objects, charts and diagrams must look period-accurate (hand-made or printed artifacts, period lettering), never modern graphic design nor present-day clothing; a recurring character's reference look and any explicitly described later or present-day moment win over this lock.`
}

// Estilos cuyo medio de render es la fotografía (no la ilustración).
export function isPhotorealisticStyle(styleId: string | undefined): boolean {
  return (styleId ?? '').trim().toLowerCase() === 'normal'
}

function normalizeForDedupe(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ')
}

function endWithPunctuation(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`
}

// Anexa una cláusula reservando el espacio de las que vienen DESPUÉS: todas
// quedan íntegras bajo MAX_PROMPT_CHARS recortando solo el cuerpo.
function appendReservingSpace(
  prompt: string,
  clause: string,
  reservedAfter: number,
): string {
  let body = endWithPunctuation(prompt.trim())
  const space = MAX_PROMPT_CHARS - clause.length - reservedAfter - 1
  if (body.length > space) body = body.slice(0, Math.max(0, space)).trim()
  return `${body} ${clause}`.trim()
}

function appendAnonymity(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return trimmed
  if (normalizeForDedupe(trimmed).includes('fictional, anonymous individual'))
    return trimmed
  return appendReservingSpace(trimmed, ANONYMITY_CLAUSE, 0)
}

function appendImageTextClause(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return trimmed
  // Mismo substring que traen las cláusulas del fallback determinístico: ni
  // el fallback ni un prompt re-sanitizado la duplican.
  if (
    normalizeForDedupe(trimmed).includes('the narration is spoken, not written')
  )
    return trimmed
  return appendReservingSpace(
    trimmed,
    IMAGE_TEXT_LANGUAGE_CLAUSE,
    ANONYMITY_CLAUSE.length + 1,
  )
}

function appendPeriodLock(prompt: string, era: string): string {
  const trimmed = prompt.trim()
  if (!trimmed || !era.trim()) return trimmed
  if (
    normalizeForDedupe(trimmed).includes('period lock — this story is set in')
  )
    return trimmed
  const clause = periodLockClause(era.trim())
  return appendReservingSpace(
    trimmed,
    clause,
    IMAGE_TEXT_LANGUAGE_CLAUSE.length + ANONYMITY_CLAUSE.length + 2,
  )
}

function appendImmersiveDiagram(prompt: string, styleId?: string): string {
  const isPhoto = isPhotorealisticStyle(styleId)
  const clause = isPhoto
    ? IMMERSIVE_DIAGRAM_PHOTO_CLAUSE
    : IMMERSIVE_DIAGRAM_CLAUSE
  const otherVariant = isPhoto
    ? IMMERSIVE_DIAGRAM_CLAUSE
    : IMMERSIVE_DIAGRAM_PHOTO_CLAUSE

  const trimmed = prompt.trim()
  if (!trimmed) return trimmed
  if (normalizeForDedupe(trimmed).includes(normalizeForDedupe(clause)))
    return trimmed
  // La variante EQUIVOCADA (prompt persistido con otro estilo) se REEMPLAZA.
  if (trimmed.includes(otherVariant))
    return trimmed.replace(otherVariant, clause)
  // Variante desconocida: dedupe defensivo por prefijo común.
  if (
    normalizeForDedupe(trimmed).includes(
      'diegetic diagram: stage this explanation',
    )
  )
    return trimmed

  // Prompt YA sanitizado (regen sobre uno persistido): insertar ANTES de la
  // cláusula de idioma existente — jamás truncar la cola de cláusulas.
  const languageIndex = trimmed.indexOf(
    'Do NOT print the narration onto the image',
  )
  if (languageIndex >= 0) {
    let body = trimmed.slice(0, languageIndex).trim()
    const tail = trimmed.slice(languageIndex).trim()
    const space = MAX_PROMPT_CHARS - clause.length - tail.length - 2
    if (body.length > space) body = body.slice(0, Math.max(0, space)).trim()
    return `${body} ${clause} ${tail}`.trim()
  }

  return appendReservingSpace(
    trimmed,
    clause,
    IMAGE_TEXT_LANGUAGE_CLAUSE.length + ANONYMITY_CLAUSE.length + 2,
  )
}

export interface FinalPromptEraContext {
  // Era global derivada de la biblia; "" = sin lock.
  era: string
  // Narración (o pedido manual) de ESTA escena, para el escape multi-época.
  sceneText?: string
  // Texto de la escena ANTERIOR (ventana acotada del escape).
  window?: string
  // ¿El tratamiento del director es "diagram"? → cláusula diegética.
  isDiagram?: boolean
  styleId?: string
}

// Scrub FINAL del prompt ya ensamblado, justo antes del generador de imágenes.
export function sanitizeFinalPrompt(
  prompt: string,
  eraContext?: FinalPromptEraContext,
): string {
  // 1) Violencia/gore/armas/sexual/drogas → términos seguros.
  let result = applySafetyReplacements(prompt ?? '')

  // 1.5) Lock de época: solo si la biblia fija una era y la narración de ESTA
  // escena no declara explícitamente otro momento.
  if (
    eraContext?.era &&
    !sceneDeclaresDifferentEra(
      eraContext.era,
      eraContext.sceneText ?? '',
      eraContext.window ?? '',
    )
  ) {
    result = appendPeriodLock(result, eraContext.era)
  }

  // 1.75) Escena de DIAGRAMA sin PERIOD LOCK → cláusula diegética. Con lock
  // presente, el lock ya exige artefactos del período; en fotorrealista se
  // suma solo el addendum de MEDIO.
  const hasPeriodLock = normalizeForDedupe(result).includes(
    'period lock — this story is set in',
  )
  if (eraContext?.isDiagram && !hasPeriodLock) {
    result = appendImmersiveDiagram(result, eraContext.styleId)
  } else if (
    eraContext?.isDiagram &&
    isPhotorealisticStyle(eraContext.styleId) &&
    !result.includes('DIAGRAM MEDIUM:')
  ) {
    result = `${result} ${IMMERSIVE_DIAGRAM_PHOTO_PERIOD_CLAUSE}`
  }

  // 2) Los nombres de personas reales NO se neutralizan acá (el famoso
  // nombrado sale estilizado pero reconocible); neutralizeFamousNames queda
  // solo para el rescate por content policy.
  // 3) Cláusula dura de texto-en-imagen, antes de la de anonimato (reserva el
  // espacio de ambas).
  result = appendImageTextClause(result)
  // 4) Cláusula condicional de anonimato.
  result = appendAnonymity(result)

  return result
}
