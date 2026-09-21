// La IDENTIDAD tejida del carril verbatim: con qué se presenta la descripción
// del protagonista pegada al final de cada prompt de escena.
//
// Vive en `prompts/` (y no en el tejedor) porque la lee también el scrub final
// de `stages/shared/prompt-safety.ts`: al recortar un prompt largo tiene que
// reconocer dónde empieza la identidad para no cortarla primero. `prompts/` no
// importa nada de `stages/`, así que no hay ciclo.

/**
 * El arranque del encabezado, sin los dos puntos. La DETECCIÓN (recorte,
 * recuperación desde prompts guardados) mira este prefijo y no el encabezado
 * completo: una variante futura del encabezado que lo comparta sigue siendo
 * reconocida sin tocar a quienes detectan.
 */
export const DESCRIPTION_HEADER_PREFIX =
  'The character in this scene must look exactly like this'

/** Con qué se presenta la descripción pegada al final del prompt de escena. */
export const DESCRIPTION_HEADER = `${DESCRIPTION_HEADER_PREFIX}:`
