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

/**
 * El encabezado cuando la escena trae su PROPIA ropa (vestuario por escena)
 * y la descripción no se pudo partir en identidad fija + ropa base (ficha
 * escrita por el usuario, protagonista guardado antes del vestuario): viaja
 * la descripción entera, y el encabezado le dice al generador que la ropa de
 * la escena le gana a la de la descripción. Comparte el prefijo: quien
 * detecta la identidad (recorte, recuperación) lo reconoce igual.
 */
export const DESCRIPTION_HEADER_WITH_WARDROBE = `${DESCRIPTION_HEADER_PREFIX}, except for the clothing, which is exactly the one this scene describes (their signature hat, badge, coat and accessories stay on top of it unless the scene makes one impossible):`

/**
 * La MARCA del personaje cuando la escena trae su propia ropa: lo que el
 * estilo le da (gabardina, placa, fedora, libreta) se queda encima de la ropa
 * de la escena, y solo se deja afuera lo que la escena hace imposible (un
 * casco en lugar del sombrero). Decisión de producto del 2026-09-21: un
 * detective que va al espacio lleva la placa en el traje y la gabardina
 * encima; el fedora, hasta que hay casco.
 */
export function signatureLookNote(outfit: string): string {
  return `Their signature look stays with them on top of this scene's clothing wherever the scene allows it: ${outfit.replace(/[.!?]+$/, '')}. Where the scene's clothing replaces one of those items (a helmet instead of the hat, a swimsuit instead of the coat), the scene wins; everything else stays.`
}
