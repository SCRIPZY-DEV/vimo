import { createHash } from 'node:crypto'

import { extractJsonObject } from '../prompts/character-designer.ts'
import type { SceneLlm } from '../stages/shared/llm.ts'
import {
  AVATAR_MOTION_LOOP_SECONDS,
  AVATAR_MOTION_PROMPT_TARGET,
} from '../types/avatar.ts'

// El escritor del movimiento del avatar (entrega 2e, diseño §21.2). Con Avatar
// V y IV el proveedor acepta un `motion_prompt`: texto libre que mueve la cara,
// las manos y la postura de la aparición. Este módulo escribe uno por escena de
// avatar, natural y de presentador profesional, sin que la persona tenga que
// pedirlo: UN solo llamado al modelo de texto de movimiento para todas las
// escenas que lo necesitan. Lo que el modelo no escribe bien —falta, pide
// cámara, lugar, objetos, o se pasa de largo— cae en una plantilla por posición
// (la que abre, una del medio, la que cierra y una larga), con o sin «más
// expresivo».
//
// Nunca frena el render: sin cliente (sin clave), con un modelo caído o con una
// respuesta rara, todas las escenas usan su plantilla. Lo único que se propaga
// es la cancelación del job. No toca disco ni red: el cliente llega inyectado
// (`createAnimationLlm`) y quien lo integra es `renderAvatarScenes`, que guarda
// el prompt y la huella del texto en la escena. Nunca escribe un prompt en un
// evento ni en el log.

// Dónde cae la aparición en el video: la primera abre, la última cierra y el
// resto va en el medio.
export type AvatarMotionPosition = 'opening' | 'middle' | 'closing'

export interface AvatarMotionRequest {
  sceneId: number
  // Lo que dice la aparición (el texto de la escena).
  text: string
  // Largo del tramo en segundos.
  seconds: number
  position: AvatarMotionPosition
  expressive: boolean
}

// Una aparición de más de AVATAR_MOTION_LOOP_SECONDS lleva una plantilla
// propia, sin importar su posición: el movimiento se repite.
type MotionTemplateKind = AvatarMotionPosition | 'long'

interface MotionTemplate {
  normal: string
  expressive: string
}

// Una entrada de la respuesta del modelo.
interface MotionEntry {
  sceneId: number
  prompt: string
}

// Las plantillas profesionales (diseño §21.2). Cada una pasa la validación de
// abajo: solo cara, manos, postura y mirada.
const MOTION_TEMPLATES: Record<MotionTemplateKind, MotionTemplate> = {
  opening: {
    normal: 'Warm, confident smile at the camera with a small welcoming nod.',
    expressive:
      'Bright, enthusiastic smile at the camera with an open-palm welcoming gesture.',
  },
  middle: {
    normal:
      'Composed posture and sincere expression, with a subtle open-hand gesture on the key point.',
    expressive:
      'Engaged, energetic expression with clear open-hand gestures on the key point.',
  },
  closing: {
    normal: 'Warm smile at the camera with a gentle, reassuring nod.',
    expressive:
      'Confident smile at the camera, nodding firmly with an open-hand gesture.',
  },
  long: {
    normal:
      'Composed, open posture and sincere expression, looking at the camera with occasional small nods.',
    expressive:
      'Warm, animated expression, looking at the camera with natural hand movement and occasional nods.',
  },
}

// Un prompt de menos de esto no dice nada.
const MOTION_PROMPT_MIN_LENGTH = 8
// Un poco más que el objetivo que se le pide al modelo; el tope duro del
// editor es AVATAR_MOTION_PROMPT_LIMIT, y este queda siempre por debajo.
const MOTION_PROMPT_MAX_LENGTH = AVATAR_MOTION_PROMPT_TARGET + 40

// Cuánto del texto de la aparición ve el modelo, en caracteres.
const MOTION_TEXT_LIMIT = 600

// Tokens de salida: un prompt del largo máximo son unos 50, más el JSON de su
// entrada; 100 por escena deja margen, y la base cubre el envoltorio. Un tope
// justo cortaría la respuesta a la mitad y todas las escenas caerían en su
// plantilla sin necesidad.
const MOTION_OUTPUT_TOKENS_BASE = 200
const MOTION_OUTPUT_TOKENS_PER_SCENE = 100

// Lo que el proveedor no controla de una aparición (guía de movimiento del
// proveedor, diseño §21.1): la cámara, el lugar o la escena, los objetos y sus
// acciones, pararse o caminar, el fondo y la luz. Se rechaza el prompt que
// nombra cualquiera, por palabra completa y sin distinguir mayúsculas. Desde
// R-2e-13 (revisión de WP-T) la lista suma las flexiones más comunes y ya no
// tiene `tilt`: «head tilt» es postura, no un movimiento de cámara.
const FORBIDDEN_MOTION_TERMS = [
  'zoom',
  'zooms',
  'zoomed',
  'zooming',
  'pan',
  'pans',
  'panned',
  'panning',
  'dolly',
  'dollies',
  'close-up',
  'walk',
  'walks',
  'walked',
  'walking',
  'stand up',
  'stands up',
  'stood up',
  'standing up',
  'sit down',
  'sits down',
  'sat down',
  'sitting down',
  'turn around',
  'turns around',
  'turned around',
  'turning around',
  'kitchen',
  'outside',
  'coffee',
  'cup',
  'cups',
  'drink',
  'drinks',
  'drinking',
  'phone',
  'phones',
  'cigarette',
  'cigarettes',
  'smoking',
  'pick up',
  'picks up',
  'picked up',
  'picking up',
  'background',
  'lighting',
  'lights',
]

// Comillas que a veces envuelven el prompt entero, y cuántas capas se sacan:
// rectas, tipográficas dobles y simples, el acento grave y las angulares. Las
// tipográficas van con `\u{…}` para que ningún editor las confunda con las
// rectas.
const WRAPPING_QUOTES = [
  ['"', '"'],
  ['\u{201C}', '\u{201D}'],
  ["'", "'"],
  ['\u{2018}', '\u{2019}'],
  ['`', '`'],
  ['\u{00AB}', '\u{00BB}'],
] as const
const WRAPPING_QUOTE_LAYERS = 3

const WHITESPACE_RUN = /\s+/g
// Los saltos de línea de Unicode: el proveedor recibe el movimiento en una
// sola línea.
const LINE_BREAK = /[\n\v\f\r\u0085\u2028\u2029]/u

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Palabra completa con letras de cualquier alfabeto: el `\b` de JavaScript solo
// conoce ASCII y vería una frontera dentro de «panóptico».
const FORBIDDEN_MOTION_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:${FORBIDDEN_MOTION_TERMS.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_])`,
  'iu',
)

// El prompt del sistema es el contrato con el modelo (diseño §21.2).
const MOTION_SYSTEM_PROMPT = `You direct a professional video presenter. For each avatar appearance, write ONE short motion prompt in English that an AI avatar engine will follow while the presenter says the given text.

Rules:
- Structure: body part + action + emotion or intensity. One gesture, or two beats at most, in at most two short clauses. Keep it under ${AVATAR_MOTION_PROMPT_TARGET} characters.
- Only control: facial expression (calm, warm, confident, sincere, enthusiastic, serious), hand gestures (open palm, point forward, hand on heart, small wave, count on fingers), body posture (lean in, upright, warm and open, composed), gaze (look at the camera, glance away briefly) and stillness (hands still, barely moves).
- Never mention camera movement (zoom, pan, dolly), changing location or scene, props or actions with objects (coffee, phone, papers), standing up, sitting down or walking, or background and lighting changes.
- Match the meaning and emotion of the text: welcome when it opens the video, emphasis on the key idea in the middle, a warm close when it ends. Natural and professional, never theatrical.
- Appearances longer than ${AVATAR_MOTION_LOOP_SECONDS} seconds: describe a sustained, subtle demeanor (expression, posture, gaze, small natural gestures) instead of a single gesture, because the motion repeats.
- expressive=true: more energy and clearer gestures, still professional. expressive=false: calm, restrained movement.
- Write the prompt in English even if the text is in another language.

Return only JSON: {"motions":[{"sceneId":<number>,"prompt":"<motion prompt>"}]}`

// El texto recortado y con los espacios (también saltos de línea y
// tabulaciones) colapsados en uno.
function normalizeMotionText(text: string): string {
  return text.replace(WHITESPACE_RUN, ' ').trim()
}

// Huella (sha256 hex) del texto normalizado. Con ella la escena sabe para qué
// texto se escribió su prompt automático, y no lo reescribe mientras el texto
// no cambie de verdad.
export function avatarMotionTextHash(text: string): string {
  return createHash('sha256').update(normalizeMotionText(text)).digest('hex')
}

function positionAt(index: number, count: number): AvatarMotionPosition {
  if (index === 0) return 'opening'
  if (index === count - 1) return 'closing'

  return 'middle'
}

// La posición de cada escena de avatar del proyecto, en orden de inicio: la
// primera abre, la última cierra (si hay más de una) y el resto va en el medio.
// Manda el orden que llega, no el valor de los ids (que no se repiten).
export function avatarMotionPositions(
  sceneIdsInOrder: readonly number[],
): Map<number, AvatarMotionPosition> {
  const positions = new Map<number, AvatarMotionPosition>()
  for (const [index, sceneId] of sceneIdsInOrder.entries())
    positions.set(sceneId, positionAt(index, sceneIdsInOrder.length))

  return positions
}

// En este orden de decisión: la larga si pasa lo que el proveedor repite; si
// no, por posición. Una posición desconocida (un proyecto escrito a mano) cae
// en la del medio.
function templateKind(request: AvatarMotionRequest): MotionTemplateKind {
  if (request.seconds > AVATAR_MOTION_LOOP_SECONDS) return 'long'
  if (request.position === 'opening') return 'opening'
  if (request.position === 'closing') return 'closing'

  return 'middle'
}

// La plantilla profesional para una escena (sin modelo).
export function templateMotionPrompt(request: AvatarMotionRequest): string {
  const template = MOTION_TEMPLATES[templateKind(request)]
  if (request.expressive) return template.expressive

  return template.normal
}

// Las comillas que envuelven `text` de punta a punta, sin ellas y sin los
// espacios que quedan adentro; null si no lo envuelven. Unas comillas que no
// abren y cierran el texto entero (`"a" y "b"`) no son una envoltura.
function unwrapQuotes(text: string): string | null {
  if (text.length < 2) return null

  for (const [open, close] of WRAPPING_QUOTES) {
    if (!text.startsWith(open) || !text.endsWith(close)) continue

    const inner = text.slice(1, -1)
    if (inner.includes(open) || inner.includes(close)) continue

    return inner.trim()
  }

  return null
}

function stripWrappingQuotes(text: string): string {
  let current = text
  for (let layer = 0; layer < WRAPPING_QUOTE_LAYERS; layer++) {
    const inner = unwrapQuotes(current)
    if (inner === null) return current

    current = inner
  }

  return current
}

// El prompt normalizado (recortado, con los espacios colapsados y sin las
// comillas que lo envuelven) o null si no sirve: vacío, de menos de 8
// caracteres, de más de AVATAR_MOTION_PROMPT_TARGET + 40, con un salto de línea
// de adentro o con una palabra de lo que el proveedor no controla.
export function validateMotionPrompt(prompt: string): string | null {
  const unwrapped = stripWrappingQuotes(prompt.trim())
  if (LINE_BREAK.test(unwrapped)) return null

  const normalized = normalizeMotionText(unwrapped)
  if (normalized.length < MOTION_PROMPT_MIN_LENGTH) return null
  if (normalized.length > MOTION_PROMPT_MAX_LENGTH) return null
  if (FORBIDDEN_MOTION_PATTERN.test(normalized)) return null

  return normalized
}

// El texto de la aparición como lo ve el modelo: normalizado y cortado por
// caracteres, no por unidades UTF-16 (un emoji no queda partido a la mitad).
function motionSourceText(text: string): string {
  return Array.from(normalizeMotionText(text))
    .slice(0, MOTION_TEXT_LIMIT)
    .join('')
}

// El mensaje del usuario: cada escena con su posición, su largo (a un
// decimal), si es larga —la regla de la plantilla, sobre los segundos
// reales—, si es expresiva y lo que dice.
function motionUserPrompt(requests: readonly AvatarMotionRequest[]): string {
  return JSON.stringify({
    scenes: requests.map((request) => {
      return {
        sceneId: request.sceneId,
        position: request.position,
        seconds: Math.round(request.seconds * 10) / 10,
        long: request.seconds > AVATAR_MOTION_LOOP_SECONDS,
        expressive: request.expressive,
        text: motionSourceText(request.text),
      }
    }),
  })
}

function isMotionEntry(value: unknown): value is MotionEntry {
  if (typeof value !== 'object' || value === null) return false
  if (!('sceneId' in value) || typeof value.sceneId !== 'number') return false

  return 'prompt' in value && typeof value.prompt === 'string'
}

// Las entradas de `motions` de la respuesta (el modelo a veces la envuelve en
// un bloque de código); null si no hay JSON o no trae la lista.
function motionEntries(answer: string): unknown[] | null {
  const parsed = extractJsonObject(answer)
  if (!parsed) return null
  if (!Array.isArray(parsed.motions)) return null

  return parsed.motions
}

// Lo que exige el `validate` del cliente (que decide si prueba con otro
// modelo): el JSON del contrato, con al menos una entrada y todas completas.
// Valida la forma; el criterio de cada prompt lo aplica `validateMotionPrompt`
// por escena, así una sola entrada mala no tira las demás.
function isMotionsResponse(answer: string): boolean {
  const entries = motionEntries(answer)
  if (!entries) return false
  if (entries.length === 0) return false

  return entries.every(isMotionEntry)
}

// Cada escena con su plantilla, en el orden de los pedidos.
function templatePrompts(
  requests: readonly AvatarMotionRequest[],
): Map<number, string> {
  const prompts = new Map<number, string>()
  for (const request of requests)
    prompts.set(request.sceneId, templateMotionPrompt(request))

  return prompts
}

// Las plantillas, con el prompt del modelo en cada escena donde pasa la
// validación. Una entrada de una escena que no se pidió no entra.
function promptsFromAnswer(
  requests: readonly AvatarMotionRequest[],
  answer: string,
): Map<number, string> {
  const prompts = templatePrompts(requests)
  const requested = new Set(requests.map((request) => request.sceneId))

  for (const entry of motionEntries(answer) ?? []) {
    if (!isMotionEntry(entry)) continue
    if (!requested.has(entry.sceneId)) continue

    const prompt = validateMotionPrompt(entry.prompt)
    if (prompt === null) continue

    prompts.set(entry.sceneId, prompt)
  }

  return prompts
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

// Un prompt por escena: el del modelo si sirve; si no, la plantilla. `llm` null
// = sin clave. Nunca lanza, salvo una cancelación (un AbortError del cliente o
// la `signal` abortada), que se vuelve a lanzar: cancelar el job no se toma por
// un fallo del modelo. `signal` es opcional y no cambia el contrato: lo normal
// es que el cliente ya la lleve y lance su propio AbortError.
export async function writeAvatarMotionPrompts(
  llm: SceneLlm | null,
  requests: readonly AvatarMotionRequest[],
  signal?: AbortSignal,
): Promise<Map<number, string>> {
  signal?.throwIfAborted()
  // Sin cliente o sin escenas no hay a quién ni qué preguntar.
  if (!llm || requests.length === 0) return templatePrompts(requests)

  try {
    const answer = await llm.generate({
      systemPrompt: MOTION_SYSTEM_PROMPT,
      userPrompt: motionUserPrompt(requests),
      jsonOnly: true,
      tier: 'balanced',
      maxOutputTokens:
        MOTION_OUTPUT_TOKENS_BASE +
        requests.length * MOTION_OUTPUT_TOKENS_PER_SCENE,
      validate: isMotionsResponse,
    })
    signal?.throwIfAborted()

    return promptsFromAnswer(requests, answer)
  } catch (error) {
    signal?.throwIfAborted()
    if (isAbortError(error)) throw error

    // Cualquier otra cosa (el modelo caído, la clave, una respuesta que ni
    // siquiera es un texto) no frena el render: todas con su plantilla.
    return templatePrompts(requests)
  }
}
