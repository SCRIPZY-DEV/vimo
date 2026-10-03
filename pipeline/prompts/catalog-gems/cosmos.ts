import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Cosmos: gema de Imperio Pro (28-cosmos.md de estilos/, 4796
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const cosmos: CatalogGem = {
  id: 'cosmos',
  name: { es: 'Cosmos', en: 'Cosmos', pt: 'Cosmos' },
  description: {
    es: 'Render espacial fotorrealista: campo de estrellas denso, nebulosas volumétricas y escala inmensa.',
    en: 'Photorealistic space render: dense star fields, volumetric nebulae and immense scale.',
    pt: 'Render espacial fotorrealista: campo de estrelas denso, nebulosas volumétricas e escala imensa.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.space,
    CATALOG_TAGS.science,
    CATALOG_TAGS.photorealistic,
  ],
  sections: {
    visualStyle: `Style: photorealistic space render, astrophotography look, deep black void with dense star fields, volumetric nebula in cyan and magenta, hard sunlight with pure black shadows, immense sense of scale, ultra detailed, 8k.`,
    dynamism: `CANDADO 5 - DINAMISMO CONSECUTIVO: varía el encuadre entre fragmentos consecutivos, alternando obligatoriamente entre Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Overhead shot y Insert shot de un objeto. PROHIBIDO repetir el mismo encuadre dos veces seguidas. CANDADO 6 - RECURSO VISUAL ROTATIVO: PROHIBIDO que dos prompts consecutivos compartan la misma composición. Alterna entre plano de lugar, detalle de objeto, escena con figuras, elemento simbólico y plano atmosférico. CANDADO 3 - FONDO BLOQUEADO: fondo por defecto es el espacio profundo con campo de estrellas denso; si la escena es planetaria, se fija el planeta y se repite igual; PROHIBIDO dejar el fondo sin describir y repetir la descripción del lugar EXACTAMENTE IGUAL, palabra por palabra, en todos los prompts de esa misma escena. CANDADO 7 - ESCALA EXPLÍCITA: cada prompt debe dar una referencia de tamaño (una sonda diminuta frente al planeta, una luna al lado del gigante gaseoso) para que el plano diga algo de escala.`,
    camera: `Alternar obligatoriamente entre Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Overhead shot y Insert shot de un objeto entre fragmentos consecutivos; PROHIBIDO repetir el mismo encuadre dos veces seguidas.`,
    rules: `CANDADO 2 - SIN PROTAGONISTA FIJO: este estilo NO tiene un personaje recurrente; si aparece alguien, descríbelo entero en ese prompt y no des por hecho que se repite en el siguiente. CANDADO 4 - TEXTOS Y NÚMEROS: si el fragmento menciona un número o una fecha, conviértelo a DÍGITOS y ponlo; añade 1 o 2 palabras del fragmento en 1 de cada 5 prompts, escritas TAL CUAL en el idioma del guion. Cualquier texto que aparezca dentro de la imagen debe ir en el idioma del guion. PROHIBIDO dejar el fondo sin describir; el fondo debe seguir el esquema de “fondo bloqueado” indicado.`,
    promptEnd: `Style: photorealistic space render, astrophotography look, dense star fields, volumetric nebula, immense sense of scale, 8k.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 0,
}
