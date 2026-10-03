import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Caricatura Editorial: gema de Imperio Pro (26-caricatura-editorial.md de estilos/, 5760
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const caricaturaEditorial: CatalogGem = {
  id: 'caricatura-editorial',
  name: {
    es: 'Caricatura Editorial',
    en: 'Editorial Caricature',
    pt: 'Caricatura Editorial',
  },
  description: {
    es: 'Caricatura de prensa: tinta suelta de grosor variable, proporciones exageradas y acuarela sobre papel.',
    en: 'Press caricature: loose ink of varying weight, exaggerated proportions and watercolor on paper.',
    pt: 'Caricatura de imprensa: tinta solta de espessura variável, proporções exageradas e aquarela sobre papel.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.caricature,
    CATALOG_TAGS.ink,
    CATALOG_TAGS.satirical,
  ],
  sections: {
    visualStyle: `Style: editorial caricature illustration with loose confident ink linework with varying line weight, exaggerated proportions with an oversized head, limited palette of watercolor washes, visible paper texture, satirical newspaper illustration look. Characters are drawn with loose ink linework, an oversized head and exaggerated proportions (with a small body when shown full body). Backgrounds are kept as suggested scenes with loose lines and watercolor blotch-like placement.`,
    dynamism: `El protagonista aparece en la mayoría de los prompts y debe mostrarse etiquetado como [subject] (no describirlo físicamente). En cada prompt se describe la emoción del protagonista a partir de la acción del fragmento (mirada, postura, tensión del cuerpo). Cada prompt exagera UN rasgo o UN objeto relacionado con lo que cuenta el fragmento (p. ej., una mano enorme, un reloj gigante, una montaña de papeles) para lograr lectura satírica.`,
    camera: `Varía el encuadre entre fragmentos consecutivos alternando obligatoriamente entre: Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Over-the-shoulder shot y Overhead shot. Cuando el fragmento mencione un objeto concreto, usa un plano cerrado sobre ese objeto. PROHIBIDO repetir el mismo encuadre dos veces seguidas.`,
    rules: `El protagonista se nombra EXCLUSIVAMENTE con la etiqueta [subject] y NO se describe físicamente. Si el fragmento es SOLO de un objeto o de un lugar, puedes hacer un plano de recurso sin [subject]. Anti-clones: los personajes secundarios JAMÁS pueden parecerse al protagonista; para CADA extra usa exactamente la fórmula: another [ROL] with [RASGO FÍSICO Y PELO OPUESTOS AL PROTAGONISTA], wearing [ROPA DE COLOR DISTINTO AL DEL PROTAGONISTA]. Fondo bloqueado: PROHIBIDO dejar el fondo sin describir; fija una descripción corta del lugar y REPÍTELA EXACTAMENTE IGUAL, palabra por palabra, en todos los prompts de esa misma escena. Textos y números: si el fragmento menciona un número o una fecha, conviértelo a DÍGITOS; añade 1 o 2 palabras del fragmento en 1 de cada 5 prompts escritas TAL CUAL en el idioma del guion; NUNCA uses comillas para diálogos hablados. Expresión y emoción: describe la emoción del protagonista en cada escena según la acción del fragmento. Exageración con intención: cada prompt exagera un rasgo u objeto relacionado con el fragmento.`,
    promptEnd: `Style: editorial caricature illustration, loose confident ink linework with varying line weight, exaggerated proportions with an oversized head, limited palette of watercolor washes, visible paper texture, satirical newspaper illustration look. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
