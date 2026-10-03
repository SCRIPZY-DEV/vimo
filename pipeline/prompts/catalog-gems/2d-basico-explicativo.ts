import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// 2D Básico Explicativo: gema de Imperio Pro (07-2d-basico-explicativo.md de estilos/, 6465
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const gem2dBasicoExplicativo: CatalogGem = {
  id: '2d-basico-explicativo',
  name: {
    es: '2D Básico Explicativo',
    en: '2D Basic Explainer',
    pt: '2D Básico Explicativo',
  },
  description: {
    es: 'Criatura ovoide gris de ojos negros sobre lienzo beige: línea fina uniforme y paleta apagada, con mucho B-roll.',
    en: 'A gray egg-shaped creature with black eyes on a beige canvas: thin uniform line, muted palette and plenty of B-roll.',
    pt: 'Criatura ovoide cinza de olhos pretos sobre tela bege: linha fina uniforme e paleta suave, com muito B-roll.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.fixedCharacter,
    CATALOG_TAGS.twoD,
    CATALOG_TAGS.explainer,
    CATALOG_TAGS.grayPalette,
  ],
  sections: {
    visualStyle: `Narrativas visuales de “Animación 2D tipo Explainer/Storytime” con coherencia extrema entre escenas, intercalando planos de personajes con B-Roll y un uso intensivo de infografías visuales. Ilustración vectorial moderna, limpia y plana (estilo 2D). Todo debe verse como una ilustración vectorial moderna, limpia y plana: NO 3D, NO CGI, NO texturas realistas, NO bordes de cómic gruesos. Smooth, consistent linework con uniform thin thickness; paleta de color muteda con dominancia de grises; sombreado mínimo para volumen simple en una forma 2D mayormente plana; fondo tipo “Light beige canvas background”.`,
    character: `A light gray ovoid creature, smooth and featureless, with a slightly chubby body, tiny legs and short arms. The face has large, solid black circular eyes and a neutral expression. Outfit: none, no clothes and no accessories.`,
    dynamism: `El protagonista NO debe aparecer en todas las escenas: en al menos el 40 % de las escenas omitir al personaje y describir un objeto, diagrama o metáfora visual (B-Roll). Cuando aparece el personaje, nómbralo con la etiqueta [subject]. Si NO aparece el personaje, describir el objeto/diagrama en primer plano. En la mayoría de las escenas (70 %), incluir textos en pantalla (carteles, notas, pantallas o texto flotante) que resuman el concepto; el texto va en el idioma del guion y entre comillas dobles.`,
    camera: `Usar lenguaje cinematográfico con variedad estricta de planos: Wide Shot, Medium Shot y Extreme Close-Up. Para escenas sin personaje usar Insert shot / Extreme Close-Up como enfoque del B-Roll/objeto.`,
    rules: `ADVERTENCIA CRÍTICA: Bajo ninguna circunstancia generar descripciones que sugieran 3D, CGI, texturas realistas, ni bordes de cómic gruesos. Todo debe verse como ilustración vectorial moderna, limpia y plana. No usar pronombres ambiguos: reconstruir el contexto del fragmento en el guion y describir siempre el sujeto u objeto completo. Evitar acciones complejas para la anatomía del personaje (preferir acciones pasivas como “observar” o “sostener”). Fondo: nunca dejar fondos en blanco; describir un lugar corto y repetirlo EXACTAMENTE igual en todos los prompts que ocurran en esa misma escena. Textos: el 70 % de las escenas deben proponer letreros/notas/pantallas con texto flotante en el idioma del guion entre comillas dobles (NUNCA diálogos hablados como texto). Personajes secundarios: describir cada extra con formas geométricas distintas y usando la fórmula obligatoria: "[ROL] character shaped like a [FORMA, ej: tall rectangle / round ball] in [COLOR] color, with [CABELLO/ROPA DISTINTA]"; NUNCA usar la palabra “ovoid” ni “gray creature” para los extras. En las escenas sin personaje (B-Roll): Extreme Close-Up o Insert shot del objeto o diagrama, sin personajes.`,
    promptEnd: `Style: Clean modern 2D vector illustration, explainer video style, flat design. Smooth, consistent linework with uniform thin thickness. Muted color palette with grayscale dominance. Minimal shading for simple volume on a mostly flat 2D form. Light beige canvas background. NO thick black borders, NO realistic 3D, NO chibi anime features. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
