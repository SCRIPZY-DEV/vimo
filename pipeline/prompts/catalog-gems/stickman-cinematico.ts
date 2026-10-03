import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Stickman Cinemático: gema de Imperio Pro (05-stickman-cinematico.md de estilos/, 4808
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const stickmanCinematico: CatalogGem = {
  id: 'stickman-cinematico',
  name: {
    es: 'Stickman Cinemático',
    en: 'Cinematic Stickman',
    pt: 'Stickman Cinematográfico',
  },
  description: {
    es: 'Monigote de línea simple sobre escenas cinematográficas: luz volumétrica, sombras dramáticas y profundidad de campo.',
    en: 'A simple line stick figure in cinematic scenes: volumetric light, dramatic shadows and depth of field.',
    pt: 'Boneco de linha simples em cenas cinematográficas: luz volumétrica, sombras dramáticas e profundidade de campo.',
  },
  tags: [
    CATALOG_TAGS.fixedCharacter,
    CATALOG_TAGS.twoD,
    CATALOG_TAGS.cinematic,
    CATALOG_TAGS.atmospheric,
  ],
  sections: {
    visualStyle: `Clean 2D vector art with simple stickman drawings (bold outlines, flat colors) placed inside cinematic scenes: volumetric lighting, dramatic shadows, depth of field, epic composition, moody atmosphere and highly detailed backgrounds. The stick figures stay simple and flat; the world around them is rich and cinematic.`,
    character: `A stick figure, with a perfectly round white head, two dot eyes, a thin line mouth and thin black stick limbs on a simple line body. Outfit: a plain shirt and trousers in flat colors.`,
    camera: `Varía los ángulos de cámara en fragmentos consecutivos (por ejemplo: Wide Shot y Close-Up). PROHIBIDO usar "Extreme Wide Shot".`,
    rules: `En cada prompt de escenas, si aparece cualquier texto dentro de la imagen (carteles, papeles, pantallas), debe estar en el IDIOMA DEL GUION. Añade 1 o 2 palabras del fragmento actual en 1 de cada 5 prompts; si el fragmento menciona un número/fecha, conviértelo a dígitos (p. ej., "10") y ponlo obligatoriamente; nunca uses comillas para diálogos hablados; todo texto debe ir sobre pizarras o papeles blancos. PROHIBIDO dejar fondos en blanco: define un lugar de fondo corto y mantenlo EXACTAMENTE IGUAL palabra por palabra durante la misma escena. Si el fragmento es SOLO de extras, NO incluyas a [subject]. PROHIBIDO crear clones del protagonista: si el fragmento menciona extras o personajes secundarios, usa SIEMPRE la fórmula exacta: "another stick figure [TIPO DE PERSONAJE] with [RASGO/CABELLO OPUESTO AL PROTA], wearing [ROPA DISTINTA AL PROTA]".`,
    promptEnd: `Style: Cinematic 2D animation, volumetric lighting, dramatic shadows, depth of field, epic composition, moody atmosphere, highly detailed background, 8k. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
