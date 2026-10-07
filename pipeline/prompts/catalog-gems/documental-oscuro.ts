import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Documental Oscuro: gema de Imperio Pro (27-documental-oscuro.md de estilos/, 4766
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const documentalOscuro: CatalogGem = {
  id: 'documental-oscuro',
  name: {
    es: 'Documental Oscuro',
    en: 'Dark Documentary',
    pt: 'Documentário Escuro',
  },
  tags: [CATALOG_TAGS.documentary, CATALOG_TAGS.dark, CATALOG_TAGS.mystery],
  sections: {
    visualStyle: `dark cinematic documentary photography, desaturated muted palette, heavy film grain, deep shadows with a single motivated light source, shallow depth of field, anamorphic widescreen framing, unsettling quiet atmosphere.`,
    camera: `varía el encuadre entre fragmentos consecutivos, alternando obligatoriamente entre Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Overhead shot y Insert shot de un objeto; PROHIBIDO repetir el mismo encuadre dos veces seguidas; alterna la composición para que dos prompts consecutivos no compartan la misma composición (alternar entre plano de lugar, detalle de objeto, escena con figuras, elemento simbólico y plano atmosférico).`,
    rules: `Sin personaje recurrente fijo: este estilo NO tiene un personaje recurrente; si aparece alguien, descríbelo entero en ese prompt y no des por hecho que se repite en el siguiente. FONDO BLOQUEADO: PROHIBIDO dejar el fondo sin describir; fija una descripción corta del lugar real y concreto (archivos, sótanos, carreteras vacías, despachos antiguos) y REPÍTELA EXACTAMENTE IGUAL, palabra por palabra, en todos los prompts de esa misma escena. TEXTOS Y NÚMEROS: si el fragmento menciona una fecha o un número, conviértelo a DÍGITOS y ponlo. Idioma del texto dentro de la imagen: cualquier texto que aparezca dentro de la imagen (carteles, papeles, pantallas) debe ir en el IDIOMA DEL GUION. TENSIÓN SIN MOSTRAR: sugiere el hecho en vez de enseñarlo (una puerta entreabierta, una silla vacía, un expediente abierto). PROHIBIDO representar violencia explícita, sangre o cadáveres.`,
    promptEnd: `Style: dark cinematic documentary photography, desaturated muted palette, heavy film grain, deep shadows, anamorphic widescreen. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 4,
}
