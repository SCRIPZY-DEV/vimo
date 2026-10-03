import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Claymation: gema de Imperio Pro (23-claymation.md de estilos/, 5723
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const claymation: CatalogGem = {
  id: 'claymation',
  name: { es: 'Claymation', en: 'Claymation', pt: 'Claymation' },
  description: {
    es: 'Stop motion de plastilina: huellas dactilares visibles, maqueta física y luz cálida de estudio.',
    en: 'Clay stop motion: visible fingerprints, a physical set and warm studio light.',
    pt: 'Stop motion de massinha: impressões digitais visíveis, maquete física e luz quente de estúdio.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.stopMotion,
    CATALOG_TAGS.clay,
    CATALOG_TAGS.handmade,
  ],
  sections: {
    visualStyle: `stop motion claymation, handmade plasticine models with visible fingerprints and tool marks, slightly uneven surfaces, miniature practical set, shallow depth of field, warm studio lighting, tactile handcrafted look. Maquetas físicas en miniatura (cartón, tela, plastilina y madera pintada), con apariencia artesanal y fabricación manual visible.`,
    dynamism: `El protagonista aparece en la mayoría de los prompts y debe nombrarse exclusivamente con la etiqueta [subject]; en fragmentos que tratan SOLO de un objeto o un lugar, se permite un plano de recurso sin [subject]. Para cada escena, la emoción del protagonista debe describirse a partir de la acción del fragmento (mirada, postura, tensión corporal).`,
    camera: `Varía el encuadre entre fragmentos consecutivos alternando obligatoriamente entre: Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Over-the-shoulder shot y Overhead shot. Cuando el fragmento mencione un objeto concreto, usa un plano cerrado sobre ese objeto. PROHIBIDO repetir el mismo encuadre dos veces seguidas.`,
    rules: `Nunca dejar el fondo sin describir: el fondo debe ser una descripción corta y repetible de un lugar/escena física. Los fondos son maquetas físicas (cartón, tela, plastilina y madera pintada) y nunca deben ser fondos digitales. Los personajes secundarios jamás pueden parecerse al protagonista; para cada extra usa la fórmula: “another [ROL] with [RASGO FÍSICO Y PELO OPUESTOS AL PROTAGONISTA], wearing [ROPA DE COLOR DISTINTO AL DEL PROTAGONISTA]”. Cada prompt debe mencionar al menos un rasgo de fabricación manual (huellas dactilares, costuras, cartón recortado, pintura irregular). Si el fragmento menciona un número o una fecha, conviértelo a DÍGITOS y ponlos. Añade 1 o 2 palabras del fragmento en 1 de cada 5 prompts, escritas TAL CUAL en el idioma del guion. NUNCA uses comillas para diálogos hablados. Si aparece texto dentro de la imagen, debe ir en el idioma del guion.`,
    promptEnd: `Style: stop motion claymation, handmade plasticine models with visible fingerprints and tool marks, slightly uneven surfaces, miniature practical set, shallow depth of field, warm studio lighting, tactile handcrafted look.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 0,
}
