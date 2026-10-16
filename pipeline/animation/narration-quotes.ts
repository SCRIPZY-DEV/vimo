import type { AnimationNarrationCue } from './narration.ts'

// Grok Imagine 1.5 (Kie) dibuja como subtítulos las frases que el prompt de
// video cita entre comillas, aunque el mismo prompt prohíba el texto (fix del
// 2026-10-15: 13 de 790 clips de la demo v4, casi todos en 9:16). El redactor
// citaba la narración como pista de tiempo: «At cue 'hasta lo alto' (2.3s), …».
// Este módulo es la garantía determinística para todo texto que un modelo
// escribe para un generador de video: saca cada cita que reproduce la
// narración y convierte la referencia a una marca de la voz en una referencia
// solo al tiempo («At 2.3s, …»). Si el tiempo no está escrito, sale de las
// marcas de la escena; si no hay tiempo, la referencia se va entera.
//
// Qué es narración: una cita cuyas palabras están TODAS en lo que leyó el
// redactor (guion, narración del clip y la vecina), sin importar mayúsculas,
// acentos ni puntuación; o una que el texto presenta como una marca de la voz
// («the cue 'X'», «'X' is spoken», «the narrator says 'X'»), aunque esté
// traducida o mal copiada. Lo demás queda tal cual: el rótulo de la imagen
// que no repite la narración, el nombre del estilo, los apóstrofos. Un texto
// sin citas de la narración vuelve idéntico, byte por byte.

export interface NarrationQuoteSource {
  // Lo narrado que leyó el modelo: una cita de cualquiera de estos textos es
  // narración.
  narration: readonly string[]
  // Las marcas de palabra en el reloj del clip generado, primero las de la
  // escena del texto: dan el tiempo de una cita que no lo trae escrito.
  cues?: readonly AnimationNarrationCue[]
}

interface QuotedSpan {
  // Índice de la comilla que abre y el siguiente a la que cierra.
  start: number
  end: number
  inner: string
}

// Lo que precede a una cita y la ata al reloj o la presenta como rótulo.
interface QuoteLead {
  start: number
  preposition?: string
  speaker: boolean
  noun?: string
  time?: string
}

// Lo que sigue a una cita: el nombre de la marca, el verbo del habla y el
// tiempo escrito, que se reemplazan junto con ella.
interface QuoteTail {
  end: number
  cueNoun: boolean
  spoken: boolean
  lettering: boolean
  time?: string
}

// Cómo queda una cita de la narración: el tramo del texto que se reemplaza y
// lo que va en su lugar (una referencia al tiempo o nada).
interface QuoteRewrite {
  start: number
  end: number
  replacement: string
  timed: boolean
}

// Las comillas que abren una cita y las que pueden cerrarla: los modelos
// mezclan rectas y tipográficas. Las tipográficas van con `\u{…}` para que
// ningún editor las confunda con las rectas.
const DOUBLE_QUOTES = ['"', '\u{201C}', '\u{201D}', '\u{201E}']
const SINGLE_QUOTES = ["'", '\u{2018}', '\u{2019}', '\u{201A}']
const QUOTE_CLOSERS = new Map([
  ['"', DOUBLE_QUOTES],
  ['\u{201C}', DOUBLE_QUOTES],
  ['\u{201D}', DOUBLE_QUOTES],
  ['\u{201E}', DOUBLE_QUOTES],
  ["'", SINGLE_QUOTES],
  ['\u{2018}', SINGLE_QUOTES],
  ['\u{2019}', SINGLE_QUOTES],
  ['\u{201A}', SINGLE_QUOTES],
  ['\u{00AB}', ['\u{00BB}']],
  ['\u{2039}', ['\u{203A}']],
  ['\u{300C}', ['\u{300D}']],
  ['\u{300E}', ['\u{300F}']],
])
// Las rectas y las tipográficas también son apóstrofo o marca de pulgadas
// («the boy’s hands», «rock 'n' roll», «5"»): abren solo pegadas al principio
// de una palabra y cierran solo pegadas al final de una. Las angulares y las
// japonesas tienen dirección y admiten blancos adentro (« alto »).
const AMBIGUOUS_QUOTES = new Set([...DOUBLE_QUOTES, ...SINGLE_QUOTES])
// Una cita más larga o que cruza un salto de línea son dos comillas sueltas.
const MAX_QUOTE_LENGTH = 1000
const WORD_CHARACTER = /[\p{L}\p{N}]/u
const WHITESPACE = /\s/u
const LINE_BREAK = /[\n\r\u{2028}\u{2029}]/u
// Escrituras sin espacios entre palabras: la cita se busca como texto.
const UNSPACED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u
// La palabra de la cita que ubica su tiempo si la frase entera no está en
// las marcas: la primera de al menos este largo, para no caer en «la» o «y».
const CUE_ANCHOR_MIN_LENGTH = 4
// Lo que se mira hacia atrás para encontrar la preposición de una cita.
const LEAD_WINDOW = 120

// Las preposiciones que atan una cita al reloj, y cómo se escriben delante
// del tiempo. El redactor a veces escribe en el idioma del guion.
const TIME_PREPOSITIONS = new Map([
  ['at', 'at'],
  ['on', 'at'],
  ['upon', 'at'],
  ['when', 'at'],
  ['as', 'at'],
  ['while', 'at'],
  ['once', 'at'],
  ['right at', 'at'],
  ['right as', 'at'],
  ['just as', 'at'],
  ['exactly at', 'at'],
  ['by', 'by'],
  ['until', 'until'],
  ['till', 'until'],
  ['from', 'from'],
  ['since', 'from'],
  ['starting at', 'from'],
  ['starting from', 'from'],
  ['starting with', 'from'],
  ['beginning at', 'from'],
  ['beginning with', 'from'],
  ['after', 'after'],
  ['following', 'after'],
  ['through', 'through'],
  ['throughout', 'through'],
  ['during', 'through'],
  ['before', 'before'],
  ['between', 'between'],
  ['en', 'a los'],
  ['cuando', 'a los'],
  ['al decir', 'a los'],
  ['al decirse', 'a los'],
  ['al oír', 'a los'],
  ['al oírse', 'a los'],
  ['al escuchar', 'a los'],
  ['al escucharse', 'a los'],
  ['al pronunciarse', 'a los'],
  ['al sonar', 'a los'],
  ['al llegar a', 'a los'],
  ['al llegar', 'a los'],
  ['al nombrar', 'a los'],
  ['al nombrarse', 'a los'],
  ['al ritmo de', 'a los'],
  ['cuando se dice', 'a los'],
  ['cuando se oye', 'a los'],
  ['cuando suena', 'a los'],
  ['desde', 'desde los'],
  ['hasta', 'hasta los'],
  ['hacia', 'hacia los'],
  ['durante', 'durante los'],
  ['tras', 'tras los'],
  ['después de', 'después de los'],
  ['antes de', 'antes de los'],
  ['entre', 'entre los'],
])
// Las que también rodean un objeto («a calendar with 'X'»): atan al reloj
// solo con otra señal de la voz (una marca, el verbo del habla o un tiempo).
const WEAK_PREPOSITIONS = new Map([
  ['with', 'at'],
  ['to', 'to'],
  ['toward', 'toward'],
  ['towards', 'toward'],
  ['around', 'around'],
  ['near', 'around'],
  ['under', 'at'],
  ['over', 'at'],
  ['into', 'at'],
  ['con', 'a los'],
  ['sobre', 'a los'],
])
// Entre dos citas de la voz seguidas («between 'X' and 'Y'»).
const CONNECTORS = [
  'and then',
  'and',
  'then',
  'or',
  '&',
  'to',
  'y luego',
  'y',
  'e',
  'o',
]
// Los nombres de una marca de la voz: con ellos la cita es narración aunque
// no coincida con el texto (una traducción, una palabra mal copiada).
const CUE_NOUNS = ['cue', 'cues', 'beat', 'beats', 'pista', 'pistas']
// Los que también nombran un rótulo («the word 'EXIT'»): cuentan con una
// preposición de tiempo delante o el verbo del habla detrás.
const WORD_NOUNS = [
  'word',
  'words',
  'phrase',
  'phrases',
  'line',
  'lines',
  'moment',
  'syllable',
  'palabra',
  'palabras',
  'frase',
]
const ARTICLES = ['the', 'a', 'an', 'la', 'el', 'las', 'los']
const CUE_ADJECTIVES = [
  'spoken',
  'narrated',
  'audio',
  'voiced',
  'final',
  'first',
  'last',
  'next',
  'opening',
  'closing',
  'key',
  'same',
]
const SPEAKERS = [
  'narration',
  'narrator',
  'voiceover',
  'voice-over',
  'voice',
  'audio',
  'speaker',
  'narración',
  'narrador',
  'voz',
  'locutor',
]
const SPEAKER_VERBS = [
  'says',
  'said',
  'reaches',
  'reached',
  'hits',
  'mentions',
  'speaks',
  'arrives at',
  'gets to',
  'dice',
  'llega a',
  'menciona',
  'pronuncia',
]
// El verbo del habla detrás de la cita: también es una marca de la voz.
const SPEECH_VERBS = [
  'is spoken',
  'are spoken',
  'gets spoken',
  'is heard',
  'are heard',
  'is said',
  'are said',
  'is voiced',
  'are voiced',
  'is narrated',
  'are narrated',
  'is mentioned',
  'are mentioned',
  'is uttered',
  'is pronounced',
  'is read',
  'is reached',
  'lands',
  'land',
  'passes',
  'pass',
  'sound',
  'arrives',
  'arrive',
  'sounds',
  'plays',
  'begins',
  'starts',
  'ends',
  'hits',
  'kicks in',
  'comes in',
  'se dice',
  'se oye',
  'se escucha',
  'se pronuncia',
  'suena',
  'llega',
]
// Un rótulo de la imagen que repite la narración se va con su verbo.
const LETTERING_VERBS = [
  'reading',
  'reads',
  'labeled',
  'labelled',
  'lettered',
  'marked',
  'stamped',
  'titled',
  'captioned',
  'inscribed',
  'saying',
  'says',
  'showing',
  'shows',
  'bearing',
  'that reads',
  'that says',
  'which reads',
  'which says',
  'with the text',
  'with the word',
  'with the words',
  'with the label',
  'with the caption',
  'que dice',
  'que dicen',
  'que reza',
  'con el texto',
  'con la palabra',
  'con las palabras',
  'con la leyenda',
  'etiquetado',
  'etiquetada',
  'etiquetados',
  'etiquetadas',
  'rotulado',
  'rotulada',
  'marcado con',
  'marcada con',
]
// Un nombre de rótulo detrás de la cita («the 'Año 1' panel»): la cita es el
// texto del rótulo, no una marca de tiempo, y el nombre se queda.
const LETTERING_NOUNS = [
  'sign',
  'signs',
  'label',
  'labels',
  'tag',
  'tags',
  'board',
  'banner',
  'caption',
  'title',
  'note',
  'panel',
  'card',
  'plaque',
  'poster',
  'text',
  'lettering',
  'heading',
  'marker',
  'counter',
  'ribbon',
  'plank',
  'flag',
  'slip',
  'sticker',
  'placard',
  'billboard',
  'display',
  'screen',
  'readout',
  'overlay',
  'logo',
  'stamp',
  'numeral',
  'number',
  'digits',
]
// Un tiempo como lo escribe un modelo: «2.3s», «4.6–5.0 s», «5.1s to 6s».
const SECONDS_UNIT = String.raw`(?:\s*(?:s|secs?|seconds?|segundos?))?`
const TIME = String.raw`\d+(?:[.,]\d+)?${SECONDS_UNIT}(?:\s*(?:-|\u{2013}|\u{2014}|to)\s*\d+(?:[.,]\d+)?${SECONDS_UNIT})?(?![\p{L}\p{N}])`

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Las palabras en una alternancia, las largas primero para que «al llegar a»
// gane a «al llegar»; los espacios aceptan cualquier blanco.
function alternation(words: readonly string[]): string {
  return [...words]
    .sort((left, right) => right.length - left.length)
    .map((word) => escapeRegExp(word).replace(/ /g, String.raw`\s+`))
    .join('|')
}

const LEAD = new RegExp(
  String.raw`(?<![\p{L}\p{N}])` +
    String.raw`(?:(?<preposition>${alternation([...TIME_PREPOSITIONS.keys(), ...WEAK_PREPOSITIONS.keys()])})\s+)?` +
    String.raw`(?:(?<speaker>(?:(?:the|la|el)\s+)?(?:${alternation(SPEAKERS)})\s+(?:${alternation(SPEAKER_VERBS)}))\s+)?` +
    String.raw`(?:(?:${alternation(ARTICLES)})\s+)?` +
    String.raw`(?:(?:${alternation(CUE_ADJECTIVES)})\s+)?` +
    String.raw`(?:(?<time>${TIME})\s+)?` +
    String.raw`(?:(?<noun>${alternation([...CUE_NOUNS, ...WORD_NOUNS])})(?:\s+(?:of|for|on|de))?\s+)?$`,
  'iu',
)
const LETTERING_LEAD = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${alternation(LETTERING_VERBS)})(?:\s+exactly)?\s+$`,
  'iu',
)
const CONNECTOR = new RegExp(
  String.raw`^\s*(?<comma>,)?\s*(?:(?<word>${alternation(CONNECTORS)})\s+)?$`,
  'iu',
)
const TAIL_LETTERING_NOUN = new RegExp(
  String.raw`\s+(?:${alternation(LETTERING_NOUNS)})(?![\p{L}\p{N}])`,
  'iuy',
)
const TAIL_CUE_NOUN = new RegExp(
  String.raw`\s+(?:${alternation(CUE_NOUNS)})(?![\p{L}\p{N}])`,
  'iuy',
)
const TAIL_SPEECH = new RegExp(
  String.raw`\s+(?:${alternation(SPEECH_VERBS)})(?![\p{L}\p{N}])`,
  'iuy',
)
const TAIL_TIME = new RegExp(
  String.raw`\s*\(\s*(?:(?:at|from|around|a\s+los)\s+|[~\u{2248}]\s*)?(?<written>${TIME})\s*\)|\s+(?:at|around|near|from|a\s+los|en)\s+(?<following>${TIME})`,
  'iuy',
)

function normalizedText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

function words(text: string): string[] {
  const normalized = normalizedText(text)
  if (!normalized) return []
  return normalized.split(' ')
}

// Las palabras de la narración, y todo el texto junto para las escrituras
// sin espacios.
function narrationIndex(narration: readonly string[]) {
  const texts = narration.map(normalizedText).filter(Boolean)
  return {
    words: new Set(texts.flatMap((text) => text.split(' '))),
    text: texts.join('\n'),
  }
}

type NarrationIndex = ReturnType<typeof narrationIndex>

function isNarrationWord(word: string, index: NarrationIndex): boolean {
  if (UNSPACED_SCRIPT.test(word)) return index.text.includes(word)
  return index.words.has(word)
}

// Cada palabra de la cita está en la narración: también una cita con elipsis
// («'sabios...grecia'») o un rótulo armado con palabras de la voz, que el
// modelo de video dibuja igual.
function reproducesNarration(inner: string, index: NarrationIndex): boolean {
  const quoted = words(inner)
  if (quoted.length === 0) return false
  return quoted.every((word) => isNarrationWord(word, index))
}

function isOpening(text: string, position: number): boolean {
  const quote = text[position]
  if (!QUOTE_CLOSERS.has(quote) || position + 1 >= text.length) return false
  if (!AMBIGUOUS_QUOTES.has(quote)) return true
  if (WHITESPACE.test(text[position + 1])) return false

  return !WORD_CHARACTER.test(text[position - 1] ?? '')
}

function isClosing(text: string, position: number, opening: string): boolean {
  const quote = text[position]
  if (!QUOTE_CLOSERS.get(opening)?.includes(quote)) return false
  if (!AMBIGUOUS_QUOTES.has(quote)) return true
  if (WHITESPACE.test(text[position - 1])) return false

  return !WORD_CHARACTER.test(text[position + 1] ?? '')
}

// La primera cita que abre en `from` o después. Una comilla que ya cerró
// otra cita no abre una nueva: «"hi.", then "X"» no es la cita «, then ».
function nextQuotedSpan(
  text: string,
  from: number,
  closings: ReadonlySet<number>,
): QuotedSpan | undefined {
  for (let start = from; start < text.length; start++) {
    if (closings.has(start) || !isOpening(text, start)) continue

    const limit = Math.min(text.length, start + 2 + MAX_QUOTE_LENGTH)
    for (let end = start + 2; end < limit; end++) {
      if (LINE_BREAK.test(text[end])) break
      if (!isClosing(text, end, text[start])) continue

      return { start, end: end + 1, inner: text.slice(start + 1, end) }
    }
  }

  return undefined
}

// El tiempo en que la voz dice la cita: la frase entera sobre las marcas o,
// si no está entera, su primera palabra larga. Undefined si no aparece.
function cueTime(
  inner: string,
  cues: readonly AnimationNarrationCue[],
): number | undefined {
  const quoted = words(inner)
  if (quoted.length === 0) return undefined

  const unspaced = UNSPACED_SCRIPT.test(quoted.join(''))
  const separator = unspaced ? '' : ' '
  const target = quoted.join(separator)
  const cueWords = cues.map((cue) => words(cue.word).join(separator))
  for (let start = 0; start < cueWords.length; start++) {
    let joined = ''
    for (let end = start; end < cueWords.length; end++) {
      if (!cueWords[end]) continue

      joined = joined ? joined + separator + cueWords[end] : cueWords[end]
      if (joined === target) return cues[start].fromSeconds
      if (!target.startsWith(joined + separator)) break
    }
  }

  const anchor =
    quoted.find((word) => word.length >= CUE_ANCHOR_MIN_LENGTH) ?? quoted[0]
  const position = cueWords.findIndex((cueWord) =>
    cueWord.split(' ').includes(anchor),
  )
  if (position < 0) return undefined

  return cues[position].fromSeconds
}

// El tiempo de la cita escrito como lo lee el generador: «2.3 s».
function cueSeconds(
  inner: string,
  cues: readonly AnimationNarrationCue[],
): string | undefined {
  const seconds = cueTime(inner, cues)
  if (seconds === undefined) return undefined

  return `${Math.round(seconds * 100) / 100} s`
}

// El texto antes de una cita, desde lo último reemplazado. Lleva un carácter
// más por delante para que la frontera de palabra mire el texto real.
function textBefore(text: string, cursor: number, start: number) {
  const from = Math.max(cursor, start - LEAD_WINDOW)
  const offset = from > 0 ? from - 1 : 0
  return { before: text.slice(offset, start), offset, from }
}

function readLead(text: string, cursor: number, start: number): QuoteLead {
  const { before, offset, from } = textBefore(text, cursor, start)
  const match = LEAD.exec(before)
  const leadStart = offset + (match?.index ?? 0)
  if (!match?.groups || match[0] === '' || leadStart < from)
    return { start, speaker: false }

  return {
    start: leadStart,
    preposition: match.groups.preposition?.toLowerCase().replace(/\s+/g, ' '),
    speaker: match.groups.speaker !== undefined,
    noun: match.groups.noun?.toLowerCase(),
    time: match.groups.time,
  }
}

// Dónde empieza el verbo de un rótulo delante de la cita, si lo hay.
function letteringStart(
  text: string,
  cursor: number,
  start: number,
): number | undefined {
  const { before, offset, from } = textBefore(text, cursor, start)
  const match = LETTERING_LEAD.exec(before)
  if (!match || offset + match.index < from) return undefined

  return offset + match.index
}

function readTail(text: string, end: number): QuoteTail {
  const tail: QuoteTail = {
    end,
    cueNoun: false,
    spoken: false,
    lettering: false,
  }
  const take = (pattern: RegExp) => {
    pattern.lastIndex = tail.end
    const match = pattern.exec(text)
    if (match) tail.end = pattern.lastIndex
    return match
  }

  TAIL_LETTERING_NOUN.lastIndex = end
  if (TAIL_LETTERING_NOUN.test(text)) return { ...tail, lettering: true }

  tail.cueNoun = take(TAIL_CUE_NOUN) !== null
  tail.spoken = take(TAIL_SPEECH) !== null
  const time = take(TAIL_TIME)
  tail.time = time?.groups?.written ?? time?.groups?.following
  if (!tail.spoken) tail.spoken = take(TAIL_SPEECH) !== null

  return tail
}

// La cita se presenta como algo que dice la voz: una marca, el narrador, el
// verbo del habla, o «word» y «phrase» con una preposición delante.
function isVoiced(lead: QuoteLead, tail: QuoteTail): boolean {
  if (tail.cueNoun || tail.spoken || lead.speaker) return true
  if (lead.noun === undefined) return false
  if (CUE_NOUNS.includes(lead.noun)) return true

  return WORD_NOUNS.includes(lead.noun) && lead.preposition !== undefined
}

// El conector entre esta cita y la anterior de la voz, si el texto entre las
// dos no es más que eso («, », « and », « y »).
function connectorBetween(gap: string): string | undefined {
  const match = CONNECTOR.exec(gap)
  if (!match?.groups) return undefined

  const word = match.groups.word?.toLowerCase().replace(/\s+/g, ' ')
  const connector = word === '&' ? 'and' : word
  if (match.groups.comma && connector) return `, ${connector}`
  if (match.groups.comma) return ','
  if (connector) return ` ${connector}`

  return undefined
}

// El tramo empieza una oración y no con una minúscula: lo que quede en su
// lugar va en mayúscula.
function opensSentence(text: string, position: number): boolean {
  if (/\p{Ll}/u.test(text[position] ?? '')) return false

  const before = text.slice(0, position).trimEnd()
  return before === '' || /[.!?]$/.test(before)
}

// Después de la cita viene puntuación o el final: la cita era el objeto.
function closesPhrase(text: string, position: number): boolean {
  return /^\s*(?:[,.;:!?)]|$)/u.test(text.slice(position))
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Qué hacer con una cita; undefined si no es narración y se queda.
function rewriteQuote(
  text: string,
  span: QuotedSpan,
  cursor: number,
  previous: QuoteRewrite | undefined,
  cues: readonly AnimationNarrationCue[],
  index: NarrationIndex,
): QuoteRewrite | undefined {
  const tail = readTail(text, span.end)
  const narration = reproducesNarration(span.inner, index)
  const spokenTime = () => tail.time ?? cueSeconds(span.inner, cues)

  // La segunda de dos citas de la voz seguidas («between 'X' and 'Y'») va
  // con la primera: lleva su propio tiempo o se va con su conector.
  const connector =
    previous?.end === cursor
      ? connectorBetween(text.slice(cursor, span.start))
      : undefined
  if (connector !== undefined) {
    if (!narration && !tail.spoken && !tail.cueNoun) return undefined

    const time = previous?.timed ? spokenTime() : undefined
    if (time === undefined)
      return { start: cursor, end: tail.end, replacement: '', timed: false }

    return {
      start: cursor,
      end: tail.end,
      replacement: `${connector} ${time}`,
      timed: true,
    }
  }

  // El texto de un rótulo que repite la narración se va con su verbo
  // («reading 'X'»), o solo si el nombre del rótulo va detrás («the 'X' sign»).
  const lettering = letteringStart(text, cursor, span.start)
  if (lettering !== undefined || tail.lettering) {
    if (!narration) return undefined

    return {
      start: lettering ?? span.start,
      end: span.end,
      replacement: '',
      timed: false,
    }
  }

  const lead = readLead(text, cursor, span.start)
  const voiced = isVoiced(lead, tail)
  if (!narration && !voiced) return undefined

  // Sin nada que la ate al reloj, la cita es parte de la frase: se va sola,
  // o con la preposición débil que la presentaba si era su objeto («a
  // calendar with 'X'.»; en «with the 'X' map» queda «with the map»).
  const strong = TIME_PREPOSITIONS.has(lead.preposition ?? '')
  const weak = WEAK_PREPOSITIONS.has(lead.preposition ?? '')
  if (!strong && !voiced && tail.time === undefined)
    return {
      start: weak && closesPhrase(text, span.end) ? lead.start : span.start,
      end: span.end,
      replacement: '',
      timed: false,
    }

  // Una referencia a la voz queda solo con su tiempo, o se va entera.
  const time = lead.time ?? spokenTime()
  if (time === undefined)
    return { start: lead.start, end: tail.end, replacement: '', timed: false }

  const preposition =
    TIME_PREPOSITIONS.get(lead.preposition ?? '') ??
    WEAK_PREPOSITIONS.get(lead.preposition ?? '') ??
    'at'
  const reference = `${preposition} ${time}`
  return {
    start: lead.start,
    end: tail.end,
    replacement: opensSentence(text, lead.start)
      ? capitalized(reference)
      : reference,
    timed: true,
  }
}

// Una referencia que se va entera al principio de una oración deja la
// oración empezando con la palabra que seguía: va en mayúscula.
function withCapitalFollowing(
  text: string,
  rewrite: QuoteRewrite,
): QuoteRewrite {
  if (rewrite.replacement || !opensSentence(text, rewrite.start)) return rewrite

  const following = /^[\s,;:]*(\p{Ll})/u.exec(text.slice(rewrite.end))
  if (!following) return rewrite

  return {
    ...rewrite,
    end: rewrite.end + following[0].length,
    replacement: following[1].toUpperCase(),
  }
}

// Lo que dejan los cortes: paréntesis vacíos, blancos y puntuación de más.
function tidy(text: string): string {
  return text
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+(?=\n)/g, '')
    .replace(/[ \t]+([,.;:!?)\]])/g, '$1')
    .replace(/([([])[ \t]+/g, '$1')
    .replace(/([,;:])(?:[ \t]*[,;:])+/g, '$1')
    .replace(/[,;:]+(?=[.!?])/g, '')
    .replace(/^[\s,;:]+/, '')
    .replace(/[\s,;:]+$/, '')
}

function cleaningPass(
  text: string,
  cues: readonly AnimationNarrationCue[],
  index: NarrationIndex,
): string {
  const parts: string[] = []
  const closings = new Set<number>()
  let cursor = 0
  let previous: QuoteRewrite | undefined
  let span = nextQuotedSpan(text, 0, closings)
  while (span) {
    closings.add(span.end - 1)
    const found = rewriteQuote(text, span, cursor, previous, cues, index)
    // Una cita que se queda puede tener adentro otra que sí es narración.
    if (!found) {
      span = nextQuotedSpan(text, span.start + 1, closings)
      continue
    }

    const rewrite = withCapitalFollowing(text, found)
    parts.push(text.slice(cursor, rewrite.start), rewrite.replacement)
    cursor = rewrite.end
    // Si la mayúscula tomó la palabra siguiente, lo que sigue ya no es un
    // conector hacia otra cita.
    previous = rewrite === found ? found : undefined
    span = nextQuotedSpan(text, cursor, closings)
  }
  if (parts.length === 0) return text

  parts.push(text.slice(cursor))
  return tidy(parts.join(''))
}

// El texto sin las citas de la narración. Cada pasada que cambia algo saca
// al menos un par de comillas y no agrega ninguna, así que el bucle termina;
// la pasada siguiente encuentra lo que la anterior dejó enfrentado.
export function stripNarrationQuotes(
  text: string,
  source: NarrationQuoteSource,
): string {
  const index = narrationIndex(source.narration)
  const cues = source.cues ?? []
  let current = text
  for (;;) {
    const cleaned = cleaningPass(current, cues, index)
    if (cleaned === current) return current

    current = cleaned
  }
}
