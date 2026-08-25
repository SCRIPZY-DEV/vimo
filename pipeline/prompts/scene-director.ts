import type { SceneTreatment } from '../types/scenes.ts'

// Prompts del DIRECTOR DE ESCENAS (ADR-0013; port fiel de las piezas de
// prompt de director_escenas.ts del origen). El director es UNA llamada LLM
// que lee el guion entero y asigna a cada escena un tratamiento visual +
// lugar + emoción. El texto en inglés de los prompts se copia VERBATIM: el
// vocabulario que ve el LLM sigue siendo el ESPAÑOL del origen ("accion",
// "diagrama", ...) y la lógica traduce su respuesta con
// SPANISH_TREATMENT_TO_ENGLISH. Browser-safe: cero APIs de Node.

// Vocabulario de tratamientos tal como lo emite/consume el LLM (verbatim del
// origen; NO es el union inglés persistido — ese es SceneTreatment).
export const DIRECTOR_TREATMENTS = [
  'accion',
  'diagrama',
  'metafora',
  'burbuja',
  'grupo',
  'objeto',
  'recuerdo',
  'lugar',
] as const

export type DirectorTreatment = (typeof DIRECTOR_TREATMENTS)[number]

// Traducción de la respuesta del LLM (vocabulario español del prompt) al
// union inglés del dominio persistido. Indexable por string: la respuesta
// cruda del LLM no viene tipada.
export const SPANISH_TREATMENT_TO_ENGLISH: Record<string, SceneTreatment> = {
  accion: 'action',
  diagrama: 'diagram',
  metafora: 'metaphor',
  burbuja: 'bubble',
  grupo: 'group',
  objeto: 'object',
  recuerdo: 'memory',
  lugar: 'place',
}

// El subconjunto que cuenta para la cuota de dinamismo (≥1 de cada 3): los
// tratamientos explicativos/alusivos que rompen la monotonía de "personaje
// parado en el mismo lugar".
export const EXPLANATORY_TREATMENTS: ReadonlySet<DirectorTreatment> = new Set([
  'diagrama',
  'metafora',
  'burbuja',
  'objeto',
  'recuerdo',
])

// Tratamientos que un ESTILO no admite nunca, esté quien esté en la escena.
// En fotorrealista (`normal`) el video tiene que leerse como metraje real: un
// diagrama rotulado y una viñeta de pensamiento son recursos gráficos que
// rompen esa ilusión.
const STYLE_VETOED_TREATMENTS: Readonly<
  Record<string, readonly DirectorTreatment[]>
> = {
  normal: ['diagrama', 'burbuja'],
}

// Tratamientos que este estilo NUNCA admite (vacío para los estilos dibujados).
export function vetoedTreatments(
  styleId: string | undefined,
): readonly DirectorTreatment[] {
  return (styleId && STYLE_VETOED_TREATMENTS[styleId]) || []
}

// Los tratamientos que este estilo SÍ admite (orden estable).
export function treatmentsForStyle(
  styleId: string | undefined,
): DirectorTreatment[] {
  const vetoed = vetoedTreatments(styleId)
  return DIRECTOR_TREATMENTS.filter((treatment) => !vetoed.includes(treatment))
}

// Contexto del plan (port de ContextoPlan).
export interface DirectorPlanContext {
  // ¿El proyecto tiene personajes de referencia?
  hasCharacters: boolean
  // ¿El estilo es el del muñeco (stickman)?
  isStickmanStyle: boolean
  // Estilo del video: hay tratamientos que un estilo no admite nunca.
  // Opcional; sin estilo, no hay vetos (comportamiento histórico).
  styleId?: string
}

// ¿Este tratamiento es legal para esta escena, dada la presencia y el
// contexto? (port de tratamientoPermitido — lo usa la composición del prompt
// y lo necesitará el validador cuando se porte la lógica).
export function isTreatmentAllowed(
  treatment: DirectorTreatment,
  present: boolean,
  context: DirectorPlanContext,
): boolean {
  // El veto por estilo manda sobre todo lo demás (incluida la presencia).
  if (vetoedTreatments(context.styleId).includes(treatment)) return false
  if (present) return true
  if (context.hasCharacters) {
    // Proyecto CON refs y el personaje NO está: la escena se dibuja SIN
    // personas (ADR-0011) — nada que exija figuras. "lugar" también queda
    // prohibido acá: sin sujeto natural permitido, el lugar salía VACÍO.
    return !['accion', 'grupo', 'burbuja', 'lugar'].includes(treatment)
  }
  // Proyecto SIN refs: en stickman hay figura genérica en cada escena (todos
  // los tratamientos sirven); en los demás estilos hay gente anónima solo si
  // la narración la implica, pero no hay NADIE fijo para una burbuja.
  if (context.isStickmanStyle) return true
  return treatment !== 'burbuja'
}

// Escena mínima que el director necesita (port de EscenaParaPlan).
export interface DirectorSceneInput {
  id: number
  text: string
  // ¿El personaje de referencia está presente acá? (lo decidió la frecuencia).
  present: boolean
}

// System prompt del director (port verbatim de construirSystemPromptDirector,
// con los mismos condicionales por estilo/personajes/idioma).
export function buildDirectorSystemPrompt(options: {
  styleId: string
  isStickmanStyle: boolean
  hasCharacters: boolean
  characterNames: string[]
  imageTextLanguage: string
}): string {
  const lang =
    options.imageTextLanguage.trim() || "the narration's own language"
  const names = options.characterNames.filter(Boolean)
  const whoActs = options.hasCharacters
    ? `the recurring main character${names.length > 1 ? 's' : ''} (${names.join(', ')})`
    : options.isStickmanStyle
      ? 'a generic anonymous figure (the implied narrator)'
      : 'anonymous people ONLY when the narration implies them'
  // El menú de tratamientos lo define el ESTILO: los vetados no se OFRECEN
  // (una regla "PROHIBIDO X" con ejemplos vívidos primea al modelo a producir
  // MÁS X; mejor quitarlos del menú).
  const allowed = treatmentsForStyle(options.styleId)
  const allows = (treatment: DirectorTreatment): boolean =>
    allowed.includes(treatment)
  const TREATMENT_DESCRIPTIONS: Record<DirectorTreatment, string> = {
    accion: `${whoActs} physically DOING / living the narrated beat, mid-action, never posing.`,
    diagrama: `the narration explains a fact, process, comparison or concept → a clear, simple explanatory diagram staged inside the story's world (on a surface, screen or object present in the scene), never a floating slide.`,
    metafora: `the narration is ABSTRACT (emotion, idea, opinion, life lesson) → a concrete VISUAL METAPHOR or allusive scene that embodies it. When the narration mentions the video's main location in a reflective line ("training alone", "at the gym"), prefer this over showing that location literally AGAIN.`,
    burbuja: `the narration says someone thinks, remembers, imagines, wants or fears something → a THOUGHT BUBBLE with ONE simple picture inside (never words).`,
    grupo: `the narration involves or clearly suggests OTHER people (interaction, social pressure, contrast, a crowd, being watched) → a social scene with anonymous extras.`,
    objeto: `one KEY OBJECT or symbol of the narration in close-up focus.`,
    recuerdo: `the narration looks back at the past → a flashback/memory scene.`,
    lugar: `the location itself is the point → show it WITH a clear focal subject, from a fresh angle. NEVER an empty establishing shot.`,
  }
  const treatmentsList = allowed
    .map((treatment) => `"${treatment}"`)
    .join(' | ')
  const treatmentDescriptions = allowed
    .map(
      (treatment) =>
        `    ${treatment.padEnd(8)} = ${TREATMENT_DESCRIPTIONS[treatment]}`,
    )
    .join('\n')
  const allowedExplanatory = allowed.filter((treatment) =>
    EXPLANATORY_TREATMENTS.has(treatment),
  )
  const explanatoryList = allowedExplanatory
    .map((treatment) => `"${treatment}"`)
    .join(', ')
  // Sustitutos para escenas sin figuras: explicativos permitidos que no
  // exijan gente. Se DERIVAN de la misma función que valida el plan, así el
  // prompt nunca nombra un tratamiento que el estilo no ofrece.
  const promptContext: DirectorPlanContext = {
    hasCharacters: options.hasCharacters,
    isStickmanStyle: options.isStickmanStyle,
    styleId: options.styleId,
  }
  const forbiddenWithoutCharacter = allowed.filter(
    (treatment) => !isTreatmentAllowed(treatment, false, promptContext),
  )
  const forbiddenWithoutCharacterList =
    forbiddenWithoutCharacter.map((treatment) => `"${treatment}"`).join(', ') ||
    `nothing in particular`
  const substitutesWithoutFigures =
    allowed
      .filter((treatment) =>
        isTreatmentAllowed(treatment, false, promptContext),
      )
      .map((treatment) => `"${treatment}"`)
      .join(', ') || `"metafora"`

  return `You are the VISUAL DIRECTOR of a narrated video. You read the FULL script and the list of scenes (each scene = one narration fragment, with a flag saying whether the recurring character appears there — that flag is FIXED, you NEVER change it) and you assign each scene its visual treatment, so the finished video is dynamic and professional — never a monotonous slideshow of the same place.

PRIORITIES, in strict order (violating #1 to satisfy #3 is a defect):
1. COHERENCE with the narration — every treatment must represent EXACTLY what its fragment narrates. NEVER invent facts, actions, places, characters or emotions the narration does not state or clearly imply.
2. AUDIO-IMAGE SYNC — the viewer hears this fragment while seeing this image; the image must belong to THIS moment, not to another part of the script.
3. VISUAL VARIETY without excess — alternate treatments and settings so no two stretches of the video look the same.

For EVERY scene you output exactly one entry:
- "tratamiento": one of ${treatmentsList}
${treatmentDescriptions}
- "lugar": a SHORT English phrase naming the setting of the scene (e.g. "the gym entrance at dawn", "a lone road"${
    allows('diagrama') ? ', "a chart on the office whiteboard"' : ''
  })${
    allows('diagrama')
      ? '; for "diagrama" the lugar names the real place in the story\'s world where the explanation lives, never a layout'
      : ''
  }. Follow the narration when it moves; NEVER park the whole video in one room — when neighbouring fragments linger in the same place, move to a different area of it or cut away to an allusive setting.
- "emocion": a SHORT English word/phrase for the dominant emotion of THIS fragment (worried, relieved, determined, dejected, hopeful, nostalgic...). Read it from the narration.
- "extras" (optional): for "grupo", a SHORT English description of who else appears (always anonymous, generic people).
${
  allows('diagrama')
    ? `- "rotulos" (optional): for "diagrama" ONLY — the EXACT short title/label words (1-4 words each, at most a title + 3 labels), written in ${lang}. These exact words will be drawn in the image; never sentences, never the narration itself.`
    : `- This video is LIVE-ACTION footage: every scene is a real moment captured by a camera inside the story's world. Explanatory beats are carried by what the shot SHOWS — the object, the gesture, the consequence — not by graphics.`
}

ANTI-MONOTONY CONTRACT (hard rules your plan must satisfy — a plan that breaks them gets rejected):
- At least 1 of every 3 scenes must be explicative/allusive (${explanatoryList}), INTERLEAVED across the whole video — never clumped at the end. Even when the character appears in every scene, these treatments still happen WITH the character in frame (inside the metaphor, holding the key object, living the memory).
- Never assign the same "lugar" to more than 2 consecutive scenes, and never repeat the same "tratamiento" more than 2 times in a row (no repetir; the monotony we are killing is the whole point).
- Scenes where the character flag is OFF must NOT get ${forbiddenWithoutCharacterList}${
    options.hasCharacters
      ? ' (those scenes are drawn with NO people at all, and a location with nobody in it renders as an EMPTY establishing shot — banned)'
      : ''
  } — use ${substitutesWithoutFigures} there.
- Every scene gets a non-empty "lugar" and "emocion".

OUTPUT — STRICT JSON ONLY, no prose, no markdown fences, exactly this shape:
{"escenas":[{"id":1,"tratamiento":"accion","lugar":"...","emocion":"..."}, ...]}
One entry per scene id given, no ids invented, no ids skipped.`
}

// User prompt del director (port verbatim de construirUserPromptDirector).
// Videos largos: el plan se pide por LOTES para que la salida nunca se
// acerque al tope de tokens; `batch` anota qué tramo se está dirigiendo.
export function buildDirectorUserPrompt(
  fullScript: string,
  scenes: DirectorSceneInput[],
  batch?: { from: number; to: number; total: number },
): string {
  const list = [...scenes]
    .sort((a, b) => a.id - b.id)
    .map(
      (scene) =>
        `${scene.id} [character:${scene.present ? 'YES' : 'NO'}] ${(
          scene.text || ''
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 220)}`,
    )
    .join('\n')
  const batchNote =
    batch && batch.total > scenes.length
      ? `\n\nNOTE: this video has ${batch.total} scenes in total; you are planning ONLY scenes ${batch.from}-${batch.to} in this batch (apply the same anti-monotony rules within the batch).`
      : ''
  return `FULL SCRIPT (for context — the narration the viewer hears):\n"""\n${fullScript.slice(0, 6000)}\n"""\n\nSCENES (id [character flag] narration fragment):\n${list}${batchNote}\n\nWrite the JSON plan now:`
}

// Tamaño máximo del LOTE que se le pide al director en UNA llamada. Videos
// más largos se dirigen en varios lotes secuenciales (port de LOTE_DIRECTOR).
export const DIRECTOR_BATCH_SIZE = 80

// Presupuesto de tokens de salida del plan: crece con N (acotado al lote).
// 150 tok/escena con medición real; 80 escenas ≈ 12.400 → cap 13k. (Port
// exacto de calcularMaxTokensDirector.)
export function computeDirectorMaxTokens(sceneCount: number): number {
  const scenesInBatch = Math.min(sceneCount, DIRECTOR_BATCH_SIZE)
  return Math.min(13000, Math.max(1500, 400 + scenesInBatch * 150))
}
