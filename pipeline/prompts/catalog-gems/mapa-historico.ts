import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Mapa Histórico: gema de Imperio Pro (34-mapa-historico.md de estilos/, 4841
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const mapaHistorico: CatalogGem = {
  id: 'mapa-historico',
  name: { es: 'Mapa Histórico', en: 'Historical Map', pt: 'Mapa Histórico' },
  description: {
    es: 'Cartografía antigua en pergamino: costas grabadas, rosa de los vientos y rutas de puntos.',
    en: 'Antique parchment cartography: engraved coastlines, a compass rose and dotted routes.',
    pt: 'Cartografia antiga em pergaminho: costas gravadas, rosa dos ventos e rotas pontilhadas.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.map,
    CATALOG_TAGS.history,
    CATALOG_TAGS.parchment,
  ],
  sections: {
    visualStyle: `Style: antique cartographic illustration, aged parchment map with sepia tones, fine engraved coastlines and hand-drawn terrain hatching, compass rose and decorative border, dotted route lines, vintage atlas aesthetic. The map support is always an aged parchment map; if there is a scene, it is drawn as an illustrated vignette on the parchment map itself.`,
    dynamism: `Cada prompt marca un desplazamiento o una posición sobre el mapa usando recursos cartográficos como línea de puntos, flecha de avance, chincheta, círculo resaltado o zona sombreada.`,
    camera: `Varía el encuadre entre fragmentos consecutivos alternando obligatoriamente entre: Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Overhead shot y Insert shot de un objeto. Prohibido repetir el mismo encuadre dos veces seguidas.`,
    rules: `Sin protagonista fijo recurrente: si aparece alguien, descríbelo entero en ese prompt y no des por hecho que se repite en el siguiente. Fondo bloqueado: está prohibido dejar el fondo sin describir; fija una descripción corta del lugar y REPÍTELA EXACTAMENTE IGUAL, palabra por palabra, en todos los prompts de esa misma escena. No dos prompts consecutivos pueden compartir la misma composición: alterna entre plano de lugar, detalle de objeto, escena con figuras, elemento simbólico y plano atmosférico. Si el fragmento menciona una cifra o una fecha, conviértela a dígitos. Añade 1 o 2 palabras del fragmento en 1 de cada 5 prompts, escritas TAL CUAL en el idioma del guion. NUNCA uses comillas para diálogos hablados.`,
    promptEnd: `Style: antique cartographic illustration, aged parchment map with sepia tones, fine engraved coastlines and hand-drawn terrain hatching, compass rose and decorative border, dotted route lines, vintage atlas aesthetic.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 0,
}
