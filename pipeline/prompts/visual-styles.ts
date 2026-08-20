import type { CharacterStyleId } from '../types/characters.ts'

// Estilos visuales, acotados a lo que necesita el preview de personaje: el
// PROLOGUE y el STYLE de cada plantilla (copiados verbatim de estilos.ts del
// origen). Cuando llegue Create (paso 6) este dataset crece con el
// `systemPrompt` de generación de prompts por escena, el `filterFinal` de
// FFmpeg y los `modelosIncompatibles` de cada estilo.
export interface VisualStyleTemplate {
  prologue: string
  styleSuffix: string
  separator: 'newline' | 'space'
}

export interface VisualStyle {
  id: CharacterStyleId
  template?: VisualStyleTemplate
}

export const VISUAL_STYLES: Record<CharacterStyleId, VisualStyle> = {
  normal: {
    id: 'normal',
    template: {
      prologue: '',
      styleSuffix:
        'Cinematic, photorealistic, natural color palette, hyperdetailed, 35mm film grain, shallow depth of field, documentary realism.',
      separator: 'space',
    },
  },
  pov_stickman: {
    id: 'pov_stickman',
    template: {
      prologue:
        'A simple stickman doll character drawing with a round white head, a simple drawn face, arms and legs as single black lines, white Mickey Mouse-style gloves and white rounded shoes.',
      styleSuffix:
        'A simple stickman drawing: round white head with a face made of two black dot eyes and an expressive mouth, body wearing clothing that fits the scene, arms and legs drawn as single thin black lines, white Mickey Mouse-style gloves at the end of each arm, white rounded shoes at the end of each leg, clean lines, well-proportioned, friendly and expressive. The setting is colorful and clearly drawn, with soft shading on the background.',
      separator: 'space',
    },
  },
  cartoon: {
    id: 'cartoon',
    template: {
      prologue: '',
      styleSuffix:
        'Stylized 2D cartoon animation still in the style of a modern animated TV series, SIMPLIFIED EXAGGERATED character proportions with chunky cartoon facial features, FLAT cel-shaded coloring with hard sharp shadow edges, ABSOLUTELY NO smooth gradients on skin or clothing, NO realistic skin shading, NO volumetric muscle rendering, bold thick uniform black ink outlines around every shape and limb, FLAT solid color blocks, highly saturated vibrant palette, hand-drawn cartoon illustration look, comic-book speed lines on action, background crowd as flat silhouette shapes. NOT realistic, NOT semi-realistic, NOT photorealistic, NOT 3D, NOT CGI, NOT digital painting, NOT detailed portrait rendering. PURE FLAT 2D CARTOON DRAWING.',
      separator: 'space',
    },
  },
  fantasia: {
    id: 'fantasia',
    template: {
      prologue:
        'An epic high-fantasy concept art painting, magical fantasy illustration in the style of premium fantasy book cover art and cinematic fantasy movie concept art with rich painterly detail and mystical magical atmosphere.',
      styleSuffix:
        'STYLE: Pure epic fantasy concept art painting style, premium fantasy book illustration aesthetic, cinematic fantasy movie concept art, highly detailed digital painting, rich painterly brushwork, dramatic volumetric lighting, magical god rays, atmospheric light beams, rich saturated magical colors, deep golds and royal purples, mystical blues and emerald greens, glowing magical effects, luminous magical particles, ethereal glow, intricate ornate detail, painterly atmospheric haze, floating dust motes, magical sparkles, epic grand scale composition, dramatic majestic framing, painted texture, mystical enchanted mood, awe-inspiring fantasy atmosphere. Epic fantasy art, magical fantasy painting, high fantasy concept art, cinematic fantasy illustration, mystical fantasy artwork, enchanted painting, legendary fantasy scene. Looks like a frame from an epic fantasy film or premium fantasy book cover.',
      separator: 'space',
    },
  },
  terror: {
    id: 'terror',
    template: {
      prologue:
        'A dark atmospheric horror film still, frame from a psychological horror movie, shot in the style of cinematic gothic horror photography with heavy shadows and unsettling mood.',
      styleSuffix:
        'STYLE: Pure dark horror photography style, cinematic gothic horror film aesthetic, heavy chiaroscuro lighting, deep black shadows covering most of the frame, single dramatic directional light, desaturated muted dark color palette, dominant blacks and deep cold blues, subtle dark crimson accents, dense atmospheric fog, floating dust particles, heavy film grain texture, dark vignette around edges, claustrophobic horror composition, sinister dread atmosphere, eerie silent mood, vintage horror cinema look, dark gothic painting feel. Horror film still, horror movie frame, dark cinematic horror, atmospheric dread, psychological horror aesthetic, gothic dark mood, sinister shadowy scene. Looks like a frame from a dark arthouse psychological horror film.',
      separator: 'space',
    },
  },
}

export function isCharacterStyleId(value: unknown): value is CharacterStyleId {
  return typeof value === 'string' && value in VISUAL_STYLES
}

/**
 * Ensambla el prompt final a partir de un SCENE y la plantilla del estilo
 * (port de ensamblarPromptDesdeUsuario). Es el mismo ensamblado que usa el
 * pipeline para una escena editada a mano, así el preview refleja la realidad.
 */
export function assembleUserScenePrompt(
  style: VisualStyle,
  scene: string,
): string {
  const trimmed = scene.trim()
  if (!style.template) return trimmed

  // El prefijo SCENE: es necesario para que los modelos reconozcan el bloque.
  const labelled = /^scene\s*:/i.test(trimmed) ? trimmed : `SCENE: ${trimmed}`
  const separator = style.template.separator === 'newline' ? '\n\n' : ' '

  return [style.template.prologue, labelled, style.template.styleSuffix]
    .filter((block) => block.length > 0)
    .join(separator)
}
