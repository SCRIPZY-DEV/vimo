import type { SuggestCharacterProfilePayload } from '../types/characters.ts'

// Experto en identidad de personaje. El prompt del sistema es el contrato con
// el LLM.
// describe SOLO quién es el personaje — nunca el estilo visual, la escena, la pose ni la
// cámara — porque el estilo se aplica aparte al generar cada imagen. Si la
// identidad trajera "cartoon" o "foto realista", contradiría al estilo elegido.
export const CHARACTER_DESIGNER_SYSTEM_PROMPT = `You are a CHARACTER DESIGNER for AI image generation. You write ONE compact English description of a SINGLE character's IDENTITY, to be reused across many images of that same character.

HOW TO PICK THE CHARACTER (in this priority):
1. If the NOTES contain a Name or any appearance description, design THAT exact character — use the SCRIPT only to enrich plausible details. The AVOID list below does NOT apply in this case (the user explicitly chose this character).
2. ONLY if the NOTES are empty, infer ONE prominent character that appears in the SCRIPT and design them. In this case the character MUST be DIFFERENT from everyone in the AVOID list — never reproduce or lightly re-skin them (clearly different age/gender/look/role); pick another character from the script.
The AVOID list exists so that, when inferring, you don't hand back a character that was already designed for this same video.

You describe ONLY who the character IS (so they look identical in every image). This identity is reused across MANY visual styles — INCLUDING very simple ones (stickman / minimal / flat) where the head is a plain shape with NO facial detail. So the identity MUST be carried by traits that stay recognizable even there. Order the description by how DISTINCTIVE and DRAWABLE each trait is (most recognizable first):
- HAIR FIRST: exact color, length and style, plus facial hair — OR state explicitly "bald" / "clean-shaven" if that fits. Hair (or baldness) is the single most recognizable trait in every style.
- SKIN TONE RIGHT AFTER THE HAIR, for every human character: state it explicitly in plain words ("dark brown skin", "light olive skin", "pale freckled skin"). If the NOTES give a skin tone or an ethnicity, keep exactly that one; otherwise choose one that fits the character. Realistic styles default to a light-skinned person when this is missing, so it is NEVER optional and NEVER left for the end. Keep it to a few words.
- ONE bold SIGNATURE feature that is easy to draw and unmistakable: a thick moustache, a full beard, big round glasses, an eyepatch, a distinctive hat or cap, heavy freckles, a prominent scar, a bold hair color, etc. ALWAYS give the character at least one such simply-drawable trait so they stay consistent.
- CLOTHING and its DOMINANT COLORS, plus any signature ACCESSORY or PROP that fits their role (a priest -> black cassock and white collar; a baker -> white apron; a soldier -> uniform; etc.). Be specific about colors.
- body build/contexture and overall silhouette.
- THEN, briefly and LAST, face shape and eyes — keep these short; simple styles cannot show them, so NEVER let the identity rely only on facial micro-features.

ABSOLUTELY FORBIDDEN (these would break generation when combined with a separate visual style):
- NO visual style words: photorealistic, cartoon, anime, 3D, CGI, render, illustration, painting, cinematic, stickman, comic, sketch, watercolor, etc.
- NO scene, background, setting, location or environment.
- NO pose, action, camera angle, shot type, framing or lighting.
- NO real people's names, celebrities or copyrighted characters. Generic archetypes only. SFW only.

Keep it 300-600 characters, a single flowing phrase. Translate the identity description to English.

ALSO return, to auto-fill the form fields:
- "name": the REQUIRED character's name — the one given in the NOTES, or the one you pick from the SCRIPT when inferring (a proper name like "Elena", or a short label like "el mensajero" if the character is unnamed). Keep it in its original language. Always provide a coherent name or label; never leave it empty.
- "age": a REQUIRED short age or age range in Spanish for the form (e.g. "55 años", "mediana edad"). Preserve any age given by the user or script; otherwise choose a plausible age/life stage consistent with the character. Never leave it empty. For a character to which age does not apply, explain that briefly instead of inventing a human age.
- "role": a REQUIRED short role/occupation in Spanish for the form (e.g. "sacerdote", "herbolaria"). If no occupation is stated, infer their role in the story. Never leave it empty.

OUTPUT FORMAT (STRICT): return ONLY this JSON object, no preamble, no markdown:
{"prompt": "<identity description in English>", "name": "<name or short label>", "age": "<required short age in Spanish>", "role": "<required short role in Spanish>"}`

// Límites del origen.
export const NOTES_LIMIT = 1500
export const SCRIPT_LIMIT = 4000
export const AVOID_LIMIT = 800
export const AVOID_DESCRIPTION_LIMIT = 200
export const IDENTITY_PROMPT_LIMIT = 800
export const MIN_IDENTITY_PROMPT_LENGTH = 20
export const FALLBACK_PROMPT_LIMIT = 700
export const NAME_LIMIT = 80
export const AGE_LIMIT = 40
export const ROLE_LIMIT = 60

/**
 * Palabras de ESTILO/ESCENA que no pueden aparecer en la identidad: romperían
 * la generación al combinarse con un estilo contrario. Si el LLM las cuela
 * igual, se podan defensivamente. Incluye los términos de MUÑECO en inglés y
 * español: una identidad contaminada con "doll" se inyectaba verbatim en un
 * video realista y el generador dibujaba el muñeco.
 */
const FORBIDDEN_STYLE_WORDS =
  /\b(photorealistic|photo-?realistic|realistic photo|cartoon|anime|manga|3d|cgi|render(?:ed|ing)?|illustration|illustrated|painting|painterly|concept art|cinematic|stickman|stick figure|doll|round white head|white round head|mu[ñn]eco(?: de palitos)?|palitos|palotes|cabeza (?:redonda )?blanca|watercolou?r|oil painting|sketch|comic|cel-?shaded|low-?poly|pixar|disney|claymation|vector art|digital art|hyperrealistic)\b/gi

export function stripStyleWords(text: string): string {
  return text
    .replace(FORBIDDEN_STYLE_WORDS, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim()
}

/** Extrae el primer objeto JSON balanceado de una respuesta del LLM. */
export function extractJsonObject(
  text: string,
): Record<string, unknown> | null {
  const cleaned = text
    .replace(/```(?:json|jsonc)?\s*\n?/gi, '')
    .replace(/```/g, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Identidad determinística con los campos que dio el usuario, para cuando el
 * LLM falla o no hay nada que inferir. Aun acá se empuja hacia un rasgo
 * DIBUJABLE y distintivo: es lo que mantiene la identidad en estilos simples.
 */
export function deterministicFallbackPrompt(
  input: SuggestCharacterProfilePayload,
): string {
  const parts: string[] = []
  const subject = [input.age?.trim(), input.role?.trim()]
    .filter(Boolean)
    .join(' ')
  parts.push(
    subject
      ? `A character: ${subject}`
      : `A character named ${input.name?.trim() || 'the main character'}`,
  )
  if (input.description?.trim()) parts.push(input.description.trim())
  parts.push(
    'give this character one bold, simply-drawable distinctive trait (hair or baldness, a moustache or beard, glasses, a hat, or a signature clothing colour) and keep that same hair, same outfit and same distinctive trait identical in every scene',
  )

  return stripStyleWords(parts.join('. ').slice(0, FALLBACK_PROMPT_LIMIT))
}

/** Notas del formulario, en el formato que espera el prompt del sistema. */
export function buildCharacterNotes(
  input: SuggestCharacterProfilePayload,
): string {
  return [
    input.name?.trim() ? `Name: ${input.name.trim()}` : '',
    input.age?.trim() ? `Age: ${input.age.trim()}` : '',
    input.role?.trim() ? `Role/occupation: ${input.role.trim()}` : '',
    input.description?.trim()
      ? `Appearance notes: ${input.description.trim()}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildCharacterDesignerUserPrompt(
  input: SuggestCharacterProfilePayload,
  notes: string,
): string {
  const script = (input.script ?? '').trim()
  const avoid = (input.avoid ?? [])
    .map((item) => {
      const name = (item.name ?? '').trim()
      const description = (item.description ?? '')
        .trim()
        .slice(0, AVOID_DESCRIPTION_LIMIT)
      if (!name && !description) return ''
      return `- ${name || '(unnamed)'}${description ? `: ${description}` : ''}`
    })
    .filter(Boolean)
    .join('\n')

  const blocks = [
    notes
      ? `CHARACTER NOTES (Spanish or English):\n"""\n${notes.slice(0, NOTES_LIMIT)}\n"""`
      : '',
    script
      ? `SCRIPT for context (Spanish):\n"""\n${script.slice(0, SCRIPT_LIMIT)}\n"""`
      : '',
    avoid
      ? `CHARACTERS ALREADY DESIGNED for this video — design a DIFFERENT person, never reproduce these:\n${avoid.slice(0, AVOID_LIMIT)}`
      : '',
  ].filter(Boolean)

  return `${blocks.join('\n\n')}\n\nReturn the JSON object now:`
}
