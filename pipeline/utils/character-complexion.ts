// Detección determinística de la TEZ (tono de piel / etnia) en la descripción
// canónica de un personaje y en un prompt de escena ya redactado. Es la base
// del candado de identidad: el redactor suelta este rasgo en algunas escenas y
// el generador rellena con una persona de piel clara.
//
// Principios:
//  - Se devuelve la cláusula ORIGINAL, verbatim: no se traduce ni se
//    reinterpreta («moreno» es ambiguo; se respeta la redacción del usuario).
//  - Un color suelto NUNCA alcanza: «black jacket», «white shirt», «brown
//    eyes», «pelo moreno» o «barba negra» no hablan de la piel. El color solo
//    cuenta pegado a un sustantivo de persona o a una palabra de piel.
//  - «afro» suelto queda afuera a propósito: es un peinado.

const MAX_CLAUSE_CHARS = 80

const CLAUSE_SEPARATOR = /[,;:.()\n]|\s(?:and|with|y|con|e|com)\s/i

// Palabra que por sí sola habla de la piel. `skinny` y los cueros
// («snakeskin») no matchean por el límite de palabra; «skin-tight» se excluye.
const SKIN_WORD =
  /\b(skin(?![- ]?tight)|skinned|complexion(?:ed)?|piel|tez|cutis|pele)\b/

// Etnia sin color: alcanza sola.
const ETHNICITY_WORD =
  /\b(asian|latin[oa]s?|latinx|hispanic|african|afro[- ]?(?:american|latin[oa]|caribbean|colombian[oa]?|brazilian|brasileir[oa]|descend\w+)|south asian|middle eastern|arab|indigenous|indigena|native american|caucasian|caucasic[oa]|mestiz[oa]|mulatt?[oa]|biracial|mixed[- ]race|triguen[oa]|asiatic[oa]|cabocl[oa])\b/

// Color + sustantivo de persona en inglés. La lista blanca de palabras
// intermedias evita «black bearded man».
const ENGLISH_COLORED_PERSON =
  /\b(black|white|brown)\s+(?:(?:young|old|elderly|adult|middle-aged|teenage|tall|short|slim|\d+-year-old)\s+){0,2}(?:man|woman|boy|girl|person|guy|lady|teen(?:ager)?|child|kid|male|female)\b/

const ROMANCE_SKIN_COLOR =
  '(?:moren[oa]|negr[oa]|blanc[oa]|pret[oa]|pard[oa]|branc[oa])'

// Sustantivo de persona + color en español y portugués («mujer morena»).
const ROMANCE_COLORED_PERSON = new RegExp(
  `\\b(?:hombre|mujer|chic[oa]|nin[oa]|joven|senora?|ancian[oa]|persona|muchach[oa]|homem|mulher|menin[oa]|rapaz|garot[oa]|moc[oa]|senhora?|pessoa)\\s+(?:muy\\s+|muito\\s+)?${ROMANCE_SKIN_COLOR}\\b`,
)

// «es moreno», «era negra»: vale solo si la cláusula no habla de pelo.
const ROMANCE_COPULA_COLOR = new RegExp(
  `\\b(?:es|era|e)\\s+(?:muy\\s+|muito\\s+)?${ROMANCE_SKIN_COLOR}\\b`,
)

const HAIR_CONTEXT = /\b(pelo|cabello|melena|hair|cabelo|barba|beard)\b/

// Minúsculas y sin acentos, conservando el largo para mapear al original.
function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function clauseMentionsComplexion(normalizedClause: string): boolean {
  if (SKIN_WORD.test(normalizedClause)) return true
  if (ETHNICITY_WORD.test(normalizedClause)) return true
  if (ENGLISH_COLORED_PERSON.test(normalizedClause)) return true
  if (ROMANCE_COLORED_PERSON.test(normalizedClause)) return true

  return (
    ROMANCE_COPULA_COLOR.test(normalizedClause) &&
    !HAIR_CONTEXT.test(normalizedClause)
  )
}

// Sin comillas: la cláusula de texto-en-imagen dibujaría lo citado.
function cleanClause(clause: string): string {
  const cleaned = clause
    .replace(/["“”«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length <= MAX_CLAUSE_CHARS) return cleaned

  return cleaned
    .slice(0, MAX_CLAUSE_CHARS)
    .replace(/\s+\S*$/, '')
    .trim()
}

/**
 * La cláusula de la descripción canónica que fija la tez del personaje, tal
 * como la escribió el usuario. Cadena vacía si la descripción no habla de la
 * piel ni de la etnia.
 */
export function extractComplexionClause(description: string): string {
  const clauses = (description || '').split(CLAUSE_SEPARATOR)
  for (const clause of clauses) {
    if (!clause?.trim()) continue
    if (clauseMentionsComplexion(normalizeForMatch(clause)))
      return cleanClause(clause)
  }

  return ''
}

/**
 * ¿El cuerpo de un prompt (ya SIN los bloques fijos del estilo) menciona la
 * tez? Alcanza una palabra de piel, una etnia, un color pegado a una persona
 * o la cláusula canónica misma.
 */
export function promptMentionsComplexion(
  promptBody: string,
  clause: string,
): boolean {
  const normalizedBody = normalizeForMatch(promptBody || '')
  if (!normalizedBody) return false

  const normalizedClause = normalizeForMatch(clause || '').trim()
  if (normalizedClause && normalizedBody.includes(normalizedClause)) return true

  return (
    SKIN_WORD.test(normalizedBody) ||
    ETHNICITY_WORD.test(normalizedBody) ||
    ENGLISH_COLORED_PERSON.test(normalizedBody)
  )
}
