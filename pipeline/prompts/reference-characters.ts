// Prompts de los personajes de referencia (port de deteccion_personajes.ts):
// el clasificador name-agnostic de sujeto/acción y el bloque de identidad
// canónica que se ANEXA a la biblia visual. Texto verbatim del origen.

// Clasificador de escenas con SUJETO humano/acción (una llamada LLM, tier
// economy): marca dónde puede aparecer el protagonista; puro lugar/paisaje
// queda vacío (variedad). Sesgo a INCLUIR.
export const SUBJECT_CLASSIFIER_SYSTEM_PROMPT =
  `You are labeling scenes of a narrated video to place ONE recurring MAIN CHARACTER (the protagonist) that this video introduces. ` +
  `The numbered items below are CONSECUTIVE TIME-SLICES of ONE continuous narration (written in the script's own language — read it as-is, do not assume any specific language): a single sentence is frequently split across several scenes. ` +
  `Mark a scene as featuring the protagonist when that moment shows a HUMAN SUBJECT or ACTION the protagonist can embody — someone acting, moving, speaking, reacting, deciding, working, observing or feeling, or being the visual focus — by explicit subject, by a pronoun, by the implicit subject of the verb, or by clear narrative continuity from the neighbouring fragments. ` +
  `Do NOT mark a scene ONLY when it is a pure establishing shot of a place, landscape, object, sky, weather or an abstract/atmospheric idea in which NO person takes part. ` +
  `Bias toward INCLUDING the protagonist (a consistent recurring character beats empty landscapes), so leave UNMARKED only the scenes that are genuinely about a place or object ALONE — keeping some of those for visual variety. ` +
  `Return ONLY a JSON object {"ids":[<scene numbers where the protagonist appears>]}, no preamble, no markdown. If every scene is pure scenery, return {"ids":[]}.`

export function buildSubjectClassifierUserPrompt(sceneLines: string): string {
  return `SCENES:\n${sceneLines}\n\nReturn the JSON object now:`
}

// Bloque de identidad canónica de UN personaje, anexado a la biblia visual.
// La referencia de IMAGEN fija la cara; este texto fija el resto
// (cuerpo/ropa/pelo/consistencia). Incluye el override explícito: la
// apariencia canónica del usuario le GANA a cualquier descripción que la
// biblia generada haya inventado para ese personaje. Sin descripción el
// personaje es «con foto»: ahí el texto prohíbe inventarle rasgos físicos.
export function buildCharacterBibleBlock(
  name: string,
  description: string,
): string {
  const trimmedName = name.trim()
  const trimmedDescription = description.trim()
  if (!trimmedName) return ''

  return (
    `\n\n--- MAIN REFERENCE CHARACTER ---\n` +
    `The recurring MAIN CHARACTER of this video is "${trimmedName}".` +
    (trimmedDescription
      ? ` Canonical appearance (authoritative): ${trimmedDescription}.`
      : '') +
    (trimmedDescription
      ? ` This canonical appearance OVERRIDES any other description in this guidance: if elsewhere ${trimmedName} is described with a different color, a generic look, or without their usual outfit, IGNORE that and keep ${trimmedName}'s exact identity, outfit and design as stated here. `
      : ` ${trimmedName}'s look comes from a reference photo attached to the image request, which you cannot see: never invent or describe ${trimmedName}'s skin tone, ethnicity, face, hair, eyes or age anywhere in this guidance or in a scene. `) +
    `Whenever the narration involves ${trimmedName} (by name, pronoun or clear reference), make ${trimmedName} the clear focus with this EXACT same identity and design, kept perfectly consistent across every scene where they appear. ` +
    `Keep ${trimmedName}'s hair IDENTICAL in every scene — same exact color, length and style — and the same face, skin tone and facial hair; never recolor, restyle, lengthen, shorten or change ${trimmedName}'s hair from one scene to the next. ` +
    `Render ${trimmedName} as the scene needs: full body or close-up as appropriate, the pose and action of that moment, and the clothing the narration specifies (otherwise their canonical outfit above — never plain or undressed if their canonical look includes clothing/accessories). ` +
    `When the narration does NOT involve ${trimmedName}, depict the place, idea or secondary subject of that moment instead — do not force ${trimmedName} into every scene.\n` +
    `--- END MAIN REFERENCE CHARACTER ---`
  )
}

// Hasta 2 personajes: un bloque autocontenido por cada uno.
export function buildCharactersBibleBlock(
  characters: { name: string; description: string }[],
): string {
  const valid = characters.filter((character) => character.name?.trim())
  if (valid.length === 0) return ''

  return valid
    .map((character) =>
      buildCharacterBibleBlock(character.name, character.description),
    )
    .join('')
}
