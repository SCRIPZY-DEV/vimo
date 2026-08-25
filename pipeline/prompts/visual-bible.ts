import type { VisualStyle } from './visual-styles.ts'

// Prompts de la biblia visual global del proyecto (port fiel de
// construirSystemPromptBiblia y generarContextoVisualGlobal de parser.ts del
// origen). La biblia se genera UNA vez por proyecto y se inyecta en cada
// prompt por escena para forzar consistencia. Texto en inglés verbatim.
// Browser-safe: cero APIs de Node.

// Marcador de versión de la biblia persistida (V3: suma la línea ERA al
// contrato). Si el archivo persistido no empieza con este marcador, el lector
// la regenera. Se despoja ANTES de inyectar la biblia en cualquier prompt.
export const BIBLE_VERSION_MARKER = '__BIBLE_FACTS_V3__'

// Tope de caracteres del guion que viaja en el user prompt de la biblia.
export const SCRIPT_EXCERPT_LIMIT = 6000

// Tope de caracteres de la biblia devuelta (el recorte lo aplica quien llama
// al LLM sobre el contenido ya limpio).
export const BIBLE_OUTPUT_LIMIT = 1200

// System prompt del escritor de la biblia visual (port verbatim de
// construirSystemPromptBiblia). `style` solo aclara que el estilo es FIJO y
// vive aparte; `referenceCharacters` son los personajes de referencia que la
// biblia tiene PROHIBIDO re-describir.
export function buildVisualBibleSystemPrompt(options: {
  style?: VisualStyle
  referenceCharacters?: { name: string; description?: string }[]
}): string {
  const { style, referenceCharacters } = options
  const styleHint = style
    ? `This world will be rendered separately in a FIXED "${style.name}" art style applied per scene; your job is ONLY to pin the factual look of the world so it stays identical across scenes, NEVER to choose, name or describe that art style. `
    : ''
  const names = (referenceCharacters ?? [])
    .map((character) => (character?.name || '').trim())
    .filter(Boolean)
  const referenceSection =
    names.length > 0
      ? `REFERENCE CHARACTERS — DO NOT DESCRIBE THEM: this video already has recurring character(s) with a FIXED canonical look owned by a separate block: ${names
          .map((name) => `"${name}"`)
          .join(
            ', ',
          )}. NEVER describe, re-describe or restyle them (no age, hair, face, build, outfit) — their look is not yours to write. And when the script's protagonist, narrator or a named story figure clearly IS one of them (the same person under a story name or a real name), do NOT create a second description for that figure either: state the correspondence by name only (e.g. 'the prince = "${names[0]}"') and move on. `
      : ''
  const realPublicFiguresRule =
    "REAL PUBLIC FIGURES — STYLIZED BUT RECOGNIZABLE: when the script names a real, recognizable person (a politician, an athlete, a celebrity), pin their most ICONIC public features ONCE — signature hairstyle and facial hair, famous kit/jersey and shirt number, visible tattoos, typical outfit and build (the REAL features of THAT person; state ONLY features you are CERTAIN of — a wrong detail like giving a famously bearded man a clean-shaven face breaks the resemblance, so when unsure OMIT the detail and let the name carry the identity) — so they render consistent and instantly recognizable in every scene, in the video's own art style. Never water them down into an anonymous stranger, and never invent private or demeaning attributes: only the public, iconic look. "
  return (
    'You are a continuity/world-bible writer for short-form narrated videos. ' +
    'Given a full Spanish narration script, produce a CONCISE English WORLD BIBLE (80-150 words) that lists the FACTS of this world so they stay IDENTICAL in every scene. ' +
    styleHint +
    referenceSection +
    realPublicFiguresRule +
    // Los ejemplos de la biblia son deliberadamente modernos: los ejemplos
    // viejos (aldea rústica) sembraban época antigua en guiones actuales.
    "Describe ONLY concrete, STYLE-NEUTRAL facts: the recurring characters (species, age, build, skin tone, HAIR color/length/style, facial hair, eyes, outfit and its colors, accessories) and the recurring places/objects, each pinned ONCE with concrete material, color and key features — so they look identical whenever they appear (e.g. 'Elena: an elderly woman with long grey hair in a loose bun, a beige cardigan over a brown dress'; 'Elena's apartment: a small bright flat with a mint-green kitchen wall and a street-facing window'). " +
    // La era exige un marcador EXPLÍCITO en las palabras del guion (gate E28
    // del origen: una fábula sin época no puede lockear estética antigua).
    "ERA — PRESENT DAY BY DEFAULT: state a non-present era ONLY when the script ITSELF explicitly places the story in another time IN ITS OWN WORDS — a dated year, a named century, or a named historical period (pharaohs, medieval Europe, the Wild West...); an unstated era is ALWAYS today — a contemporary, present-day world with modern buildings, interiors and objects. A fable, a moral tale, a fantasy world, a rural mood or an unstated setting is NOT an era: write 'ERA: present day' for ALL of those — the word 'timeless' is FORBIDDEN in the ERA line. NEVER invent a historical, rustic, pre-industrial or old-world setting just because the script is emotional, motivational, abstract or village-flavored. " +
    // Línea ERA machine-readable: PRIMERA línea, sobrevive el recorte a 1200
    // chars y el código la parsea.
    "FIRST LINE — MACHINE-READABLE ERA: your VERY FIRST output line is exactly 'ERA: <value>' on its own line — write 'ERA: present day' when the era is unstated or contemporary; otherwise the story's MAIN era as a short concrete phrase carrying the year or period the script states (e.g. 'ERA: 1912', 'ERA: medieval Europe', 'ERA: the age of the dinosaurs'). When the script explicitly spans eras (a historical story with a modern-day discovery or legacy section), the ERA line is the era where MOST of the story happens — never the modern epilogue. Then continue the bible text on the next line. " +
    'The bible pins how things LOOK, never what anyone is doing: do NOT freeze the protagonist into one pose, one action or one corner of a room, and do NOT pin one single time of day, weather or light level for the whole video. ' +
    "CRITICAL — describe WHAT things ARE, NEVER HOW they are rendered. Do NOT prescribe any art style, medium or technique, and do NOT use words like photorealistic, realistic, cinematic, painterly, illustration, cartoon, anime, render, 3D, film grain, photographic, oil painting, watercolor or concept art. Do NOT prescribe lighting, color grading or mood as a style (no 'golden hour', 'warm cinematic lighting', 'chiaroscuro', 'muted palette', 'soft shading') — mention light only if it is a fixed physical fact of a place (e.g. 'a room with a single small window'). The art style is owned entirely by a separate per-scene template; anything you say about style would CONFLICT with it and must be omitted. " +
    'Do NOT include camera angles, shot composition or per-scene action — only persistent world facts. ' +
    "CONTENT SAFETY: keep it safe-for-work — never describe gore, blood, wounds, weapons in use, corpses or sexual/nude content; convey any dark tone with neutral, non-graphic wording that won't trip image-generator safety filters. " +
    'Output ONLY the world bible text, no preamble, no bullet points, no quotes.'
  )
}

// User prompt de la biblia (port verbatim del de generarContextoVisualGlobal):
// el guion recortado a SCRIPT_EXCERPT_LIMIT.
export function buildVisualBibleUserPrompt(script: string): string {
  return `SCRIPT (in Spanish):\n"""\n${script.slice(0, SCRIPT_EXCERPT_LIMIT)}\n"""\n\nWrite the world bible now:`
}
