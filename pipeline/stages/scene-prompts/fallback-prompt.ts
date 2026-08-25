import { MAX_PROMPT_CHARS } from '../../prompts/prompt-limits.ts'
import {
  STICKMAN_CONCEPT_EXACT_TEXT,
  STICKMAN_CONCEPT_PROLOGUE,
  STICKMAN_CONCEPT_STYLE_BASE,
  STICKMAN_CONCEPT_TEXT_FREE,
  characterIndicesInRequest,
} from '../../prompts/scene-prompt-blocks.ts'
import {
  assembleUserScenePrompt,
  type VisualStyle,
} from '../../prompts/visual-styles.ts'
import type { Scene } from '../../types/scenes.ts'
import { sanitizeNarration } from '../../utils/content-safety.ts'
import { stripBibleMarker } from '../../utils/story-era.ts'
import { buildContextWindow } from './prompt-composer.ts'
import { directionPhraseForFallback } from './scene-director.ts'

// Respaldo determinístico y anclas de estilo del redactor (port de la Capa 3
// del parser del origen): lo que garantiza que una escena salga con un prompt
// coherente —estilo, personaje, pelo, idioma, plan del director— aunque el
// LLM no haya podido.

export interface PromptCharacter {
  name: string
  description: string
}

// ─── Ancla de realismo para "normal" ───
// Su systemPrompt PIDE cerrar con la frase ancla de fotorrealismo, pero el
// LLM a veces la omite en escenas fantásticas/abstractas → esa imagen salía
// ilustrada y el video mezclaba estilos. Se re-impone por código. No-op para
// los demás estilos (su bloque STYLE fijo es robusto).
export function anchorNormalRealism(
  prompt: string,
  style: VisualStyle,
): string {
  if (style.id !== 'normal') return prompt
  const anchor = style.template?.styleSuffix?.trim()
  if (!anchor) return prompt

  const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ')
  const normalized = normalize(prompt)
  const hasAnchor =
    normalized.includes(normalize(anchor)) ||
    (normalized.includes('photorealistic') &&
      normalized.includes('documentary realism'))
  if (hasAnchor) return prompt

  let body = prompt.trim()
  if (body && !/[.!?]$/.test(body)) body += '.'
  // Se recorta el CUERPO, nunca el ancla: la frase de realismo queda íntegra.
  const bodySpace = MAX_PROMPT_CHARS - anchor.length - 1
  if (body.length > bodySpace)
    body = body.slice(0, Math.max(0, bodySpace)).trim()
  return `${body} ${anchor}`.trim()
}

// ─── Escenario sin personaje en stickman ───
// El bloque STYLE fijo de stickman DESCRIBE al muñeco y el systemPrompt obliga
// a copiarlo verbatim, así que una escena de paisaje salía con un muñeco
// parado. Solución: se quitan los bloques fijos de la salida del LLM y se
// reenvuelve la SCENE en el molde CONCEPTO (sin figura). No-op fuera de stickman.

// ¿La SCENE trae rótulos ESCRITOS (palabras exactas entre comillas)?
function sceneHasWrittenLabels(scene: string): boolean {
  return /"[^"]{1,80}"|“[^”]{1,80}”|«[^»]{1,80}»/.test(scene)
}

// Rótulos exactos-o-nada: si la SCENE cita palabras → solo esas; si no →
// imagen completamente libre de texto (nunca permiso abierto: el generador
// inventaba rótulos en otros alfabetos).
function stickmanConceptSuffix(scene: string): string {
  return (
    STICKMAN_CONCEPT_STYLE_BASE +
    (sceneHasWrittenLabels(scene)
      ? STICKMAN_CONCEPT_EXACT_TEXT
      : STICKMAN_CONCEPT_TEXT_FREE)
  )
}

// Tratamiento de escenario por estilo: en stickman, el molde CONCEPTO; en los
// demás el PROLOGUE/STYLE del estilo ya rinde escenarios/objetos.
function sceneryTreatmentForStyle(
  style: VisualStyle,
  sceneInterior: string,
): string {
  const scene = sceneInterior.trim()
  if (style.id === 'pov_stickman') {
    const labelled = /^scene\s*:/i.test(scene) ? scene : `SCENE: ${scene}`
    return [
      STICKMAN_CONCEPT_PROLOGUE,
      labelled,
      stickmanConceptSuffix(scene),
    ].join(' ')
  }
  return assembleUserScenePrompt(style, scene)
}

export function rewriteSceneryWithoutCharacter(
  llmPrompt: string,
  style: VisualStyle,
  narrationFallback = '',
): string {
  if (style.id !== 'pov_stickman') return llmPrompt

  const prologue = (style.template?.prologue ?? '').trim()
  const suffix = (style.template?.styleSuffix ?? '').trim()
  let interior = llmPrompt
  if (prologue) interior = interior.split(prologue).join(' ')
  if (suffix) interior = interior.split(suffix).join(' ')
  interior = interior
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^scene\s*:/i, '')
    .trim()

  // Si el LLM parafraseó los bloques o devolvió basura, se reconstruye desde
  // la narración real (sin comillas: citada activaría la variante de rótulos).
  if (interior.length < 15) {
    const narration = sanitizeNarration(narrationFallback)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300)
    if (narration) {
      const unquoted = narration.replace(/["“”«»]/g, '').trim()
      interior = `the best single illustration of what the narration says here — ${unquoted} — Do NOT print that narration onto the image and do NOT add any caption, floating title or watermark — it is spoken, not written. This image carries NO readable text of any kind, in ANY language or alphabet: if the best visual is a diagram, draw it as a clean UNLABELLED schematic (shapes, arrows and icons only — no words). No characters, no people.`
    } else {
      interior =
        'the main thing the narration describes here (a place, object or concept), illustrated clearly, no characters present'
    }
  }

  return sceneryTreatmentForStyle(style, interior)
}

// ─── Rasgos de cabeza canónicos ───

// ¿La descripción menciona pelo? (un personaje calvo no debe recibir pelo).
export function descriptionMentionsHair(description: string): boolean {
  const lowered = (description || '').toLowerCase()
  if (
    /\b(bald|shaven|shaved|hairless|calv[oa]|rapad[oa]|pelad[oa])\b/.test(
      lowered,
    )
  )
    return false
  return /\b(hair|cabello|pelo|ponytail|braid|bun|dreadlocks|afro|bangs|fringe|mohawk|hairstyle|hairdo|coleta|trenza|mo[ñn]|rizos|melena|flequillo)\b/.test(
    lowered,
  )
}

const HAIR_IN_PROMPT_REGEX =
  /\b(hair|haired|hairstyle|hairdo|ponytail|braids?|braided|bun|dreadlocks|afro|bangs|fringe|mohawk|curly|curls|bald|shaven|shaved)\b/

// Rasgos de cabeza canónicos (pelo, barba, bigote, lentes) de los personajes
// PRESENTES que el prompt emitido no menciona: un backstop de identidad que
// dispara un reintento con corrección explícita.
export function missingHeadTraits(
  prompt: string,
  characters: PromptCharacter[],
  present: number[],
): string[] {
  const lowered = (prompt || '').toLowerCase()
  const missing = new Set<string>()
  for (const index of present) {
    const description = (characters[index]?.description || '').toLowerCase()
    if (!description) continue

    if (
      descriptionMentionsHair(description) &&
      !HAIR_IN_PROMPT_REGEX.test(lowered)
    )
      missing.add('hair')
    if (
      /\b(beard|barba)\b/.test(description) &&
      !/\bbeard(ed)?\b/.test(lowered)
    )
      missing.add('beard')
    if (
      /\b(mustache|moustache|bigote)\b/.test(description) &&
      !/\b(mustache|moustache)\b/.test(lowered)
    )
      missing.add('mustache')
    if (
      /\b(glasses|spectacles|eyeglasses|gafas|lentes|anteojos)\b/.test(
        description,
      ) &&
      !/\b(glasses|spectacles|eyeglasses)\b/.test(lowered)
    )
      missing.add('glasses')
  }
  return [...missing]
}

// ─── Fallback determinístico (Capa 3) ───

// Ensambla respetando MAX_PROMPT_CHARS SIN cortar el PROLOGUE/STYLE: se
// calcula el overhead fijo y se recorta SOLO el cuerpo del SCENE.
function assembleFallbackWithCap(
  style: VisualStyle,
  sceneInterior: string,
  isScenery: boolean,
): string {
  const usesStickmanScenery = isScenery && style.id === 'pov_stickman'
  const prologue = usesStickmanScenery
    ? STICKMAN_CONCEPT_PROLOGUE
    : (style.template?.prologue ?? '')
  // Presupuesto con el PEOR caso de las dos variantes del sufijo stickman.
  const styleSuffix = usesStickmanScenery
    ? STICKMAN_CONCEPT_STYLE_BASE +
      (STICKMAN_CONCEPT_TEXT_FREE.length > STICKMAN_CONCEPT_EXACT_TEXT.length
        ? STICKMAN_CONCEPT_TEXT_FREE
        : STICKMAN_CONCEPT_EXACT_TEXT)
    : (style.template?.styleSuffix ?? '')
  const separator =
    !usesStickmanScenery && style.template?.separator === 'newline'
      ? '\n\n'
      : ' '

  const overhead =
    prologue.length +
    styleSuffix.length +
    'SCENE: '.length +
    separator.length * 2 +
    4
  const max = Math.max(40, MAX_PROMPT_CHARS - overhead)
  const cappedScene =
    sceneInterior.length > max
      ? sceneInterior.slice(0, max).trim()
      : sceneInterior

  return isScenery
    ? sceneryTreatmentForStyle(style, cappedScene)
    : assembleUserScenePrompt(style, cappedScene)
}

// Planos de respaldo, rotados por id (mismo id → mismo plano: re-render
// idéntico) con paso que evita repetir entre escenas contiguas.
const FALLBACK_SHOTS = [
  'a wide establishing shot of the scene',
  'a closer, eye-level shot focused on the key subject or detail',
  'a low-angle or high-angle view of the scene',
  'a medium shot from a different side or vantage point',
]

// Última línea de defensa, sin LLM: ancla en (a) los hechos de la biblia, (b)
// la narración REAL del momento, (c) el PROLOGUE/STYLE real del estilo y (d)
// la identidad canónica de los personajes presentes (con refuerzo de pelo) +
// el idioma del texto in-image. Doctrina "blank beats wrong": sin LLM que
// escriba rótulos correctos, los diagramas van SIN palabras.
export function buildDeterministicFallbackPrompt(
  scene: Scene,
  visualBible: string | undefined,
  style: VisualStyle,
  orderedScenes: Scene[],
  characters: PromptCharacter[],
  imageTextLanguage: string,
): string {
  // Un pedido manual del usuario manda sobre el fragmento auto-cortado.
  let narration = (scene.userPrompt?.trim() || scene.text || '').trim()
  if (narration.length < 40 && orderedScenes.length > 0) {
    const window = buildContextWindow(orderedScenes, scene.id, 320)
    if (window.length > narration.length) narration = window
  }
  // Este camino no pasa por el LLM: un término sensible iría directo al
  // generador, por eso se suaviza ANTES de embeber.
  narration = sanitizeNarration(narration)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)

  // Presencia EFECTIVA: un pedido manual que menciona al personaje lo trae de
  // vuelta (paridad con el camino LLM); lo persistido no se toca.
  let present = scene.charactersPresent ?? []
  if (
    present.length === 0 &&
    characters.length > 0 &&
    scene.userPrompt?.trim()
  ) {
    const mentioned = characterIndicesInRequest(scene.userPrompt, characters)
    if (mentioned.length > 0) present = mentioned
  }
  const presentCharacters = characters.filter((_, index) =>
    present.includes(index),
  )

  // Biblia (sin marcador) como lead-in factual breve, DENTRO del SCENE para
  // que PROLOGUE quede primero y STYLE último (invariante del template).
  const bible = stripBibleMarker(visualBible)
  const bibleFacts =
    bible.trim().length >= 20
      ? `World facts (keep identical): ${bible.trim()} `
      : ''

  const language = (imageTextLanguage || '').trim()
  const narrationLabel = language ? `(${language} narration)` : '(narration)'

  // El plan del director acompaña al fallback, salvo con pedido manual.
  const activeDirection = scene.userPrompt?.trim() ? undefined : scene.direction
  // ¿Diagrama con rótulos exactos del director? Entonces el candado de texto
  // cambia de variante: "sin texto" contradeciría los rótulos.
  const planLabels =
    activeDirection?.treatment === 'diagram' &&
    (activeDirection.labels?.length ?? 0) > 0
      ? activeDirection.labels!
      : null
  const languageClause = planLabels
    ? ` Do NOT print the narration onto the image and do NOT add any caption, subtitle, floating title or watermark — the narration is spoken, not written. The ONLY readable text allowed in the image are the exact quoted diagram words given in this prompt, drawn once each, big and letter-perfect, in the exact language and spelling they are quoted in — never the narration, and NO other text, label, caption or signage in ANY language or alphabet.`
    : ` Do NOT print the narration onto the image and do NOT add any caption, subtitle, floating title or watermark — the narration is spoken, not written. This image carries NO readable text of any kind, in ANY language or alphabet — no title, no labels, no lettering. If the best visual is a diagram, draw it as a clean UNLABELLED schematic (shapes, arrows and icons only — no words). The ONLY exception is text that physically exists inside the scene (a sign, a screen, a product label) — written in ${
        language || "the narration's own language"
      }, never translated to English and never in another alphabet.`

  const framingBase = ` Camera: prefer ${
    FALLBACK_SHOTS[Math.abs(scene.id) % FALLBACK_SHOTS.length]
  } for this scene, so consecutive scenes never repeat the same framing.`
  const framingClause = `${framingBase} If this moment happens in the SAME place as the surrounding story, keep that location and its defining background elements consistent and change ONLY the camera angle and distance — do not invent a new, unrelated location.`
  // Ramas de CONTENIDO (ilustración/diagrama): sin la orden de locación
  // consistente (el generador la leía como orden de repetir lugar).
  const contentFramingClause = `${framingBase} If this image is a diagram or explanatory illustration, ignore the camera preference and lay the diagram out clearly instead.`

  const directionPhrase = directionPhraseForFallback(activeDirection, {
    present: present.length > 0,
    hasCharacters: characters.length > 0,
    characterNames: presentCharacters.map((character) => character.name),
    isStickmanStyle: style.id === 'pov_stickman',
    styleId: style.id,
  })

  // La narración va SIN comillas: citada activaba la variante "texto exacto"
  // del molde stickman y el generador podía estampar la narración.
  const plainNarration = narration.replace(/["“”«»]/g, '').trim()

  if (presentCharacters.length > 0) {
    const characterParts = presentCharacters.map((character) => {
      const name = (character.name || '').trim()
      const description = (character.description || '').trim()
      const base = description
        ? description
        : `the recurring character ${name || '(unnamed)'} with their established design`
      const hair = descriptionMentionsHair(description)
        ? ` Keep ${name || 'this character'}'s exact hair (color, length and style) drawn on the head; never bald, never replaced by a hat or scarf unless canonical.`
        : ''
      return `${base.replace(/\s+$/, '')}.${hair}`
    })
    const both =
      presentCharacters.length > 1
        ? ' Both characters are present together in the same image, each drawn with their exact identity.'
        : ''

    // Candado anti-extras (paridad con el camino LLM): sin esto, las escenas
    // caídas al fallback salían con una segunda persona inventada.
    const names = presentCharacters
      .map((character) => (character.name || '').trim())
      .filter(Boolean)
    const namesList = names.join(' and ') || 'the recurring character'
    const extrasException =
      activeDirection?.treatment === 'group'
        ? ` UNLESS the narration above explicitly names another person or this scene is planned as a social scene below`
        : ` UNLESS the narration above explicitly names another person`
    const extrasGuard = ` Only ${namesList} ${names.length > 1 ? 'appear' : 'appears'} in this image: do NOT add any other person, and NO extra background people, bystanders, crowd or silhouettes — not even small or distant ones —${extrasException}. If so, draw every such person clearly DIFFERENT from ${namesList} (a different hairstyle or a hat, and clothing in a different colour) and NEVER as a duplicate or second copy of ${namesList}.`

    const sceneInterior =
      `${bibleFacts}${characterParts.join(' ')}${both}${extrasGuard} Illustrate this moment faithfully ${narrationLabel}: ${plainNarration}.${framingClause}${languageClause}${directionPhrase}`
        .replace(/\s+/g, ' ')
        .trim()
    return assembleFallbackWithCap(style, sceneInterior, false)
  }

  // Proyecto SIN NINGÚN personaje: en stickman hay figura genérica (rasgo del
  // estilo); en los demás estilos se ilustra lo narrado sin figura forzada.
  if (characters.length === 0) {
    if (style.id === 'pov_stickman') {
      const genericInterior =
        `${bibleFacts}A single generic, anonymous figure (the implied narrator/protagonist of the story, with NO fixed identity — it may look different in each scene) is present in the setting, naturally doing, watching or reacting to what the narration describes. If the narration explains a specific object, fact or concept, the figure may present or point at that illustration instead. Illustrate this moment faithfully ${narrationLabel}: ${plainNarration}.${framingClause}${languageClause}${directionPhrase}`
          .replace(/\s+/g, ' ')
          .trim()
      return assembleFallbackWithCap(style, genericInterior, false)
    }
    const contentInterior =
      `${bibleFacts}Show the best single visual that explains what the narration describes here — a place, an object, a named artwork or landmark (depict that exact thing), or a simple clear diagram illustrating a concept (drawn WITHOUT any words or labels). If the narration implies people, depict them as anonymous, generic persons who fit the moment; otherwise show no people. Depict it faithfully ${narrationLabel}: ${plainNarration}.${contentFramingClause}${languageClause}${directionPhrase}`
        .replace(/\s+/g, ' ')
        .trim()
    return assembleFallbackWithCap(style, contentInterior, true)
  }

  // Escena sin personajes presentes (con personajes en el proyecto): SIEMPRE
  // ilustra el contenido, sin gente.
  const sceneInterior =
    `${bibleFacts}Show the best single visual that explains what the narration describes here — a place, an object, a named artwork or landmark (depict that exact thing), or a simple clear diagram illustrating a concept (drawn WITHOUT any words or labels) — with NO people and NO characters of any kind. Depict it faithfully ${narrationLabel}: ${plainNarration}.${contentFramingClause}${languageClause}${directionPhrase}`
      .replace(/\s+/g, ' ')
      .trim()
  return assembleFallbackWithCap(style, sceneInterior, true)
}
