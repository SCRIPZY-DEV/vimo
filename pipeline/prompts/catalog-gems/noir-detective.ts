import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Noir Detective: gema de Imperio Pro (22-noir-detective.md de estilos/, 5707
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const noirDetective: CatalogGem = {
  id: 'noir-detective',
  name: { es: 'Noir Detective', en: 'Noir Detective', pt: 'Noir Detetive' },
  description: {
    es: 'Cine negro en blanco y negro puro: claroscuro duro, sombras de persiana y grano marcado.',
    en: 'Pure black-and-white film noir: hard chiaroscuro, venetian blind shadows and heavy grain.',
    pt: 'Cinema noir em preto e branco puro: claro-escuro duro, sombras de persiana e grão marcado.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.noir,
    CATALOG_TAGS.blackAndWhite,
    CATALOG_TAGS.mystery,
  ],
  sections: {
    visualStyle: `Style: high-contrast black and white film noir illustration, deep pure blacks and stark whites, hard chiaroscuro lighting, venetian blind shadow patterns, heavy grain, 1940s detective movie atmosphere, almost no midtones. White and black only; high-contrast, harsh light with deep shadowing (e.g., half of the face in deep shadow / harsh light raking across surfaces).`,
    dynamism: `El protagonista aparece en la mayoría de los prompts y se le nombra exclusivamente con la etiqueta [subject]; si el fragmento trata de un objeto o un extra, el encuadre debe incluir a [subject]. En cada escena, describe la emoción del protagonista a partir de la acción del fragmento (mirada, postura, tensión del cuerpo).`,
    camera: `Varia el encuadre entre fragmentos consecutivos alternando obligatoriamente entre: Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Over-the-shoulder shot y Overhead shot. Prohibido repetir el mismo encuadre dos veces seguidas. Si el fragmento menciona un objeto concreto, usa un plano cerrado sobre ese objeto.`,
    rules: `Presencia y etiqueta: el protagonista aparece en la mayoría de prompts y se le nombra EXCLUSIVAMENTE con [subject]; no se describe físicamente al protagonista. Excepción: si el fragmento es SOLO de un objeto o un lugar, puedes hacer un plano de recurso sin [subject]. Anti-clones: los secundarios jamás pueden parecerse al protagonista; para CADA extra usa la fórmula: another [ROL] with [RASGO FÍSICO Y PELO OPUESTOS AL PROTAGONISTA], wearing [ROPA DE TONO DISTINTO AL DEL PROTAGONISTA]. Fondo bloqueado: prohibido dejar el fondo sin describir; fija una descripción corta del lugar y REPÍTELA EXACTAMENTE IGUAL, palabra por palabra, en todos los prompts de esa misma escena. Fondos urbanos y nocturnos: calles mojadas que reflejan farolas, oficinas con persianas, callejones con vapor. Textos y números: si el fragmento menciona un número o una fecha, conviértelo a DÍGITOS y ponlo. Añade 1 o 2 palabras del fragmento en 1 de cada 5 prompts, escritas TAL CUAL en el idioma del guion. Nunca uses comillas para diálogos hablados. Expresión y emoción: describe la emoción del protagonista en cada escena según la acción del fragmento. Sombra como protagonista: cada prompt debe nombrar una fuente de luz dura y la sombra que proyecta (persiana, farola, faro de coche, cerilla); prohibido pedir color (este estilo es SIEMPRE blanco y negro). Idioma de texto dentro de la imagen: si aparece texto, debe estar en el IDIOMA DEL GUION.`,
    promptEnd: `Style: high-contrast black and white film noir illustration, deep pure blacks and stark whites, hard chiaroscuro lighting, venetian blind shadow patterns, heavy grain, 1940s detective movie atmosphere, almost no midtones.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 0,
}
