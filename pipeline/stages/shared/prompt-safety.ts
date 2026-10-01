import { MAX_PROMPT_CHARS } from '../../prompts/prompt-limits.ts'
import type { FixedPhrases } from '../../prompts/template-frame.ts'
import { DESCRIPTION_HEADER_PREFIX } from '../../prompts/verbatim-identity.ts'
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

// Lo que le queda al CUERPO de un prompt una vez reservadas las dos cláusulas
// que se anexan siempre (texto-en-imagen y anonimato). Por encima de esto el
// scrub final recorta. Exportado para que quien arma el prompt pueda AVISAR
// que se pasó, en vez de enterarse nadie.
export const FINAL_PROMPT_BODY_BUDGET =
  MAX_PROMPT_CHARS -
  IMAGE_TEXT_LANGUAGE_CLAUSE.length -
  ANONYMITY_CLAUSE.length -
  2

// Piso del núcleo de escena cuando un prompt del carril verbatim no entra: por
// debajo de esto la imagen ya no cuenta lo que narra el fragmento, y recién
// ahí se empieza a ceder cola de estilo.
const MIN_SCENE_CORE_CHARS = 300

// Dos separadores entre los tres tramos + un punto de cierre por tramo.
const JOINED_PARTS_OVERHEAD = 5

// Con frases fijas: tres separadores entre los cuatro tramos + un punto de
// cierre por cada tramo que se puede cortar.
const FRAMED_PARTS_OVERHEAD = 6

// Corta en el último cierre de oración que entre; si el cierre queda muy
// atrás (una oración larguísima, típica de una cola de estilo), corta en
// palabra entera: perder media frase es mejor que perder medio prompt.
function cutAtSentence(text: string, space: number): string {
  if (text.length <= space) return text
  const cut = text.slice(0, Math.max(0, space))
  const boundary = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
  )
  if (boundary >= space / 2) return cut.slice(0, boundary + 1).trim()

  const lastSpace = cut.lastIndexOf(' ')
  const wholeWords = lastSpace > 0 ? cut.slice(0, lastSpace) : cut
  return wholeWords.replace(/[,;:\s]+$/, '')
}

// Dónde arranca la cola de estilo de un prompt verbatim: el último "Style:"
// o, si la gema no lo escribe así, la última oración (la arquitectura del
// prompt cierra siempre con la cola). Sin cola reconocible devuelve el largo.
function styleTailIndex(scene: string): number {
  const styleMarks = [...scene.matchAll(/\bstyle\s*:/gi)]
  const lastMark = styleMarks.at(-1)
  if (lastMark?.index) return lastMark.index

  const withoutClosing = scene.replace(/[.!?\s]+$/, '')
  const boundary = Math.max(
    withoutClosing.lastIndexOf('. '),
    withoutClosing.lastIndexOf('! '),
    withoutClosing.lastIndexOf('? '),
  )
  return boundary > 0 ? boundary + 2 : scene.length
}

interface FramedBody {
  start: string
  middle: string
  end: string
}

// Las frases fijas como quedan dentro de un prompt saneado: el paso 1 de
// `sanitizeFinalPrompt` cambia los términos marcables y colapsa los espacios
// de TODO el prompt, también los de las frases, y el recorte (y el rescate sin
// foto, que las quita de un prompt guardado) las buscan tal cual.
export function sanitizedFixedPhrases(phrases: FixedPhrases): FixedPhrases {
  return {
    promptStart:
      phrases.promptStart && applySafetyReplacements(phrases.promptStart),
    promptEnd: phrases.promptEnd && applySafetyReplacements(phrases.promptEnd),
  }
}

// El inicio y el final fijos de una gema de plantilla, separados del cuerpo.
// undefined = el cuerpo no los trae (otro camino, o un prompt anterior a la
// plantilla): se recorta como siempre.
function splitFixedPhrases(
  body: string,
  phrases: FixedPhrases,
): FramedBody | undefined {
  const start = phrases.promptStart?.trim() ?? ''
  const end = phrases.promptEnd?.trim() ?? ''
  const hasStart = start.length > 0 && body.startsWith(start)
  const middleStart = hasStart ? start.length : 0
  // `endWithPunctuation` pudo sumarle un punto al final fijo.
  const endIndex = end ? body.lastIndexOf(end) : -1
  const hasEnd =
    endIndex >= middleStart &&
    /^[.!?\s]*$/.test(body.slice(endIndex + end.length))
  if (!hasStart && !hasEnd) return undefined
  return {
    start: hasStart ? start : '',
    middle: body.slice(middleStart, hasEnd ? endIndex : body.length).trim(),
    end: hasEnd ? body.slice(endIndex).trim() : '',
  }
}

// Con frases fijas (spec §5.4) el cuerpo es inicio → escena → identidad →
// final. Si no entra, cede primero el núcleo de la escena (hasta su piso),
// después el final fijo y la identidad recién al final. El inicio fijo no se
// corta nunca.
function fitFramedBody(framed: FramedBody, space: number): string {
  const budget = space - framed.start.length - FRAMED_PARTS_OVERHEAD
  const identityIndex = framed.middle.lastIndexOf(DESCRIPTION_HEADER_PREFIX)
  const scene =
    identityIndex < 0
      ? framed.middle
      : framed.middle.slice(0, identityIndex).trim()
  const identity =
    identityIndex < 0 ? '' : framed.middle.slice(identityIndex).trim()

  const sceneSpace = Math.max(
    MIN_SCENE_CORE_CHARS,
    budget - identity.length - framed.end.length,
  )
  const fittedScene = cutAtSentence(scene, sceneSpace)
  const endSpace = budget - fittedScene.length - identity.length
  const fittedEnd = cutAtSentence(framed.end, Math.max(0, endSpace))
  const identitySpace = budget - fittedScene.length - fittedEnd.length
  const fittedIdentity = cutAtSentence(identity, Math.max(0, identitySpace))

  const cut = [fittedScene, fittedIdentity, fittedEnd]
    .filter((part) => part.length > 0)
    .map(endWithPunctuation)
  return [framed.start, ...cut].filter((part) => part.length > 0).join(' ')
}

// Hace entrar el cuerpo en `space`. Sin identidad tejida (todo el carril del
// catálogo) es el corte de siempre, byte por byte. Con identidad tejida (carril
// verbatim) el cuerpo es escena → cola de estilo → identidad, y cortar por el
// final borraba justo la identidad: el personaje desaparecía en silencio de las
// escenas con cola de estilo larga. Acá se cede en orden inverso de valor:
// primero el núcleo de la escena (hasta su piso), después la cola de estilo y
// la identidad recién al final. Con las frases fijas de una gema de plantilla,
// el corte de `fitFramedBody`.
function fitBody(
  body: string,
  space: number,
  fixedPhrases?: FixedPhrases,
): string {
  if (body.length <= space) return body

  const framed = fixedPhrases
    ? splitFixedPhrases(body, fixedPhrases)
    : undefined
  if (framed) return fitFramedBody(framed, space)

  const identityIndex = body.lastIndexOf(DESCRIPTION_HEADER_PREFIX)
  if (identityIndex < 0) return body.slice(0, Math.max(0, space)).trim()

  const identity = body.slice(identityIndex).trim()
  const scene = body.slice(0, identityIndex).trim()
  const tailIndex = styleTailIndex(scene)
  const core = scene.slice(0, tailIndex).trim()
  const tail = scene.slice(tailIndex).trim()

  // Lo que se arma al final suma dos separadores y, a lo sumo, un punto de
  // cierre por tramo cortado: se descuenta acá para que el resultado entre de
  // verdad (si se pasa por uno, la cláusula siguiente vuelve a recortar).
  const budget = space - JOINED_PARTS_OVERHEAD
  const coreSpace = Math.max(
    MIN_SCENE_CORE_CHARS,
    budget - identity.length - tail.length,
  )
  const fittedCore = cutAtSentence(core, coreSpace)
  const tailSpace = budget - identity.length - fittedCore.length
  const fittedTail = cutAtSentence(tail, Math.max(0, tailSpace))
  const identitySpace = budget - fittedCore.length - fittedTail.length
  const fittedIdentity = cutAtSentence(identity, Math.max(0, identitySpace))

  return [fittedCore, fittedTail, fittedIdentity]
    .filter((part) => part.length > 0)
    .map(endWithPunctuation)
    .join(' ')
}

// Anexa una cláusula reservando el espacio de las que vienen DESPUÉS: todas
// quedan íntegras bajo MAX_PROMPT_CHARS recortando solo el cuerpo.
function appendReservingSpace(
  prompt: string,
  clause: string,
  reservedAfter: number,
  fixedPhrases?: FixedPhrases,
): string {
  const space = MAX_PROMPT_CHARS - clause.length - reservedAfter - 1
  const body = fitBody(endWithPunctuation(prompt.trim()), space, fixedPhrases)
  return `${body} ${clause}`.trim()
}

// Arranque de cada cláusula final, derivado de su propio texto: así un cambio
// en la redacción de la cláusula no deja este corte mirando un texto viejo.
const FINAL_CLAUSE_MARK_CHARS = 32
const FINAL_CLAUSE_MARKS = [
  'PERIOD LOCK —',
  IMMERSIVE_DIAGRAM_CLAUSE,
  IMMERSIVE_DIAGRAM_PHOTO_CLAUSE,
  IMMERSIVE_DIAGRAM_PHOTO_PERIOD_CLAUSE,
  IMAGE_TEXT_LANGUAGE_CLAUSE,
  ANONYMITY_CLAUSE,
].map((clause) => clause.slice(0, FINAL_CLAUSE_MARK_CHARS))

// El cuerpo de un prompt YA sanitizado, sin las cláusulas que este archivo le
// anexó al final. Lo usa quien necesita leer lo que el carril escribió (la
// identidad tejida) en un prompt guardado.
export function bodyWithoutFinalClauses(prompt: string): string {
  const starts = FINAL_CLAUSE_MARKS.map((mark) => prompt.indexOf(mark)).filter(
    (index) => index >= 0,
  )
  if (starts.length === 0) return prompt.trim()
  return prompt.slice(0, Math.min(...starts)).trim()
}

// Lo que la cláusula de texto-en-imagen le garantiza al generador, la traiga
// el fallback adentro o la anexe este archivo.
const IMAGE_TEXT_GUARANTEES = [
  'do not print the narration',
  'no readable text',
  'the narration is spoken, not written',
]

function carriesImageTextClause(prompt: string): boolean {
  const normalized = normalizeForDedupe(prompt)
  return IMAGE_TEXT_GUARANTEES.every((guarantee) =>
    normalized.includes(guarantee),
  )
}

function appendAnonymity(prompt: string, fixedPhrases?: FixedPhrases): string {
  const trimmed = prompt.trim()
  if (!trimmed) return trimmed
  if (normalizeForDedupe(trimmed).includes('fictional, anonymous individual'))
    return trimmed
  return appendReservingSpace(trimmed, ANONYMITY_CLAUSE, 0, fixedPhrases)
}

function appendImageTextClause(
  prompt: string,
  fixedPhrases?: FixedPhrases,
): string {
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
    fixedPhrases,
  )
}

function appendPeriodLock(
  prompt: string,
  era: string,
  fixedPhrases?: FixedPhrases,
): string {
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
    fixedPhrases,
  )
}

function appendImmersiveDiagram(
  prompt: string,
  styleId?: string,
  fixedPhrases?: FixedPhrases,
): string {
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
    const tail = trimmed.slice(languageIndex).trim()
    const space = MAX_PROMPT_CHARS - clause.length - tail.length - 2
    const body = fitBody(
      trimmed.slice(0, languageIndex).trim(),
      space,
      fixedPhrases,
    )
    return `${body} ${clause} ${tail}`.trim()
  }

  return appendReservingSpace(
    trimmed,
    clause,
    IMAGE_TEXT_LANGUAGE_CLAUSE.length + ANONYMITY_CLAUSE.length + 2,
    fixedPhrases,
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
// `fixedPhrases`: las frases fijas de una gema de plantilla, que el recorte
// protege (spec §5.4). Ausente = el recorte de siempre.
export function sanitizeFinalPrompt(
  prompt: string,
  eraContext?: FinalPromptEraContext,
  fixedPhrases?: FixedPhrases,
): string {
  // Las frases fijas, saneadas como el resto del prompt en el paso 1: el
  // recorte las busca tal cual dentro de él.
  const phrases = fixedPhrases && sanitizedFixedPhrases(fixedPhrases)
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
    result = appendPeriodLock(result, eraContext.era, phrases)
  }

  // 1.75) Escena de DIAGRAMA sin PERIOD LOCK → cláusula diegética. Con lock
  // presente, el lock ya exige artefactos del período; en fotorrealista se
  // suma solo el addendum de MEDIO.
  const hasPeriodLock = normalizeForDedupe(result).includes(
    'period lock — this story is set in',
  )
  if (eraContext?.isDiagram && !hasPeriodLock) {
    result = appendImmersiveDiagram(result, eraContext.styleId, phrases)
  } else if (
    eraContext?.isDiagram &&
    isPhotorealisticStyle(eraContext.styleId) &&
    !result.includes('DIAGRAM MEDIUM:')
  ) {
    // Reserva TODA la cola antes de añadir el medio: recortar después podía
    // borrar el addendum y volver a anexarlo en la segunda pasada (>3000).
    const body = bodyWithoutFinalClauses(result)
    const tail = result.slice(body.length).trim()
    const normalized = normalizeForDedupe(result)
    const reserveLanguage = normalized.includes(
      'the narration is spoken, not written',
    )
      ? 0
      : IMAGE_TEXT_LANGUAGE_CLAUSE.length + 1
    const reserveAnonymity = normalized.includes(
      'fictional, anonymous individual',
    )
      ? 0
      : ANONYMITY_CLAUSE.length + 1
    const space =
      MAX_PROMPT_CHARS -
      tail.length -
      IMMERSIVE_DIAGRAM_PHOTO_PERIOD_CLAUSE.length -
      reserveLanguage -
      reserveAnonymity -
      2
    result = [
      fitBody(body, space, phrases),
      tail,
      IMMERSIVE_DIAGRAM_PHOTO_PERIOD_CLAUSE,
    ]
      .filter(Boolean)
      .join(' ')
  }

  // 2) Los nombres de personas reales NO se neutralizan acá (el famoso
  // nombrado sale estilizado pero reconocible); neutralizeFamousNames queda
  // solo para el rescate por content policy.
  // 3) Cláusula dura de texto-en-imagen, antes de la de anonimato (reserva el
  // espacio de ambas).
  const beforeClauses = result
  result = appendImageTextClause(result, phrases)
  // 4) Cláusula condicional de anonimato.
  result = appendAnonymity(result, phrases)
  // 5) Con frases fijas, la cláusula de texto que el fallback trae adentro es
  // parte de la escena para el recorte: el paso 3 la dio por puesta y el
  // recorte del paso 4 pudo llevársela entera o en parte. Si quedó
  // incompleta, se rehacen los pasos 3 y 4 anexando SIEMPRE la de la
  // plataforma, que el recorte nunca toca. Es más larga que la del fallback:
  // el recorte, ahora más justo, se lleva lo que quedaba de esta.
  if (phrases && !carriesImageTextClause(result)) {
    result = appendAnonymity(
      appendReservingSpace(
        beforeClauses,
        IMAGE_TEXT_LANGUAGE_CLAUSE,
        ANONYMITY_CLAUSE.length + 1,
        phrases,
      ),
      phrases,
    )
  }

  return result
}
