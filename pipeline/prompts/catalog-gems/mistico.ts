import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Místico: gema de Imperio Pro (19-mistico.md de estilos/, 5915
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const mistico: CatalogGem = {
  id: 'mistico',
  name: { es: 'Místico', en: 'Mystic', pt: 'Místico' },
  tags: [CATALOG_TAGS.engraving, CATALOG_TAGS.alchemy, CATALOG_TAGS.vintage],
  sections: {
    visualStyle: `Emulación obligatoria de ilustraciones antiguas: grabados en madera (woodcut) y grabado/linework tipo engraving, litografías vintage y arte alquímico. Estética de manuscrito alquímico intrincado (alchemical manuscript art) con simbolismo esotérico y filosófico altamente detallado. Composición inmersiva tipo full-bleed/edge-to-edge (sin márgenes perceptibles) con iluminación dramática y sombras profundas. Paleta base monocroma en tonos negro, gris oscuro y sepia, con destellos e indicios dorados radiantes (golden highlights) de alto contraste.`,
    camera: `Para mantener coherencia cuando el mismo concepto/símbolo reaparece: usa variación de ángulo y escala siguiendo la secuencia guía (1) Wide Shot, (2) Close-Up re-describiendo físicamente el sujeto/símbolo, (3) Low Angle / Extreme Close-Up. Enmarcar siempre la acción dentro de un entorno físico infinito y expansivo que toque los límites de la visión para forzar que el arte llene el lienzo completo (p. ej., desiertos brumosos sin fin, mar cósmico, cavernas monumentales oscuras), evitando que el sujeto parezca “flotando” en un espacio vacío.`,
    rules: `Imágenes sin texto: está estrictamente prohibido incluir texto, letras, números o palabras dentro de las imágenes. Evitar cualquier apariencia moderna o sintética: NO usar 3D, CGI, plastilina ni renders modernos. La imagen debe mantenerse como grabado/litografía antigua y grabado alquímico (woodcut/engraving/lithography aesthetic).`,
    promptEnd: `Style: Ancient woodcut engraving, intricate alchemical manuscript art, vintage lithography aesthetic. Full-bleed artwork, immersive cinematic edge-to-edge framing filling the entire canvas. Monochrome base palette (black, dark gray, sepia) with stark, striking radiant golden highlights. Highly detailed, esoteric and philosophical symbolism, dramatic lighting, deep shadows. NO 3D, NO CGI, NO text, NO letters. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 4,
}
