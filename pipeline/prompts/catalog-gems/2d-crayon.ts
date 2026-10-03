import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// 2D Crayón: gema de Imperio Pro (11-2d-crayon.md de estilos/, 3716
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const gem2dCrayon: CatalogGem = {
  id: '2d-crayon',
  name: { es: '2D Crayón', en: '2D Crayon', pt: '2D Giz de Cera' },
  description: {
    es: 'Boceto a mano tipo doodle, coloreado tosco de cera y fondo de papel crudo.',
    en: 'A hand-drawn doodle sketch with rough crayon coloring on raw paper.',
    pt: 'Esboço à mão tipo doodle, colorido tosco de giz de cera e fundo de papel cru.',
  },
  tags: [CATALOG_TAGS.twoD, CATALOG_TAGS.doodle, CATALOG_TAGS.paper],
  sections: {
    visualStyle: `Hand-drawn sketch, minimalist doodle style, rough crayon-like coloring, thick outlines, off-white paper textured background.`,
    camera: `Varía los ángulos de cámara en fragmentos consecutivos (Ej: Fragmento 1: Wide Shot. Fragmento 2: Close-Up). PROHIBIDO usar "Extreme Wide Shot".`,
    rules: `CANDADO 1 - CONTEXTO Y MEMORIA: Rastrea el fragmento en el guion. Reconstruye mentalmente la escena. NUNCA uses pronombres ambiguos. Describe los objetos completos cada vez.
CANDADO 2 - ADAPTACIÓN VISUAL: Describe los elementos, acciones o figuras presentes de forma explícita y detallada en cada escena.
CANDADO 3 - DIVERSIDAD: Si aparecen figuras o extras, dales rasgos o ropa distintos para evitar clones.
CANDADO 4 - FONDO BLOQUEADO: Tienes PROHIBIDO dejar fondos en blanco. Establece una descripción corta del lugar y MANTENLA EXACTAMENTE IGUAL palabra por palabra durante la misma escena.
CANDADO 5 - TEXTOS Y NÚMEROS: Añade 1 o 2 palabras del fragmento actual en 1 de cada 5 prompts. NÚMEROS: si el fragmento menciona un número/fecha, CONVIÉRTELO A DÍGITOS (ej: "10") y ponlo obligatoriamente. NUNCA uses comillas para diálogos hablados. Todo texto va sobre pizarras o papeles blancos.
CANDADO 6 - EXPRESIONES: Describe la atmósfera o emoción en cada escena.
CANDADO 7 - DINAMISMO CONSECUTIVO: Varía los ángulos de cámara en fragmentos consecutivos. PROHIBIDO usar "Extreme Wide Shot".
IDIOMA DE TEXTOS EN IMAGEN: cualquier texto que aparezca dentro de la imagen (carteles, papeles, pantallas) debe ir en el IDIOMA DEL GUION.`,
    promptEnd: `Style: Hand-drawn sketch, minimalist doodle style, rough crayon-like coloring, thick outlines, off-white paper textured background.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 0,
}
