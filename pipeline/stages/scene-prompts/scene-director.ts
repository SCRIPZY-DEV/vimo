import { PipelineFailure } from '../../runner/failure.ts'
import {
  SPANISH_TREATMENT_TO_ENGLISH,
  buildDirectorSystemPrompt,
  buildDirectorUserPrompt,
  computeDirectorMaxTokens,
} from '../../prompts/scene-director.ts'
import {
  SCENE_TREATMENTS,
  type Scene,
  type SceneDirection,
  type SceneTreatment,
} from '../../types/scenes.ts'
import type { SceneLlm } from '../shared/llm.ts'

// Catálogo: el LLM aporta lugar/emoción y el código corrige secuencias.
// Nunca inventar un plan ciego tras un fallo del proveedor (ADR-0036).
const CATALOG_DIRECTOR_BATCH_SIZE = 12
const DIRECTOR_TARGET_BATCHES = 4
const DIRECTOR_MIN_BATCH_SIZE = 3

// El subconjunto que cuenta para la cuota de dinamismo (≥1 de cada 3): los
// tratamientos explicativos/alusivos que rompen la monotonía.
export const EXPLANATORY_TREATMENTS: ReadonlySet<SceneTreatment> = new Set([
  'diagram',
  'metaphor',
  'bubble',
  'object',
  'memory',
])

// La cuota/ventanas solo aplican con esta cantidad mínima de escenas con
// texto (los videos cortos no cambian de contrato).
const MIN_SCENES_FOR_QUOTA = 6
const INTERLEAVE_WINDOW = 4
const MAX_STREAK = 2

// Escena mínima que el director necesita (evita acoplarse a toda Scene).
export interface DirectorScene {
  id: number
  text: string
  // ¿El personaje de referencia está presente acá? (lo decidió la frecuencia).
  present: boolean
}

export interface DirectorPlanContext {
  hasCharacters: boolean
  isStickmanStyle: boolean
  // Hay tratamientos que un estilo no admite nunca (veto por estilo).
  styleId?: string
}

export interface PlanValidation {
  ok: boolean
  violations: string[]
  // Escenas con violación DE CONTENIDO (falta entrada, tratamiento inválido o
  // no permitido, lugar/emoción vacíos): las únicas que un modelo debe volver
  // a pensar — la reparación se pide SOLO para estos ids.
  contentViolationIds: number[]
  // ¿Hay violaciones de SECUENCIA (rachas, cuota, ventana)? Dependen del
  // ORDEN: las resuelve el parche determinístico al instante, sin LLM.
  hasSequenceViolations: boolean
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function normalizePlace(place: string): string {
  return (place || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function eligibleScenes(scenes: DirectorScene[]): DirectorScene[] {
  return [...scenes]
    .filter((scene) => (scene.text ?? '').trim().length > 0)
    .sort((a, b) => a.id - b.id)
}

// ─── Veto de tratamientos por estilo ───
// En fotorrealista el video debe leerse como metraje real: un diagrama
// rotulado o una viñeta de pensamiento son recursos gráficos que rompen esa
// ilusión (decisión del usuario del origen). La variedad no se pierde:
// metáfora/objeto/recuerdo siguen contando para la cuota.
const VETOED_TREATMENTS_BY_STYLE: Readonly<
  Record<string, readonly SceneTreatment[]>
> = {
  normal: ['diagram', 'bubble'],
}

export function vetoedTreatments(
  styleId: string | undefined,
): readonly SceneTreatment[] {
  return (styleId && VETOED_TREATMENTS_BY_STYLE[styleId]) || []
}

// ¿Este tratamiento es legal para esta escena, dada la presencia y contexto?
function treatmentAllowed(
  treatment: SceneTreatment,
  present: boolean,
  planContext: DirectorPlanContext,
): boolean {
  // El veto por estilo manda sobre todo lo demás (incluida la presencia).
  if (vetoedTreatments(planContext.styleId).includes(treatment)) return false
  if (present) return true

  if (planContext.hasCharacters) {
    // Proyecto CON refs y el personaje NO está: la escena se dibuja SIN
    // personas — nada que exija figuras. "place" también queda prohibido acá
    // (bug real del origen: la orden pedía "a clear focal subject" sin
    // definir ninguno mientras el candado prohibía a la persona → el lugar
    // salía VACÍO); la escena degrada a metáfora/objeto, siempre con sujeto.
    return !['action', 'group', 'bubble', 'place'].includes(treatment)
  }

  // Proyecto SIN refs: en stickman hay figura genérica en cada escena; en los
  // demás estilos no hay NADIE fijo sobre quién dibujar una burbuja.
  if (planContext.isStickmanStyle) return true
  return treatment !== 'bubble'
}

// ─── Parser tolerante del JSON del director ───

function validEntry(
  raw: unknown,
  validIds: Set<number>,
): [number, SceneDirection] | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>

  const id = typeof record.id === 'number' ? record.id : Number(record.id)
  if (!Number.isFinite(id) || !validIds.has(id)) return null

  // El prompt del director habla el vocabulario español del origen (verbatim);
  // acá se traduce al union inglés del dominio. Se acepta cualquiera de los
  // dos por robustez (el modelo a veces "traduce" solo).
  const rawTreatment = normalizeText(
    record.tratamiento ?? record.treatment,
  ).toLowerCase()
  const treatment =
    SPANISH_TREATMENT_TO_ENGLISH[rawTreatment] ??
    (SCENE_TREATMENTS.includes(rawTreatment as SceneTreatment)
      ? (rawTreatment as SceneTreatment)
      : undefined)
  if (!treatment) return null

  const direction: SceneDirection = {
    treatment,
    place: normalizeText(record.lugar ?? record.place),
    emotion: normalizeText(record.emocion ?? record.emotion),
  }
  const extras = normalizeText(record.extras)
  if (extras) direction.extras = extras

  const rawLabels = record.rotulos ?? record.labels
  if (Array.isArray(rawLabels)) {
    const labels = rawLabels
      .map(normalizeText)
      .filter((label) => label.length > 0 && label.length <= 60)
    if (labels.length > 0) direction.labels = labels.slice(0, 4)
  }

  return [id, direction]
}

// Busca RECURSIVAMENTE la lista de entradas del plan dentro de cualquier
// envoltorio ({escenas:[...]}, {plan:{...}}, array top-level, objeto-mapa
// {"1":{...}}). El modo clásico de fallo de json_object es RENOMBRAR/ENVOLVER
// — descartar un plan perfecto por eso era tirar la llamada a la basura.
function extractPlanList(candidate: unknown, depth = 0): unknown[] | null {
  if (Array.isArray(candidate)) return candidate
  if (!candidate || typeof candidate !== 'object' || depth > 3) return null

  const record = candidate as Record<string, unknown>
  const entries = Object.entries(record)
  const numericEntries = entries.filter(
    ([key, value]) =>
      /^\d+$/.test(key) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value),
  )
  if (numericEntries.length > 0 && numericEntries.length === entries.length) {
    return numericEntries.map(([key, value]) => ({
      id: Number(key),
      ...(value as object),
    }))
  }

  for (const [, value] of entries) {
    const found = extractPlanList(value, depth + 1)
    if (found) return found
  }
  return null
}

// Todos los bloques {...} / [...] balanceados dentro de un texto con prosa.
function balancedJsonBlocks(text: string): string[] {
  const blocks: string[] = []
  for (const open of ['{', '['] as const) {
    const close = open === '{' ? '}' : ']'
    let from = 0
    while (from < text.length) {
      const start = text.indexOf(open, from)
      if (start === -1) break

      let depth = 0
      let inString = false
      let escaped = false
      let end = -1
      for (let index = start; index < text.length; index++) {
        const character = text[index]
        if (escaped) {
          escaped = false
          continue
        }
        if (character === '\\') {
          escaped = true
          continue
        }
        if (character === '"') inString = !inString
        if (inString) continue
        if (character === open) depth++
        if (character === close) depth--
        if (depth === 0) {
          end = index
          break
        }
      }
      if (end === -1) break

      blocks.push(text.slice(start, end + 1))
      from = end + 1
    }
  }
  return blocks
}

// Extrae el plan del texto crudo del LLM. Nunca lanza: basura → mapa vacío.
export function parseDirectorPlan(
  raw: string,
  validIds: number[],
): Map<number, SceneDirection> {
  const ids = new Set(validIds)
  const plan = new Map<number, SceneDirection>()
  const cleaned = (raw || '').replace(/```(?:json)?/gi, '').trim()

  const candidates: unknown[] = []
  try {
    candidates.push(JSON.parse(cleaned))
  } catch {
    for (const block of balancedJsonBlocks(cleaned)) {
      try {
        candidates.push(JSON.parse(block))
      } catch {
        // Candidato roto: probar el siguiente.
      }
    }
  }

  for (const candidate of candidates) {
    const list = extractPlanList(candidate)
    if (!list) continue
    for (const item of list) {
      const entry = validEntry(item, ids)
      if (entry && !plan.has(entry[0])) plan.set(entry[0], entry[1])
    }
    if (plan.size > 0) break
  }
  return plan
}

// ─── Validador determinístico (el contrato de dinamismo vive ACÁ) ───

export function validatePlan(
  plan: Map<number, SceneDirection>,
  scenes: DirectorScene[],
  planContext: DirectorPlanContext,
): PlanValidation {
  const violations: string[] = []
  const contentViolationIds = new Set<number>()
  const eligible = eligibleScenes(scenes)
  const total = eligible.length

  // Cobertura + campos + matriz de permitidos.
  for (const scene of eligible) {
    const direction = plan.get(scene.id)
    if (!direction) {
      violations.push(`scene ${scene.id}: missing plan entry`)
      contentViolationIds.add(scene.id)
      continue
    }
    if (!SCENE_TREATMENTS.includes(direction.treatment)) {
      violations.push(
        `scene ${scene.id}: invalid treatment "${direction.treatment}"`,
      )
      contentViolationIds.add(scene.id)
      continue
    }
    if (!normalizeText(direction.emotion)) {
      violations.push(`scene ${scene.id}: empty emotion`)
      contentViolationIds.add(scene.id)
    }
    if (!normalizeText(direction.place)) {
      violations.push(`scene ${scene.id}: empty place`)
      contentViolationIds.add(scene.id)
    }
    if (!treatmentAllowed(direction.treatment, scene.present, planContext)) {
      violations.push(
        `scene ${scene.id}: "${direction.treatment}" needs figures and the character is not present here`,
      )
      contentViolationIds.add(scene.id)
    }
  }
  const contentViolationCount = violations.length

  // Rachas de tratamiento y de lugar (sobre entradas existentes válidas).
  const sequence = eligible
    .map((scene) => ({ id: scene.id, direction: plan.get(scene.id) }))
    .filter(
      (item): item is { id: number; direction: SceneDirection } =>
        !!item.direction,
    )
  for (let index = MAX_STREAK; index < sequence.length; index++) {
    const treatments = [
      sequence[index - 2].direction.treatment,
      sequence[index - 1].direction.treatment,
      sequence[index].direction.treatment,
    ]
    if (
      treatments[0] === treatments[1] &&
      treatments[1] === treatments[2] &&
      SCENE_TREATMENTS.includes(treatments[0])
    )
      violations.push(
        `scenes ${sequence[index - 2].id}-${sequence[index].id}: treatment "${treatments[0]}" repeated ${MAX_STREAK + 1} times in a row`,
      )

    const places = [
      normalizePlace(sequence[index - 2].direction.place),
      normalizePlace(sequence[index - 1].direction.place),
      normalizePlace(sequence[index].direction.place),
    ]
    if (places[0] && places[0] === places[1] && places[1] === places[2])
      violations.push(
        `scenes ${sequence[index - 2].id}-${sequence[index].id}: place "${sequence[index].direction.place}" repeated ${MAX_STREAK + 1} times in a row`,
      )
  }

  // Cuota + intercalado (solo videos con N suficiente).
  if (total >= MIN_SCENES_FOR_QUOTA) {
    const isExplanatory = (id: number) => {
      const direction = plan.get(id)
      return !!direction && EXPLANATORY_TREATMENTS.has(direction.treatment)
    }

    const explanatoryCount = eligible.filter((scene) =>
      isExplanatory(scene.id),
    ).length
    const quota = Math.ceil(total / 3)
    if (explanatoryCount < quota)
      violations.push(
        `dynamism quota: ${explanatoryCount}/${total} explanatory/allusive scenes (at least ${quota} required)`,
      )

    for (let index = 0; index + INTERLEAVE_WINDOW <= total; index++) {
      const window = eligible.slice(index, index + INTERLEAVE_WINDOW)
      if (!window.some((scene) => isExplanatory(scene.id))) {
        violations.push(
          `window without dynamism: scenes ${window[0].id}-${window[window.length - 1].id} have no explanatory/allusive scene (interleave, do not clump)`,
        )
        break
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    contentViolationIds: [...contentViolationIds].sort((a, b) => a - b),
    // Todo lo sumado DESPUÉS del bloque de contenido es de secuencia.
    hasSequenceViolations: violations.length > contentViolationCount,
  }
}

// ─── Parche determinístico — SIEMPRE converge a un plan válido ───

// Explicativas "seguras" para asignar A CIEGAS: una metáfora o un objeto
// clave siempre pueden derivarse del fragmento por el redactor (que SÍ lee la
// narración). diagram/memory solo los asigna el director.
const BLIND_PATCH_EXPLANATORY: readonly SceneTreatment[] = [
  'metaphor',
  'object',
]

// Lugares de relleno VARIADOS para romper rachas sin inventar contenido: son
// órdenes de reencuadre, no lugares nuevos (coherencia primero).
const ANTI_STREAK_PLACES: readonly string[] = [
  'a different area of the same location',
  'an allusive cut-away setting',
  'just outside the previous location',
  'a symbolic close-up setting',
]

// Repara CUALQUIER plan (incluso vacío) para que pase validatePlan.
// Determinístico: misma entrada → mismo resultado. Conserva del original todo
// lo que no viola el contrato. NUNCA toca la presencia del personaje.
export function patchPlanDeterministically(
  plan: Map<number, SceneDirection>,
  scenes: DirectorScene[],
  planContext: DirectorPlanContext,
): Map<number, SceneDirection> {
  const eligible = eligibleScenes(scenes)
  const total = eligible.length
  const result = new Map<number, SceneDirection>()

  // Posiciones que DEBEN ser explicativas: cuota ⌈N/3⌉ distribuida pareja,
  // estilo difusión de error.
  const explanatoryPositions = new Set<number>()
  if (total >= MIN_SCENES_FOR_QUOTA) {
    const quota = Math.ceil(total / 3)
    for (let slot = 0; slot < quota; slot++) {
      explanatoryPositions.add(Math.floor(((slot + 0.5) * total) / quota))
    }
  }

  const previousTreatments: SceneTreatment[] = []
  const previousPlaces: string[] = []

  eligible.forEach((scene, index) => {
    const original = plan.get(scene.id)
    let direction: SceneDirection = original
      ? { ...original }
      : {
          treatment: scene.present ? 'action' : 'metaphor',
          place: "follows this scene's narration",
          emotion: "matching this narration's emotion",
        }

    // Campos obligatorios.
    if (!SCENE_TREATMENTS.includes(direction.treatment))
      direction.treatment = scene.present ? 'action' : 'metaphor'
    if (!normalizeText(direction.place))
      direction.place = "follows this scene's narration"
    if (!normalizeText(direction.emotion))
      direction.emotion = "matching this narration's emotion"

    // Matriz de permitidos: lo prohibido degrada a metáfora (universalmente
    // legal: objetos/naturaleza, sin personas).
    if (!treatmentAllowed(direction.treatment, scene.present, planContext)) {
      direction = {
        treatment: 'metaphor',
        place: direction.place,
        emotion: direction.emotion,
      }
    }

    // Posición de cuota: si toca explicativa y no lo es, asignar una segura.
    if (
      explanatoryPositions.has(index) &&
      !EXPLANATORY_TREATMENTS.has(direction.treatment)
    ) {
      const base =
        BLIND_PATCH_EXPLANATORY[scene.id % BLIND_PATCH_EXPLANATORY.length]
      direction.treatment =
        base !== previousTreatments[previousTreatments.length - 1]
          ? base
          : BLIND_PATCH_EXPLANATORY[
              (scene.id + 1) % BLIND_PATCH_EXPLANATORY.length
            ]
    }

    // Racha de tratamiento: si con las dos anteriores formaría 3 iguales,
    // cambiar por la primera alternativa LEGAL que la rompa.
    if (
      previousTreatments.length >= MAX_STREAK &&
      previousTreatments[previousTreatments.length - 1] ===
        direction.treatment &&
      previousTreatments[previousTreatments.length - 2] === direction.treatment
    ) {
      const candidates: SceneTreatment[] = explanatoryPositions.has(index)
        ? [...BLIND_PATCH_EXPLANATORY]
        : scene.present
          ? ['action', ...BLIND_PATCH_EXPLANATORY, 'place']
          : [...BLIND_PATCH_EXPLANATORY, 'place']
      const alternative = candidates.find(
        (candidate) =>
          candidate !== direction.treatment &&
          treatmentAllowed(candidate, scene.present, planContext),
      )
      if (alternative) direction.treatment = alternative
    }

    // Racha de lugar: tercer lugar idéntico consecutivo → reencuadre variado.
    const normalizedPlace = normalizePlace(direction.place)
    if (
      previousPlaces.length >= MAX_STREAK &&
      previousPlaces[previousPlaces.length - 1] === normalizedPlace &&
      previousPlaces[previousPlaces.length - 2] === normalizedPlace
    ) {
      let placeIndex = scene.id % ANTI_STREAK_PLACES.length
      if (normalizePlace(ANTI_STREAK_PLACES[placeIndex]) === normalizedPlace)
        placeIndex = (placeIndex + 1) % ANTI_STREAK_PLACES.length
      direction.place = ANTI_STREAK_PLACES[placeIndex]
    }

    previousTreatments.push(direction.treatment)
    previousPlaces.push(normalizePlace(direction.place))
    result.set(scene.id, direction)
  })

  return result
}

// ─── Bloque SCENE PLAN — la inyección al redactor por escena ───

export interface PlanInjectionContext {
  // Presencia REAL de ESTA escena AHORA (puede haber cambiado tras planificar
  // — el bloque se adapta, nunca la contradice).
  present: boolean
  hasCharacters: boolean
  isStickmanStyle: boolean
  imageTextLanguage: string
  characterNames: string[]
  styleId?: string
}

function labelsPhrase(labels: string[] | undefined, language: string): string {
  if (labels && labels.length > 0) {
    const quoted = labels.map((label) => `"${label}"`).join(', ')
    return ` Its title/labels are EXACTLY these words, each drawn once, big, sparse and letter-perfect, written in ${language}: ${quoted} — do NOT invent, translate or add any other text.`
  }
  return ` YOU must write its exact short title and up to 3 label words yourself in THIS prompt, in quotes, in ${language} — short 1-4-word noun phrases, big and sparse; never leave any wording for the image generator to invent.`
}

// La ORDEN específica de esta escena para el redactor: tratamiento + lugar +
// emoción. Devuelve "" sin dirección.
export function buildScenePlanBlock(
  direction: SceneDirection | undefined,
  injection: PlanInjectionContext,
): string {
  if (!direction || !SCENE_TREATMENTS.includes(direction.treatment)) return ''

  const language =
    injection.imageTextLanguage.trim() || "the narration's own language"
  const names =
    injection.characterNames.filter(Boolean).join(' and ') || 'the character'
  const doll = injection.isStickmanStyle ? 'stickman doll ' : ''

  // Adaptar el tratamiento a la presencia REAL: si el plan pedía figuras y ya
  // no hay personaje acá, degrada a la alusión sin gente.
  let treatment = direction.treatment
  if (
    !treatmentAllowed(treatment, injection.present, {
      hasCharacters: injection.hasCharacters,
      isStickmanStyle: injection.isStickmanStyle,
      styleId: injection.styleId,
    })
  ) {
    treatment = 'metaphor'
  }

  const withCharacter = injection.present && injection.hasCharacters
  let order: string
  switch (treatment) {
    case 'action':
      order = withCharacter
        ? `${names} is MID-ACTION physically acting out this scene's narration — show the action itself, never a static pose.`
        : `Show the narrated action happening, mid-motion — never a static, empty frame.`
      break
    case 'diagram':
      // El diagrama es un artefacto de la ÉPOCA de la historia (era-neutral:
      // en un guion actual, la historia misma es present-day).
      order =
        (withCharacter
          ? `This scene is an EXPLANATORY DIAGRAM of what the narration explains, sharing the frame WITH ${names}: show ${names} presenting, pointing at or looking at a clear, simple explanation rendered in this video's own medium and art style — ${names}'s canonical identity fully intact.`
          : `This scene is a clear, simple EXPLANATORY DIAGRAM of what the narration explains, rendered in this video's own medium and art style.`) +
        ` The diagram is staged as an artifact of the story's own era and world — in a period story a hand-drawn or printed chart of that time with period lettering, never a modern presentation slide; in a present-day story an explanatory visual integrated INTO the scene's world (on a screen, board or surface present in the scene, with real depth and lighting), never a floating flat infographic on a plain background.` +
        labelsPhrase(direction.labels, language)
      break
    case 'metaphor':
      order =
        (withCharacter
          ? `Build a clear, concrete VISUAL METAPHOR or allusive scene AROUND ${names} that embodies this narration's idea — completely TEXT-FREE, ${names}'s canonical identity fully intact.`
          : `Build a clear, concrete VISUAL METAPHOR out of objects, nature or symbolic scenery that embodies this narration's idea — completely TEXT-FREE${injection.hasCharacters ? ', with NO people in it' : ''}.`) +
        ` Its objects and scenery belong to the story's era.`
      break
    case 'bubble':
      order = `Draw a THOUGHT BUBBLE above ${names}'s head containing ONE simple picture of what the narration says ${names} thinks, remembers, wants or fears — imagery only, NEVER any words, letters or text inside the bubble.`
      break
    case 'group':
      order = `This is a SOCIAL scene — the narration involves other people${
        direction.extras ? ` (${direction.extras})` : ''
      }: draw them as anonymous, generic ${doll}people who fit the moment${
        withCharacter ? `, interacting with ${names}` : ''
      } — EACH of them clearly DIFFERENT${
        withCharacter ? ` from ${names}` : ' from each other'
      } (different hair or a hat, clothing in a different colour), rendered in this exact same art style, never realistic humans and never a clone of anyone.`
      break
    case 'object':
      order = withCharacter
        ? `The focus is the KEY OBJECT/symbol of this narration, in clear close-up, with ${names} in frame relating to it (holding, watching or reaching for it).`
        : `The focus is the KEY OBJECT/symbol of this narration, in clear close-up — a plain inanimate object, no faces or limbs on it.`
      break
    case 'memory':
      order = withCharacter
        ? `This scene is a FLASHBACK/memory the narration evokes: stage the remembered moment clearly as a memory, with ${names}'s canonical identity fully intact.`
        : `This scene is a FLASHBACK/memory the narration evokes: stage the remembered moment clearly as a memory.`
      break
    case 'place':
    default:
      order = withCharacter
        ? `The location itself matters here: show it WITH ${names} as the focal subject, from a fresh angle — never an empty establishing shot.`
        : `The location itself matters here: show it with a clear focal subject in frame, from a fresh angle — never an empty establishing shot.`
      break
  }

  return `\n# SCENE PLAN — the director's decision for THIS scene (follow it)\nTREATMENT: ${order}\nSETTING: ${direction.place}. EMOTION: ${direction.emotion} — write the facial expression and body language matching this emotion explicitly in the prompt.\n`
}

// Frase de dirección para el FALLBACK DETERMINÍSTICO: a diferencia del bloque
// de arriba (instrucciones a un LLM redactor), esto va DIRECTO al generador
// de imágenes — frases descriptivas, no órdenes de redacción. Así una escena
// caída al respaldo conserva el tratamiento/lugar/emoción planificados.
export function directionPhraseForFallback(
  direction: SceneDirection | undefined,
  injection: {
    present: boolean
    hasCharacters: boolean
    characterNames: string[]
    isStickmanStyle: boolean
    styleId?: string
  },
): string {
  if (!direction || !SCENE_TREATMENTS.includes(direction.treatment)) return ''

  const names =
    injection.characterNames.filter(Boolean).join(' and ') || 'the character'
  const withCharacter = injection.present && injection.hasCharacters

  let treatment = direction.treatment
  if (
    !treatmentAllowed(treatment, injection.present, {
      hasCharacters: injection.hasCharacters,
      isStickmanStyle: injection.isStickmanStyle,
      styleId: injection.styleId,
    })
  ) {
    treatment = 'metaphor'
  }

  let phrase: string
  switch (treatment) {
    case 'action':
      phrase = withCharacter
        ? ` ${names} is shown MID-ACTION, physically performing what the narration describes — never standing still or posing.`
        : ` The narrated action is shown happening, mid-motion.`
      break
    case 'diagram': {
      const labels =
        direction.labels && direction.labels.length > 0
          ? ` Its only readable text are exactly these words, drawn once each, big and letter-perfect: ${direction.labels
              .map((label) => `"${label}"`)
              .join(', ')} — no other text anywhere.`
          : ` Drawn as a clean UNLABELLED schematic — shapes, arrows and icons only, no words.`
      phrase =
        (withCharacter
          ? ` The scene is a simple, clear explanatory diagram of what the narration explains, drawn on a surface or screen that belongs to the scene, in perspective with the scene's depth and lighting, with ${names} presenting or pointing at it.`
          : ` The scene is a simple, clear explanatory diagram of what the narration explains, drawn on a surface or screen that belongs to the scene, in perspective with the scene's depth and lighting.`) +
        labels
      break
    }
    case 'metaphor':
      phrase = withCharacter
        ? ` The scene is a clear visual metaphor built around ${names} that embodies the narrated idea, completely text-free.`
        : ` The scene is a clear visual metaphor of the narrated idea, built from objects, nature or symbolic scenery, completely text-free.`
      break
    case 'bubble':
      phrase = ` A thought bubble floats above ${names}'s head containing ONE simple picture of what ${names} thinks or remembers — imagery only, absolutely no words or letters inside the bubble.`
      break
    case 'group':
      phrase = ` The narration involves other people${
        direction.extras ? ` (${direction.extras})` : ''
      }: they appear as anonymous, generic ${
        injection.isStickmanStyle
          ? 'stickman dolls in this same simple drawing style (white round heads, stick limbs — never realistic humans)'
          : 'people who fit the moment'
      }, each clearly different${
        withCharacter ? ` from ${names}` : ' from each other'
      } (different hair or a hat, clothing in a different colour), never a clone of anyone.`
      break
    case 'object':
      phrase = withCharacter
        ? ` The focus is the key object of this narration in clear close-up, with ${names} in frame relating to it.`
        : ` The focus is the key object of this narration in clear close-up — a plain inanimate object.`
      break
    case 'memory':
      phrase = ` The scene is staged as a remembered moment — a flashback the narration evokes.`
      break
    case 'place':
    default:
      phrase = withCharacter
        ? ` The location matters here: it is shown with ${names} as the focal subject, from a fresh angle — never an empty establishing shot.`
        : ` The location matters here: it is shown with a clear focal subject in frame, never an empty establishing shot.`
      break
  }

  const emotion = direction.emotion?.trim()
  const place = direction.place?.trim()
  const tails: string[] = []
  if (place) tails.push(` Setting: ${place}.`)
  if (emotion)
    tails.push(
      withCharacter
        ? ` The dominant emotion is ${emotion} — ${names}'s facial expression and body language clearly show it.`
        : ` The mood of the scene is ${emotion}.`,
    )
  return `${phrase}${tails.join('')}`
}

// ─── Orquestación: dirigir un video completo ───

// ¿Hay escenas con texto sin dirección? Una dirección `provisional` (parche
// ciego por LLM caído) cuenta como FALTANTE: la próxima corrida re-dirige.
export function scenesNeedPlan(scenes: Scene[]): boolean {
  return scenes.some(
    (scene) =>
      (scene.text ?? '').trim().length > 0 &&
      (!scene.direction || scene.direction.provisional === true),
  )
}

export interface DirectorOptions {
  styleId: string
  isStickmanStyle: boolean
  characters: { name: string; description: string }[]
  imageTextLanguage: string
  signal: AbortSignal
  onLog?(message: string): void
}

// Conserva direcciones válidas; solo planifica las faltantes o provisionales.
export async function directScenes(
  llm: SceneLlm,
  scenes: Scene[],
  fullScript: string,
  options: DirectorOptions,
): Promise<Scene[]> {
  options.signal.throwIfAborted()
  const forPlan: DirectorScene[] = scenes
    .filter((scene) => (scene.text ?? '').trim().length > 0)
    .map((scene) => ({
      id: scene.id,
      text: scene.text,
      present: (scene.charactersPresent ?? []).length > 0,
    }))
  if (forPlan.length === 0) return scenes

  const planContext: DirectorPlanContext = {
    hasCharacters: options.characters.length > 0,
    isStickmanStyle: options.isStickmanStyle,
    styleId: options.styleId,
  }
  let plan = new Map<number, SceneDirection>()
  for (const scene of scenes) {
    if (scene.direction && !scene.direction.provisional)
      plan.set(scene.id, scene.direction)
  }
  const invalidIds = new Set(
    validatePlan(plan, forPlan, planContext).contentViolationIds,
  )
  const missing = forPlan.filter(
    (scene) => !plan.has(scene.id) || invalidIds.has(scene.id),
  )
  const systemPrompt = buildDirectorSystemPrompt({
    styleId: options.styleId,
    isStickmanStyle: options.isStickmanStyle,
    hasCharacters: planContext.hasCharacters,
    characterNames: options.characters.map((character) => character.name),
    imageTextLanguage: options.imageTextLanguage,
  })
  const size = Math.min(
    CATALOG_DIRECTOR_BATCH_SIZE,
    Math.max(
      DIRECTOR_MIN_BATCH_SIZE,
      Math.ceil(missing.length / DIRECTOR_TARGET_BATCHES),
    ),
  )
  const batches: DirectorScene[][] = []
  for (let index = 0; index < missing.length; index += size)
    batches.push(missing.slice(index, index + size))

  const results = await Promise.allSettled(
    batches.map(async (batch) => {
      const ids = batch.map((scene) => scene.id)
      const validate = (content: string) => {
        const parsed = parseDirectorPlan(content, ids)
        return (
          parsed.size === batch.length &&
          validatePlan(parsed, batch, planContext).contentViolationIds
            .length === 0
        )
      }
      const content = await llm.generate({
        systemPrompt,
        userPrompt: buildDirectorUserPrompt(fullScript, batch, {
          from: batch[0].id,
          to: batch[batch.length - 1].id,
          total: forPlan.length,
        }),
        jsonOnly: true,
        tier: 'balanced',
        maxOutputTokens: computeDirectorMaxTokens(batch.length),
        validate,
      })
      options.signal.throwIfAborted()
      if (!validate(content))
        throw new PipelineFailure(
          'catalog_prompts_incomplete',
          'scene director returned an incomplete plan',
        )
      options.onLog?.('scene director completed scene ids: ' + ids.join(', '))
      return parseDirectorPlan(content, ids)
    }),
  )
  options.signal.throwIfAborted()
  const rejected = results.find((result) => result.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const [id, direction] of result.value) plan.set(id, direction)
  }
  const validation = validatePlan(plan, forPlan, planContext)
  if (validation.contentViolationIds.length > 0)
    throw new PipelineFailure(
      'catalog_prompts_incomplete',
      'scene director could not plan all narrative fragments',
    )
  // Solo quedan reglas de secuencia, nunca lugares/emociones inventados por
  // ausencia de respuesta. Se preserva el contrato visual existente.
  if (!validation.ok)
    plan = patchPlanDeterministically(plan, forPlan, planContext)
  return scenes.map((scene) =>
    plan.has(scene.id) ? { ...scene, direction: plan.get(scene.id)! } : scene,
  )
}
