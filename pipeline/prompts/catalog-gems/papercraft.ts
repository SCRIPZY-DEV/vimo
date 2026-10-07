import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Papercraft: gema de Imperio Pro (24-papercraft.md de estilos/, 5666
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const papercraft: CatalogGem = {
  id: 'papercraft',
  name: { es: 'Papercraft', en: 'Papercraft', pt: 'Papercraft' },
  tags: [CATALOG_TAGS.paper, CATALOG_TAGS.diorama, CATALOG_TAGS.tale],
  sections: {
    visualStyle: `Ilustración de recortes de papel en capas (layered paper cut-out) y diorama artesanal de papercraft. Múltiples capas de profundidad que proyectan sombras suaves tipo “soft drop shadows” entre capas. Cartulina mate texturizada (textured matte cardstock). Formas geométricas limpias (clean geometric shapes). Iluminación de estudio suave y uniforme (soft even studio lighting). Sensación de cuento infantil (storybook feel). Los fondos son dioramas de papel por capas con descripciones cortas del lugar, p. ej., montañas escalonadas, ciudades recortadas e interiores en tres o cuatro planos, manteniendo el mismo aspecto en todos los prompts de esa misma escena.`,
    camera: `Alterna obligatoriamente el tipo de encuadre entre fragmentos consecutivos, sin repetir el mismo encuadre dos veces seguidas: Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Over-the-shoulder shot y Overhead shot. Si el fragmento menciona un objeto concreto, usa un plano cerrado sobre ese objeto.`,
    rules: `El protagonista aparece en la mayoría de prompts y debe nombrarse exclusivamente con la etiqueta [subject]; no se debe describir físicamente al protagonista. Si el fragmento trata solo de un objeto o de un lugar, puede hacerse un plano de recurso sin [subject]. Prohibido que los personajes secundarios se parezcan al protagonista: para cada extra usa la fórmula “another [ROL] with [RASGO FÍSICO Y PELO OPUESTOS AL PROTAGONISTA], wearing [ROPA DE COLOR DISTINTO AL DEL PROTAGONISTA]”. Prohibido dejar el fondo sin descripción: fija una descripción corta del lugar y repítela exactamente igual, palabra por palabra, en todos los prompts de esa misma escena. Si el fragmento menciona un número o una fecha, conviértelo a dígitos. Añade 1 o 2 palabras del fragmento en 1 de cada 5 prompts, escritas tal cual en el idioma del guion. Nunca uses comillas para diálogos hablados. Describe la emoción/expresión del protagonista en cada escena a partir de la acción del fragmento (mirada, postura, tensión corporal). Profundidad por capas: cada prompt debe indicar cuántos planos de papel tiene la escena (primer plano, plano medio, fondo) y especificar que cada capa proyecta una sombra suave sobre la de atrás.`,
    promptEnd: `Style: layered paper cut-out illustration, handcrafted papercraft diorama, multiple depth layers casting soft drop shadows, textured matte cardstock, clean geometric shapes, soft even studio lighting, storybook feel. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
