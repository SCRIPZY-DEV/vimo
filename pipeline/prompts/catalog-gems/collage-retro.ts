import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Collage Retro: gema de Imperio Pro (31-collage-retro.md de estilos/, 4828
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const collageRetro: CatalogGem = {
  id: 'collage-retro',
  name: { es: 'Collage Retro', en: 'Retro Collage', pt: 'Colagem Retrô' },
  description: {
    es: 'Collage de revista de los 50: recortes con bordes rasgados, trama de semitono y papel envejecido.',
    en: '1950s magazine collage: torn-edge cutouts, halftone screen and aged paper.',
    pt: 'Colagem de revista dos anos 50: recortes com bordas rasgadas, retícula de meio-tom e papel envelhecido.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.collage,
    CATALOG_TAGS.retro,
    CATALOG_TAGS.analog,
  ],
  sections: {
    visualStyle: `retro mixed-media collage, cut-out 1950s magazine photographs with visible torn paper edges, halftone print dots, aged yellowed paper background, limited faded palette with red and teal accents, hand-cut analog scrapbook look.`,
    dynamism: `Para fragmentos consecutivos, varía el encuadre y alterna obligatoriamente: un prompt debe usar una de estas opciones de encuadre (Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Overhead shot y Insert shot de un objeto) y el siguiente debe usar otro distinto (PROHIBIDO repetir el mismo encuadre dos veces seguidas). Además, para composición consecutiva: alterna entre plano de lugar, detalle de objeto, escena con figuras, elemento simbólico y plano atmosférico.`,
    camera: `Alterna el tipo de plano entre: Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Overhead shot y Insert shot de un objeto; PROHIBIDO repetir el mismo encuadre dos veces seguidas.`,
    rules: `SIN PROTAGONISTA FIJO: este estilo no tiene un personaje recurrente; si aparece alguien, descríbelo entero en ese prompt y no des por hecho que se repite en el siguiente. FONDO BLOQUEADO: PROHIBIDO dejar el fondo sin describir; fija una descripción corta del lugar y REPÍTELA EXACTAMENTE IGUAL, palabra por palabra, en todos los prompts de esa misma escena; el fondo es siempre papel envejecido, a veces con manchas o cinta adhesiva vieja. TEXTOS Y NÚMEROS: si el fragmento menciona un número o una fecha, conviértelo a DÍGITOS y ponlo; añade 1 o 2 palabras del fragmento en 1 de cada 5 prompts, escritas TAL CUAL en el idioma del guion; NUNCA uses comillas para diálogos hablados. RECURSO VISUAL ROTATIVO: PROHIBIDO que dos prompts consecutivos compartan la misma composición; alterna entre plano de lugar, detalle de objeto, escena con figuras, elemento simbólico y plano atmosférico. MEZCLA DE ESCALAS: el collage funciona por el choque de tamaños; cada prompt combina al menos dos recortes de escala muy distinta (por ejemplo, una mano gigante y un edificio diminuto, o un ojo enorme sobre una multitud). También debes describir por completo cada objeto y elemento, evitando pronombres ambiguos.`,
    promptEnd: `Style: retro mixed-media collage, cut-out 1950s magazine photographs with visible torn paper edges, halftone print dots, aged yellowed paper background, limited faded palette with red and teal accents, hand-cut analog scrapbook look.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 0,
}
