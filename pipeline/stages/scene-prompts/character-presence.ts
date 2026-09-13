import {
  SUBJECT_CLASSIFIER_SYSTEM_PROMPT,
  buildSubjectClassifierUserPrompt,
} from '../../prompts/reference-characters.ts'
import type { Scene } from '../../types/scenes.ts'
import type { CharacterFrequency } from '../../types/video-project.ts'
import type { SceneLlm } from '../shared/llm.ts'

// Presencia de los personajes de referencia por escena (port de
// deteccion_personajes.ts, flujo único de ADR-0011 del origen): la FRECUENCIA
// elegida por el usuario manda sobre todo el video; el clasificador LLM por
// sujeto/acción es el camino sin frecuencia explícita.

// Densidad objetivo por nivel, como razón on/(on+off). Mapea la intuición del
// usuario (1-sí-2-no, 1-sí-1-no, 3-sí-1-no, 5-sí-1-no). "always" (100%) no
// usa densidad: cortocircuita a todas las escenas con texto.
const FREQUENCY_RUNS: Record<
  Exclude<CharacterFrequency, 'always'>,
  { on: number; off: number }
> = {
  rarely: { on: 1, off: 2 },
  balanced: { on: 2, off: 2 },
  often: { on: 3, off: 1 },
  'almost-always': { on: 5, off: 1 },
}

// Reparto por ERROR-DIFUSIÓN (Bresenham) con fase aleatoria + jitter de
// vecinos: densidad EXACTA del nivel, ON/OFF mezclados de punta a punta
// (nunca todos al inicio ni una cola sola al final), sin ser un metrónomo
// predecible. El resultado se PERSISTE en scenes.json: re-corridas reusan la
// distribución, no la recalculan.
export function distributePresenceByFrequency(
  orderedEligibleIds: number[],
  level: CharacterFrequency,
): Set<number> {
  const present = new Set<number>()
  const total = orderedEligibleIds.length
  if (total === 0) return present
  if (level === 'always') return new Set(orderedEligibleIds)

  const { on, off } = FREQUENCY_RUNS[level] ?? FREQUENCY_RUNS.balanced
  const density = on / (on + off)

  const states: boolean[] = []
  let accumulator = Math.random()
  for (let index = 0; index < total; index++) {
    accumulator += density
    if (accumulator >= 1) {
      accumulator -= 1
      states.push(true)
    } else {
      states.push(false)
    }
  }

  // Jitter de vecinos: intercambia pares adyacentes con prob. 30% → dobletes
  // naturales manteniendo la densidad exacta y las rachas acotadas.
  for (let index = 0; index + 1 < total; index += 2) {
    if (Math.random() < 0.3) {
      const swapped = states[index]
      states[index] = states[index + 1]
      states[index + 1] = swapped
    }
  }

  states.forEach((isPresent, index) => {
    if (isPresent) present.add(orderedEligibleIds[index])
  })

  // Garantía mínima: si hay elegibles, el personaje aparece al menos una vez.
  if (present.size === 0)
    present.add(orderedEligibleIds[Math.floor(Math.random() * total)])

  return present
}

// Aplica la frecuencia a los personajes indicados sobre TODAS las escenas con
// texto (decisión de producto del origen: si el usuario eligió personaje, lo
// quiere ver — sin veto previo del clasificador). La presencia del personaje
// pasa a ser EXACTAMENTE el set calculado (add + remove).
export function applyFrequencyToCharacters(
  scenes: Scene[],
  characterIndexes: Set<number>,
  level: CharacterFrequency,
): Scene[] {
  if (characterIndexes.size === 0) return scenes

  const idsWithText = [...scenes]
    .sort((a, b) => a.id - b.id)
    .filter((scene) => (scene.text ?? '').trim().length > 0)
    .map((scene) => scene.id)

  let marked = scenes
  for (const characterIndex of characterIndexes) {
    const keep =
      level === 'always'
        ? new Set(idsWithText)
        : distributePresenceByFrequency(idsWithText, level)

    marked = marked.map((scene) => {
      const present = scene.charactersPresent ?? []
      const shouldBePresent = keep.has(scene.id)
      if (shouldBePresent === present.includes(characterIndex)) return scene

      return {
        ...scene,
        charactersPresent: shouldBePresent
          ? [...present, characterIndex]
          : present.filter((index) => index !== characterIndex),
      }
    })
  }

  return marked
}

// ¿La distribución PERSISTIDA está rota respecto del nivel "always"? Cura
// SOLO el caso patológico e inequívoco (nivel "always" + presencia CERO):
// ningún toggle manual legítimo explica ese estado. Cualquier presencia
// parcial persistida se respeta intacta.
export function needsAlwaysCure(
  scenes: Scene[],
  characterIndexes: Set<number>,
  level: CharacterFrequency,
): boolean {
  if (level !== 'always' || characterIndexes.size === 0) return false

  const hasText = scenes.some((scene) => (scene.text ?? '').trim().length > 0)
  if (!hasText) return false

  return !scenes.some((scene) =>
    (scene.charactersPresent ?? []).some((index) =>
      characterIndexes.has(index),
    ),
  )
}

// Extrae el primer array u objeto JSON balanceado de un texto del LLM.
function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/```(?:json|jsonc)?\s*\n?/gi, '')
    .replace(/```/g, '')
    .trim()

  for (const [open, close] of [
    ['[', ']'],
    ['{', '}'],
  ] as const) {
    const start = cleaned.indexOf(open)
    const end = cleaned.lastIndexOf(close)
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        // Probar la otra forma.
      }
    }
  }
  return null
}

function toNonNegativeInteger(value: unknown): number {
  const parsed =
    typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
}

// Clasificador name-agnostic (una llamada, tier economy): en qué escenas hay
// un sujeto humano/acción que el protagonista pueda encarnar. Una lista vacía
// es válida; un fallo de red/modelo/cancelación no se convierte en clasificación.
export async function detectSubjectScenes(
  llm: SceneLlm,
  scenes: Scene[],
): Promise<number[]> {
  const withText = scenes.filter(
    (scene) => (scene.text ?? '').trim().length > 0,
  )
  if (withText.length === 0) return []

  const sceneLines = withText
    .map(
      (scene) =>
        `${scene.id}: ${(scene.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 180)}`,
    )
    .join('\n')

  const content = await llm.generate({
    systemPrompt: SUBJECT_CLASSIFIER_SYSTEM_PROMPT,
    userPrompt: buildSubjectClassifierUserPrompt(sceneLines),
    jsonOnly: true,
    tier: 'economy',
    validate(value) {
      const parsed = extractJson(value)
      if (Array.isArray(parsed)) return true
      return (
        !!parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as Record<string, unknown>).ids)
      )
    },
  })

  const json = extractJson(content)
  let ids: unknown = null
  if (Array.isArray(json)) ids = json
  else if (json && typeof json === 'object')
    ids = (json as Record<string, unknown>).ids
  if (!Array.isArray(ids)) return []

  const validIds = new Set(withText.map((scene) => scene.id))
  const result: number[] = []
  for (const value of ids) {
    const id = toNonNegativeInteger(value)
    if (validIds.has(id) && !result.includes(id)) result.push(id)
  }
  return result
}

// Presencia para hasta 2 personajes con UNA llamada (el set de escenas con
// sujeto es el mismo; la frecuencia después distribuye a cada uno).
export async function detectScenesWithCharacters(
  llm: SceneLlm,
  scenes: Scene[],
  characters: { name: string }[],
): Promise<Map<number, number[]>> {
  const presence = new Map<number, number[]>()
  const validIndexes = characters
    .map((character, index) => ({ character, index }))
    .filter(({ character }) => character?.name?.trim())
    .map(({ index }) => index)
  if (validIndexes.length === 0) return presence

  const subjectIds = await detectSubjectScenes(llm, scenes)
  for (const id of subjectIds) {
    presence.set(id, [...validIndexes])
  }
  return presence
}
