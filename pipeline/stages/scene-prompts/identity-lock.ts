import { FINAL_PROMPT_BODY_BUDGET } from '../shared/prompt-safety.ts'
import { REFERENCE_PERSON_ANCHOR } from '../../prompts/character-reference.ts'
import { characterIndicesInRequest } from '../../prompts/scene-prompt-blocks.ts'
import type { VisualStyle } from '../../prompts/visual-styles.ts'
import type { Scene } from '../../types/scenes.ts'
import {
  extractComplexionClause,
  promptMentionsComplexion,
} from '../../utils/character-complexion.ts'
import type { PromptCharacter } from './fallback-prompt.ts'

// Candado de TEZ del Catálogo. El redactor reescribe la identidad del
// personaje en cada escena y a veces suelta el tono de piel; el generador
// rellena entonces con una persona de piel clara (un personaje moreno salía
// blanco en algunas escenas del estilo realista). Tres capas: el bloque duro
// lo PIDE, `missingComplexion` lo VALIDA (reintento con corrección) y
// `lockCharacterComplexion` lo REPARA por código si aun así falta.
//
// No aplica a stickman (su bloque prohíbe redactar la piel: dibujaría un
// humano junto al muñeco) ni a Mi estilo (carril verbatim, identidad tejida
// por `[subject]`).
const STYLES_WITHOUT_LOCK = new Set(['pov_stickman', 'custom'])

// Frontera de la primera frase: puntuación tras una palabra de 3+ letras
// (no corta en «Mr.») seguida de mayúscula.
const FIRST_SENTENCE_END = /[a-z]{3,}[.!?](?=\s+[A-Z])/

// Alguna persona en el encuadre: si una reescritura convirtió la escena en
// paisaje u objeto, el candado no debe meter a nadie.
const PERSON_WORD =
  /\b(man|woman|boy|girl|person|guy|lady|child|kid|teen(?:ager)?|he|she|his|her|him|figure|protagonist|character)\b/i

// Frases defensivas que NIEGAN gente («no other people anywhere in the frame»):
// se quitan antes de buscar personas, o toda escena vacía daría positivo.
const NEGATED_PEOPLE =
  /\b(?:no|without|free of|empty of)\s+(?:other\s+|any\s+)?(?:people|persons?|characters?|figures?|bystanders|crowds?|silhouettes?|humans?|pedestrians)\b/gi

// Alguien dibujado en el encuadre. Más ancho que PERSON_WORD: en una escena
// SIN personaje cualquier persona es un desvío del bloque: también la gente,
// los oficios («repairman») y la «lone figure seen from behind», que el
// generador resuelve como un desconocido de espaldas.
const DEPICTED_PERSON =
  /\b(\w*(?:man|men|woman|women)|boy|girl|person|people|guy|lady|child|children|kid|teen(?:ager)?|worker|he|she|his|her|him|himself|herself|someone|somebody|figures?|silhouettes?|crowd|passers?-?by|pedestrians?|protagonist)\b/i

// Un cuerpo sin sustantivo de persona: el redactor nombra al protagonista de la
// NARRACIÓN («Mateo's face… Mateo is wearing»), que no tiene por qué llamarse
// como el personaje del proyecto.
const DEPICTED_BODY =
  /\b(faces?|facial|hair|beard|eyes|hands?|arms?|smil(?:e|es|ing)|gaze|expression|wearing|wears|dressed)\b/i

export interface MissingComplexion {
  name: string
  clause: string
}

export interface ComplexionLockOptions {
  // true fuera del redactor (reescritura por content policy, chokepoint de
  // imágenes): solo se candadea un prompt que de verdad muestra a alguien.
  requirePersonMention?: boolean
}

interface PromptBodyRange {
  start: number
  end: number
}

// El cuerpo narrativo del prompt, sin los bloques fijos del estilo: el STYLE
// de `cartoon` trae la palabra «skin» y daría por presente una tez ausente.
function promptBodyRange(prompt: string, style: VisualStyle): PromptBodyRange {
  const prologue = style.template?.prologue?.trim() ?? ''
  const suffix = style.template?.styleSuffix?.trim() ?? ''

  let start = 0
  if (prologue && prompt.trimStart().startsWith(prologue))
    start = prompt.indexOf(prologue) + prologue.length

  const label = /^\s*scene\s*:\s*/i.exec(prompt.slice(start))
  if (label) start += label[0].length

  const suffixIndex = suffix ? prompt.lastIndexOf(suffix) : -1
  const end = suffixIndex >= start ? suffixIndex : prompt.length

  return { start, end }
}

// Inserta una frase TRAS LA PRIMERA FRASE del cuerpo, nunca en la cola: ahí
// recortan las cláusulas finales, y después del ancla de realismo rompería su
// cierre. Sin frontera de frase, va justo antes del bloque STYLE.
function insertAfterFirstSentence(
  prompt: string,
  style: VisualStyle,
  sentence: string,
): string {
  const { start, end } = promptBodyRange(prompt, style)
  const sentenceEnd = FIRST_SENTENCE_END.exec(prompt.slice(start, end))
  const firstEnd = sentenceEnd
    ? start + sentenceEnd.index + sentenceEnd[0].length
    : end
  // Una primera oración gigante dejaba el candado fuera del presupuesto:
  // el scrub lo borraba y la fase de imágenes volvía a añadirlo tras revisar.
  if (firstEnd + sentence.length + 1 > FINAL_PROMPT_BODY_BUDGET)
    return `${prompt.slice(0, start)} ${sentence} ${prompt.slice(start)}`.trim()
  if (!sentenceEnd) {
    const head = prompt.slice(0, end).trimEnd()
    const tail = prompt.slice(end)
    const separator = head && !/[.!?]$/.test(head) ? '.' : ''
    return `${head}${separator} ${sentence}${tail ? ` ${tail}` : ''}`.trim()
  }

  const insertAt = start + sentenceEnd.index + sentenceEnd[0].length
  return `${prompt.slice(0, insertAt)} ${sentence}${prompt.slice(insertAt)}`
}

// Cierre defensivo de una escena SIN personaje: aunque el prompt no describa a
// nadie, el generador puebla cocinas, talleres y calles con gente de fondo —
// que el espectador lee como el protagonista cambiado.
const NO_PEOPLE_SEAL =
  'No people anywhere in the frame — not in the background, in reflections or out of focus.'

/** Sella una escena sin personaje contra gente inventada por el generador. */
export function sealSceneWithoutPeople(
  prompt: string,
  style: VisualStyle,
): string {
  if (STYLES_WITHOUT_LOCK.has(style.id)) return prompt
  if (prompt.includes(NO_PEOPLE_SEAL)) return prompt

  return insertAfterFirstSentence(prompt, style, NO_PEOPLE_SEAL)
}

/**
 * ¿El prompt de una escena SIN personaje dibuja igual a una persona? Con
 * frecuencia parcial esas escenas se ilustran sin nadie, pero cuando la
 * narración habla del protagonista el redactor lo escribe igual — como un
 * desconocido genérico, sin identidad ni referencia: el personaje «perdido».
 */
export function promptDepictsPerson(
  prompt: string,
  style: VisualStyle,
  characters: PromptCharacter[],
): boolean {
  if (STYLES_WITHOUT_LOCK.has(style.id)) return false

  const { start, end } = promptBodyRange(prompt || '', style)
  const body = (prompt || '').slice(start, end).replace(NEGATED_PEOPLE, ' ')
  if (DEPICTED_PERSON.test(body) || DEPICTED_BODY.test(body)) return true

  const loweredBody = body.toLowerCase()
  return characters.some((character) => {
    const name = character.name?.trim().toLowerCase()
    return !!name && loweredBody.includes(name)
  })
}

// Rótulo que el bloque SIN personaje exige para la gente que la narración sí
// describe: distingue a «an anonymous fisherman» (pedido por el guion) de «a
// young man» (el protagonista colado sin identidad).
const ANONYMOUS_LABEL = /\banonymous\b/i
// El rótulo vale para el sustantivo que tiene CERCA («a crowd of anonymous
// people»): un «anonymous» en otra frase no blanquea a «a lone figure».
const ANONYMOUS_LABEL_REACH = 40

// Sustantivos de persona (sin pronombres: esos siguen a su sustantivo).
const PERSON_NOUN =
  /\b(\w*(?:man|men|woman|women)|boy|girl|person|people|guy|lady|child|children|kid|teen(?:ager)?|worker|someone|somebody|figures?|silhouettes?|crowd|passers?-?by|pedestrians?|protagonist)\b/gi

function everyPersonIsLabelled(body: string): boolean {
  for (const match of body.matchAll(PERSON_NOUN)) {
    const from = Math.max(0, match.index - ANONYMOUS_LABEL_REACH)
    const to = match.index + match[0].length + ANONYMOUS_LABEL_REACH
    if (!ANONYMOUS_LABEL.test(body.slice(from, to))) return false
  }

  return true
}

/**
 * ¿La escena SIN personaje trae a alguien que hace de protagonista? Sí cuando
 * nombra al personaje, o cuando dibuja a una persona sin rotularla «anonymous».
 * La gente que la narración describe, rotulada, es legítima.
 */
export function promptDepictsStandIn(
  prompt: string,
  style: VisualStyle,
  characters: PromptCharacter[],
): boolean {
  if (STYLES_WITHOUT_LOCK.has(style.id)) return false

  const { start, end } = promptBodyRange(prompt || '', style)
  const loweredBody = (prompt || '').slice(start, end).toLowerCase()
  const namesCharacter = characters.some((character) => {
    const name = character.name?.trim().toLowerCase()
    return !!name && loweredBody.includes(name)
  })
  if (namesCharacter) return true
  if (!promptDepictsPerson(prompt, style, characters)) return false

  // Cuerpo o ropa sin ningún sustantivo de persona («Mateo's face… is wearing»):
  // no hay a quién rotular, es el protagonista de la narración.
  const body = loweredBody.replace(NEGATED_PEOPLE, ' ')
  if (!DEPICTED_PERSON.test(body)) return true

  return !everyPersonIsLabelled(body)
}

// Tope de la identidad que el candado de presencia copia al prompt.
const MAX_LOCKED_IDENTITY_CHARS = 400
// Largo mínimo para dar por buena una cita textual de la descripción canónica.
const MIN_DESCRIPTION_ECHO_CHARS = 12

// ¿El cuerpo del prompt trae a este personaje? Por nombre o, si el redactor lo
// tradujo («el mensajero» → «the messenger»), por el arranque textual de su
// descripción canónica.
function bodyFeaturesCharacter(
  loweredBody: string,
  character: PromptCharacter,
): boolean {
  const name = character.name.trim().toLowerCase()
  if (name && loweredBody.includes(name)) return true

  const echo = (character.description || '')
    .split(/[,;.]/)[0]
    .trim()
    .toLowerCase()
  return echo.length >= MIN_DESCRIPTION_ECHO_CHARS && loweredBody.includes(echo)
}

/**
 * Personajes MARCADOS en la escena que el prompt emitido no trae. Con
 * frecuencia «always» toda escena está marcada: esta es la validación de que el
 * personaje de verdad sale en todas, no solo de que quedó asignado.
 */
export function missingCharacterMention(
  prompt: string,
  characters: PromptCharacter[],
  present: number[],
  style: VisualStyle,
): number[] {
  if (STYLES_WITHOUT_LOCK.has(style.id)) return []

  const { start, end } = promptBodyRange(prompt || '', style)
  const loweredBody = (prompt || '').slice(start, end).toLowerCase()
  return present.filter((index) => {
    const character = characters[index]
    if (!character?.name?.trim()) return false
    return !bodyFeaturesCharacter(loweredBody, character)
  })
}

/**
 * Mete en el prompt a los personajes marcados que el redactor dejó afuera, con
 * su identidad canónica (o el ancla de la foto si no tiene descripción).
 * Idempotente. Va tras la primera frase, como el candado de tez.
 */
export function lockCharacterPresence(
  prompt: string,
  characters: PromptCharacter[],
  present: number[],
  style: VisualStyle,
): string {
  const missing = missingCharacterMention(prompt, characters, present, style)
  if (missing.length === 0) return prompt

  const sentence = missing
    .map((index) => {
      const name = characters[index].name.trim()
      const identity = (characters[index].description || '')
        .replace(/["“”«»]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_LOCKED_IDENTITY_CHARS)
      const subject = identity
        ? `${name}, ${identity}`
        : `${name} (${REFERENCE_PERSON_ANCHOR})`
      return `The main subject of this shot is ${subject} — clearly visible and the focus of the frame.`
    })
    .join(' ')

  return insertAfterFirstSentence(prompt, style, sentence)
}

/** Personajes de la escena: los marcados o, si no hay, los que nombra el pedido manual. */
export function effectivePresence(
  scene: Scene,
  characters: PromptCharacter[],
): number[] {
  const present = scene.charactersPresent ?? []
  if (present.length > 0) return present

  const request = scene.userPrompt?.trim() ?? ''
  if (!request) return []

  return characterIndicesInRequest(request, characters)
}

/** Personajes presentes cuya tez canónica no aparece en el prompt emitido. */
export function missingComplexion(
  prompt: string,
  characters: PromptCharacter[],
  present: number[],
  style: VisualStyle,
): MissingComplexion[] {
  if (STYLES_WITHOUT_LOCK.has(style.id)) return []

  const { start, end } = promptBodyRange(prompt || '', style)
  const body = (prompt || '').slice(start, end)
  const missing: MissingComplexion[] = []
  for (const index of present) {
    const character = characters[index]
    const name = character?.name?.trim()
    if (!name) continue

    const clause = extractComplexionClause(character.description)
    if (!clause) continue
    if (promptMentionsComplexion(body, clause)) continue

    missing.push({ name, clause })
  }

  return missing
}

/**
 * Inserta la tez canónica de los personajes presentes que el prompt soltó.
 * Idempotente: con la tez ya escrita (o tras una pasada previa) no toca nada.
 * La frase va TRAS LA PRIMERA FRASE del cuerpo, nunca en la cola: ahí recortan
 * las cláusulas finales, y después del ancla de realismo rompería su cierre.
 */
export function lockCharacterComplexion(
  prompt: string,
  characters: PromptCharacter[],
  present: number[],
  style: VisualStyle,
  options: ComplexionLockOptions = {},
): string {
  const missing = missingComplexion(prompt, characters, present, style)
  if (missing.length === 0) return prompt

  const { start, end } = promptBodyRange(prompt, style)
  const body = prompt.slice(start, end)
  const loweredBody = body.toLowerCase()
  const mentionsSomeone =
    PERSON_WORD.test(body) ||
    missing.some((entry) => loweredBody.includes(entry.name.toLowerCase()))
  if (options.requirePersonMention && !mentionsSomeone) return prompt

  const lock = missing
    .map((entry) => {
      // El realista redacta con descriptores genéricos: si el prompt no
      // nombra al personaje, el nombre no le diría nada al generador.
      const isNamed = loweredBody.includes(entry.name.toLowerCase())
      const subject =
        isNamed || missing.length > 1 ? entry.name : 'the main character'
      return `Identity lock — ${subject}: ${entry.clause}; render this exact skin tone in every shot, never lighter or darker, whatever the scene lighting.`
    })
    .join(' ')

  return insertAfterFirstSentence(prompt, style, lock)
}
