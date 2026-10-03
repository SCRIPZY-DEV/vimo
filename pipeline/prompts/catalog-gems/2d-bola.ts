import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// 2D Bola: gema de Imperio Pro (12-2d-bola.md de estilos/, 6391
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const gem2dBola: CatalogGem = {
  id: '2d-bola',
  name: { es: '2D Bola', en: '2D Blob', pt: '2D Bola' },
  description: {
    es: 'Criatura ovoide gris de ojos negros con B-roll constante: línea fina, paleta apagada y lienzo beige.',
    en: 'A gray egg-shaped creature with black eyes and constant B-roll: thin line, muted palette and beige canvas.',
    pt: 'Criatura ovoide cinza de olhos pretos com B-roll constante: linha fina, paleta suave e tela bege.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.fixedCharacter,
    CATALOG_TAGS.twoD,
    CATALOG_TAGS.explainer,
    CATALOG_TAGS.bRoll,
  ],
  sections: {
    visualStyle: `Animación 2D tipo Explainer/Storytime, con coherencia extrema entre escenas e intercalando planos de personajes con B-Roll y un uso intensivo de infografías visuales. Todo debe verse como una ilustración vectorial moderna, limpia y plana. Prohibido que parezca 3D/CGI o con texturas realistas; nada de bordes de cómic gruesos. Estética de líneas suave y consistente, diseño plano con volumen mínimo. Paleta apagada con predominio de grises, y fondo tipo lienzo color beige claro; composición limpia y moderna.`,
    character: `A light gray ovoid creature, smooth, featureless and slightly chubby, with tiny legs and short arms, and a neutral face with large, solid black circular eyes. Outfit: none, no clothes and no accessories.`,
    dynamism: `El protagonista NO debe aparecer en todas las escenas: en al menos el 40% de las escenas omitir al protagonista y describir un objeto, diagrama o metáfora visual (B-Roll). En la mayoría de escenas (70%), incluir letreros/notas/pantallas o texto flotante que resuma el concepto, sin usar diálogos hablados como texto.`,
    camera: `Usa lenguaje cinematográfico con variedad estricta entre Wide Shot, Medium Shot, Extreme Close-Up e Insert shot (en B-Roll/objeto usa especialmente Extreme Close-Up/Insert shot).`,
    rules: `Bajo ninguna circunstancia generar descripciones que sugieran 3D, CGI, texturas realistas ni bordes de cómic gruesos; todo debe verse como ilustración vectorial moderna, limpia y plana. NO thick black borders, NO realistic 3D, NO chibi anime features. Reconstruir el contexto absoluto rastreando el fragmento en el guion; evitar pronombres ambiguos y describir siempre al sujeto/objeto completo. Evitar acciones complejas que impliquen destreza anatómica (usar acciones pasivas simples como “observe” o “hold”). Mantener un fondo: nunca dejar fondos en blanco; establecer una descripción corta del lugar y repetirla EXACTAMENTE igual en todos los prompts que ocurran en esa misma escena. Si hay personajes secundarios, deben ser formas geométricas distintas para no clonarse con el protagonista y seguir la fórmula de rol + forma + color, sin usar “ovoid” ni “gray creature” para los extras. En escenas sin protagonista (B-Roll), no incluir personajes.`,
    promptEnd: `Style: Clean modern 2D vector illustration, explainer video style, flat design. Smooth, consistent linework with uniform thin thickness. Muted color palette with grayscale dominance. Minimal shading for simple volume on a mostly flat 2D form. Light beige canvas background. NO thick black borders, NO realistic 3D, NO chibi anime features.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
