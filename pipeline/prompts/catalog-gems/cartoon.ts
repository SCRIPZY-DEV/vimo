import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Cartoon 2D: la gema de plantilla del estilo `cartoon` del carril viejo
// (`VISUAL_STYLES.cartoon`). El bloque STYLE fijo supera los 600 caracteres
// de una frase fija, así que `promptEnd` es su versión condensada (las
// negaciones repetidas en una sola) y el bloque completo vive en
// `visualStyle`.
export const cartoon: CatalogGem = {
  id: 'cartoon',
  name: { es: 'Cartoon 2D', en: '2D Cartoon', pt: 'Cartoon 2D' },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.twoD,
    CATALOG_TAGS.cartoon,
    CATALOG_TAGS.celShaded,
    CATALOG_TAGS.vividColor,
  ],
  sections: {
    visualStyle: `Flat 2D cartoon animation still, like a frame of a modern animated TV series: simplified, exaggerated character proportions with chunky cartoon facial features, flat cel-shaded coloring with hard sharp shadow edges, bold thick uniform black ink outlines around every shape and limb, flat solid color blocks and a highly saturated vibrant palette. A hand-drawn cartoon illustration look, with comic-book speed lines on action and crowds drawn as flat silhouette shapes. Absolutely no smooth gradients on skin or clothing, no realistic skin shading, no volumetric muscle rendering. Not realistic, not semi-realistic, not photorealistic, not 3D, not CGI, not digital painting, not detailed portrait rendering: pure flat 2D cartoon drawing.`,
    dynamism: `Treatments available in this style: action, metaphor, object, place, group, memory, diagram and bubble.
At least 1 of every 3 scenes is explanatory or allusive (metaphor, object, place, diagram, bubble or memory), interleaved with the action scenes. Never three identical treatments in a row and never three identical locations in a row.
The protagonist appears in about 50 % of the scenes. In the other scenes the cartoon setting, the objects, a cartoon diagram or the flat silhouette crowd tell the story.`,
    camera: `Open every scene with a cartoon shot type: "Wide cinematic cartoon shot of...", "Medium cartoon shot of...", "Close-up cartoon shot of...", "Low-angle cinematic cartoon shot of...". Vary the shot type between consecutive scenes.`,
    rules: `- Prefix "cartoon" on the key nouns to anchor the medium ("a cartoon male soccer player", "a cartoon football stadium", "cartoon Portuguese flags"): at least 5 "cartoon" prefixes inside each scene.
- When a character is present, include "simplified cartoon face", "big expressive cartoon eyes" and "exaggerated cartoon proportions".
- Crowds and background characters are flat silhouettes: "crowd drawn as flat black and red silhouette shapes", "background crowd as flat silhouette shapes".
- Lighting with "cartoon" intercalated: "cartoon light beams", "cartoon night sky", "cartoon grass".
- Keep the scene text between 400 and 800 characters: the closing style block is added by the platform.`,
    promptEnd:
      'Stylized 2D cartoon animation still in the style of a modern animated TV series, simplified exaggerated character proportions with chunky cartoon facial features, flat cel-shaded coloring with hard sharp shadow edges, no smooth gradients on skin or clothing, no realistic skin shading, bold thick uniform black ink outlines around every shape and limb, flat solid color blocks, highly saturated vibrant palette, comic-book speed lines on action, background crowd as flat silhouette shapes. NOT realistic, NOT 3D, NOT CGI, NOT digital painting. PURE FLAT 2D CARTOON DRAWING.',
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
