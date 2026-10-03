import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Abstracto Rojo: gema de Imperio Pro (14-abstracto-rojo.md de estilos/, 4749
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const abstractoRojo: CatalogGem = {
  id: 'abstracto-rojo',
  name: { es: 'Abstracto Rojo', en: 'Abstract Red', pt: 'Abstrato Vermelho' },
  description: {
    es: 'Novela gráfica psicológica: negro absoluto, rojo sangre y violeta profundo, con tintas planas.',
    en: 'Psychological graphic novel: absolute black, blood red and deep violet in flat inks.',
    pt: 'Novela gráfica psicológica: preto absoluto, vermelho sangue e violeta profundo, com tintas chapadas.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.abstract,
    CATALOG_TAGS.psychological,
    CATALOG_TAGS.redAndBlack,
  ],
  sections: {
    visualStyle: `Abstract psychological graphic novel look with pure stark black shadows and a blood crimson red palette, plus subtle deep violet accents; flat ink washes; minimalist pitch-black void backgrounds; heavy noir atmosphere; edge-to-edge cinematic framing. No white borders. No paper texture. No sci-fi. No neon. Purely conceptual.`,
    dynamism: `Usar descripciones claras de figuras anónimas o elementos abstractos (sin la etiqueta [subject]) y adaptar el encuadre para que el objeto/extra funcione como metáfora visual. Se permiten múltiples figuras, siluetas, multitudes anónimas y objetos metafóricos (p. ej., engranajes, máscaras, jaulas) si el guion lo requiere. En cada escena, describir la emoción basándose en la atmósfera abstracta o el lenguaje corporal. El fondo no puede quedar en blanco: debe incluirse una descripción corta del lugar (mínimal y oscuro) y mantenerse consistente dentro de la misma escena.`,
    camera: `Varía los ángulos de cámara en fragmentos consecutivos (p. ej., Wide Shot seguido de Close-Up). Prohibido usar “Extreme Wide Shot”.`,
    rules: `No dejar fondos en blanco: siempre debe existir una descripción corta del entorno. Si aparece texto dentro de la imagen (carteles, papeles, pantallas), debe estar en el idioma del guion. Todo el texto debe mostrarse sobre pizarras o papeles blancos. Si el fragmento menciona un número/fecha, convertirlo a dígitos. No usar comillas para diálogos hablados (el texto visible no debe llevar comillas). Prohibido: ambientes o elementos sci‑fi y neon; no crear bordes blancos ni textura de papel.`,
    promptEnd: `Style: Abstract psychological graphic novel, pure stark black shadows and blood crimson red palette with subtle deep violet accents, flat ink washes, minimalist pitch-black void backgrounds, heavy noir atmosphere, edge-to-edge cinematic framing, NO white borders, NO paper texture, NO sci-fi, NO neon, purely conceptual. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
