import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Anime Storytime: gema de Imperio Pro (20-anime-storytime.md de estilos/, 5763
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const animeStorytime: CatalogGem = {
  id: 'anime-storytime',
  name: { es: 'Anime Storytime', en: 'Anime Storytime', pt: 'Anime Storytime' },
  description: {
    es: 'Anime digital moderno: cel shading limpio, ojos expresivos, color saturado y luz dramática.',
    en: 'Modern digital anime: clean cel shading, expressive eyes, saturated color and dramatic light.',
    pt: 'Anime digital moderno: cel shading limpo, olhos expressivos, cor saturada e luz dramática.',
  },
  tags: [CATALOG_TAGS.anime, CATALOG_TAGS.storytime, CATALOG_TAGS.vividColor],
  sections: {
    visualStyle: `high-quality 2D anime illustration, modern digital cel shading, crisp clean linework, expressive large eyes, vibrant saturated colors, dramatic anime lighting with lens flare, detailed painted background, key visual quality. Fondos pintados al estilo anime: cielos con nubes trabajadas, interiores con luz cálida y perspectiva marcada.`,
    camera: `Variar el encuadre entre fragmentos consecutivos alternando obligatoriamente entre Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Over-the-shoulder shot y Overhead shot. Cuando el fragmento mencione un objeto concreto, usar un plano cerrado sobre ese objeto. Prohibido repetir el mismo encuadre dos veces seguidas.`,
    rules: `El fondo no puede quedar sin describir: en una misma escena, fijar una descripción corta del lugar y repetirla EXACTAMENTE IGUAL, palabra por palabra, en todos los prompts de esa misma escena. Especificar la iluminación en cada escena (por ejemplo: golden hour, luz azul nocturna, contraluz, luz de neón). Los personajes secundarios jamás pueden parecerse al protagonista (evitar clonación visual). Si aparece texto en la imagen, debe estar en el idioma del guion.`,
    promptEnd: `Style: high-quality 2D anime illustration, modern digital cel shading, crisp clean linework, expressive large eyes, vibrant saturated colors, dramatic anime lighting with lens flare, detailed painted background, key visual quality.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
