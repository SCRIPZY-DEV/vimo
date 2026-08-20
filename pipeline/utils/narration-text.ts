// Normalización de números a palabras ANTES del TTS (port de
// numeros_a_palabras.ts del origen). Los proveedores de voz reciben el texto
// tal cual: un "41" se pronuncia dígito por dígito ("cuatro uno") en vez de
// "cuarenta y uno". Este módulo reescribe los números a su forma hablada, en
// el idioma del texto, justo antes de mandárselo al proveedor.
//
// Decisiones (conservadoras, para NO romper el texto del usuario):
//  - Locale-aware: en español el separador decimal es la coma y el de miles
//    el punto; en inglés al revés ("1.000" es mil en ES y 1.0 en EN).
//  - Solo números "aislados": no adyacentes a letras (MP3, H2O, 3D), ni a
//    ordinales (1º, 2°), ni dentro de horas (3:30). Lo dudoso queda intacto.
//  - Decimales: parte entera como número + "coma"/"point" + dígitos sueltos.
//
// Diferencia con el origen: la detección de idioma ya no lee TTS_LANGUAGE del
// env (guard de ADR-0010) — el idioma forzado llega por parámetro.

export type NarrationLanguage = 'es' | 'en'

// ─── Español ───

// 0..29 tienen forma propia en español (veintiuno, veintidós, ...).
const SPANISH_0_TO_29 = [
  'cero',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veintiuno',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
]
const SPANISH_TENS = [
  '',
  '',
  'veinte',
  'treinta',
  'cuarenta',
  'cincuenta',
  'sesenta',
  'setenta',
  'ochenta',
  'noventa',
]
const SPANISH_HUNDREDS = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
]

function spanishUpTo99(value: number): string {
  if (value < 30) return SPANISH_0_TO_29[value]
  const tens = Math.floor(value / 10)
  const units = value % 10
  return units === 0
    ? SPANISH_TENS[tens]
    : `${SPANISH_TENS[tens]} y ${SPANISH_0_TO_29[units]}`
}

function spanishUpTo999(value: number): string {
  if (value === 0) return ''
  if (value === 100) return 'cien'
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  let words = ''
  if (hundreds > 0) words += SPANISH_HUNDREDS[hundreds]
  if (rest > 0) words += (words ? ' ' : '') + spanishUpTo99(rest)
  return words
}

// Apócope antes de "mil"/"millones": uno→un, veintiuno→veintiún, ...y uno→...y un.
function apocopate(words: string): string {
  if (words === 'uno') return 'un'
  if (words.endsWith('veintiuno'))
    return words.slice(0, -'veintiuno'.length) + 'veintiún'
  if (words.endsWith(' uno')) return words.slice(0, -' uno'.length) + ' un'
  return words
}

function spanishThousandsSection(value: number): string {
  // value ∈ [0, 999999]
  const thousands = Math.floor(value / 1000)
  const rest = value % 1000
  let words = ''
  if (thousands === 1) words = 'mil'
  else if (thousands > 1) words = apocopate(spanishUpTo999(thousands)) + ' mil'
  if (rest > 0) words += (words ? ' ' : '') + spanishUpTo999(rest)
  return words
}

function spanishInteger(value: number): string {
  if (value === 0) return 'cero'
  const millions = Math.floor(value / 1_000_000)
  const rest = value % 1_000_000
  let words = ''
  if (millions === 1) words = 'un millón'
  else if (millions > 1)
    words = apocopate(spanishThousandsSection(millions)) + ' millones'
  if (rest > 0) words += (words ? ' ' : '') + spanishThousandsSection(rest)
  return words
}

// ─── Inglés ───

const ENGLISH_0_TO_19 = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]
const ENGLISH_TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
]

function englishUpTo999(value: number): string {
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  let words = ''
  if (hundreds > 0) words += `${ENGLISH_0_TO_19[hundreds]} hundred`
  if (rest > 0) {
    if (words) words += ' '
    if (rest < 20) words += ENGLISH_0_TO_19[rest]
    else {
      const tens = Math.floor(rest / 10)
      const units = rest % 10
      words += ENGLISH_TENS[tens] + (units ? `-${ENGLISH_0_TO_19[units]}` : '')
    }
  }
  return words
}

const ENGLISH_SCALES: ReadonlyArray<readonly [number, string]> = [
  [1_000_000_000_000, 'trillion'],
  [1_000_000_000, 'billion'],
  [1_000_000, 'million'],
  [1_000, 'thousand'],
]

function englishInteger(value: number): string {
  if (value === 0) return 'zero'
  let words = ''
  let rest = value
  for (const [scale, scaleName] of ENGLISH_SCALES) {
    const quotient = Math.floor(rest / scale)
    if (quotient > 0) {
      words += (words ? ' ' : '') + englishInteger(quotient) + ' ' + scaleName
      rest %= scale
    }
  }
  if (rest > 0) words += (words ? ' ' : '') + englishUpTo999(rest)
  return words
}

// ─── Conversión sobre el texto ───

// Más allá perdemos precisión de entero seguro → no tocar.
const MAX_DIGITS = 15

function spelledDigits(fraction: string, language: NarrationLanguage): string {
  const table = language === 'es' ? SPANISH_0_TO_29 : ENGLISH_0_TO_19
  return fraction
    .split('')
    .map((digit) => table[Number(digit)] ?? digit)
    .join(' ')
}

// Apócope de "uno" ante un sustantivo: "41 años" → "cuarenta y UN años",
// "1 hora" → "UNA hora". Solo en español. No se apocopa ante conectores
// ("31 de diciembre") ni a fin de frase ("tengo 41").

// Palabras que NO son el sustantivo contado (preposiciones/conjunciones):
const SPANISH_NO_APOCOPE = new Set([
  'de',
  'del',
  'a',
  'al',
  'y',
  'e',
  'o',
  'u',
  'en',
  'que',
  'con',
  'por',
  'para',
  'como',
  'más',
  'menos',
  'sin',
  'sobre',
  'entre',
  'hasta',
  'desde',
  'según',
  'ni',
  'pero',
])

// Sustantivos masculinos terminados en -a/-as (excepciones al heurístico de
// género), para no decir "una día".
const SPANISH_MASCULINE_IN_A = new Set([
  'día',
  'días',
  'mapa',
  'mapas',
  'problema',
  'problemas',
  'sistema',
  'sistemas',
  'tema',
  'temas',
  'programa',
  'programas',
  'clima',
  'climas',
  'idioma',
  'idiomas',
  'planeta',
  'planetas',
  'drama',
  'dramas',
  'poema',
  'poemas',
  'dilema',
  'dilemas',
  'sofá',
  'sofás',
  'tranvía',
  'tranvías',
  'mediodía',
])

function isFeminineNoun(word: string): boolean {
  if (SPANISH_MASCULINE_IN_A.has(word)) return false
  return /as?$/.test(word)
}

// Apocopa un número en español que termina en "uno" cuando lo sigue el
// sustantivo contado; sin cambios si no aplica.
function apocopateBeforeNoun(words: string, nextWord?: string): string {
  const endsInUno =
    words === 'uno' || words.endsWith('veintiuno') || words.endsWith(' uno')
  if (!endsInUno || !nextWord) return words

  const next = nextWord.toLowerCase()
  if (SPANISH_NO_APOCOPE.has(next)) return words

  const feminine = isFeminineNoun(next)
  if (words === 'uno') return feminine ? 'una' : 'un'
  if (words.endsWith('veintiuno'))
    return (
      words.slice(0, -'veintiuno'.length) +
      (feminine ? 'veintiuna' : 'veintiún')
    )
  return words.slice(0, -' uno'.length) + (feminine ? ' una' : ' un')
}

/**
 * Reescribe los números del texto a palabras, según el idioma indicado.
 * No altera nada que no matchee el patrón conservador de "número aislado".
 */
export function convertNumbersToWords(
  text: string,
  language: NarrationLanguage,
): string {
  if (!text) return text
  const thousandsSeparator = language === 'es' ? '\\.' : ','
  const decimalSeparator = language === 'es' ? ',' : '\\.'
  // (?<![…]) no arrancar pegado a letra/dígito/separador/":" (mitad de
  // número/hora). Parte entera: grupos de miles o dígitos puros. Parte decimal
  // opcional. (?![…]) no terminar pegado a letra/dígito/ordinal/":". El grupo
  // 3 (lookahead, no consume) captura la palabra siguiente, para decidir la
  // apócope en español ("uno" → "un"/"una" ante un sustantivo).
  const pattern = new RegExp(
    `(?<![\\p{L}\\d:.,])(\\d{1,3}(?:${thousandsSeparator}\\d{3})+|\\d+)(?:${decimalSeparator}(\\d+))?(?![\\p{L}\\d:º°ª])(?=\\s+(\\p{L}+)|)`,
    'gu',
  )
  const thousandsPattern = new RegExp(thousandsSeparator, 'g')

  return text.replace(
    pattern,
    (
      match: string,
      integerPart: string,
      fractionPart?: string,
      nextWord?: string,
    ) => {
      const integerClean = integerPart.replace(thousandsPattern, '')
      if (integerClean.length > MAX_DIGITS) return match
      const integerValue = Number(integerClean)
      if (!Number.isFinite(integerValue)) return match

      let words =
        language === 'es'
          ? spanishInteger(integerValue)
          : englishInteger(integerValue)
      if (fractionPart) {
        const separator = language === 'es' ? ' coma ' : ' point '
        words += separator + spelledDigits(fractionPart, language)
      } else if (language === 'es') {
        words = apocopateBeforeNoun(words, nextWord)
      }
      return words
    },
  )
}

// ─── Detección de idioma ───

const SPANISH_STOP_WORDS =
  /\b(?:de|la|el|que|y|en|un|una|los|las|del|se|su|sus|por|con|para|como|más|pero|este|esta|al|lo|le|son|ya|muy|cuando|porque|nos|este)\b/gi
const ENGLISH_STOP_WORDS =
  /\b(?:the|of|and|to|in|is|that|for|it|with|as|was|on|are|you|this|be|at|or|have|from|they|but|not|by|an|we|he|she)\b/gi

/**
 * Detecta el idioma del texto para elegir la conversión. Conservador y sesgado
 * a español (el caso por defecto de Vimo): solo devuelve "en" cuando el inglés
 * gana claramente.
 */
export function detectNarrationLanguage(text: string): NarrationLanguage {
  const spanishHits = (text.match(SPANISH_STOP_WORDS) ?? []).length
  const englishHits = (text.match(ENGLISH_STOP_WORDS) ?? []).length
  return englishHits > spanishHits ? 'en' : 'es'
}

/**
 * Punto de entrada: detecta idioma (o usa el forzado) y normaliza números.
 * Devuelve `{ text, language }` para que el caller también sepa qué idioma
 * pasarle al proveedor de voz.
 */
export function prepareNarrationText(
  text: string,
  forcedLanguage?: NarrationLanguage,
): { text: string; language: NarrationLanguage } {
  const language = forcedLanguage ?? detectNarrationLanguage(text)
  return { text: convertNumbersToWords(text, language), language }
}
