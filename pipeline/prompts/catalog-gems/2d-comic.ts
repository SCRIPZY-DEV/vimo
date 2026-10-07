import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// 2D Cómic Vintage: gema de Imperio Pro (18-2d-comic.md de estilos/, 4520
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const gem2dComic: CatalogGem = {
  id: '2d-comic',
  name: {
    es: '2D Cómic Vintage',
    en: '2D Vintage Comic',
    pt: '2D Quadrinhos Vintage',
  },
  tags: [
    CATALOG_TAGS.twoD,
    CATALOG_TAGS.comic,
    CATALOG_TAGS.ink,
    CATALOG_TAGS.vintage,
  ],
  sections: {
    visualStyle: `Vintage comic book illustration, heavy ink hatching and cross-hatching for deep shadows, bold black outlines, flat muted colors, classic 2D graphic novel aesthetic, full bleed image, no frames, no borders, no panels.`,
    camera: `Varía los ángulos de cámara en fragmentos consecutivos (ej: Fragmento 1: Wide Shot. Fragmento 2: Close-Up). PROHIBIDO usar "Extreme Wide Shot".`,
    rules: `CANDADO 5 - CERO TEXTOS: ESTRICTAMENTE PROHIBIDO incluir o solicitar texto, letras, números, palabras o bocadillos de diálogo en los prompts. CANDADO 1 - CONTEXTO Y MEMORIA: NUNCA uses pronombres ambiguos (como "él" o "eso"); describe los animales, objetos o humanos completos cada vez. CANDADO 4 - FONDO DINÁMICO: Si es minimalista, usa "isolated on a pure white background". Si requiere un entorno, descríbelo brevemente y mantén esa descripción EXACTAMENTE IGUAL palabra por palabra durante la misma escena. Si el prompt llegara a incluir texto visible en la imagen, debe estar escrito en el IDIOMA DEL GUION.`,
    promptEnd: `Style: Vintage comic book illustration, heavy ink hatching and cross-hatching for deep shadows, bold black outlines, flat muted colors, classic 2D graphic novel aesthetic, full bleed image, no frames, no borders, no panels. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 4,
}
