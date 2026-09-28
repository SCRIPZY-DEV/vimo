// PARSEO de la respuesta del carril verbatim. Port de
// `motor-web/verbatim/parseo.ts` del origen — funciones PURAS sobre texto,
// testeables sin gastar un crédito.
//
// La gema fija el formato visual; la plataforma añade IDs ((n)) para unir
// cada prompt a su fragmento sin depender del orden. No se exige JSON. La
// lectura histórica sin IDs permanece solo para entradas sin contexto
// temporal y respuestas completas con conteo exacto.

/** Etiquetas con las que las réplicas envuelven su razonamiento. */
const REASONING_TAGS = 'think|thinking|reasoning'

/**
 * Saca la deliberación del modelo del contenido. Se limpian también las
 * etiquetas HUÉRFANAS (solo apertura o solo cierre), que es como llegan
 * cuando el stream corta a mitad del razonamiento.
 */
export function stripReasoning(raw: string): string {
  return removeReasoning(raw).trim()
}

/**
 * Lo mismo pero SIN recortar los extremos. Existe por
 * `countCompletedPrompts`: ahí el espacio del final NO es basura, es el dato
 * — la línea en blanco que separa un prompt del siguiente es lo único que
 * dice si el último está terminado o a medio escribir.
 */
function removeReasoning(raw: string): string {
  let text = raw.replace(
    new RegExp(`<(${REASONING_TAGS})>[\\s\\S]*?</\\1>`, 'gi'),
    ' ',
  )
  // Cierre huérfano: la apertura se perdió y la respuesta útil empieza después.
  const closing = new RegExp(`</(?:${REASONING_TAGS})>`, 'i').exec(text)
  if (closing) text = text.slice(closing.index + closing[0].length)
  // Apertura huérfana: de ahí para adelante es todo deliberación sin cerrar.
  text = text.replace(new RegExp(`<(?:${REASONING_TAGS})>[\\s\\S]*$`, 'i'), ' ')
  return text
}

/**
 * Se queda con el contenido del bloque de código (donde la gema pide los
 * prompts); lo de afuera es charla. Si el modelo no usó fence, se usa la
 * respuesta entera: preferimos parsear de más y que el conteo lo rechace,
 * antes que perder un lote bien generado.
 */
export function extractCodeBlock(text: string): string {
  const fenced = /```[a-z]*[ \t]*\r?\n?([\s\S]*?)```/i.exec(text)
  if (fenced?.[1]?.trim()) return fenced[1].trim()
  // Fence abierto y sin cerrar (respuesta cortada justo al final).
  if (text.trimStart().startsWith('```'))
    return text
      .trimStart()
      .replace(/^```[a-z]*[ \t]*\r?\n?/i, '')
      .trim()

  return text.trim()
}

/**
 * Líneas de conversación que la gema pide escribir FUERA del bloque, pero que
 * a veces quedan adentro. No son prompts: contadas como tales, el conteo
 * cerraría con una escena de menos.
 */
const CHATTER_LINES: readonly RegExp[] = [
  /^se\s+generaron\s+\[?\d+\]?\s+prompts/i,
  /^he\s+generado\s+hasta\s+el\s+fragmento/i,
  /^aqu[ií]\s+tienes\b/i,
  /^escribe\s+["'“]?contin[uú]a/i,
]

function isChatter(piece: string): boolean {
  return CHATTER_LINES.some((line) => line.test(piece))
}

function splitPieces(block: string, separator: RegExp): string[] {
  return block
    .split(separator)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0 && !isChatter(piece))
}

/**
 * Parte el bloque en prompts (separador: línea en blanco). `expected`
 * habilita un único rescate: si el modelo escribió los prompts en líneas
 * consecutivas y contando por líneas da EXACTAMENTE la cantidad pedida, se
 * usa esa lectura. Solo con coincidencia exacta: ante la duda vale más
 * rechazar el lote que inventar cortes.
 */
export function splitPrompts(block: string, expected?: number): string[] {
  const byParagraphs = splitPieces(block, /\r?\n[ \t]*\r?\n/)
  if (expected !== undefined && byParagraphs.length !== expected) {
    const byLines = splitPieces(block, /\r?\n/)
    if (byLines.length === expected) return byLines
  }
  return byParagraphs
}

/**
 * Cuántos prompts TERMINÓ de escribir el modelo en lo que va del stream: el
 * progreso real que ve el usuario. «Terminado» = tiene un separador DESPUÉS;
 * el último trozo no se cuenta nunca mientras no haya línea en blanco detrás
 * (contarlo haría que la barra llegue al final antes de tiempo). Cota
 * superior `expected`.
 */
export function countCompletedPrompts(
  partial: string,
  expected: number,
): number {
  const clean = removeReasoning(partial)

  // NO se usa `extractCodeBlock`: su trim() borra justo la señal — la línea
  // en blanco final, que distingue «terminado» de «a medio escribir».
  const opening = /```[a-z]*[ \t]*\r?\n?/i.exec(clean)
  let body = opening ? clean.slice(opening.index + opening[0].length) : clean

  // Bloque ya cerrado = el modelo terminó de escribir: el último también cuenta.
  let closed = false
  const closingIndex = body.indexOf('```')
  if (opening && closingIndex >= 0) {
    body = body.slice(0, closingIndex)
    closed = true
  }
  if (!body.trim()) return 0

  const pieces = splitPieces(body, /\r?\n[ \t]*\r?\n/)
  const endsWithSeparator = /\r?\n[ \t]*\r?\n[ \t]*$/.test(body)
  const completed =
    closed || endsWithSeparator ? pieces.length : pieces.length - 1
  return Math.max(0, Math.min(expected, completed))
}

/**
 * Lo ya delimitado de un stream interrumpido. Nunca adivina que una frase
 * final está completa: exige cierre de bloque, separador o el ID siguiente.
 * Quien cosecha este prefijo debe exigir IDs, porque un prefijo sin ellos no
 * permite saber qué fragmento omitió o reordenó el modelo.
 */
export function completedPromptPrefix(partial: string): string {
  const clean = removeReasoning(partial)
  const opening = /```[a-z]*[ \t]*\r?\n?/i.exec(clean)
  const body = opening ? clean.slice(opening.index + opening[0].length) : clean
  const closing = opening ? body.indexOf('```') : -1
  if (closing >= 0) return body.slice(0, closing).trim()

  // Un JSON completo ya define sus límites; un JSON cortado no se interpreta
  // como prosa ni se reconstruye inventando corchetes de cierre.
  if (/^[ \t\r\n]*[[{]/.test(body))
    return unwrapJsonPrompts(body) ? body.trim() : ''

  let end = 0
  for (const match of body.matchAll(
    /\r?\n[ \t]*\r?\n|\r?\n(?=[ \t]*\(\(\d{1,4}\)\))/g,
  ))
    end = match.index + match[0].length
  const prefix = body.slice(0, end).trim()
  const unfinished = readIdMarker(body.slice(end).trim())
  // Conserva el ID incompleto sin su texto: si duplica uno ya terminado,
  // ese ID también es ambiguo y no debe darse por aceptado.
  if (unfinished) return `${prefix}\n\n((${unfinished.n}))`.trim()
  return prefix
}

/*
 * RED DE DES-ENVOLTURA JSON (v1.29.0 del origen). Este lector espera TEXTO,
 * pero una gema del usuario puede pedir JSON a su manera y un modelo
 * obediente lo cumple — el envoltorio `{"prompts":[...]}` viajaba ENTERO como
 * prompt al generador sin que ninguna defensa de texto lo viera. La red
 * desenvuelve ANTES de trocear, y es estricta a propósito: si nada parsea
 * devuelve null y el camino de texto sigue intacto.
 */

/** Un prompt desenvuelto; `n` solo si el JSON traía el id del fragmento. */
export interface UnwrappedPrompt {
  n?: number
  text: string
}

function itemsFromJsonValue(value: unknown): UnwrappedPrompt[] | null {
  if (Array.isArray(value)) {
    const items: UnwrappedPrompt[] = []
    for (const entry of value) {
      const sub = itemsFromJsonValue(entry)
      // Un elemento JSON malformado no invalida los hermanos identificados.
      // Conserva un hueco anónimo: jamás se elimina para correr posiciones.
      items.push(...(sub ?? [{ text: '' }]))
    }
    return items
  }
  if (value === null || typeof value !== 'object') return null
  const record = value as { prompts?: unknown; prompt?: unknown; id?: unknown }
  if (Array.isArray(record.prompts)) return itemsFromJsonValue(record.prompts)
  const n =
    typeof record.id === 'number' && Number.isInteger(record.id)
      ? record.id
      : undefined
  if (typeof record.prompt === 'string') {
    const text = record.prompt.trim()
    return [n !== undefined ? { n, text } : { text }]
  }
  // El ID se conserva incluso con prompt vacío, nulo o de tipo incorrecto:
  // ese fragmento queda pendiente y los demás no se vuelven a comprar.
  if (n !== undefined) return [{ n, text: '' }]

  return null
}

function parseJson(text: string): UnwrappedPrompt[] | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    return itemsFromJsonValue(JSON.parse(trimmed))
  } catch {
    return null
  }
}

/**
 * Desenvuelve una respuesta JSON a la lista de prompts, o null si no es JSON.
 * Prueba el bloque ENTERO primero y, si no, párrafo por párrafo — pero solo
 * si TODOS los párrafos son JSON: una mezcla se deja al camino de texto, que
 * la va a rechazar por conteo o contaminación como corresponde.
 */
export function unwrapJsonPrompts(block: string): UnwrappedPrompt[] | null {
  const whole = parseJson(block)
  if (whole && whole.length > 0) return whole

  const paragraphs = block
    .split(/\r?\n[ \t]*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
  if (paragraphs.length === 0) return null
  const items: UnwrappedPrompt[] = []
  for (const paragraph of paragraphs) {
    const parsed = parseJson(paragraph)
    if (parsed === null) return null
    items.push(...parsed)
  }
  return items.length > 0 ? items : null
}

/** El «PROTOCOLO DE LÍMITE DE RESPUESTA» que muchas gemas traen escrito. */
export const LIMIT_PROTOCOL_REGEX =
  /he\s+generado\s+hasta\s+el\s+fragmento\s*\[?(\d+)\]?/i

/**
 * Huellas de que la réplica filtró su deliberación DENTRO de un prompt. Acá
 * el parseo es de TEXTO y no falla con basura, así que este chequeo es la
 * única defensa — estricto, y una sola coincidencia condena al lote entero.
 */
const REASONING_TRACES: readonly RegExp[] = [
  /\bfragmento\s+\d+/i,
  /\bde un total de\b/i,
  /\bel\s+usuario\s+(quiere|pide|necesita|dice)\b/i,
  /\b(debo|tengo que|necesito)\s+(escribir|generar|crear|devolver|ilustrar)\b/i,
  /\bse\s+generaron\s+\d+\s+prompts\b/i,
  /\bhe\s+generado\s+hasta\b/i,
  /\baqu[ií]\s+tienes\s+(los|el)\s+prompts?\b/i,
  new RegExp(`</?(?:${REASONING_TAGS})\\b`, 'i'),
]

/**
 * Palabras funcionales que aparecen en cualquier prompt en inglés y en
 * ninguna frase en español. Si no hay ni una, lo que llegó no es un prompt:
 * es el modelo hablando.
 */
const ENGLISH_FUNCTION_WORDS =
  /\b(of|the|with|and|on|in|at|from|into|wearing|shot|style)\b/i

/*
 * HUECOS DE LA PLANTILLA QUE EL MODELO NO RELLENÓ (E33 del origen): las gemas
 * escriben sus plantillas con ranuras entre corchetes (`[ROL]`, `[ESTILO
 * OBLIGATORIO]`, `[DESCRIPCIÓN FÍSICA: …]`) que el modelo tiene que
 * reemplazar por texto real. La regla mira lo que distingue a una etiqueta de
 * plantilla en los datos medidos: la ETIQUETA viene EN MAYÚSCULAS. Un
 * corchete de prosa en minúscula pasa («diagrams of [strange writing
 * systems]» es el modelo escribiendo); uno sin letras también se rechaza.
 * Rechazar es barato; aceptar es un video con el protagonista sin definir.
 */
const BRACKET_REGEX = /\[[^\]]{0,80}\]/g
const LEGITIMATE_TAG = /^\[subject\]$/i

/** Proporción de mayúsculas desde la cual una etiqueta se lee como ranura. */
const UPPERCASE_THRESHOLD = 0.6

function isTemplateSlot(bracket: string): boolean {
  const label = bracket.slice(1, -1).split(':')[0]
  const letters = label.match(/\p{L}/gu) ?? []
  if (letters.length === 0) return true
  const uppercase = letters.filter(
    (letter) =>
      letter === letter.toUpperCase() && letter !== letter.toLowerCase(),
  )
  return uppercase.length / letters.length >= UPPERCASE_THRESHOLD
}

function unfilledSlot(prompt: string): string | undefined {
  for (const match of prompt.matchAll(BRACKET_REGEX)) {
    if (LEGITIMATE_TAG.test(match[0])) continue
    if (isTemplateSlot(match[0])) return match[0]
  }
  return undefined
}

/**
 * DOBLE LECTURA de la respuesta (v1.8.0): si TODOS los trozos traen su
 * marcador `((n))` al frente, la correspondencia pasa a ser por ID y el orden
 * deja de importar. Todo-o-nada a propósito: una lectura mixta obligaría a
 * deducir posiciones confiando en el orden — justo lo que el id vino a
 * evitar.
 */
const ID_MARKER_REGEX = /^\(\((\d{1,4})\)\)[.:\s-]*/

/** Conserva también un ID cuyo texto quedó vacío: nunca se infiere por posición. */
export function readIdMarker(
  piece: string,
): { n: number; text: string } | undefined {
  const match = ID_MARKER_REGEX.exec(piece)
  if (!match) return undefined
  return { n: Number(match[1]), text: piece.slice(match[0].length).trim() }
}

export function readIdMarkers(
  pieces: readonly string[],
): { n: number; text: string }[] | null {
  if (pieces.length === 0) return null
  const withId: { n: number; text: string }[] = []
  for (const piece of pieces) {
    const identified = readIdMarker(piece)
    if (!identified?.text) return null
    withId.push(identified)
  }
  return withId
}

/**
 * Pela un marcador `((n))` que haya quedado al FRENTE de un texto (defensivo:
 * un modelo que numeró «a medias» no puede mandar el marcador al generador
 * como ruido).
 */
export function stripIdMarker(text: string): string {
  return text.replace(ID_MARKER_REGEX, '').trim()
}

/**
 * CONTAMINACIÓN: deliberación filtrada o idioma equivocado. El lector decide
 * su alcance: con ID único se rechaza solo esa escena; sin IDs no se puede
 * confiar en la separación ni en el orden del lote.
 */
export function responseContamination(prompt: string): string | undefined {
  if (REASONING_TRACES.some((trace) => trace.test(prompt)))
    return 'the model leaked its reasoning inside the prompt'
  if (!ENGLISH_FUNCTION_WORDS.test(prompt))
    return 'the prompt did not come in English'

  return undefined
}

/**
 * Defecto LOCAL de UNA escena (E35/E33): el conteo dio exacto y la
 * separación es sana, así que las demás escenas del lote se COSECHAN y solo
 * esta se re-pide. «character model/sheet» no aparece en ninguna escena
 * legítima medida; «clay model of the city» pasa porque el veneno exige la
 * palabra «character».
 */
const SHEET_IN_SCENE_REGEX =
  /\bcharacter\s+(?:model|sheet|design|reference|turnaround)\b/i

export function localSceneDefect(prompt: string): string | undefined {
  const slot = unfilledSlot(prompt)
  if (slot) return `unfilled template slot: ${slot.slice(0, 40)}`
  const sheet = SHEET_IN_SCENE_REGEX.exec(prompt)
  if (sheet) return `character sheet inside the scene ("${sheet[0]}")`
  return undefined
}

/*
 * REPARACIÓN EN EL ACTO de la ficha pegada (E35, v1.8.1/v1.12.0 del origen).
 * Detectar y re-pedir NO alcanza: en racha, el re-pedido vuelve con la MISMA
 * ficha (un video real quemó las 3 rondas enteras). La ficha viaja pegada
 * dentro de una escena por lo demás sana, así que la escena se salva
 * QUITANDO la ficha (y sus frases de continuación) y cosiendo lo de antes
 * con lo de después — truncar se llevaba puesta la cola de estilo del final
 * (medido: 15/15 escenas sin estilo). Conservador: si la ficha ES el trozo
 * entero, o lo que queda no alcanza para una escena, se re-pide como
 * siempre; el llamador re-valida el resultado (un hueco E33 no se cura
 * cortando).
 */
const MINIMUM_SCENE_WORDS = 8

/**
 * Frases que son CONTINUACIÓN de una ficha, no escena. Son los arranques
 * MEDIDOS en las fichas reales; una frase de escena no empieza así (empieza
 * con el encuadre o con el sujeto haciendo algo).
 */
const SHEET_CONTINUATION_REGEX =
  /^(?:made of|wearing|exaggerated|slightly exaggerated|hair is|the hair|full body|body is|face is|skin is|dressed in|its? (?:hair|face|body|skin))\b/i

/** Fin (índice exclusivo) de la oración que contiene `from`. */
function sentenceEnd(text: string, from: number): number {
  const closer = /[.!?]["')\]]*(?=\s|$)/g
  closer.lastIndex = from
  const match = closer.exec(text)
  return match ? match.index + match[0].length : text.length
}

/** Arranque de la oración (o línea) que contiene `until`. */
function sentenceStart(text: string, until: number): number {
  const before = text.slice(0, until)
  let start = before.lastIndexOf('\n')
  const closer = /[.!?]["')\]]*(?=\s)/g
  for (
    let match = closer.exec(before);
    match !== null;
    match = closer.exec(before)
  ) {
    const candidate = match.index + match[0].length
    if (candidate > start) start = candidate
  }
  return start
}

export function trimEmbeddedCharacterSheet(prompt: string): string | undefined {
  const poison = SHEET_IN_SCENE_REGEX.exec(prompt)
  if (!poison) return undefined

  // El arranque de la ficha es el de SU frase: «character model» aparece a
  // mitad («Full body stop motion claymation character model of…»), así que
  // cortar en el match dejaría el arranque colgando.
  const start = sentenceStart(prompt, poison.index)
  if (start <= 0) return undefined // el trozo ES la ficha: no hay escena que salvar

  const before = prompt.slice(0, start).trim()
  if ((before.match(/\S+/g)?.length ?? 0) < MINIMUM_SCENE_WORDS)
    return undefined

  // Primero QUITAR (la ficha y sus continuaciones), no truncar.
  let end = sentenceEnd(prompt, poison.index)
  for (;;) {
    const rest = prompt.slice(end).trim()
    if (!SHEET_CONTINUATION_REGEX.test(rest)) break
    const next = sentenceEnd(prompt, end + 1)
    if (next <= end) break
    end = next
  }

  const tail = prompt.slice(end).trim()
  if (tail) {
    const stitched = `${before} ${tail}`.replace(/\s+/g, ' ').trim()
    // El que llama re-valida igual; acá se chequea para decidir entre coser y
    // truncar, no para confiar.
    if (localSceneDefect(stitched) === undefined) return stitched
  }

  return before
}

/**
 * Validación TODO-EN-UNO para el prompt del personaje (Fase 1): ahí no hay
 * lote que salvar — cualquier defecto se trata igual (reintento de la fase).
 * Las escenas NO pasan por acá: usan `responseContamination` (condena al
 * lote) + `localSceneDefect` (repara solo esa escena).
 */
export function validateCharacterPrompt(prompt: string, label: string): void {
  const contamination = responseContamination(prompt)
  if (contamination)
    throw new Error(`in the ${label}: ${contamination}; discarded, retrying`)

  const slot = unfilledSlot(prompt)
  if (slot)
    throw new Error(
      `the model left an unfilled template slot in the ${label} (${slot.slice(0, 40)}); discarded, retrying`,
    )
}

/*
 * EL PROMPT QUE SE QUEDÓ SIN LA COLA DE ESTILO (v1.14.0 del origen): la gema
 * ordena «concatena esto al final de CADA prompt», y sin esa frase el
 * generador devuelve una imagen cualquiera — un video con 4 escenas en
 * plastilina y 11 en foto (caso real). CÓMO SE DETECTA SIN SABER QUÉ DICE EL
 * ESTILO: la cola es un texto FIJO que la gema obliga a repetir, así que
 * dentro de un lote todos los prompts terminan igual — se agrupa por los
 * últimos caracteres y la mayoría define la cola esperada. QUÉ SE HACE: se le
 * pega la cola EXACTA que traen los demás (la misma frase literal, no un
 * invento), y se registra qué se agregó.
 */

/** Cuántos caracteres del final se comparan. */
const TAIL_LENGTH = 60
/** Proporción del lote que tiene que compartirla para contar como «la cola». */
const TAIL_MAJORITY = 0.6
/** Con menos prompts no hay mayoría que valga: 2 contra 1 es demasiado poco. */
const MINIMUM_PROMPTS_FOR_TAIL = 4

/**
 * La cola que comparte la mayoría del lote, o `undefined` si no hay tal
 * mayoría (ahí no se puede saber cuál es la correcta y no se toca nada).
 */
export function sharedStyleTail(
  prompts: readonly string[],
): string | undefined {
  const longEnough = prompts.filter((prompt) => prompt.length >= TAIL_LENGTH)
  if (longEnough.length < MINIMUM_PROMPTS_FOR_TAIL) return undefined

  const counts = new Map<string, number>()
  for (const prompt of longEnough) {
    const tail = prompt.slice(-TAIL_LENGTH)
    counts.set(tail, (counts.get(tail) ?? 0) + 1)
  }
  let best: string | undefined
  let bestCount = 0
  for (const [tail, count] of counts) {
    if (count > bestCount) {
      best = tail
      bestCount = count
    }
  }
  if (
    best === undefined ||
    bestCount < Math.ceil(prompts.length * TAIL_MAJORITY)
  )
    return undefined

  // La cola de verdad es más larga que la ventana: se estira hacia atrás
  // mientras TODOS los que la comparten sigan coincidiendo.
  const sharing = longEnough.filter((prompt) => prompt.endsWith(best!))
  let length = TAIL_LENGTH
  while (length < sharing[0]!.length) {
    const candidate = sharing[0]!.slice(-(length + 1))
    if (!sharing.every((prompt) => prompt.endsWith(candidate))) break
    length++
  }
  // Se corta en el arranque de la oración: pegar media frase sería peor que nada.
  const raw = sharing[0]!.slice(-length)
  const sentenceOpening = raw.search(/[A-Z]/)
  return sentenceOpening > 0 ? raw.slice(sentenceOpening) : raw
}

/**
 * Le devuelve la cola de estilo a los prompts que la perdieron. Devuelve qué
 * se le agregó a cada uno, para el log (regla de auditoría: nada se toca en
 * silencio).
 */
export function restoreStyleTail(
  good: { n: number; prompt: string }[],
): { n: number; added: string }[] {
  const tail = sharedStyleTail(good.map((entry) => entry.prompt))
  if (tail === undefined) return []

  const restored: { n: number; added: string }[] = []
  for (const entry of good) {
    if (entry.prompt.endsWith(tail)) continue
    // Si la trae en el medio, no falta: el generador la lee igual. Solo se
    // repara la AUSENCIA.
    if (entry.prompt.includes(tail)) continue
    entry.prompt = `${entry.prompt.trimEnd()} ${tail}`
    restored.push({ n: entry.n, added: tail })
  }
  return restored
}
