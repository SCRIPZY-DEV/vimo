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
