// Bloques textuales que componen el user prompt por escena del redactor de
// prompts de imagen (port fiel de los bloques de parser.ts del origen). Este
// archivo reúne SOLO texto y su composición; la lógica que decide cuándo se
// inyecta cada bloque (sanitizado, dedupe, topes de caracteres, reintentos)
// se porta aparte. Texto en inglés verbatim. Browser-safe: cero APIs de Node.

import { extractComplexionClause } from '../utils/character-complexion.ts'
import { REFERENCE_PERSON_ANCHOR } from './character-reference.ts'

// Ventana de contexto local por escena: ~1600 chars de narración alrededor de
// la escena actual (port de VENTANA_MAX_CHARS).
export const CONTEXT_WINDOW_MAX_CHARS = 1600

// Cláusula de anonimato CONDICIONAL que se anexa a TODO prompt final: extras
// anónimos; solo la figura pública nombrada conserva su look icónico. El
// substring "fictional, anonymous individ" es la clave de dedupe (port de
// CLAUSULA_ANONIMATO).
export const ANONYMITY_CLAUSE =
  "Background and incidental people are fictional, anonymous individuals with ordinary generic faces. ONLY a real public figure that this prompt explicitly names or describes keeps their recognizable, iconic public appearance, rendered in this video's own art style."

// Cláusula dura de TEXTO-EN-IMAGEN anexada a TODO prompt final (language-
// agnostic). Dedupe: el substring "the narration is spoken, not written"
// (port de CLAUSULA_IDIOMA_TEXTO).
export const IMAGE_TEXT_LANGUAGE_CLAUSE =
  'Do NOT print the narration onto the image and do NOT add any caption, subtitle, floating title, heading, banner or watermark — the narration is spoken, not written. The ONLY readable text allowed anywhere in the image are the exact words quoted in this prompt (if any), each drawn at most once, big and letter-perfect, in the exact language and spelling they are quoted in — never translated to English and never re-lettered in another language or alphabet. If this prompt quotes no such words, the image carries NO readable text of any kind — no titles, no labels, no signs, no posters with words, no lettering, in ANY language.'

// Cláusula de DIAGRAMA DIEGÉTICO para escenas con tratamiento "diagrama" sin
// PERIOD LOCK. Dedupe: "diegetic diagram: stage this explanation" (port de
// CLAUSULA_DIAGRAMA_INMERSIVO).
export const IMMERSIVE_DIAGRAM_CLAUSE =
  "DIEGETIC DIAGRAM: stage this explanation inside the story's world, drawn on a surface or object present in the scene (a screen in a modern story; a wall, board, paper or crafted object in any era) with real depth and lighting; never a flat floating chart on a plain background nor a presentation-slide layout; labels keep the exact quoted words; a staging explicitly requested in this prompt wins."

// Variante para estilos FOTORREALISTAS: el diagrama es un OBJETO FÍSICO
// fotografiado (port de CLAUSULA_DIAGRAMA_INMERSIVO_FOTO).
export const IMMERSIVE_DIAGRAM_PHOTO_CLAUSE =
  "DIEGETIC DIAGRAM: stage this explanation as a REAL PHYSICAL OBJECT photographed inside the scene — printed paper, a chalkboard with real chalk, an engraved or painted panel, an object arranged on a surface — lying in the scene's own space with real lighting and real material texture; never flat vector art, never digital graphic design, never a chart floating on a plain background nor a presentation-slide layout; its lettering stays sharp and fully legible; labels keep the exact quoted words; a staging explicitly requested in this prompt wins. Photographed, photorealistic, documentary realism."

// Addendum de MEDIO para historias de época en estilo fotorrealista (ahí
// manda el PERIOD LOCK y la cláusula diegética no se anexa) (port de
// CLAUSULA_DIAGRAMA_FOTO_EPOCA).
export const IMMERSIVE_DIAGRAM_PHOTO_PERIOD_CLAUSE =
  'DIAGRAM MEDIUM: that period artifact is a REAL PHYSICAL OBJECT photographed in the scene, with real material texture and sharp legible lettering — never flat vector art nor digital graphic design.'

// Tratamiento CONCEPTUAL del escenario stickman: estética storybook cálida
// ilustrando lo narrado, SIN muñeco/figura (port de STICKMAN_CONCEPTO_*).
export const STICKMAN_CONCEPT_PROLOGUE =
  "A warm, cozy hand-drawn storybook illustration in the SAME colorful, soft-shaded children's-book style as the rest of this video: soft digital brush texture, gentle clean outlines, layered depth, a warm earthy palette of wood browns, cream, terracotta and amber with muted green accents, and cozy golden light from one main source casting soft shadows. It clearly ILLUSTRATES the thing the narration describes — a place, an object, a named artwork or landmark, or a simple friendly diagram that explains a concept — drawn so the idea is instantly clear, everything drawn as it belongs to the story's own world and era (in a story set in another time — prehistory, an ancient or historical period — nothing modern appears: no modern rooms, whiteboards, screens, presenters or present-day objects), with absolutely NO stickman doll, NO character, NO person and NO figure of any kind."

export const STICKMAN_CONCEPT_STYLE_BASE =
  "Cozy children's-storybook illustration of the described subject (a place, object, artwork/landmark, or an explanatory diagram of the concept), warm and colorful, clearly drawn with soft shading and gentle golden light, faithful to the story's era (never modern objects, devices or graphic design in a story set in another time), well composed and matching the other scenes' style exactly. NO people, NO doll, NO figure of any kind — just the thing being illustrated."

// Rótulos exactos-o-nada: si la SCENE trae palabras citadas → SOLO esas; si
// no trae ninguna → imagen completamente libre de texto.
export const STICKMAN_CONCEPT_EXACT_TEXT =
  ' The ONLY readable text allowed in the image are the exact words quoted in this prompt, drawn once each, letter-perfect, in the exact language and spelling they are quoted in — do NOT invent, translate, expand or add ANY other text, label, caption, heading or signage.'

export const STICKMAN_CONCEPT_TEXT_FREE =
  ' COMPLETELY TEXT-FREE (critical): this image contains NO readable text of any kind, in ANY language or alphabet — no words, letters, numbers, labels, captions, titles, banners, posters or signage anywhere; the descriptive wording of this prompt is scene description, NEVER text to draw.'

// Bloque de seguridad de contenido inyectado en TODO userPrompt de generación
// de prompts de imagen (port de BLOQUE_SEGURIDAD_PROMPT).
export const PROMPT_SAFETY_BLOCK = `# REAL PEOPLE, BRANDS & SAFETY (mandatory — overrides every other instruction)
- NAMED PUBLIC FIGURES — STYLIZED BUT RECOGNIZABLE: when the narration names a real public figure (an athlete, a politician, a celebrity), depict THAT person rendered in this video's art style and INSTANTLY RECOGNIZABLE: write their name AND their most iconic public features in the prompt — <signature hairstyle and facial hair, famous team kit and shirt number, visible tattoos, typical outfit, build> (write the REAL features of THAT person; never copy features from another person or from an example). If the GLOBAL VISUAL CONTEXT pins their look, copy it exactly so they stay identical across scenes. Keep the depiction respectful and true to their public image.
- EVERYONE ELSE IS ANONYMOUS: any person the narration does NOT name — extras, crowds, background people — is an anonymous, fictional generic who does NOT resemble any real, recognizable person. For teams or national squads without a named star, depict UNNAMED players identified only by kit colors and setting; do not invent or insert famous players the script never names.
- NEVER write a real brand, logo, trademark or product name. Use a generic equivalent — e.g. "a generic cola can", "a plain smartphone", "an unbranded sports car".
- NEVER depict graphic violence, gore, wounds, blood, corpses, weapons in use, or sexual/nude content. Convey any dark or intense tone ONLY through atmosphere, lighting, palette and body language — never literally.
Staying within the image generator's content policy still matters: be faithful to the role, action and mood — never to a brand. A named public figure is drawn stylized-but-recognizable as above.`

// Bloque que fija cuándo se permite texto dentro de la imagen y su idioma
// (port de bloqueIdiomaTextoEnImagen). `languageName` = nombre en inglés del
// idioma del guion; "" → el LLM lo infiere de la narración.
export function buildImageTextLanguageBlock(languageName: string): string {
  const language = (languageName || '').trim()
  const target = language
    ? `in ${language} (the language this video's script is written in)`
    : `in the SAME LANGUAGE as this video's narration / script`
  const onlyLanguage = language
    ? `ONLY in ${language}`
    : `ONLY in the narration's own language`
  const inLanguage = language ? `in ${language}` : `in the narration's language`
  return `\n# IN-IMAGE TEXT — WHEN ALLOWED + LANGUAGE (mandatory)
DEFAULT IS A TEXT-FREE IMAGE (critical): this is a scene of a NARRATED video — the narration is SPOKEN over it, so any wording stamped on the picture that repeats or summarizes the narration is a DEFECT. NEVER print the narration text onto the image; NEVER add a caption, subtitle, quote box, floating title, heading, banner or watermark with the narrated words or a summary of them. Readable text is allowed ONLY in two cases: (1) it PHYSICALLY exists inside the scene itself (a shop sign, a wall poster, a phone/computer screen, a product label, a book cover the scene actually shows), or (2) this image is explicitly an explanatory diagram/infographic (see ESSENTIAL TEXT below). If neither case applies, the image must contain NO readable text at all.
Keep the image PROMPT itself written in English as required. BUT any readable text that actually appears RENDERED INSIDE the image — signs, posters, banners, billboards, shop or street names, phone or computer screens, app interfaces, labels, packaging, book / newspaper / magazine titles, graffiti, handwritten notes, on-screen captions — MUST be written ${target}, exactly as a native speaker would write it, and NOT translated to English. Only this literal in-image lettering follows that language; every other word of the prompt stays in English. If a scene needs no readable text, do not invent any.
IMPORTANT — quote that on-image text ONLY in its real language and NOWHERE its English/translated version: write it once, in quotes, in the right language, and do NOT also write an English name or English translation of it anywhere in the prompt. (For a Spanish script: if a shop sign says "Panadería", write the sign as "Panadería" — never as "a Bakery sign" and never "a Bakery sign that reads 'Panadería'".) The image generator copies onto the image whatever text it finds in the prompt, so ANY English version you write will wrongly appear printed in the picture.
NO OTHER LANGUAGE OR ALPHABET (critical): every readable letter that ends up drawn in the image must be ${onlyLanguage}. NEVER render in-image text in a different language or writing system than the script — NO Hindi or Devanagari, NO Chinese / Japanese / Korean characters, NO Arabic, NO Cyrillic, NO Thai, NO Greek script — unless the script itself is written in that language. This rule ALSO governs any decorative wording the art style adds on its own initiative: a title or heading, a name banner, a scroll, a caption box, a plaque, a watermark, a stamp — all of it counts as in-image text and MUST obey this language. Do NOT add a decorative title or caption in another language as ornament.
ESSENTIAL TEXT IS REQUIRED AND MUST BE CORRECT (never blank): ONLY if this image is an explanatory DIAGRAM or INFOGRAPHIC with labelled parts — a normal narrated scene is NEVER "explanatory" just because the narration explains something; the scene block decides when a diagram is justified — it MUST show its title and labels, and YOU must write those exact, correctly-spelled words here ${inLanguage}, in quotes, naming every part. Titles and labels are SHORT noun phrases of 1-4 words that NAME the topic or a part — NEVER a full sentence and NEVER the narration's own sentence(s): if the only "title" you can think of is the narrated sentence, this image is NOT a diagram — make it a text-free scene instead. Do NOT leave a genuine diagram blank or unlabelled, and never label it in another language: supply the wording yourself so the correct ${language || 'script-language'} text renders on the image.
INCIDENTAL TEXT — blank beats wrong: ONLY for non-essential decorative lettering the scene does not depend on (a faraway background sign, a random poster) may you leave that surface blank when you cannot spell it ${inLanguage}. Blank is acceptable ONLY there — never as a substitute for an explanatory image's required text, and NEVER replaced by text in another language. The order of preference everywhere is: correct ${language || 'script-language'} text first; blank only for incidental text; foreign-language text never.\n`
}

// Bloque DURO por escena para UN personaje de referencia presente (port de
// bloquePersonajeObligatorio). Fija la apariencia canónica como restricción
// inviolable; el pedido/narración solo definen acción y lugar.
export function buildMandatoryCharacterBlock(
  name: string,
  description: string,
  // true cuando la escena se regenera por un PEDIDO EXPLÍCITO del usuario.
  isUserRequest = false,
  // true SOLO cuando el estilo del video usa el muñeco (pov_stickman).
  isStickmanStyle = false,
  // Idioma del guion para los rótulos del visual explicativo.
  imageTextLanguage = '',
  // Estilos fotorrealistas: la orden explicativa va en su variante inmersiva.
  isPhotorealistic = false,
): string {
  const n = (name || '').trim()
  const d = (description || '').trim()
  if (!n) return ''
  // SIN descripción el personaje es «con foto» (ADR-0033): el redactor no ve
  // la foto, así que cualquier rasgo físico que escriba es inventado y puede
  // contradecirla (salía blanco un personaje moreno). Stickman queda igual: ahí
  // el personaje es el muñeco y no se redacta como persona.
  const looksComeFromPhoto = !d && !isStickmanStyle
  const appearance = d
    ? `"${d}"`
    : looksComeFromPhoto
      ? `(${n}'s look comes from a REFERENCE PHOTO that is attached to the image request and that YOU CANNOT SEE. In the prompt, write ${n} as ${n} (${REFERENCE_PERSON_ANCHOR}) the first time ${n} is mentioned, and NEVER write any physical trait for ${n} — no skin tone, ethnicity, face, hair, eyes, age or build: anything you invent can contradict the photo. Write ONLY ${n}'s action, facial expression, body language, framing and the clothing the narration calls for.)`
      : `(keep ${n}'s established design exactly)`
  const traits =
    'species, body, face, skin tone, HAIR (exact color, length and style), facial hair, eyes, outfit, colors and accessories'
  // Rama PELADO bifurcada EN CÓDIGO: si la descripción canónica es
  // explícitamente pelada, se emite una variante sin ejemplo de pelo.
  const isCanonicallyBald =
    /\b(bald|shaven|shaved|hairless|calv[oa]|rapad[oa]|pelad[oa])\b/.test(
      d.toLowerCase(),
    )
  const hairInSimpleStyle = isCanonicallyBald
    ? ` BALD / HAIRLESS HEAD IS CANONICAL (critical): ${n}'s canonical look has NO hair — draw ${n}'s head bald/bare (or covered ONLY by the canonical headwear if ${n}'s description includes one) and NEVER invent, add or attach ANY hair to it, in this or any other phrase; never copy hair wording from any example or other character. ${n}'s OTHER head features are just as mandatory: if the canonical look includes FACIAL HAIR (a beard, a mustache), glasses or a headdress, then EVERY SINGLE TIME you mention ${n}'s head you MUST attach those exact canonical features IN THE SAME PHRASE — ${
        isStickmanStyle
          ? `write it as "round white head with <${n}'s exact canonical facial hair / glasses / headwear>"`
          : `write ${n}'s head together with <${n}'s exact canonical facial hair / glasses / headwear>, rendered naturally in this video's own art style`
      } — they are permanent, non-removable parts of the head, never omitted, simplified or swapped in any scene. Being bald never removes a canonical beard, mustache or headdress.`
    : isStickmanStyle
      ? ` HAIR IS MANDATORY AND INSEPARABLE FROM THE HEAD (critical for this doll-style video that uses a round, blank, white head): read ${n}'s canonical description above. If it includes HAIR, then EVERY SINGLE TIME you mention ${n}'s head you MUST attach that exact hair to it IN THE SAME PHRASE — write it as "round white head WITH ${n}'s <exact hair: color, length, style> on top" (for example "round white head with long grey hair on top"). Treat the hair as a permanent, non-removable part of the head: never write or draw the head without immediately adding the hair, never leave it bald or bare, and never replace the hair with a hat, headscarf, bandana or hood unless ${n}'s canonical look explicitly includes one. ONLY if ${n} is explicitly described as bald or shaven may the head stay hairless. Apply the same rule to any other distinctive head feature ${n} has (beard, glasses).`
      : ` HAIR IS MANDATORY AND INSEPARABLE FROM THE HEAD: read ${n}'s canonical description above. If it includes HAIR, then every time you describe ${n}'s head you MUST attach that exact hair (color, length and style) in the same phrase, rendered naturally in this video's own art style. Never leave ${n} bald or bare-headed, and never replace the hair with a hat, headscarf, bandana or hood unless ${n}'s canonical look explicitly includes one. ONLY if ${n} is explicitly described as bald or shaven may the head stay hairless. Apply the same rule to any other distinctive head feature ${n} has (beard, glasses).`

  // TONO DE PIEL: mismo candado duro que el pelo. Los generadores rellenan con
  // piel clara cuando el prompt no la nombra, y el redactor la soltaba en
  // algunas escenas. Nunca en stickman: ahí escribir la piel dibuja un humano.
  const complexion = isStickmanStyle ? '' : extractComplexionClause(d)
  const skinToneLock = complexion
    ? ` SKIN TONE IS MANDATORY IN EVERY SCENE: ${n}'s canonical look states ${complexion} — write that exact skin tone IN THE SAME PHRASE that introduces ${n}, in every prompt, even in wide shots, silhouettes against the light, night scenes or partial framings. Never lighten it, darken it, leave it out or replace it with a vague word: image generators default to a light-skinned person whenever the prompt does not name the skin tone.`
    : ''

  // MUÑECO, NO HUMANO REAL: prohibición de redactar al personaje como humano
  // en estilo stickman (evita que el generador dibuje a AMBOS).
  const dollNotHuman = isStickmanStyle
    ? ` ${n} IS DRAWN AS THE DOLL, NOT AS A REAL HUMAN: this is a doll-style video, so ALWAYS refer to ${n} as "a stickman doll" (round white head with the hair on top, single-line arms and legs, white gloves, rounded shoes) wearing ${n}'s canonical outfit — that is HOW ${n} stays consistent between scenes, NOT by describing a realistic person. NEVER carry ${n}'s real-human wording into the prompt: do not write "a man" or "a woman", an age like "in his late 20s" or "in her 30s", "clean-shaven face", a realistic "lean / athletic / muscular / slim build", a skin tone, or any photoreal face or body description for ${n} — those words make the generator draw a REAL person beside or instead of the doll and break the style (the exact trap the extras have). Translate every such human trait into the doll form: keep ONLY ${n}'s hair, outfit and its colors, and any distinctive mark (a scar, glasses, a beard) drawn simply on the doll's round white head.`
    : ''

  // FONDO EN EL ESTILO: refuerzo duro anti-fondos semi-fotorrealistas, solo
  // en el estilo con muñeco.
  const drawnSetting = isStickmanStyle
    ? ` THE SETTING IS DRAWN, NEVER PHOTOGRAPHIC (critical): the background and every piece of furniture or decor around ${n} are rendered in the SAME warm hand-drawn storybook cartoon look as the rest of this video — soft shading, clean outlines, colorful — NEVER photorealistic, semi-realistic or photographic, no matter how luxurious, dark or solemn the described interior is; a realistic-looking room behind the doll is a style-mixing DEFECT.`
    : ''

  if (isUserRequest) {
    // Mismo candado duro que el camino automático, adaptado al modo
    // pedido-usuario: la identidad es innegociable; el pedido solo define el
    // contenido de la toma.
    return `\n# MANDATORY CHARACTER — non-negotiable, overrides the user request ("${n}")\nThis scene FEATURES the recurring main character "${n}". ${n} MUST appear, drawn with this EXACT canonical appearance:\n${appearance}\nThis identity is FIXED and OVERRIDES the user request: even if the request describes a different place, a different subject or does not mention ${n} at all, ${n} MUST still appear with the full canonical identity above. The user request only decides WHAT ${n} is doing, WHERE the scene happens and WHAT ELSE appears in the image — never ${n}'s look and never whether ${n} appears. Never change, recolor, simplify, age-down, or omit ${n}'s ${traits}. If the requested action seems to clash with the outfit (fishing, swimming, sleeping...), KEEP the outfit anyway. If the request centers on something else (an object, a place, a diagram), draw ${n} WITH it — presenting, pointing at or interacting with it — NEVER omit ${n}.${hairInSimpleStyle}${skinToneLock}${dollNotHuman}${drawnSetting}\n`
  }

  // SETTING que sigue a la narración + permiso de visual explicativo (con
  // rótulos escritos, acotados y grandes) o su variante inmersiva.
  const visualLanguage =
    (imageTextLanguage || '').trim() || "the narration's own language"
  const settingAndVisuals = isPhotorealistic
    ? ` ${n}'s SETTING follows THIS scene's narration: when the narration moves to a different place or topic, place ${n} in THAT new setting — do not keep one location for the whole video. When the narration here explains a fact, an object, a process or a comparison, ${n} is SHOWN WITH IT in the real world — handling the object, standing beside the two things being compared, reacting to the visible result — never presenting a graphic. The moment stays photographable and completely TEXT-FREE, with ${n}'s canonical identity fully intact.`
    : ` ${n}'s SETTING follows THIS scene's narration: when the narration moves to a different place or topic, place ${n} in THAT new setting — do not keep one location for the whole video. EXPLANATORY VISUALS ARE WELCOME: when the narration here explains a specific fact, object, artwork, process or concept, make THAT explanatory visual share the focus WITH ${n} — a named artwork or landmark, a clear labelled diagram, a reference illustration — and draw ${n} presenting, pointing at or looking at it, with ${n}'s canonical identity fully intact. If that visual is a diagram, YOU must write its exact title and label words yourself in THIS prompt, in quotes, in ${visualLanguage} — short noun phrases of 1-4 words each, NEVER the narration's sentence — and do NOT leave any wording for the image generator to invent (without the words it makes up labels in the WRONG language). Keep the wording SPARSE and LARGE: at most a short title plus 3 labels, described as big, clearly readable text — NEVER "small text labels", tiny lettering or dense annotations (small in-image text always renders as unreadable scribbles). If the diagram appears on a small object or screen inside the scene (a tablet, a phone, a monitor), write ONLY the title and NO labels.`
  // DIRECCIÓN DE ESCENA: el personaje ACTÚA lo narrado, metáfora solo para
  // narración abstracta, burbuja de pensamiento sin texto y encuadre libre.
  const sceneDirection = `\n# SCENE DIRECTION — ${n} ACTS, never poses\n${n} is the story's narrator-protagonist and must be ACTING OUT this scene's narration — physically DOING the action, feeling the emotion or living the moment described right here — NEVER just standing still, posing or facing the camera unless the narration itself says so. That ban targets the accidental default pose ONLY — a deliberate EXPRESSIVE SHOT is NOT posing and OVERRIDES that ban: a waist-up or face close-up of ${n} with the narrated emotion clear on the face and in the body language — even looking straight at the viewer, like a narrator addressing the audience — is welcome and professional; what is banned is the emotionless full-body statue. When the narration speaks TO the viewer or about them ("you", "maybe you have seen..."), prefer that direct-address shot and write the words "looking directly at the viewer" explicitly in the prompt. In EVERY scene, write ${n}'s facial expression and body language explicitly in the prompt (worried, relieved, determined, dejected, hopeful...), matching THIS narration's emotion — a neutral face on an emotional line is a defect. Write ${n}'s ACTION in the SAME sentence that describes ${n}'s appearance — never default to "standing alone" or "standing in the center": if the narration has ANY physical beat (arriving, training, lifting, leaving, being watched), show ${n} MID-ACTION doing it; if it has none, use the metaphor or the thought bubble instead. When the narration is ABSTRACT (an emotion, an idea, an opinion, a life lesson) with no physical action to show, stage a clear VISUAL METAPHOR or allusive scene built AROUND ${n} (e.g. "going your own way" → ${n} walking alone down an open road at dawn), with ${n}'s canonical identity fully intact — use a metaphor ONLY for abstract narration; when the narration describes a concrete action, show that action itself. When the narration says ${n} thinks, remembers or imagines something, you may draw a THOUGHT BUBBLE above ${n} containing ONE simple picture of that thought — imagery only, NEVER any words, letters or text inside the bubble. The bubble is also welcome as an EXPLANATORY device: to CONTRAST what others assume about ${n} with what is actually true, or to show what ${n} wants, misses or rejects — always ONE simple picture, never words. FRAMING IS FREE: ${n} does NOT need to appear full-body in every scene — close-ups of the face, profile shots, over-the-shoulder or partial framings are welcome; in them ${n}'s canonical identity applies to every part that IS visible, and the crop is NEVER an excuse to change or omit a visible trait. Never repeat the same spot of the location with the same pose in consecutive scenes — change ${n}'s action, position and framing every time. Do not spend every scene inside the same room: when neighbouring narration lingers in one place, move ${n} to a different area of it (the entrance, the doorway, the street outside, a corner) or use the allusive cut-away — the video must breathe.`
  return `\n# MANDATORY CHARACTER — non-negotiable, overrides everything below\nThis scene FEATURES the recurring main character "${n}". ${n} MUST appear, drawn with this EXACT canonical appearance:\n${appearance}\nThis identity is FIXED and OVERRIDES the user request, the narration and the global context. The request/narration only set ${n}'s ACTION, POSE and SETTING for this moment — never ${n}'s look. Never change, recolor, simplify, age-down, or omit ${n}'s ${traits}. If the requested action seems to clash with the outfit (fishing, swimming, sleeping...), KEEP the outfit anyway. Make ${n} the clear focus rendered with this identical design so it stays perfectly consistent with every other scene.${sceneDirection}${settingAndVisuals}${hairInSimpleStyle}${skinToneLock}${dollNotHuman}${drawnSetting}\n`
}

// Bloque para proyectos SIN NINGÚN personaje de referencia en estilo
// stickman: figura genérica del estilo en CADA escena, sin consistencia
// entre escenas (port de bloqueProtagonistaGenerico).
export function buildGenericProtagonistBlock(): string {
  return `\n# NO RECURRING CHARACTER — show a generic figure in EVERY scene
This video has NO specific, named or recurring character. Even so, EVERY scene must show ONE single generic, anonymous figure — the implied narrator/protagonist of the story (or a fitting generic person for the moment) — present in the setting and naturally doing, watching or reacting to what the narration describes here.
- Keep the style's FIXED blocks (the PROLOGUE and the STYLE block) WORD-FOR-WORD: they describe the FIGURE and the drawing medium to render in. Draw that figure, in this exact art style.
- The figure does NOT need to stay consistent between scenes — it can look different each time (different clothes, pose, age, framing). There is NO identity to preserve, so do not worry about matching previous scenes.
- DEFAULT: place the figure inside the setting, interacting with, holding or looking at what the narration describes — the frame is normally never just the location alone. EXCEPTION: when the narration explains a specific fact, object, artwork, process or concept that is clearer as an explanatory visual (a named artwork or landmark, a simple labelled diagram, a reference image), make THAT visual the focus, ideally with the figure in frame presenting, pointing at or looking at it; only if the figure genuinely does not fit may the explanatory visual stand alone for this one scene. If that visual is a diagram, its title/labels are short 1-4-word noun phrases — never the narration's sentence stamped on the image. The same goes for a COMPARISON of named entities (two ships or flags standing for two countries, any "X versus Y"): tag EACH side with its short name, writing those exact words yourself in the prompt, in quotes, in the script's language — naming left unwritten gets invented by the generator in the WRONG language.
- MOVE and VARY like a real edit — do NOT keep the figure in the video's main location scene after scene: follow THIS scene's narration to a DIFFERENT place when it moves there (a street, a home, outdoors, a memory), and when the narration turns ABSTRACT or emotional, build a clear VISUAL METAPHOR or allusive scene AROUND the figure (walking a lone road at dawn, one small figure against a vast empty space, hands cupping a small light) instead of another shot of the same room. Every few scenes should leave that main location — repeating the same place and framing is the monotony we are preventing.
- The figure must be DOING or FEELING something concrete in every scene — acting out THIS scene's narration, never just standing in the middle of the room as a default. Never write "standing alone" or "standing in the center": write what the figure is DOING instead. Every OTHER person visible anywhere in the frame — blurred, distant, reflected or on a screen — is ALSO a stickman doll in this same drawing style; never "silhouettes" or "people" alone, which render as realistic humans and break the style. When the story is about solitude, show it through ACTION and context — the figure training alone, walking through empty space, one small figure in a large frame — NEVER by freezing a centered, static figure. Write the figure's facial expression and body language explicitly in the prompt (worried, determined, relieved, dejected...), matching the narration's emotion. An EXPRESSIVE EMOTION SHOT — waist-up or face close-up, even looking straight at the viewer like a narrator addressing the audience (write "looking directly at the viewer" in the prompt when you use it) — is welcome whenever the narration is emotional, and a THOUGHT BUBBLE with ONE simple picture (never words) may show what the figure thinks, wants or rejects.
- Vary the camera angle, distance and framing versus the neighbouring scenes so consecutive images never look like duplicates.\n`
}

// Bullets del redactor en su variante INMERSIVA para estilos fotorrealistas:
// mostrar el hecho ocurriendo en vez de graficarlo (port de
// BULLET_EXPLICATIVO_INMERSIVO).
export const IMMERSIVE_EXPLANATORY_BULLET = `- When the narration here explains how something works, a process, a comparison, a figure or a technical concept, SHOW IT HAPPENING instead of charting it: the real object mid-use, the two things side by side in the same frame so the difference is visible at a glance, the physical consequence, or the trace it leaves behind — always a real moment a camera could have captured in this world, completely TEXT-FREE.`

// Comparaciones sin rótulos añadidos: la diferencia se lee de la imagen.
export const IMMERSIVE_COMPARISON_BULLET = `- COMPARISONS stay in the world: when this scene shows two or more counterpart subjects that stand for named entities, make the comparison readable from the IMAGE itself — the two things side by side at the same scale, in the same light, with their real distinguishing features visible — instead of tagging them with added labels.`

// Texto en imagen para el carril inmersivo: solo lo que existe físicamente.
export const IMMERSIVE_IN_IMAGE_TEXT = `IN-IMAGE TEXT — only what physically exists in the scene: this is live-action footage, so readable words appear ONLY when a real surface in the shot carries them (a sign on the wall, a label on the object, a screen that is part of the scene). Never a caption, title, tag, arrow or annotation added on top of the picture. When in doubt, no text at all.`

// Cámara inmersiva: sin la excepción de "si es un diagrama, maquetalo".
export const IMMERSIVE_CAMERA = `Vary the camera angle, distance and framing versus the neighbouring scenes so consecutive images never look like duplicates. The era rules (BACKGROUND & SETTING / STORY ERA) always apply: everything in frame belongs to the story's own time.`

// Bloque para guiones SIN NINGÚN personaje en estilos SIN muñeco: cada escena
// ILUSTRA lo que la narración describe, sin figura forzada (port de
// bloqueIlustracionContenidoSinPersonaje).
export function buildNoCharacterIllustrationBlock(
  language = '',
  // Estilos fotorrealistas: bullets explicativos en variante inmersiva.
  isPhotorealistic = false,
): string {
  const lang = language.trim() || 'the SAME language as the narration'
  return `\n# NO RECURRING CHARACTER — illustrate the CONTENT of the narration, same art style
This video has NO specific, named or recurring character. EVERY scene must ILLUSTRATE WHAT THE NARRATION IS DESCRIBING here so the idea is instantly clear and engaging for the viewer — do NOT invent a recurring narrator or mascot figure.
Read the narration and the surrounding context and pick the SINGLE best visual for THIS moment. The subject must follow THIS scene's narration: when the narration moves on to a new thing, topic or place, illustrate THAT — do not reuse the previous scene's location or subject out of inertia:
- If the narration names a SPECIFIC known thing — a famous artwork, monument, landmark, building, place, animal or object (e.g. "la Mona Lisa" → the painting itself; "la Torre Eiffel" → the tower; "el ADN" → a DNA double helix) — depict THAT exact thing, recognizably.
${isPhotorealistic ? IMMERSIVE_COMPARISON_BULLET : `- IDENTIFICATION LABELS — comparisons and named entities deserve their names: when this scene shows two or more counterpart subjects that STAND FOR named entities (two ships, flags, armies or headquarters standing for two countries; two institutions, brands, teams or eras side by side; any "X versus Y" composition), it COUNTS as an explanatory illustration: put a small clean name-tag or plaque on or next to EACH side so the viewer instantly knows which is which — every tag a SHORT 1-4-word name written in ${lang}, optionally plus ONE short title for the whole composition, and YOU must write ALL those exact words yourself in THIS prompt, in quotes (they follow the in-image text rule below). NEVER write that a subject "represents" or "stands for" something without ALSO writing its name-tag words: naming left unwritten gets invented by the image generator in the WRONG language.`}
${isPhotorealistic ? IMMERSIVE_EXPLANATORY_BULLET : `- ONLY if the narration here is explicitly DIDACTIC — it explains how something works, a process, a structure, a comparison, a statistic or a technical concept — show a clear, simple EXPLANATORY DIAGRAM of it rendered in THIS video's own medium and art style (a photographed real object in a photorealistic video, a drawing in an illustrated one), staged as an artifact that belongs to the story's world and era — in a period or historical story that means a hand-drawn chart, engraving, printed poster or chalkboard of THAT era with period lettering, never modern flat graphic design nor a white presentation slide; in a present-day story the explanation is DIEGETIC too: drawn on a screen, board, window, paper or surface that belongs to the scene's world, seen in perspective with the scene's depth, lighting and surroundings, never a floating flat slide on a plain background — WITH a short title and clear labels and arrows, all written in ${lang} (see the in-image text rule below). A story moment, an action, an emotion, an opinion or the plain description of a place or person is NOT didactic — depict those as a normal, completely TEXT-FREE scene.`}
- If the narration here is ABSTRACT — an emotion, an idea, an opinion or a life lesson — do NOT depict a generic empty place: build a clear, concrete VISUAL METAPHOR that embodies the idea (e.g. "the promise broke" → a snapped wooden toy train; "a fresh start" → footprints in fresh snow), completely TEXT-FREE; anonymous people may appear inside the metaphor ONLY when it genuinely needs them.
- If the narration here is about a place or setting itself, depict that location with a clear focal SUBJECT in frame (seen from a fresh angle versus the neighbouring scenes) — but a reflective or emotional line is NOT a request for a place: even when it mentions the video's main setting ("training alone", "at the gym", "in the office"), treat it as ABSTRACT and build a metaphor instead. NEVER fill a scene with an EMPTY establishing shot of the video's main recurring location — an empty room with no clear subject is filler, not illustration.
- If the narration implies PEOPLE doing something (a worker unloading trucks, a crowd celebrating, a scientist in a lab), depict them as ANONYMOUS, generic persons who fit the moment — people appear ONLY when the narration implies them, never as a forced or recurring figure.
- Otherwise pick a concrete object, symbol or mini-scene that best represents the idea.
CRITICAL — keep the art style IDENTICAL to the other scenes so the video NEVER mixes styles: build this prompt the SAME way as every other scene, keeping the style's FIXED blocks (the PROLOGUE and the STYLE block) WORD-FOR-WORD. Those FIXED blocks define the DRAWING STYLE / medium only.
${isPhotorealistic ? IMMERSIVE_IN_IMAGE_TEXT : `IN-IMAGE TEXT — a genuine diagram MUST be labelled (never blank, never another language): ONLY if this image is a didactic diagram or infographic (per the rule above), it MUST carry a short title and clear labels, and YOU must write those EXACT words yourself in THIS prompt, in quotes, in ${lang}, naming every part in ${lang}. Each title/label is a SHORT noun phrase of 1-4 words that NAMES the topic or a part — NEVER a full sentence and NEVER the narration's own words: the narration is SPOKEN over the video, stamping it (or a summary of it) onto the image is a DEFECT. Keep the wording SPARSE and LARGE: at most a short title plus 3 labels, described as big, clearly readable text — NEVER small or tiny lettering and never dense annotations (small in-image text always renders as unreadable scribbles). If the diagram sits on a small object or screen inside the scene (a tablet, a phone, a monitor), write ONLY the title and NO labels. Any NON-diagram scene here carries NO readable text at all.`}
${isPhotorealistic ? IMMERSIVE_CAMERA : `Vary the camera angle, distance and framing versus the neighbouring scenes so consecutive images never look like duplicates. If the best visual is a diagram or explanatory illustration, the camera/continuity hints elsewhere in this prompt do NOT apply to it — lay the diagram out clearly instead, but the era rules (BACKGROUND & SETTING / STORY ERA) still apply: the diagram remains an artifact of the story's era.`}\n`
}

// Bloque de las escenas SIN el personaje cuando el proyecto SÍ tiene
// personajes: la mejor ilustración de lo narrado, sin figura alguna (port de
// bloqueSinPersonajeIlustracion).
export function buildIllustrationWithoutCharacterBlock(
  names: string[],
  language = '',
  // El token "stickman doll" solo se menciona (en negativo) cuando el estilo
  // del video ES el del muñeco.
  isStickmanStyle = false,
  // Estilos fotorrealistas: bullets explicativos en variante inmersiva.
  isPhotorealistic = false,
): string {
  const list = names.map((name) => (name || '').trim()).filter(Boolean)
  if (list.length === 0) return ''
  const plural = list.length > 1
  const lang = language.trim() || 'the SAME language as the narration'
  const who = list.join(' or ')
  // Stickman conserva la regla del origen (nadie en el encuadre: su molde
  // CONCEPTO no admite figuras). En los demás estilos la escena muestra lo que
  // narra el guion: sin el personaje, pero CON la gente que la narración
  // describa — rotulada «anonymous», que es lo que valida el redactor.
  const peopleRule = isStickmanStyle
    ? `Draw NO character and NO person at all: no ${list.join(' or ')}, no stickman doll or figure, no bystanders, crowds or silhouettes — not even small, distant or incidental ones. The "character / doll" wording inside the FIXED blocks refers ONLY to the drawing style — do NOT place such a figure here.`
    : `NEVER draw ${who} here — not under another name, not as "a man", "a young woman", a lone figure, a silhouette, a face or a pair of hands standing in for the narration's protagonist: that person has no identity to follow and renders as a STRANGER the viewer mistakes for ${who}. When the ONLY human in this narration is the protagonist, show NO person at all and illustrate the moment through the object, the place or a visual metaphor, writing the phrase no people anywhere in the frame. OTHER PEOPLE appear ONLY when THIS scene's narration explicitly describes them (a crowd, the fishermen, a guard, a customer): then depict them, write EACH of them with the word anonymous (an anonymous fisherman, an anonymous crowd of commuters) and make them visibly DIFFERENT from ${who} — different hair, build and clothing colours. Never invent bystanders, crowds or silhouettes the narration does not mention. Any character wording inside the FIXED blocks refers ONLY to the drawing style — do NOT place such a figure here.`
  return `\n# SCENE WITHOUT THE CHARACTER — illustrate the CONTENT, same art style
This moment does NOT feature the recurring character${plural ? 's' : ''} (${list.join(', ')}). Instead, ILLUSTRATE WHAT THE NARRATION IS DESCRIBING here so the idea is instantly clear and engaging for the viewer — ${isStickmanStyle ? 'with NO character or person in the frame' : `WITHOUT ${list.join(' or ')} in the frame; other people appear ONLY when THIS scene's narration explicitly describes them`}.
Read the narration and the surrounding context and pick the SINGLE best visual for THIS moment. The subject must follow THIS scene's narration: when the narration moves on to a new thing, topic or place, illustrate THAT — do not reuse the previous scene's location or subject out of inertia:
- If the narration names a SPECIFIC known thing — a famous artwork, monument, landmark, building, place, animal or object (e.g. "la Mona Lisa" → the painting itself; "la Torre Eiffel" → the tower; "el ADN" → a DNA double helix) — depict THAT exact thing, recognizably.
${isPhotorealistic ? IMMERSIVE_COMPARISON_BULLET : `- IDENTIFICATION LABELS — comparisons and named entities deserve their names: when this scene shows two or more counterpart subjects that STAND FOR named entities (two ships, flags, armies or headquarters standing for two countries; two institutions, brands, teams or eras side by side; any "X versus Y" composition), it COUNTS as an explanatory illustration: put a small clean name-tag or plaque on or next to EACH side so the viewer instantly knows which is which — every tag a SHORT 1-4-word name written in ${lang}, optionally plus ONE short title for the whole composition, and YOU must write ALL those exact words yourself in THIS prompt, in quotes (they follow the in-image text rule below). NEVER write that a subject "represents" or "stands for" something without ALSO writing its name-tag words: naming left unwritten gets invented by the image generator in the WRONG language.`}
${isPhotorealistic ? IMMERSIVE_EXPLANATORY_BULLET : `- ONLY if the narration here is explicitly DIDACTIC — it explains how something works, a process, a structure, a comparison, a statistic or a technical concept (e.g. a protein, a molecule, an organ) — show a clear, simple EXPLANATORY DIAGRAM of it rendered in THIS video's own medium and art style (a photographed real object in a photorealistic video, a drawing in an illustrated one), staged as an artifact that belongs to the story's world and era — in a period or historical story that means a hand-drawn chart, engraving, printed poster or chalkboard of THAT era with period lettering, never modern flat graphic design nor a white presentation slide; in a present-day story the explanation is DIEGETIC too: drawn on a screen, board, window, paper or surface that belongs to the scene's world, seen in perspective with the scene's depth, lighting and surroundings, never a floating flat slide on a plain background — WITH a short title and clear labels and arrows, all written in ${lang} (see the in-image text rule below). A story moment, an action, an emotion, an opinion or the plain description of a place or person is NOT didactic — depict those as a normal, completely TEXT-FREE scene.`}
- If the narration here is ABSTRACT — an emotion, an idea, an opinion or a life lesson — do NOT depict a generic empty place: build a clear VISUAL METAPHOR out of objects, nature or symbolic scenery that embodies the idea (e.g. "promises break" → a snapped rope still swinging), completely TEXT-FREE and, like every scene in this block, with NO people in it.
- If the narration here is about a place or setting itself, depict that location with a clear focal SUBJECT in frame (seen from a fresh angle versus the neighbouring scenes) — but a reflective or emotional line is NOT a request for a place: even when it mentions the video's main setting ("training alone", "at the gym", "in the office"), treat it as ABSTRACT and build a metaphor instead. NEVER fill a scene with an EMPTY establishing shot of the video's main recurring location — an empty room with no clear subject is filler, not illustration.
- Otherwise pick a concrete object, symbol or mini-scene that best represents the idea.
CRITICAL — keep the art style IDENTICAL to the other scenes so the video NEVER mixes styles:
- Build this prompt the SAME way as every other scene, keeping the style's FIXED blocks (the PROLOGUE and the STYLE block) WORD-FOR-WORD. Those FIXED blocks define the DRAWING STYLE / medium (linework, shapes, colors, shading) only — they do NOT require a character to be present in THIS scene.
- Render in that exact same style (same medium, linework, palette, shading). NEVER switch to a more realistic, painterly, photographic or different-looking style — mixing styles is the bug we are preventing.
${peopleRule} When the best visual is an OBJECT or a metaphor (a tree, a rope, a wall, a machine), draw it as a NORMAL object: the art STYLE (linework, palette, shading) still applies, but the object NEVER gets ${isStickmanStyle ? "the doll's round white head, face, white gloves, rounded shoes or stick limbs" : 'a face, eyes or human limbs'} — a tree is a tree, not a character.
${isPhotorealistic ? IMMERSIVE_IN_IMAGE_TEXT : `IN-IMAGE TEXT — a genuine diagram MUST be labelled (never blank, never another language): ONLY if this image is a didactic diagram or infographic (per the rule above), it MUST carry a short title and clear labels, and YOU must write those EXACT words yourself in THIS prompt, in quotes, in ${lang}, naming every part in ${lang}. Each title/label is a SHORT noun phrase of 1-4 words that NAMES the topic or a part — NEVER a full sentence and NEVER the narration's own words: the narration is SPOKEN over the video, stamping it (or a summary of it) onto the image is a DEFECT. Do NOT leave a genuine diagram blank or unlabelled, and do NOT leave any wording for the image generator to invent (without the text it makes up labels in the WRONG language). Keep the wording SPARSE and LARGE: at most a short title plus 3 labels, described as big, clearly readable text — NEVER small or tiny lettering and never dense annotations (small in-image text always renders as unreadable scribbles). If the diagram sits on a small object or screen inside the scene (a tablet, a phone, a monitor), write ONLY the title and NO labels. Any NON-diagram scene here carries NO readable text at all.`}
${isPhotorealistic ? IMMERSIVE_CAMERA : `Vary the camera angle, distance and framing versus the neighbouring scenes so consecutive images never look like duplicates. If the best visual is a diagram or explanatory illustration, the camera/continuity hints elsewhere in this prompt do NOT apply to it — lay the diagram out clearly instead, but the era rules (BACKGROUND & SETTING / STORY ERA) still apply: the diagram remains an artifact of the story's era.`}\n`
}

// Bloque DURO para los personajes presentes en una escena (hasta 2). Para 1
// personaje devuelve exactamente buildMandatoryCharacterBlock; con varios
// suma el refuerzo multi-personaje, el anti-clon de extras y el candado de
// objetos de fondo (port de bloquePersonajesObligatorios).
export function buildMandatoryCharactersBlock(
  characters: { name: string; description: string }[],
  present: number[],
  isUserRequest = false,
  isStickmanStyle = false,
  imageTextLanguage = '',
  isPhotorealistic = false,
): string {
  const blocks: string[] = []
  for (const index of present) {
    const character = characters[index]
    if (character?.name)
      blocks.push(
        buildMandatoryCharacterBlock(
          character.name,
          character.description,
          isUserRequest,
          isStickmanStyle,
          imageTextLanguage,
          isPhotorealistic,
        ),
      )
  }
  // Refuerzo MULTI-personaje: cada personaje presente recibe el mismo detalle
  // de cabeza + pelo, no solo el primero.
  const names = present
    .map((index) => characters[index]?.name?.trim())
    .filter((name): name is string => !!name)
  // Un personaje con foto y sin descripción no tiene pelo ni cara que
  // redactar: exigirlos obligaba al redactor a inventarlos.
  const photoOnlyNames = isStickmanStyle
    ? []
    : present
        .map((index) => characters[index])
        .filter(
          (character) =>
            character?.name?.trim() && !character.description?.trim(),
        )
        .map((character) => character.name.trim())
  const photoOnlyException =
    photoOnlyNames.length > 0
      ? ` EXCEPTION — ${photoOnlyNames.join(' and ')}: their look comes from an attached reference photo, so write NO physical trait for them (no head, hair, face or skin wording) — only the name followed by (${REFERENCE_PERSON_ANCHOR}), their action, expression and clothing.`
      : ''
  if (names.length >= 2) {
    const headDetail = isStickmanStyle
      ? `do NOT flesh out one character and reduce the other to "another stickman doll wearing [clothes]". For EACH character explicitly describe their HEAD and HAIR: write it as "round white head WITH <that character's exact hair: color, length, style> on top" (only bald if that character's canonical look is explicitly bald), plus their face and their outfit/accessories.`
      : `do NOT flesh out one character and reduce the other to a vague secondary figure. For EACH character explicitly describe their HEAD and HAIR (exact color, length and style — only bald if that character's canonical look is explicitly bald), plus their face and their outfit/accessories, rendered in this video's own art style.`
    blocks.push(
      `\n# MULTIPLE CHARACTERS TOGETHER — describe EACH with EQUAL detail\nThis scene shows ${names.join(
        ' and ',
      )} together in the SAME image. Give EVERY one of them their FULL description with the SAME level of detail — ${headDetail} Every listed character MUST keep their EXACT hair and identity here — none of them turned bald, hatless or generic just because another character in the scene is bald or simpler.${photoOnlyException}\n`,
    )
  }
  // Anti-clon de EXTRAS: los generadores clonan al protagonista si los extras
  // no se describen como explícitamente distintos.
  if (names.length >= 1) {
    const extraExample = isStickmanStyle
      ? ` Describe each such extra explicitly as "a [their role] stickman with a white round head, with <hair or hat clearly different from the main character>, wearing <clothing in a colour different from the main character>". EVERY person visible anywhere in the frame — including blurred, distant, background people, reflections in mirrors and people on screens — is ALSO a simple stickman doll in this same drawing style; NEVER describe them as "silhouettes", "gym-goers" or "people" alone (the generator renders those as realistic humans and breaks the style) — always name them as stickman dolls.`
      : ` Describe each such extra explicitly with their own hair/hat and clothing colours, all clearly different from the main character, rendered in this video's own art style — including blurred, distant or reflected people: NEVER let any person in the frame drift into a different, more realistic rendering style than the rest of the scene.`
    blocks.push(
      `\n# SECONDARY / EXTRA PEOPLE — never clone the main character${
        names.length > 1 ? 's' : ''
      }\nDo NOT invent extra people that the narration of this scene does not mention — keep the focus on ${names.join(
        ' and ',
      )}. ONLY if the narration of THIS scene actually includes another person (a guard, a clerk, a passer-by, a child, a crowd, etc.), or the SCENE PLAN section of this prompt stages a social scene with other people, must you draw them — and then draw EACH of them clearly DIFFERENT from ${names.join(
        ' and ',
      )}: a DIFFERENT hairstyle or a hat, AND clothing in a DIFFERENT colour.${extraExample} NEVER copy the main character's hair, outfit or colours onto a secondary figure — image generators clone the protagonist unless every extra is described as visibly different. And when NEITHER the narration NOR the SCENE PLAN calls for any other person, you MUST write the defensive phrase explicitly IN the prompt: "no other people anywhere in the frame, in the background or in reflections" — image generators fill gyms, offices and streets with realistic background people unless the prompt forbids them (same defensive pattern as the bare-walls phrase; found in real v0.64.0 acceptance images).\n`,
    )
    // Anti-sangrado de estilo sobre OBJETOS: los objetos del fondo se nombran
    // como objetos, jamás "figures".
    blocks.push(
      `\n# BACKGROUND OBJECTS ARE NEVER CHARACTERS\nSatellites, moons, planets, vehicles, machines, tools and other props in this scene are plain INANIMATE objects: no faces, no eyes, no smiles, no arms and no character-like bodies on them, and none of them drawn as a miniature copy of ${names.join(
        ' or ',
      )}. When you mention such objects in this prompt, name them as objects ("satellites", "machines", "moons") and NEVER as "figures" or "characters" — the image generator turns the word "figures" into little mascots with faces. The ONLY exception is an object that the narration itself explicitly presents as a living character.\n`,
    )
  }
  return blocks.join('')
}

// ¿El pedido MANUAL del usuario menciona a algún personaje del proyecto?
// Detección determinística por nombre (borde de palabra, sin acentos) y, si
// ninguno matchea, por términos genéricos → protagonista (índice 0). (Port de
// indicesPersonajesEnPedido; helper determinístico que necesita
// buildSceneCharacterBlock.)
export function characterIndicesInRequest(
  request: string | undefined,
  characters: { name: string }[],
): number[] {
  const normalize = (value: string): string =>
    value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  const text = normalize((request || '').trim())
  if (!text || characters.length === 0) return []
  // Borde de palabra unicode-safe: \b no funciona con letras acentuadas.
  const asWord = (token: string): RegExp =>
    new RegExp(
      `(^|[^\\p{L}\\p{N}])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`,
      'u',
    )
  const indices: number[] = []
  characters.forEach((character, index) => {
    const name = normalize((character.name || '').trim())
    if (name && asWord(name).test(text)) indices.push(index)
  })
  if (indices.length > 0) return indices
  const GENERIC_TERMS = [
    'personaje',
    'personajes',
    'protagonista',
    'protagonistas',
    'muneco', // "muñeco" ya normalizado (NFD quita la virgulilla)
    'munecos',
    'stickman',
    'doll',
    'main character',
    'the character',
  ]
  if (GENERIC_TERMS.some((term) => asWord(term).test(text))) return [0]
  return []
}

// Bloque para proyectos SIN NINGÚN personaje cuando la escena se regenera con
// un pedido MANUAL (estilos sin muñeco): el USER REQUEST es la única fuente
// de verdad de quién y qué aparece (port de bloqueIlustracionPedidoUsuario).
export function buildUserRequestIllustrationBlock(language = ''): string {
  const lang = language.trim() || 'the SAME language as the narration'
  return `\n# USER REQUEST SCENE — no recurring character in this video; the request decides
This video has NO specific, named or recurring character. The USER REQUEST below is the SINGLE source of truth for WHO and WHAT appears in this scene — draw EXACTLY what it describes, nothing swapped, nothing dropped:
- If the request includes a person, character or figure (e.g. "el personaje", "una persona", "un hombre"), DRAW that person as an anonymous, generic person who fits the moment, rendered in this video's exact art style — never a real, recognizable person.
- If the request names a famous artwork, monument, landmark or object, depict that exact thing recognizably — and when the request pairs it WITH a person (someone looking at it, holding it, standing next to it), include BOTH in the same frame, exactly as requested. Never reduce the scene to the named thing alone when the request asks for more.
- If the request mentions no person, show no people.
CRITICAL — keep the art style IDENTICAL to the other scenes so the video NEVER mixes styles: build this prompt the SAME way as every other scene, keeping the style's FIXED blocks (the PROLOGUE and the STYLE block) WORD-FOR-WORD. Those FIXED blocks define the DRAWING STYLE / medium only.
IN-IMAGE TEXT: unless the request explicitly asks for a labelled diagram (then write its short title/labels yourself, in quotes, in ${lang}), this scene carries NO readable text of any kind.\n`
}

// ÚNICA fuente de verdad del bloque de personaje que se inyecta en el user
// prompt de cada escena del camino LLM (port de bloquePersonajeParaEscena).
// Ramas: 1) personajes presentes → bloque duro; 1b) regen manual cuyo pedido
// menciona a un personaje → bloque duro de los mencionados; 2) hay personajes
// pero ninguno acá → ilustración del contenido; 3) proyecto sin personajes →
// figura genérica solo en stickman; con pedido manual, el pedido manda.
export function buildSceneCharacterBlock(
  characters: { name: string; description: string }[],
  presentInScene: number[],
  options: {
    isStickmanStyle: boolean
    imageTextLanguage: string
    isUserRequest?: boolean
    // Texto del pedido manual (para detectar menciones de personaje).
    request?: string
    // Estilo fotorrealista: bullets explicativos en variante inmersiva.
    isPhotorealistic?: boolean
  },
): string {
  if (characters.length > 0 && presentInScene.length > 0)
    return buildMandatoryCharactersBlock(
      characters,
      presentInScene,
      options.isUserRequest ?? false,
      options.isStickmanStyle,
      options.imageTextLanguage,
      options.isPhotorealistic ?? false,
    )
  // Regen manual: el pedido que NOMBRA al personaje lo trae de vuelta con su
  // bloque DURO. Detección determinística, nunca del LLM.
  if (characters.length > 0 && options.isUserRequest) {
    const mentioned = characterIndicesInRequest(options.request, characters)
    if (mentioned.length > 0)
      return buildMandatoryCharactersBlock(
        characters,
        mentioned,
        true,
        options.isStickmanStyle,
        options.imageTextLanguage,
        options.isPhotorealistic ?? false,
      )
  }
  // Escena sin el personaje: SIEMPRE ilustración del contenido (ADR-0011).
  if (characters.length > 0)
    return buildIllustrationWithoutCharacterBlock(
      characters.map((character) => character.name),
      options.imageTextLanguage,
      options.isStickmanStyle,
      options.isPhotorealistic ?? false,
    )
  if (options.isStickmanStyle) return buildGenericProtagonistBlock()
  // 0 personajes + pedido manual: el pedido manda.
  return options.isUserRequest
    ? buildUserRequestIllustrationBlock(options.imageTextLanguage)
    : buildNoCharacterIllustrationBlock(
        options.imageTextLanguage,
        options.isPhotorealistic ?? false,
      )
}

// Rotación suave de PUNTO DE VISTA para escenas genéricas/atmosféricas (port
// de PLANOS_VARIEDAD). Determinística por índice de escena.
export const SHOT_VARIETY_ROTATION = [
  'a wide establishing shot that shows the whole place',
  'a closer, eye-level shot focused on one evocative detail of it',
  'a different angle of the same place (low-angle, high-angle or from another side)',
  'a medium shot from a fresh vantage point, framing a different part of the scene',
] as const

// Rotación explícita de plano entre escenas consecutivas, aplicada a TODAS
// las escenas (port de PISTAS_CAMARA).
export const CAMERA_HINT_ROTATION = [
  "a WIDER or medium shot that establishes the place and the subject's full body / posture",
  'a CLOSER shot — a close-up or over-the-shoulder — on the key subject, a face, hands or a meaningful detail',
  "a HIGH-ANGLE view looking down at this scene's subject, or a LOW-ANGLE view looking up — change the vertical point of view versus the neighbouring scenes",
  "a shot from a DIFFERENT SIDE of this scene's subject (profile or three-quarter view; if a character is present, keep their face visible), so the subject is seen from a new direction",
] as const

// Rotación de TIPO de plano (mezcla de tipos como una edición profesional;
// port de PISTAS_TIPO). El orden está calibrado a la fase de la rotación: el
// índice de escena arranca en 1, así la escena 1 cae en el plano expresivo.
export const SHOT_TYPE_ROTATION = [
  'a CUT-AWAY: a different location or meaningful detail implied by the narration, or a THOUGHT-BUBBLE insert above the figure showing what is going through their mind (one simple picture, no words; any MANDATORY CHARACTER above still appears as required)',
  'an EXPRESSIVE EMOTION SHOT: a waist-up or face close-up of this scene\'s main figure (when the blocks above put one here) with the emotion of THIS narration written clearly on the face and body language — the figure may look straight at the viewer, like a narrator addressing the audience; name the emotion explicitly in the prompt, WRITE the chosen framing explicitly in the prompt ("waist-up shot" or "face close-up") — and do not always default to waist-up: a true FACE CLOSE-UP, with the head and shoulders filling the frame, is the most powerful emotional beat and must appear somewhere in the video — and when you choose direct address write the words "looking directly at the viewer" in the prompt',
  'the main figure MID-ACTION: physically performing what the narration describes, framed from a fresh angle',
  "a VISUAL METAPHOR or symbolic staging of this narration's idea — one concrete object or scene that embodies it (use it when this narration is abstract or emotional; a concrete physical action stays literal)",
  "an INTERACTION or REACTION beat — ONLY if this scene's narration implies other people (looks, judgement, laughter, company — and COLLECTIVES count: groups, institutions, nations, armies, analysts, officials or crowds named by the narration ARE implied people): the main figure reacting to them, or they to the figure, anonymous and clearly distinct from each other — a GROUP scene with several distinct extras (a briefing, a meeting, a crowd, a team at work) is welcome and beats yet another solo shot; the OTHER PARTY of an interaction the narration describes MUST be in frame too (a handshake, a meeting, a deal — a NAMED public figure drawn RECOGNIZABLE with their iconic public features, anyone unnamed as an anonymous generic figure in this same style), never the main figure interacting with empty air; if the narration implies no one else, use a reaction close-up of the main figure alone instead",
] as const

// Bloque de FONDO Y SETTING que sigue a la narración (port del bloqueFondo de
// construirUserPrompt). `eraGlobalLock` = era derivada de la biblia ("" si el
// guion es presente/sin lock): con era, se inyecta el párrafo STORY ERA que
// invierte el default present-day para este proyecto.
export function buildBackgroundBlock(eraGlobalLock = ''): string {
  const eraParagraph = eraGlobalLock
    ? `STORY ERA — ${eraGlobalLock} (this OVERRIDES the present-day default above): the global visual context pins this story in ${eraGlobalLock}, so EVERY scene — including diagrams, infographics, comparisons, metaphors and cut-aways — belongs to that time: period architecture, interiors, furniture, clothing, hairstyles, vehicles, tools and materials. An explanatory diagram or comparison here is a DIEGETIC PERIOD ARTIFACT: a hand-drawn chart, engraving, letterpress poster, blueprint, ship's manifest or chalkboard of ${eraGlobalLock} with period typography and period-styled icons — NEVER a modern white presentation slide, flat minimalist infographic, sans-serif UI, gauges, sliders, app-style icons or modern safety pictograms, and its people wear period clothing and hairstyles. EXCEPTION — the narration wins: when THIS scene's narration explicitly moves to a LATER or present-day time (a modern discovery, expedition, memorial, museum or "today" passage), depict THAT era faithfully instead — modern vessels, devices and clothing are correct THERE and only there.\n`
    : ''
  return `\n# BACKGROUND & SETTING (follows the narration, never blank)
Always ground the subject in a concrete SETTING — never leave the background blank, white or empty, not even in a close-up or over-the-shoulder shot. The setting must FOLLOW THIS scene's narration: when the narration moves to a different place, city, building, planet, artwork or topic, CHANGE the setting to show THAT — do not reuse the previous scene's location out of inertia. Keep the SAME location and its key background elements consistent (same room / street / landscape, same defining props) ONLY while the narration stays in that same place — then change just the camera angle, distance and the subject's action, and do NOT invent a new, unrelated location. If this image is an explanatory diagram, its in-world staging (the surface, screen or artifact that carries it, inside this scene's setting) IS the background for this one scene.\nSAME TOPIC IS NOT SAME SHOT: staying in the same location does NOT mean repeating the same framed view — while the narration stays in one place, show a DIFFERENT part of it each time (another corner, the entrance seen from inside, the street outside the windows, one meaningful detail) so no two consecutive scenes show the same wall with the same furniture. EXCEPTION — ALLUSIVE CUT-AWAY: when the narration turns abstract, emotional or reaches back to a memory, you MAY leave the current location for one scene and show an allusive setting or visual metaphor that embodies what is being said (a lone road, an empty horizon, a childhood room), keeping the video's global look and palette; this narration-driven cut-away is NOT an "unrelated location".\nPRESENT DAY BY DEFAULT: unless the narration or the global visual context EXPLICITLY places this story in a historical, ancient, medieval, period, fantasy or futuristic setting, depict a CONTEMPORARY, present-day world — modern buildings, modern interiors, modern streets, modern clothing, modern vehicles and modern everyday objects. Do NOT drift into a rustic, pre-industrial, old-world or vaguely "timeless" look (stone huts, cobblestone or unpaved dirt roads, thatched or crumbling walls, wooden shacks, oil lamps, peasant or period clothing, smoking chimneys) just because the narration is emotional, motivational, abstract or set outdoors — an ordinary gym, home, office, school or street is a MODERN one. Even an allusive cut-away or visual metaphor stays in this same present-day world unless the narration itself calls for another era.\n${eraParagraph}NO DECORATIVE TEXT: do not decorate the scene with motivational posters, banners, quotes, graffiti, chalkboards or wall art carrying readable words — invented background text is a DEFECT (it renders garbled and in the wrong language). This does NOT override the IN-IMAGE TEXT rules elsewhere in this prompt: a labelled diagram a rule explicitly asks for, or writing that PHYSICALLY exists in the scene (a shop sign, a screen), stays governed by those rules — everything else carries NO readable text. Image generators LOVE to hang wordy posters, signs and banners onto ANY scene — gym walls, offices, streets, even open landscapes and symbolic scenes — so describe the scene defensively IN the prompt: when it shows an interior write "plain bare walls, no posters, no signs, no readable text anywhere", and in ANY other scene (outdoor, symbolic, a visual metaphor) write "completely text-free scene, no signs, no banners, no readable text anywhere" (skip this phrase only when a rule above asks you to write a labelled diagram in this very scene).\nLIGHT VARIES: keep the video's global look and palette, but vary the LIGHTING and time of day across the video when the narration allows it — the lighting STYLE stays consistent while the hour, direction and intensity of the light change between scenes; do not stamp every scene with the same hour and the same light.\n`
}

// Bloque de reintento que se anexa al user prompt cuando el proveedor de
// imágenes rechazó el prompt anterior por content policy (port del
// `sanitizacionExtra` de regenerarPromptsParaFaltantes).
export function buildRetryAttemptBlock(attempt: number): string {
  return `

# CRITICAL — RETRY ATTEMPT ${attempt}
The previous prompt for this scene was rejected by the image model's safety filter. Generate a NEW prompt that:
- Avoids any word that could trigger content filters (no violence, weapons, blood, suggestive imagery, brand names) and does NOT write any real person's NAME in this retry.
- If the moment depicts a real public figure: KEEP their most iconic public features (signature hairstyle, facial hair, kit and shirt number, tattoos) so the character stays RECOGNIZABLE — drop only the bare name and soften other elements (framing, setting, secondary details) instead.
- Uses neutral, family-friendly language while preserving the narrative meaning of the moment.
- Keeps the visual atmosphere and style guidelines, but stays MILD and SAFE.
- Prefers wide landscape, animals, scenery, abstract or symbolic imagery over close human depictions if the original moment is sensitive.`
}

// Corrección que se anexa al reintento cuando el prompt emitido soltó rasgos
// de cabeza canónicos de un personaje presente (port de `correccionIdentidad`
// de generarPromptsImagen).
export function buildIdentityCorrectionBlock(missingTraits: string[]): string {
  return `\n\nCORRECTION — YOUR PREVIOUS ATTEMPT DROPPED CANONICAL HEAD FEATURES: the character's canonical look includes [${missingTraits.join(', ')}] and your prompt did not mention them. Rewrite the prompt keeping EVERYTHING else, and attach those exact canonical head features to the character's head IN THE SAME PHRASE where the head is described.`
}

// Corrección que se anexa al reintento cuando el prompt emitido soltó el tono
// de piel canónico de un personaje presente. Va aparte del bloque de cabeza:
// aquel ordena pegar rasgos «a la cabeza», y la piel no va ahí.
export function buildComplexionCorrectionBlock(
  missing: { name: string; clause: string }[],
): string {
  if (missing.length === 0) return ''

  const list = missing
    .map((entry) => `${entry.name}: ${entry.clause}`)
    .join('; ')
  return `\n\nCORRECTION — YOUR PREVIOUS ATTEMPT DROPPED A CANONICAL SKIN TONE: the canonical look states [${list}] and your prompt did not mention it. Rewrite the prompt keeping EVERYTHING else, and write that exact skin tone IN THE SAME PHRASE that introduces the character.`
}

// Corrección que se anexa al reintento cuando una escena SIN personaje salió
// igual con una persona: sin identidad ni referencia, esa persona es un
// desconocido que el espectador lee como el protagonista cambiado.
export function buildNoPersonCorrectionBlock(names: string[]): string {
  const list = names.map((name) => (name || '').trim()).filter(Boolean)
  const who = list.length > 0 ? list.join(' or ') : 'the main character'
  return `\n\nCORRECTION — YOUR PREVIOUS ATTEMPT DREW AN UNIDENTIFIED PERSON IN A SCENE WITHOUT THE CHARACTER: this scene does NOT feature ${who}, and the person you wrote has no identity — it renders as a stranger standing in for ${who}. Rewrite the prompt one of these two ways. (1) If the only human in this narration is the protagonist, show NO person at all — no man, woman, face, hands, lone figure or silhouette: illustrate the moment through an OBJECT, a PLACE or a VISUAL METAPHOR of what is said (the steaming coffee pot on the stove, the empty bus seat by the window, the closed workshop door under the rain) and write the phrase no people anywhere in the frame. (2) If the narration explicitly describes OTHER people, keep ONLY those, write each one with the word anonymous (an anonymous fisherman, an anonymous crowd) and make them visibly different from ${who}.`
}

// Corrección que se anexa al reintento cuando el prompt de una escena MARCADA
// con personaje salió sin él (o con un sujeto genérico en su lugar).
export function buildMissingCharacterCorrectionBlock(names: string[]): string {
  const list = names.map((name) => (name || '').trim()).filter(Boolean)
  if (list.length === 0) return ''

  return `\n\nCORRECTION — YOUR PREVIOUS ATTEMPT LEFT OUT THE MANDATORY CHARACTER: this scene FEATURES ${list.join(' and ')} and your prompt did not name them — a generic man, woman or figure is NOT ${list.join(' or ')}. Rewrite the prompt keeping the setting and the action, with ${list.join(' and ')} written BY NAME as the main subject, followed by the exact canonical appearance from the MANDATORY CHARACTER block.`
}
