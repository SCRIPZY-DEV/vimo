import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Infografía Azul: gema de Imperio Pro (29-infografia-azul.md de estilos/, 4794
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const infografiaAzul: CatalogGem = {
  id: 'infografia-azul',
  name: {
    es: 'Infografía Azul',
    en: 'Blue Infographic',
    pt: 'Infográfico Azul',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.infographic,
    CATALOG_TAGS.data,
    CATALOG_TAGS.corporate,
  ],
  sections: {
    visualStyle: `Estilo visual obligatorio: "clean modern infographic illustration, flat vector design, deep navy background with white and electric blue elements, one single orange accent color, thin uniform linework, generous negative space, corporate explainer look." Fondo siempre azul marino sólido y limpio; nunca escenas realistas.`,
    dynamism: `Alterna la composición entre fragmentos consecutivos (sin repetir composición): plano de lugar, detalle de objeto, escena con figuras, elemento simbólico y plano atmosférico. Cada imagen representa UNA sola idea con UN diagrama (por ejemplo: una barra, un flujo, un icono grande o un mapa); PROHIBIDO acumular varios diagramas en la misma imagen.`,
    camera: `Varia el encuadre entre fragmentos consecutivos, alternando obligatoriamente y sin repetir el mismo encuadre dos veces seguidas entre: Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Overhead shot y Insert shot de un objeto.`,
    rules: `Sin protagonista recurrente fijo: si aparece alguien, descríbelo entero en ese prompt y no des por hecho que se repite en el siguiente. Fondo no puede quedar sin describir: el fondo es siempre azul marino sólido y limpio y debe mantenerse consistente en cada escena. Nunca escenas realistas. Si el fragmento menciona un número o una fecha, conviértelo a DÍGITOS y ponlos. Añade 1 o 2 palabras del fragmento en 1 de cada 5 prompts, escritas TAL CUAL en el idioma del guion. NUNCA uses comillas para diálogos hablados.`,
    promptEnd: `Style: clean modern infographic illustration, flat vector design, deep navy background with white and electric blue elements, one single orange accent color, thin uniform linework, generous negative space, corporate explainer look. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 4,
}
