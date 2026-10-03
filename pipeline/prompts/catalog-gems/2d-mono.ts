import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// 2D Mono: gema de Imperio Pro (08-2d-mono.md de estilos/, 6853
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const gem2dMono: CatalogGem = {
  id: '2d-mono',
  name: { es: '2D Mono', en: '2D Monkey', pt: '2D Macaco' },
  description: {
    es: 'Gorila deliberadamente mal dibujado estilo MS Paint: línea torpe, colores planos y cero sombreado.',
    en: 'A deliberately badly drawn MS Paint gorilla: clumsy line, flat colors and zero shading.',
    pt: 'Gorila deliberadamente mal desenhado estilo MS Paint: linha desajeitada, cores chapadas e zero sombreado.',
  },
  tags: [
    CATALOG_TAGS.fixedCharacter,
    CATALOG_TAGS.twoD,
    CATALOG_TAGS.msPaint,
    CATALOG_TAGS.humor,
  ],
  sections: {
    visualStyle: `Lazy MS Paint doodle drawing style, very poorly drawn. Very basic shapes, thin crude black linework, minimalist look with a flat/cartoon feel. Gorilla rendered as a flat character design with no muscle detail on the body and simplified facial features.`,
    character: `A crudely drawn cartoon gorilla, in a lazy MS Paint style with thin, crude black lines: a solid dark gray body with no muscle details, a solid light gray face with no nose, just two tiny dots for eyes and a flat thin line for a mouth, and a pink ear. Outfit: none, no clothes, no props and no accessories.`,
    camera: `Cambia el encuadre entre prompts consecutivos, alternando fuertemente entre: Wide Shot, Cowboy Shot, Medium Shot, Close-Up, Dutch Angle. Prohibido usar “Extreme Wide Shot”.`,
    rules: `El texto que aparezca dentro de la imagen (carteles, papeles, pantallas) debe ir en el IDIOMA DEL GUION. El protagonista NO debe tener elementos extra ni objetos en las manos. En cada prompt, describe expresiones exageradas modificando la anatomía base (p. ej., ojos en puntitos muy abiertos y boca como línea fina; prohibido incluir “teeth”, “open mouth”, “roaring”). El fondo debe ser claro y descriptivo y permanecer igual palabra por palabra en prompts consecutivos, salvo que el guion indique explícitamente un cambio geográfico o de época.`,
    promptEnd: `Style: ms paint doodle, thin black outlines, completely flat colors, minimalist, NO shading, NO details. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
