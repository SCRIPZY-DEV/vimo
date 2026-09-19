// Los 4 momentos de muestra — la vara con la que se compara cualquier estilo
// (port VERBATIM de fragmentos-muestra.ts del origen). Son FIJOS a propósito:
// si cada estilo eligiera sus propios momentos, la comparación mezclaría dos
// variables (el estilo Y la escena); con momentos fijos, la única variable es
// el estilo. Los 4 cubren posiciones bien distintas — cerca/lejos, quieto/en
// movimiento, día/noche, solo/con gente — para que la muestra enseñe el RANGO
// del estilo, no una sola pose.

export const SAMPLE_FRAGMENTS = [
  {
    id: 1,
    text: 'El protagonista sonríe aliviado, muy de cerca, mientras amanece',
  },
  {
    id: 2,
    text: 'Camina por una calle de la ciudad cargando una caja pesada',
  },
  {
    id: 3,
    text: 'De noche, levanta los brazos festejando en lo alto de una colina',
  },
  {
    id: 4,
    text: 'Conversa con otras dos personas alrededor de una mesa llena de papeles',
  },
] as const

export const SAMPLE_SCRIPT = `${SAMPLE_FRAGMENTS.map(
  (fragment) => fragment.text,
).join('. ')}.`

// ─── El protagonista de las muestras ───
//
// Las muestras tienen que enseñar al protagonista que el usuario va a ver en
// sus videos, el MISMO en las cuatro:
//  - «Mi personaje» con predeterminado → ese personaje de la biblioteca.
//  - genérico (o «Mi personaje» sin predeterminado) → el que la gema describe;
//    si no describe ninguno, uno diseñado para ella (`SAMPLE_PROTAGONIST_REQUEST`).
//  - sin personaje → nada de esto: los pedidos quedan como siempre.
// Los 4 momentos NO cambian: lo único que se agrega es QUIÉN es «el
// protagonista». Mismo mecanismo que el carril verbatim: el modelo escribe la
// etiqueta `[subject]` y la identidad la teje la plataforma, idéntica en las
// cuatro muestras.

/**
 * Regla que se anexa AL FINAL del system prompt. Medido con una gema que trae
 * su protagonista escrito (E47 del origen): con una regla que solo nombraba al
 * personaje del usuario, el modelo seguía describiendo al de la gema en los 4
 * prompts. Con la etiqueta y la prohibición explícita de describirlo, no.
 */
export const SAMPLE_PROTAGONIST_RULE =
  '# PROTAGONIST OF THESE SCENES (platform technical rule: it overrides any character your style describes and does not change your style)\n' +
  "The protagonist of these scenes is already defined. That identity REPLACES any fixed character, narrator or subject your style describes: in this request that part of your style does NOT apply — do not describe or draw the style's own character. " +
  "Every time the protagonist appears, write the literal tag [subject] and NOTHING about their looks: no face, head, hair, body, age, skin or clothing. The platform adds the protagonist's identity by itself. " +
  'Other people in a scene are described normally. Keep the technique, materials and style tail your style defines intact.'

/** El recordatorio en el turno del usuario, pegado a las escenas. */
export const SAMPLE_PROTAGONIST_REMINDER =
  'PROTAGONIST: the protagonist of every scene is the tag [subject]. Write [subject] wherever they appear and never describe their appearance — ignore the character your style describes.'

/**
 * Pedido previo para las gemas SIN personaje del usuario: la gema dice quién
 * es su protagonista. Si lo trae escrito, es ESE (las muestras tienen que
 * salir con el personaje del estilo); si no, diseña uno coherente. La
 * descripción vuelve neutra de estilo, pose y fondo: se pega igual en las 4.
 */
export const SAMPLE_PROTAGONIST_REQUEST =
  'PROTAGONIST DESIGN (platform technical request — do NOT write scene prompts now). ' +
  'Define the single protagonist of the script below. If your style already describes its own recurring character, narrator or subject, return THAT character exactly as your style defines it. ' +
  'If it does not, design one coherent with the script and with the world of your style. ' +
  'Return JSON only: {"description":"..."}. The description is the protagonist\'s permanent physical appearance in ENGLISH, 40 to 110 words, starting with who they are, then head/hair, one distinctive feature and the outfit with its colors. ' +
  'No pose, no framing, no expression, no background, no art style or technique words.'
