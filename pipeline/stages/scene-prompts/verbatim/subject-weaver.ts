// La descripción del personaje y cómo viaja DENTRO de los prompts de escena.
// Port de `motor-web/verbatim/sujeto.ts` del origen — funciones PURAS sobre
// texto, sin red, sin claves, sin estado.
//
// La Fase 1 pide el RETRATO COMPLETO de la gema (el formato que las gemas
// dominan, con la identidad completa) y la descripción permanente sale de
// darle los TRES TIJERETAZOS de acá:
//
//   1. `cleanDescription` — corta la cola `Style:` (cada escena trae la
//      suya), la charla de la gema y aplana a una línea.
//   2-3. `trimPortrait` — los recortes de retrato (encabezado de ficha, pose,
//      encuadre, brazos, expresión fija, fondo) + puntuación huérfana.
//
// `portraitStateMark` VERIFICA el resultado: nunca se shippea una descripción
// con estado de retrato — se repetiría en las 50 escenas y las congelaría.
//
// El tejido: `[subject]` se reemplaza por "the <rol>" y la descripción se
// pega AL FINAL del prompt, idéntica en todas las escenas — la consistencia
// sale de repetir el mismo texto palabra por palabra. El encabezado con el que
// se presenta vive en `prompts/verbatim-identity.ts` (lo lee también el scrub
// final, para no recortar la identidad primero).

import {
  DESCRIPTION_HEADER,
  DESCRIPTION_HEADER_PREFIX,
} from '../../../prompts/verbatim-identity.ts'
import type { Scene } from '../../../types/scenes.ts'
import { bodyWithoutFinalClauses } from '../../shared/prompt-safety.ts'

/** Reemplazo de `[subject]` cuando el diseño del personaje falló del todo. */
export const FALLBACK_SUBJECT = 'the main character'

/**
 * Reemplazo de `[subject]` cuando el video NO tiene protagonista. El tag no
 * se puede BORRAR y ya: viene metido dentro de la frase de acción y sacarlo
 * deja el prompt roto. Se degrada a una persona sin identidad fija. Es una
 * RED, no el plan: el preámbulo del lote ya le prohibió la etiqueta al
 * modelo, y cuando esto se dispara, el motor lo dice en el log.
 */
export const NEUTRAL_SUBJECT = 'the person in this scene'

const SUBJECT_TAG_REGEX = /\[subject\]/gi

/** ¿El prompt de escena nombra al protagonista? (antes de resolver el tag). */
export function namesSubject(scenePrompt: string): boolean {
  SUBJECT_TAG_REGEX.lastIndex = 0
  const found = SUBJECT_TAG_REGEX.test(scenePrompt)
  // /g + test deja `lastIndex` movido: la próxima búsqueda arrancaría de ahí.
  SUBJECT_TAG_REGEX.lastIndex = 0
  return found
}

/**
 * EL NARRADOR DESNUDO (v1.29.0 del origen): el modelo escribió "The narrator
 * sits at a wooden desk..." — ni etiqueta ni descripción — y el generador
 * inventó OTRO personaje en medio del video. Esta red detecta la mención
 * GENÉRICA al protagonista para que esa escena también reciba la descripción
 * tejida. La lista es corta a propósito: una escena legítimamente sin
 * protagonista no usa estas palabras.
 */
const GENERIC_PROTAGONIST_REGEX =
  /\b(?:the\s+)?(?:narrator|protagonist|main\s+character)\b/i

export function mentionsProtagonist(scenePrompt: string): boolean {
  return GENERIC_PROTAGONIST_REGEX.test(scenePrompt)
}

/*
 * Limpieza de la Fase 1: el modelo puede arrastrar dos colas de su gema — el
 * bloque "Style:" y la frase de cierre de fase. OJO con la frase de cierre:
 * medido que a veces viene traducida al inglés y PEGADA al mismo párrafo, así
 * que se corta POR FRASE: se descarta toda oración que hable de la
 * conversación en vez de describir al personaje.
 */

/** El bloque `Style: ...` — cada prompt de escena ya termina con el suyo. */
const STYLE_TAIL_REGEX = /\bstyle\s*:[\s\S]*$/i

/** Oraciones de charla de la gema, en español o traducidas al inglés. */
const CHATTER_SENTENCES: readonly RegExp[] = [
  /aqu[ií]\s+tienes/i,
  /\bcharacter\s+prompt\b/i,
  /\bprompt\s+(?:of|for)\s+(?:your|the)\s+(?:character|protagonist)\b/i,
  /\bgen[eé]ralo\b/i,
  /\bgenerate\s+it\b/i,
  /\bc[aá]rga(?:lo|la)\b/i,
  /\b(?:upload|load)\s+it\b/i,
  /\bas\s+(?:a\s+)?reference\b/i,
  /\benv[ií]ame\b/i,
  /\bsend\s+me\b/i,
  /\bfragmentos\s+del\s+guion\b/i,
  /\b(?:script\s+fragments?|fragments?\s+of\s+the\s+script)\b/i,
  // Cola por-prompt de la gema: pertenece a cada escena, no al personaje.
  /\bif\s+any\s+text\s+appears\b/i,
]

function isChatterSentence(sentence: string): boolean {
  return CHATTER_SENTENCES.some((regex) => regex.test(sentence))
}

/**
 * Oraciones de ESCENA dentro del retrato (v1.30.0, medido con gemas sin fase
 * de personaje): "She stands in the garden at dusk, holding a rusted key" no
 * es identidad, es una pose en un lugar — pegada al final de TODAS las
 * escenas las contradice. Una frase de ficha legítima no arranca con
 * pronombre + verbo de acción.
 */
const SCENE_SENTENCES: readonly RegExp[] = [
  /^(?:she|he|they|it)\s+(?:stands?|sits?|walks?|kneels?|lies|leans?|holds?|is\s+(?:standing|sitting|walking|kneeling|lying|leaning|holding))\b/i,
]

function isSceneSentence(sentence: string): boolean {
  return SCENE_SENTENCES.some((regex) => regex.test(sentence))
}

/**
 * Encabezados-etiqueta y énfasis de markdown MEDIDOS en retratos ("Prompt: A
 * soft, pastel..." se colaba al rol tejido; "**Lucía**" viajaba con
 * asteriscos; "Role: ..." y "Main Character – ..." de la fase inyectada). El
 * guión solo separa si viene CON espacios alrededor ("Character-driven" es
 * una palabra); la clase incluye los guiones Unicode que el modelo usa.
 */
const LEADING_LABEL_REGEX =
  /^\s*(?:image\s+)?(?:prompt|character(?:\s+(?:prompt|sheet))?|ficha|personaje|protagonist(?:a)?|main\s+character|role)(?:\s*:\s*|\s+[-‐‑–—]\s+)/i

/**
 * Deja la respuesta de la Fase 1 como UNA línea de descripción: sin bloque de
 * estilo, sin numeración, sin saltos y sin las oraciones de charla. Devuelve
 * "" si no queda nada usable — el llamador lo trata como intento fallido.
 */
export function cleanDescription(raw: string): string {
  let text = raw.replace(STYLE_TAIL_REGEX, ' ')
  // Markdown y etiqueta de encabezado, antes de partir en oraciones.
  text = text.replace(/\*\*|__/g, '').replace(LEADING_LABEL_REGEX, '')
  // Numeración o viñetas al inicio de línea y todo a una sola línea.
  text = text
    .replace(/^\s*(?:\d+[.)]\s*|[-*]\s+)/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter(
      (sentence) =>
        sentence.trim() &&
        !isChatterSentence(sentence) &&
        !isSceneSentence(sentence),
    )
  const clean = tidyPunctuation(sentences.join(' '))
  if (countWords(clean) < MIN_DESCRIPTION_WORDS) return ''
  return /[.!?]$/.test(clean) ? clean : `${clean}.`
}

/*
 * Estado que congela (MEDIDO, no supuesto). Nada de esto puede viajar dentro
 * de la descripción, porque se repite en las 50 escenas y las congela:
 * encuadre/formato (cada escena se vuelve ficha de catálogo), pose de
 * estudio, expresión fija, fondo de retrato. "expressive brows" NO cae acá:
 * la palabra vetada es "expression".
 */
const STATE_MARKS: readonly RegExp[] = [
  /\bfull[- ]body\b/i,
  /\bcharacter\s+(?:model|sheet|design|reference|turnaround)\b/i,
  /\bportrait\b/i,
  /\bstanding\s+in\b/i,
  /\bneutral\s+pose\b/i,
  /\bt[- ]pose\b/i,
  /\bfacing\s+(?:forward|front|the\s+camera|the\s+viewer)\b/i,
  /\b(?:hands|arms)\s+(?:resting\s+|hanging\s+|held\s+)?(?:by|at|along)\s+(?:the|his|her|their|its)\s+sides?\b/i,
  /\b(?:calm|neutral|serene|attentive|blank|stoic)\s+(?:\w+\s+)?(?:expression|gaze|stare)\b/i,
  /\bisolated\s+on\b/i,
  /\b(?:white|grey|gray|neutral|plain|solid|blank)\s+background\b/i,
  /\bno\s+text\b/i,
]

/**
 * La primera marca de «estado de retrato» que quede en la descripción, o
 * `undefined` si está limpia. Con marca, la descripción NO sirve: se
 * reintenta el diseño en vez de recortar por regex.
 */
export function portraitStateMark(description: string): string | undefined {
  for (const regex of STATE_MARKS) {
    const match = regex.exec(description)
    if (match) return match[0]
  }
  return undefined
}

/*
 * Los recortes de retrato (tijeretazos 2 y 3): la Fase 1 pide el retrato
 * completo de la gema y esto lo deja en descripción permanente. Asume que la
 * entrada ya pasó por `cleanDescription`; el resultado se verifica con
 * `portraitStateMark`.
 */
const SHEET_NOUNS = 'model|sheet|design|reference|turnaround|portrait'

const PORTRAIT_TRIMS: readonly RegExp[] = [
  new RegExp(`^[^.]*?\\bcharacter\\s+(?:${SHEET_NOUNS})\\s+of\\s+`, 'i'),
  /,?\s*\bstanding\s+in\s+an?\s+[^,.]*\bpose\b[^,.]*/gi,
  /,?\s*\bin\s+an?\s+(?:neutral|t|a)[- ]?pose\b[^,.]*/gi,
  /,?\s*\bfacing\s+(?:forward|front|the\s+camera|the\s+viewer)\b[^,.]*/gi,
  /,?\s*\bfull[- ]body\s+(?:shot|view|portrait)\b[^,.]*/gi,
  /,?\s*\b(?:simple\s+|relaxed\s+)?(?:hands|arms)\s+(?:resting\s+|hanging\s+|held\s+)?(?:by|at|along|to)\s+(?:the|his|her|their|its)\s+sides?\b[^,.]*/gi,
  /,?\s*\barms\s+(?:relaxed|straight|down)\b[^,.]*/gi,
  /,?\s*\b(?:calm|neutral|serene|attentive|friendly|pleasant|relaxed|blank|stoic|gentle)(?:\s+\w+)?\s+(?:expression|gaze|stare)\b[^,.]*/gi,
  /,?\s*\bisolated\s+on\s+[^.]*/gi,
  /,?\s*\b(?:on|against|over)\s+an?\s+[^,.]*\bbackground\b[^,.]*/gi,
  /,?\s*\b(?:plain|solid|blank)\s+(?:white|grey|gray|neutral)\s+backdrop\b[^,.]*/gi,
  /,?\s*\bno\s+text\b/gi,
  /,?\s*\bfull[- ]body\b[^,.]*/gi,
]

/** Recorta el retrato a descripción. "" si no queda nada que valga la pena. */
export function trimPortrait(descriptionWithState: string): string {
  let text = descriptionWithState
  for (const trim of PORTRAIT_TRIMS) text = text.replace(trim, ' ')
  const clean = tidyPunctuation(text)
  if (countWords(clean) < MIN_DESCRIPTION_WORDS) return ''
  return /[.!?]$/.test(clean) ? clean : `${clean}.`
}

/**
 * ÚLTIMO recurso cuando una marca de estado sobrevivió a los recortes en
 * TODOS los intentos: se tira LA FRASE ENTERA que la trae (el recorte fino
 * que falló tres veces va a fallar la cuarta). Perder una frase de identidad
 * es mejor que congelar la pose en 50 escenas, y muchísimo mejor que degradar
 * a "the main character".
 */
export function dropSentencesWithState(description: string): string {
  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .filter(
      (sentence) =>
        sentence.trim() && portraitStateMark(sentence) === undefined,
    )
  const clean = tidyPunctuation(sentences.join(' '))
  if (countWords(clean) < MIN_DESCRIPTION_WORDS) return ''
  return /[.!?]$/.test(clean) ? clean : `${clean}.`
}

/*
 * Rol y tejido final.
 */

/**
 * El rol del protagonista, sacado de la PRIMERA oración de su descripción (la
 * consigna pide empezar por el rol). Se corta en la primera coma para no
 * arrastrar rasgos, y si lo que queda no parece un rol cae al genérico — la
 * identidad completa viaja igual en la descripción del final.
 */
export function roleFromDescription(description: string): string {
  const first = description.split(/(?<=[.!?])\s+/)[0] ?? ''
  // Jerga de imagen en la primera oración = el retrato NO empieza por el rol
  // (medido: "A soft, pastel watercolor illustration of..." tejía "the
  // soft"). Palabras ESTRUCTURALES a propósito, no medios: un rol legítimo
  // puede ser "a watercolor artist".
  if (NON_ROLE_JARGON_REGEX.test(first)) return 'main character'
  const base = first.split(',')[0] ?? ''
  const role = base
    .replace(/[.!?]+$/, '')
    .replace(/^\s*(?:an?|the)\s+/i, '')
    .trim()
  if (!role || !/\p{L}/u.test(role) || role.split(/\s+/).length > 12)
    return 'main character'

  return role
}

/** Ver `roleFromDescription`: la primera oración no es un rol. */
const NON_ROLE_JARGON_REGEX =
  /\b(?:prompt|illustration|image|picture|render(?:ing)?|depiction|artwork|portrait)\b/i

/**
 * v1.31.3 (E47) — ¿El rol derivado sirve para TEJER? Un rol legítimo es una
 * frase nominal corta (1-6 palabras en todo lo medido). La ficha que escribe
 * el USUARIO puede abrir con rasgos ("Long wavy brown hair falls to the
 * shoulders") y ese scrape NO es un rol. "main character" es el degradado de
 * `roleFromDescription`, no un rol usable. Lo consume SOLO el modo `text`:
 * con rol inusable y nombre disponible, el nombre pasa a ser el rol.
 */
export function roleUsableForWeaving(role: string): boolean {
  return role !== 'main character' && role.split(/\s+/).length <= 6
}

/**
 * ¿Cuánta IDENTIDAD trae la ficha, descontando la jerga de estilo? Medido:
 * "Lucia, an adventurous 8-year-old girl, illustrated in soft watercolor on
 * textured cold-pressed paper." — 13 palabras, 5 de técnica de pintura: sin
 * pelo ni ropa ni colores, el atuendo salía DISTINTO entre escenas. Se
 * cuentan solo las palabras que pueden describir a una persona. La lista es
 * de técnica pura a propósito: "pastel" NO está (es color de ropa legítimo).
 */
const TECHNIQUE_WORD_REGEX =
  /^(?:watercolor|illustrated|illustration|drawn|drawing|painted|painting|rendered|rendering|textured|texture|paper|palette|brushstrokes?|brushwork|wash|artwork|style|styled|cold-pressed)$/i

/** Piso de palabras de identidad para que una ficha cuente como «con sustancia». */
export const MIN_IDENTITY_WORDS = 10

export function identityWordCount(description: string): number {
  return description
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, ''))
    .filter((word) => /\p{L}/u.test(word) && !TECHNIQUE_WORD_REGEX.test(word))
    .length
}

/**
 * Deja el prompt de escena listo para el generador:
 *
 *  - Sin `[subject]` (plano de recurso): el prompt queda TAL CUAL.
 *  - Sin descripción (el diseño falló del todo): `[subject]` no puede viajar
 *    pelado al generador (E29-bis) — se degrada al genérico.
 *  - Camino feliz: `[subject]` → "the <rol>" tejido en la acción, y la
 *    descripción permanente pegada AL FINAL, idéntica en todas las escenas.
 */
export function weaveSubject(
  scenePrompt: string,
  description?: string,
  name?: string,
): string {
  const scene = scenePrompt.trim()
  const identity = description?.trim()

  if (!namesSubject(scene)) {
    // Narrador desnudo: mención genérica sin etiqueta y sin descripción → se
    // le pega la descripción igual, para que nunca viaje una mención sin
    // identidad. Si YA está adentro (el modelo la repitió), no se duplica.
    if (
      identity &&
      (mentionsProtagonist(scene) || namesByName(scene, name)) &&
      !scene
        .toLowerCase()
        .includes(identity.replace(/[.!?]+$/, '').toLowerCase())
    ) {
      const separator = /[.!?]$/.test(scene) ? ' ' : '. '
      const finalIdentity = /[.!?]$/.test(identity) ? identity : `${identity}.`
      return `${scene}${separator}${DESCRIPTION_HEADER} ${finalIdentity}`
    }
    return scene
  }
  if (!identity) return scene.replace(SUBJECT_TAG_REGEX, FALLBACK_SUBJECT)

  // Si el rol es un NOMBRE PROPIO ("Lucía, a curious girl..."), el tejido va
  // sin artículo: "of Lucía crouching", no "of the Lucía crouching". Nombre =
  // 1-2 palabras que empiezan en mayúscula.
  const role = roleFromDescription(identity)
  const isProperName =
    /^\p{Lu}/u.test(role) &&
    role.split(/\s+/).length <= 2 &&
    role !== 'main character'
  const base = scene
    .replace(SUBJECT_TAG_REGEX, isProperName ? role : `the ${role}`)
    .trimEnd()
  const separator = /[.!?]$/.test(base) ? ' ' : '. '
  const finalIdentity = /[.!?]$/.test(identity) ? identity : `${identity}.`
  return `${base}${separator}${DESCRIPTION_HEADER} ${finalIdentity}`
}

/**
 * El ancla que ata el nombre a la FOTO adjunta, dentro del propio prompt de
 * escena (v1.27.0: el nombre pelado no le dice nada al generador — inventaba
 * un homónimo). Va UNA vez por escena y es una perífrasis corta, no una
 * ficha (E35).
 */
export const REFERENCE_ANCHOR = 'the person from the attached reference image'

/**
 * ¿El prompt nombra al personaje por su NOMBRE (sin la etiqueta)? Red para
 * cuando el modelo aprende el nombre y lo escribe directo. Borde de palabra
 * unicode-safe (\b no funciona con acentos) e insensible a mayúsculas.
 */
export function namesByName(scenePrompt: string, name?: string): boolean {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return false
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`,
    'iu',
  ).test(scenePrompt)
}

/**
 * El personaje llega por FOTO: `[subject]` se resuelve con su NOMBRE y NO se
 * pega ninguna descripción (el físico viaja en la imagen adjunta del carril
 * de personaje). La PRIMERA mención de cada escena queda atada a la foto en
 * el texto mismo: `carlos (the person from the attached reference image)`.
 * Nota honesta: si el carril de referencia se cae y la escena termina en el
 * generador normal, este prompt promete una referencia que no viaja — misma
 * degradación que el nombre pelado, preferible a una imagen en blanco.
 */
export function pointSubjectToImage(scenePrompt: string, name: string): string {
  const scene = scenePrompt.trim()
  const trimmedName = name.trim()

  if (namesSubject(scene)) {
    const resolved = trimmedName || FALLBACK_SUBJECT
    let first = true
    return scene.replace(SUBJECT_TAG_REGEX, () => {
      if (first) {
        first = false
        return `${resolved} (${REFERENCE_ANCHOR})`
      }
      return resolved
    })
  }

  // Sin etiqueta pero CON el nombre escrito directo: misma ancla, una vez.
  if (trimmedName && namesByName(scene, trimmedName)) {
    const escaped = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(
      `(^|[^\\p{L}\\p{N}])(${escaped})($|[^\\p{L}\\p{N}])`,
      'iu',
    )
    return scene.replace(
      regex,
      (_match, before, realName, after) =>
        `${before}${realName} (${REFERENCE_ANCHOR})${after}`,
    )
  }

  return scene
}

/**
 * El prompt de una escena que PERDIÓ su imagen de referencia y se rescata por
 * el carril normal (estilo propio). El prompt guardado promete una referencia
 * que ya no viaja («Elena (the person from the attached reference image)»)
 * y no trae ninguna descripción: el generador dibujaba a cualquiera. Acá se
 * quita el ancla y se pega la descripción de biblioteca al final, como en el
 * modo texto. Devuelve el prompt SIN las cláusulas finales: quien lo usa lo
 * vuelve a sanear. Si ningún personaje trae descripción usable, devuelve el
 * prompt tal cual (sin ancla).
 */
export function rescueReferencePrompt(
  prompt: string,
  identities: readonly { name: string; description: string }[],
): string {
  const anchor = new RegExp(
    `\\s*\\(${REFERENCE_ANCHOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
    'g',
  )
  const body = bodyWithoutFinalClauses(prompt).replace(anchor, '').trim()
  const usable = identities
    .map(({ name, description }) => {
      const identity =
        descriptionFromUserPrompt(description) ||
        fallbackUserDescription(description)
      if (!identity) return ''
      const trimmedName = name.trim()
      return trimmedName ? `${trimmedName}: ${identity}` : identity
    })
    .filter(Boolean)
  if (usable.length === 0) return body

  const separator = /[.!?]$/.test(body) ? ' ' : '. '
  return `${body}${separator}${DESCRIPTION_HEADER} ${usable.join(' ')}`
}

/**
 * El video NO lleva protagonista: el tag se degrada a una persona sin
 * identidad fija (ver `NEUTRAL_SUBJECT`). Red por si el modelo escribe la
 * etiqueta igual; el preámbulo ya se la prohibió.
 */
export function removeSubject(scenePrompt: string): string {
  const scene = scenePrompt.trim()
  if (!namesSubject(scene)) return scene
  return scene.replace(SUBJECT_TAG_REGEX, NEUTRAL_SUBJECT)
}

/**
 * El personaje lo escribió el USUARIO: la descripción permanente sale de
 * darle SU prompt a los mismos tres tijeretazos que al retrato de la Fase 1.
 * La diferencia es que acá NO se puede reintentar (el texto es del usuario y
 * no se toca): si sobrevive una marca de estado, se aplica directo el último
 * recurso; si ni así queda algo limpio, devuelve "" y el motor lo dice en el
 * log — la escena igual sale bien escrita (el assistant lleva el prompt
 * completo), solo falta la descripción pegada al final. Jamás se le pide al
 * usuario que reescriba su personaje por esto.
 */
export function descriptionFromUserPrompt(prompt: string): string {
  const clean = cleanDescription(prompt)
  const trimmed = clean ? trimPortrait(clean) : ''
  if (!trimmed) return ''
  if (portraitStateMark(trimmed) === undefined) return trimmed
  const rescue = dropSentencesWithState(trimmed)
  return rescue && portraitStateMark(rescue) === undefined ? rescue : ''
}

/**
 * La descripción del USUARIO cuando los tres tijeretazos no dejan nada. Caso
 * real: una ficha de biblioteca perfectamente buena que dice «portrait» o
 * «full-body», o que arranca con «Style:», se recortaba hasta quedar vacía y
 * el video salía SIN identidad — solo un aviso en el log. Acá se limpia lo
 * mínimo: markdown, saltos, la cola «Style:» solo si sobrevive texto antes de
 * ella, y las oraciones con estado de retrato solo si sobrevive alguna sin
 * estado. Una descripción con una pose fija es peor que una limpia, pero
 * muchísimo mejor que ninguna. "" si ni así hay tres palabras.
 */
export function fallbackUserDescription(raw: string): string {
  let text = raw
    .replace(/\*\*|__/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const styleIndex = text.search(/\bstyle\s*:/i)
  // Solo cola de estilo, sin personaje: no hay identidad que tejer.
  if (styleIndex === 0) return ''
  if (
    styleIndex > 0 &&
    countWords(text.slice(0, styleIndex)) >= MIN_DESCRIPTION_WORDS
  )
    text = text.slice(0, styleIndex)

  // Los recortes de retrato sacan lo que congela (pose, encuadre, fondo) sin
  // tirar la oración entera; si aun así queda estado, se conserva.
  const softened = trimPortrait(text) || text
  const withoutState = dropSentencesWithState(softened)
  const chosen = withoutState || tidyPunctuation(softened)
  if (countWords(chosen) < MIN_DESCRIPTION_WORDS) return ''
  return capWovenIdentity(/[.!?]$/.test(chosen) ? chosen : `${chosen}.`)
}

/**
 * Tope de la identidad que se teje (modos `generic` y `text`). La descripción
 * va pegada al final de TODAS las escenas y comparte los ~2.100 caracteres de
 * cuerpo del prompt final con la escena y la cola de estilo: una ficha sin
 * tope se comía la escena, o terminaba recortada distinta en cada una. El
 * corte es en límite de oración y se hace UNA vez, antes de tejer: el texto
 * ya cortado es el que viaja idéntico (y el que se guarda en el proyecto).
 */
export const MAX_WOVEN_IDENTITY_CHARS = 700

export function capWovenIdentity(description: string): string {
  const identity = description.trim()
  if (identity.length <= MAX_WOVEN_IDENTITY_CHARS) return identity

  const sentences = identity.split(/(?<=[.!?])\s+/)
  let capped = ''
  for (const sentence of sentences) {
    const next = capped ? `${capped} ${sentence}` : sentence
    if (next.length > MAX_WOVEN_IDENTITY_CHARS) break
    capped = next
  }
  // Una sola oración más larga que el tope: corte duro en palabra entera.
  if (!capped) {
    const hardCut = identity.slice(0, MAX_WOVEN_IDENTITY_CHARS)
    capped = `${hardCut.slice(0, hardCut.lastIndexOf(' ')).replace(/[,;:\s]+$/, '')}.`
  }
  return capped
}

/**
 * La identidad que un proyecto YA viene tejiendo, leída de sus prompts
 * guardados. Para los proyectos creados antes de que el protagonista se
 * guardara en project.json: sin esto, reanudar o regenerar una escena volvía
 * a diseñarlo y podía salir OTRO personaje en medio del video.
 *
 * Los prompts guardados ya pasaron por el scrub final (`sanitizeFinalPrompt`):
 * después de la identidad traen las cláusulas de texto-en-imagen y anonimato,
 * y un prompt largo pudo perder media identidad en el recorte viejo. Por eso
 * se cortan las cláusulas, se descartan los candidatos que no cierran en
 * puntuación (truncados) y gana el MÁS REPETIDO — el desempate es el más
 * largo. Devuelve `undefined` si ninguna escena trae una identidad usable.
 */
export function recoverProtagonistFromScenes(
  scenes: readonly Scene[],
): string | undefined {
  const counts = new Map<string, number>()
  for (const scene of scenes) {
    if (scene.promptIsFallback) continue
    const body = bodyWithoutFinalClauses(scene.imagePrompt ?? '')
    const headerIndex = body.lastIndexOf(DESCRIPTION_HEADER_PREFIX)
    if (headerIndex < 0) continue

    const candidate = body
      .slice(headerIndex + DESCRIPTION_HEADER_PREFIX.length)
      .replace(/^[^:]*:/, '')
      .trim()
    if (!/[.!?]$/.test(candidate)) continue
    if (countWords(candidate) < MIN_DESCRIPTION_WORDS) continue
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1)
  }

  let best: string | undefined
  let bestCount = 0
  for (const [candidate, count] of counts) {
    const wins =
      count > bestCount ||
      (count === bestCount && candidate.length > (best?.length ?? 0))
    if (!wins) continue
    best = candidate
    bestCount = count
  }
  return best
}

/*
 * Utilitarios.
 */

/**
 * Palabras mínimas para que el texto cuente como descripción. Un residuo
 * gramatical ("a.") pasa cualquier chequeo de «no está vacío» y llegaría al
 * generador como "must look exactly like this: a.".
 */
const MIN_DESCRIPTION_WORDS = 3

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /\p{L}/u.test(word)).length
}

/** Puntuación legible después de recortar frases por el medio. */
function tidyPunctuation(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,;:])\s*(?=[,.;:])/g, '')
    .replace(/\.\s*(?=\.)/g, '')
    .replace(/(^|\.)\s*,\s*/g, '$1 ')
    .replace(/\s+/g, ' ')
    .replace(/^[,;:.\s]+/, '')
    .replace(/[,;:]+$/, '')
    .trim()
}
