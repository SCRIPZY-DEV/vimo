import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Cyberpunk Neón: gema de Imperio Pro (25-cyberpunk-neon.md de estilos/, 5678
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const cyberpunkNeon: CatalogGem = {
  id: 'cyberpunk-neon',
  name: { es: 'Cyberpunk Neón', en: 'Neon Cyberpunk', pt: 'Cyberpunk Neon' },
  description: {
    es: 'Futurista de neón magenta y cian: superficies mojadas, niebla volumétrica e interfaces holográficas.',
    en: 'Magenta and cyan neon futurism: wet surfaces, volumetric fog and holographic interfaces.',
    pt: 'Futurista de neon magenta e ciano: superfícies molhadas, névoa volumétrica e interfaces holográficas.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.cyberpunk,
    CATALOG_TAGS.neon,
    CATALOG_TAGS.futuristic,
  ],
  sections: {
    visualStyle: `cyberpunk digital illustration, neon magenta and cyan rim lighting, wet reflective surfaces, volumetric fog, holographic interfaces, dense futuristic city detail, high contrast dark base with glowing accents, cinematic anamorphic look.`,
    dynamism: `En la Fase 2, el protagonista [subject] aparece en la mayoría de los prompts y debe nombrarse exclusivamente con la etiqueta [subject]; en esa fase nunca se describe físicamente al protagonista. Si el fragmento trata de un objeto o un extra, el encuadre debe adaptarse para incluir a [subject]. Excepción: si el fragmento es SOLO de un objeto o un lugar, se permite un plano de recurso sin [subject]. En cada escena se debe describir la emoción del protagonista a partir de la acción del fragmento (mirada, postura, tensión del cuerpo).`,
    camera: `En Fase 2, variar el encuadre entre fragmentos consecutivos alternando obligatoriamente entre: Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Over-the-shoulder shot y Overhead shot. No repetir el mismo encuadre dos veces seguidas. Si el fragmento menciona un objeto concreto, usar un plano cerrado sobre ese objeto.`,
    rules: `Prohibido en Fase 2 describir físicamente al protagonista: solo usar la etiqueta [subject]. Para personajes secundarios (extras) evitar clonación: cada extra debe seguir la fórmula “another [ROL] with [RASGO FÍSICO Y PELO OPUESTOS AL PROTAGONISTA], wearing [ROPA DE COLOR DISTINTO AL DEL PROTAGONISTA]”. El fondo no puede quedar sin describir: fijar una descripción corta del lugar y repetirla EXACTAMENTE IGUAL, palabra por palabra, en todos los prompts de esa misma escena; los fondos son urbanos y densos (callejones con carteles luminosos, azoteas bajo la lluvia, interiores con pantallas holográficas). Si el fragmento menciona un número o fecha, convertirlo a DÍGITOS y colocarlo. Añadir 1 o 2 palabras del fragmento en 1 de cada 5 prompts, escritas TAL CUAL en el idioma del guion; no usar comillas para diálogos hablados. Dinamismo secuencial: el encuadre debe alternar entre los tipos listados y no repetirse consecutivamente. Cada prompt debe indicar explícitamente la fuente concreta de la luz de neón (p. ej., un cartel, una pantalla o un reflejo en el charco) y está prohibido el resplandor de colores sin fuente. Cuando haya texto dentro de la imagen, debe estar en el idioma del guion (ver promptEnd).`,
    promptEnd: `Style: cyberpunk digital illustration, neon magenta and cyan rim lighting, wet reflective surfaces, volumetric fog, holographic interfaces, dense futuristic city detail, high contrast dark base with glowing accents, cinematic anamorphic look.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
