import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Naturaleza Épica: gema de Imperio Pro (33-naturaleza-epica.md de estilos/, 4846
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const naturalezaEpica: CatalogGem = {
  id: 'naturaleza-epica',
  name: { es: 'Naturaleza Épica', en: 'Epic Nature', pt: 'Natureza Épica' },
  description: {
    es: 'Documental de naturaleza: teleobjetivo nítido, luz de hora dorada y bokeh cremoso.',
    en: 'Nature documentary: sharp telephoto, golden hour light and creamy bokeh.',
    pt: 'Documentário de natureza: teleobjetiva nítida, luz da hora dourada e bokeh cremoso.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.nature,
    CATALOG_TAGS.documentary,
    CATALOG_TAGS.photographic,
  ],
  sections: {
    visualStyle: `epic wildlife documentary photography, ultra sharp telephoto detail, golden hour rim lighting, rich saturated natural colors, shallow depth of field with creamy bokeh, dramatic weather and atmosphere, BBC nature documentary look, 8k`,
    dynamism: `Cada prompt captura un instante de acción o de tensión concreto (el salto, la mirada, la gota cayendo), nunca un animal o un paisaje simplemente posando.`,
    camera: `Al variar el encuadre entre fragmentos consecutivos, alterna obligatoriamente y sin repetir dos veces seguidas el mismo encuadre entre: Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Overhead shot y Insert shot de un objeto.`,
    rules: `Este estilo NO tiene un personaje recurrente: si aparece alguien, descríbelo entero en ese prompt y no des por hecho que se repite en el siguiente. PROHIBIDO dejar el fondo sin describir: fija una descripción corta del lugar y REPÍTELA EXACTAMENTE IGUAL, palabra por palabra, en todos los prompts de esa misma escena. Si el fragmento menciona un número o una fecha, conviértelo a DÍGITOS. Añade 1 o 2 palabras del fragmento en 1 de cada 5 prompts, escritas TAL CUAL en el idioma del guion. Cualquier texto dentro de la imagen (carteles, papeles, pantallas) debe ir en el IDIOMA DEL GUION. NUNCA uses comillas para diálogos hablados. PROHIBIDO que dos prompts consecutivos compartan la misma composición: alterna entre plano de lugar, detalle de objeto, escena con figuras, elemento simbólico y plano atmosférico.`,
    promptEnd: `Style: epic wildlife documentary photography, ultra sharp telephoto detail, golden hour rim lighting, rich saturated natural colors, shallow depth of field with creamy bokeh, dramatic weather and atmosphere, BBC nature documentary look, 8k.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 0,
}
