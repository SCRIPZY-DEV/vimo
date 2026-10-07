import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Pixel Retro: gema de Imperio Pro (21-pixel-retro.md de estilos/, 5558
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const pixelRetro: CatalogGem = {
  id: 'pixel-retro',
  name: { es: 'Pixel Retro', en: 'Retro Pixel', pt: 'Pixel Retrô' },
  tags: [CATALOG_TAGS.pixelArt, CATALOG_TAGS.retro, CATALOG_TAGS.videoGame],
  sections: {
    visualStyle: `16-bit pixel art character sprites and side-scrolling videogame visuals with a retro SNES videogame aesthetic; limited color palette; crisp visible square pixels; dithering for gradients; no anti-aliasing; simple readable shapes suitable for low resolution; flat-colored clothing (2–3 flat colors per character); side-scrolling game scene composition.`,
    camera: `Use only these framing types and vary between consecutive fragments: Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Over-the-shoulder shot, Overhead shot; PROHIBIDO repetir el mismo encuadre dos veces seguidas. If the fragment mentions a specific object, use a closed shot focused on that object.`,
    rules: `Anti-clones: secondary characters must never resemble the protagonist; for each extra use the formula: another [ROL] with [RASGO FÍSICO Y PELO OPUESTOS AL PROTAGONISTA], wearing [ROPA DE COLOR DISTINTO AL DEL PROTAGONISTA]. Background must never be left undescribed: fix a short place description for the scene and repeat it EXACTLY word-for-word in all prompts of that same scene; backgrounds are recognizable retro videogame environments (repeated tilesets, parallax layers, pixel-simple recognizable objects). Text and numbers: if the fragment mentions a number or a date, convert it to digits and include it; add 1 or 2 words from the fragment in 1 of every 5 prompts written exactly as in the script’s language; spoken dialogue must not be enclosed in quotes. Image text language: any text that appears inside the image (posters, papers, screens) must be written in the script’s language. Legibility: prohibit fine details (no realistic textures, no soft shadows, no highly detailed faces); everything must read in large forms and flat colors.`,
    promptEnd: `Style: 16-bit pixel art, retro SNES videogame aesthetic, limited color palette, crisp visible square pixels, dithering for gradients, side-scrolling game scene composition, no anti-aliasing. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
