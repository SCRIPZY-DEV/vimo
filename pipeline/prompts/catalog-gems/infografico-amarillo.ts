import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Infográfico Amarillo: gema de Imperio Pro (02-infografico-amarillo.md de estilos/, 3731
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const infograficoAmarillo: CatalogGem = {
  id: 'infografico-amarillo',
  name: {
    es: 'Infográfico Amarillo',
    en: 'Yellow Infographic',
    pt: 'Infográfico Amarelo',
  },
  description: {
    es: 'Ilustración 2D tipo infografía, contornos negros limpios y fondo amarillo sólido.',
    en: '2D infographic illustration with clean black outlines on a solid yellow background.',
    pt: 'Ilustração 2D tipo infográfico, contornos pretos limpos e fundo amarelo sólido.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.twoD,
    CATALOG_TAGS.infographic,
    CATALOG_TAGS.yellowBackground,
    CATALOG_TAGS.explainer,
  ],
  sections: {
    visualStyle: `Estilo visual obligatorio: 2D infographic illustration, infographic layout, diagrammatic explainer video style, clean black outlines, flat colors. Fondo: Solid yellow background.`,
    dynamism: `Presencia y adaptación: encuadrar para mostrar la acción o diagrama descrito en la escena principal. Dinamismo consecutivo: variar los ángulos o tipos de encuadre en fragmentos consecutivos (por ejemplo, Wide Shot, Close-Up); PROHIBIDO usar “Extreme Wide Shot”. Expresiones: describir la emoción de cualquier sujeto en cada escena basándote en la acción.`,
    camera: `Usar variedad de tipos de plano/encuadre (p. ej., Medium shot y Close-up) adaptándolos a la acción o diagrama; PROHIBIDO “Extreme Wide Shot”.`,
    rules: `Fondos bloqueados: no dejar fondos en blanco; usar una descripción corta del lugar/fondo (por defecto “Solid yellow background”) y mantenerla EXACTAMENTE IGUAL palabra por palabra durante la misma escena. Texto/idioma/números: añadir 1 o 2 palabras del fragmento actual en 1 de cada 5 prompts; el idioma del texto en pantalla debe coincidir con el idioma del guion (si el guion está en español, el texto debe estar en español; si está en inglés, en inglés). Todo texto debe estar integrado en pizarras/carteles o estilo infografía. Números: si el fragmento menciona un número/fecha, convertirlo a dígitos (p. ej., “10”) y ponerlo obligatoriamente. Prohibición de ambigüedad textual: reconstruir la escena para cada prompt y evitar pronombres ambiguos (como “él” o “eso”); describir completamente los objetos y elementos de la escena en cada prompt.`,
    promptEnd: `Style: 2D infographic illustration, infographic layout, diagrammatic explainer video style, clean black outlines, flat colors. Solid yellow background`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 0,
}
