import type { GemSections } from '../types/styles.ts'
import {
  platformSystemRules,
  type VerbatimCharacterMode,
  type VerbatimSystemOptions,
} from './verbatim-messages.ts'

// EL MARCO DE VIMO (ADR-0048, spec §5): cómo se arma el `system` de la Fase 2
// cuando la gema viene por SECCIONES. La gema vieja (texto libre) sigue por
// `buildVerbatimSystem`, byte por byte; acá el system abre con el rol del
// modelo, las secciones del autor van bajo títulos fijos y la plataforma suma
// sus reglas DECLARADAS, con el mismo mecanismo de siempre (ADR-0019): reglas
// técnicas en español sin acentos, que se suman y no cambian el estilo. La
// sección `character` NUNCA entra al system: en el modo genérico viaja como
// turno del retrato y se teje por código; en «Mi personaje» y en cinemático
// no viaja (spec §5.2).

/**
 * El rol del modelo, primera línea del system. El agente reconstructor saca
 * de la gema su rol, sus fases y su formato de salida (ADR-0048), así que sin
 * esta línea el system abría directo en el estilo y el modelo deducía su
 * tarea de las reglas de más abajo. Es de la plataforma, igual para todas las
 * gemas, y dice solo quién escribe y qué entrega: el formato, el idioma y el
 * orden de cada prompt siguen en sus reglas. Texto del dueño (2026-10-04),
 * sin acentos como el resto del marco.
 */
export const FRAME_ROLE_LINE =
  'Eres un Director de Arte y Prompt Engineer experto en IA visual. ' +
  'Eres un asistente de solo texto: tu unica tarea es redactar los prompts de imagen del video, uno por fragmento del guion, con el estilo que sigue.'

export const VISUAL_STYLE_HEADING = '# VISUAL STYLE'
export const CAMERA_HEADING = '# CAMERA AND FRAMING'
export const DYNAMISM_HEADING = '# DYNAMISM'
export const STYLE_RULES_HEADING = '# STYLE RULES'
// Solo en el texto plano de la gema (`composeGemText`): en el system las
// frases fijas no se muestran, las pega el código.
export const FIXED_START_HEADING = '# FIXED START OF EVERY IMAGE PROMPT'
export const FIXED_END_HEADING = '# FIXED END OF EVERY IMAGE PROMPT'

/**
 * La seguridad de contenido que hoy solo tiene el catálogo (`GLOBAL_RULES` y
 * el bloque de Terror), traída al carril: el generador rechaza estos prompts
 * y una escena rechazada cuesta una vuelta de recuperación.
 */
export const CONTENT_SAFETY_RULE =
  'SEGURIDAD DE CONTENIDO (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'el generador de imagenes rechaza los prompts con contenido sensible, asi que cada prompt de escena tiene que pasar sus filtros automaticos. ' +
  'NUNCA escribas gore, sangre, heridas, mutilaciones, visceras, cadaveres en detalle o en descomposicion, violencia explicita o en curso (apunalar, disparar, golpear, un ataque en marcha), armas usadas contra alguien, tortura, suicidio, autolesiones, ahorcamientos, desnudos ni contenido sexual, menores en peligro, simbolos de odio ni consumo explicito de drogas. ' +
  'Si el guion narra un momento violento o sensible, cuentalo con atmosfera, simbolos y consecuencias: lenguaje corporal tenso, sombras y siluetas, una figura caida o quieta sin heridas visibles, un objeto volcado o vacio, luz dramatica, niebla, expresiones de miedo o de duelo. ' +
  'NUNCA escribas el nombre de una persona real (famosos, deportistas, politicos) ni el de un personaje con derechos de autor: usa arquetipos genericos. ' +
  'Ante la duda, elige la palabra mas suave y atmosferica.'

/**
 * El formato que hoy fija cada gema a su manera: un bloque de código, un
 * prompt por fragmento, separados por una línea en blanco y con su id
 * `((n))`. Es exactamente lo que el parser del carril ya lee.
 */
export const OUTPUT_FORMAT_RULE =
  'FORMATO DE SALIDA (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'responde UNICAMENTE con un bloque de codigo que contenga los prompts de escena, uno por fragmento y en el mismo orden en que llegan, separados entre si por una linea en blanco. ' +
  'Cada prompt es un solo parrafo de texto corrido que empieza con el numero de su fragmento en la forma ((n)): sin titulos, sin listas, sin numeracion extra, sin comillas y sin JSON. ' +
  'Fuera del bloque no escribas nada: ni saludos, ni explicaciones, ni preguntas.'

/**
 * El inicio y el final fijos los pega el código (spec §5.4): el modelo no los
 * escribe. La regla solo avisa que existen; las dos notas dicen cuál. Prohíbe
 * SOLO las frases: con un inicio fijo y sin final, la cola de estilo sigue
 * siendo del modelo (`restoreStyleTail` corre como siempre).
 */
export const FIXED_PHRASES_RULE =
  'FRASES FIJAS DE TU ESTILO (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'tu estilo tiene frases fijas que la plataforma pega por su cuenta, palabra por palabra, en cada prompt de escena. ' +
  'NUNCA las escribas tu, ni enteras, ni resumidas, ni traducidas: escribe el resto de cada prompt, sin esas frases.'

export const FIXED_START_NOTE =
  'La frase fija de INICIO va antes de tu texto: no presentes el estilo al empezar, arranca directo por la toma o el encuadre.'

/**
 * Con final fijo la cola de estilo ya es determinística (spec §5.4). El
 * modelo no ve la frase, así que una cola propia sería una SEGUNDA cola,
 * distinta y no determinística, que el recorte de copias exactas no puede
 * quitar. Por eso la nota nombra la parte (3) de la arquitectura, que va más
 * abajo, y se adelanta a todo lo que después pide la cola: la arquitectura,
 * el idioma, el protagonista del usuario y el recordatorio del turno del lote.
 */
export const FIXED_END_NOTE =
  'La frase fija de CIERRE va despues de tu texto y ES la parte (3) de la ARQUITECTURA DEL PROMPT FINAL que aparece mas abajo: en tu estilo esa parte la pone la plataforma. ' +
  'Termina cada prompt con la parte (2), donde ocurre y de que esta hecho el decorado, y no escribas ninguna cola ni frase de estilo propia, aunque las reglas de mas abajo o el pedido de los fragmentos mencionen la cola de estilo.'

/**
 * La etiqueta de tratamiento (spec §5.3): solo con dinamismo. Mide el reparto
 * del video; el parser la lee y la quita, y si falta o no es válida el prompt
 * igual vale. Las palabras son los `SCENE_TREATMENTS` del director.
 *
 * La última oración libera la parte (1) de la arquitectura («SIEMPRE … lo
 * que hace [subject]») en las escenas cuyo tratamiento no muestra al
 * protagonista: sin ella, la arquitectura empuja a [subject] a todas las
 * escenas, en contra del reparto del dinamismo. Va después de la frase sobre
 * la etiqueta [T:…] para que «la etiqueta» que se quita nunca sea [subject].
 */
export const TREATMENT_TAG_RULE =
  'ETIQUETA DE TRATAMIENTO (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'decide para cada fragmento que tratamiento visual le toca segun el dinamismo de tu estilo y declaralo al comienzo de su prompt, justo despues del numero, en la forma ((n)) [T:tratamiento] ' +
  '— por ejemplo: ((7)) [T:metaphor] Low angle shot of... ' +
  'El tratamiento es UNA de estas palabras, en ingles y tal cual: action (alguien vive en plena accion lo que narra el fragmento), metaphor (una metafora visual concreta de una idea abstracta), object (un objeto clave en primer plano), place (el lugar mismo, con un punto de interes claro), group (otras personas, una escena social), memory (un recuerdo o un flashback), diagram (una explicacion visual dentro del mundo de la historia) o bubble (una burbuja de pensamiento con una sola imagen adentro). ' +
  'Usa solo los tratamientos que tu dinamismo permita. La plataforma lee la etiqueta y la quita antes de generar la imagen: no la expliques y no la repitas dentro del prompt. ' +
  'Cuando, segun tu dinamismo, el tratamiento de un fragmento no muestra al protagonista, la parte (1) de la ARQUITECTURA DEL PROMPT FINAL es la toma o encuadre y el elemento principal de esa escena (lo que su tratamiento pone en primer plano), sin la etiqueta [subject]: en ese prompt el protagonista no aparece.'

/**
 * Cinemático con dinamismo (spec §5.2): el dinamismo habla de «el
 * protagonista», y en este modo no hay. Sin esta regla el modelo inventaba a
 * alguien que se repite para cumplir el reparto.
 */
export const DYNAMISM_WITHOUT_PROTAGONIST_RULE =
  'DINAMISMO SIN PROTAGONISTA (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'este video no tiene protagonista recurrente. Cuando tu dinamismo pida mostrar al protagonista en una escena, muestra esa escena sin el: el entorno, un objeto, el resultado de la accion o las personas anonimas que la escena pida, nunca una misma persona que se repita de escena en escena. ' +
  'El resto de tu dinamismo (metaforas, objetos, lugares y proporciones) se aplica igual.'

function sectionBlock(heading: string, text: string): string {
  return `${heading}\n${text.trim()}`
}

// La regla de las frases fijas con la nota de cada frase que el estilo trae.
// "" = el estilo no tiene frases fijas y la regla no va.
export function fixedPhrasesRuleFor(
  sections: Pick<GemSections, 'promptStart' | 'promptEnd'>,
): string {
  const notes = [
    sections.promptStart?.trim() ? FIXED_START_NOTE : '',
    sections.promptEnd?.trim() ? FIXED_END_NOTE : '',
  ].filter(Boolean)
  if (notes.length === 0) return ''
  return [FIXED_PHRASES_RULE, ...notes].join(' ')
}

function dynamismBlock(dynamism: string, mode: VerbatimCharacterMode): string {
  const block = `${sectionBlock(DYNAMISM_HEADING, dynamism)}\n\n${TREATMENT_TAG_RULE}`
  if (mode !== 'none') return block
  return `${block}\n\n${DYNAMISM_WITHOUT_PROTAGONIST_RULE}`
}

/**
 * El `system` de la Fase 2 para una gema de plantilla (spec §5.1), en este
 * orden: el rol del modelo, estilo visual, cámara, dinamismo con su
 * etiqueta, reglas del estilo, seguridad de contenido, formato de salida,
 * frases fijas y las reglas de plataforma de siempre
 * (`platformSystemRules`). Una sección opcional vacía no deja título.
 */
export function buildTemplateSystem(
  sections: GemSections,
  mode: VerbatimCharacterMode = 'generic',
  options?: VerbatimSystemOptions,
): string {
  const blocks = [
    FRAME_ROLE_LINE,
    sectionBlock(VISUAL_STYLE_HEADING, sections.visualStyle),
  ]
  const camera = sections.camera?.trim()
  if (camera) blocks.push(sectionBlock(CAMERA_HEADING, camera))
  const dynamism = sections.dynamism?.trim()
  if (dynamism) blocks.push(dynamismBlock(dynamism, mode))
  const rules = sections.rules?.trim()
  if (rules) blocks.push(sectionBlock(STYLE_RULES_HEADING, rules))
  blocks.push(CONTENT_SAFETY_RULE, OUTPUT_FORMAT_RULE)
  const fixedPhrases = fixedPhrasesRuleFor(sections)
  if (fixedPhrases) blocks.push(fixedPhrases)
  blocks.push(platformSystemRules(mode, options))
  return blocks.join('\n\n')
}

export interface GemTextOptions {
  /**
   * El inicio y el final fijos bajo sus títulos. Ausente = sí (spec §5.6
   * bis): el preview y el respaldo de imágenes quitan una copia exacta antes
   * de pegarlas. La Fase 1 del carril pasa `false`: la ficha del retrato no
   * es un prompt de escena, y un final fijo copiado ahí (sin el prefijo
   * `Style:` que `cleanDescription` corta) haría rechazar la ficha o se
   * tejería con la identidad en cada escena, antes del mismo final fijo.
   */
  fixedPhrases?: boolean
}

/**
 * La gema de plantilla como TEXTO, para los usos que hoy reciben «la gema»
 * entera: la Fase 1 del carril, el diseño del personaje con el estilo, el
 * preview de un personaje y el estilo del fallback de imágenes. Las secciones
 * con sus títulos, sin el rol del marco y sin reglas de plataforma (esos usos
 * no escriben prompts de escena). La sección `character` no va: esos usos
 * diseñan o dibujan OTRO personaje (o uno desde el guion), y el del estilo
 * solo viaja en el modo genérico (spec §5.2).
 */
export function composeGemText(
  sections: GemSections,
  options: GemTextOptions = {},
): string {
  const parts: [string, string | undefined][] = [
    [VISUAL_STYLE_HEADING, sections.visualStyle],
    [CAMERA_HEADING, sections.camera],
    [DYNAMISM_HEADING, sections.dynamism],
    [STYLE_RULES_HEADING, sections.rules],
  ]
  if (options.fixedPhrases ?? true)
    parts.push(
      [FIXED_START_HEADING, sections.promptStart],
      [FIXED_END_HEADING, sections.promptEnd],
    )

  return parts
    .flatMap(([heading, text]) =>
      text?.trim() ? [sectionBlock(heading, text)] : [],
    )
    .join('\n\n')
}

// ─── Inicio y final fijos (spec §5.4) ───

/** Las frases que Vimo pega por código a cada prompt de imagen (spec §4.1). */
export type FixedPhrases = Pick<GemSections, 'promptStart' | 'promptEnd'>

/**
 * El marcador de idioma de las gemas de Imperio Pro. Allá cada prompt cierra
 * con «If any text appears in the image, it must be written in [IDIOMA DEL
 * GUION]» y el marcador lo completa el modelo. Acá el inicio y el final fijos
 * los pega el código y el modelo no los ve, así que el idioma lo pone el
 * código. Sin esto la frase llegaba al generador con el marcador literal, o
 * había que sacarla de la gema, y los carteles que el generador inventa salían
 * en inglés con un guion en español.
 */
const SCRIPT_LANGUAGE_MARKER_REGEX = /\[\s*IDIOMA DEL GUI[OÓ]N\s*\]/gi

/**
 * Lo que ocupa el lugar del marcador cuando no hay idioma detectado: un guion
 * ambiguo o muy corto, o el preview de un personaje, que no tiene guion. Es
 * el mismo texto que usan los bloques del catálogo en ese caso.
 */
export const UNDETECTED_SCRIPT_LANGUAGE = "the narration's own language"

/**
 * Las frases fijas de un estilo con el idioma del guion en el lugar del
 * marcador. `scriptLanguage` es el nombre en inglés que devuelve
 * `detectScriptLanguage` («Spanish»); vacío = no se pudo detectar. Quien pega,
 * quita o recorta frases fijas las pide SIEMPRE por acá, una vez por corrida:
 * las tres operaciones las buscan tal cual dentro del prompt, y una frase con
 * el marcador nunca coincidiría con la que ya se pegó con el idioma.
 */
export function fixedPhrasesInLanguage(
  phrases: FixedPhrases,
  scriptLanguage: string,
): FixedPhrases {
  const language = scriptLanguage.trim() || UNDETECTED_SCRIPT_LANGUAGE
  return {
    promptStart: phrases.promptStart?.replace(
      SCRIPT_LANGUAGE_MARKER_REGEX,
      language,
    ),
    promptEnd: phrases.promptEnd?.replace(
      SCRIPT_LANGUAGE_MARKER_REGEX,
      language,
    ),
  }
}

const TRAILING_PUNCTUATION_REGEX = /[\s.!?,;:]+$/
const WORD_CHARACTER_REGEX = /[\p{L}\p{N}]/u

// Una coincidencia que corta una palabra a la mitad no es una copia de la
// frase: «Pixel art of» no es el arranque de «Pixel art often», ni «art.» el
// cierre de «a dart.». Quitarla partía la palabra del modelo.
function splitsAWord(phraseEdge: string, neighbor: string): boolean {
  return (
    WORD_CHARACTER_REGEX.test(phraseEdge) && WORD_CHARACTER_REGEX.test(neighbor)
  )
}

function opensWith(text: string, phrase: string): boolean {
  if (!text.toLowerCase().startsWith(phrase.toLowerCase())) return false
  return !splitsAWord(phrase.slice(-1), text.charAt(phrase.length))
}

function closesWith(text: string, phrase: string): boolean {
  if (!text.toLowerCase().endsWith(phrase.toLowerCase())) return false
  return !splitsAWord(
    phrase.charAt(0),
    text.charAt(text.length - phrase.length - 1),
  )
}

/**
 * El texto del modelo SIN una copia de las frases fijas: si igual las
 * escribió (la regla se lo prohíbe), el código no las duplica. Solo quita una
 * coincidencia exacta, sin distinguir mayúsculas, al frente o al final, que
 * no corte una palabra. Si no quedara nada, devuelve el texto tal cual.
 */
export function stripFixedPhrases(
  scenePrompt: string,
  phrases: FixedPhrases,
): string {
  let text = scenePrompt.trim()
  const start = phrases.promptStart?.trim()
  if (start && opensWith(text, start)) text = text.slice(start.length).trim()

  const end = phrases.promptEnd?.trim().replace(TRAILING_PUNCTUATION_REGEX, '')
  const body = text.replace(TRAILING_PUNCTUATION_REGEX, '')
  if (end && closesWith(body, end))
    text = body
      .slice(0, body.length - end.length)
      .replace(/[\s,;:]+$/, '')
      .trim()
  return text || scenePrompt.trim()
}

/**
 * El prompt final de una gema de plantilla: el inicio fijo, la escena ya
 * tejida y el final fijo, separados por un espacio (spec §5.4). Sin frases,
 * la escena tal cual.
 */
export function applyFixedPhrases(
  wovenPrompt: string,
  phrases: FixedPhrases,
): string {
  return [
    phrases.promptStart?.trim(),
    wovenPrompt.trim(),
    phrases.promptEnd?.trim(),
  ]
    .filter((part) => part)
    .join(' ')
}
