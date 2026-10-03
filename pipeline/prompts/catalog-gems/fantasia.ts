import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Fantasía mágica: la gema de plantilla del estilo `fantasia` del carril
// viejo (`VISUAL_STYLES.fantasia`). El prólogo fijo es el inicio de cada
// prompt; el bloque STYLE supera los 600 caracteres, así que `promptEnd` es
// su versión condensada y el bloque entero vive en `visualStyle`. La escena
// sigue empezando con «SCENE:», como en el carril viejo, para que el prompt
// final tenga la misma forma con la que salieron las muestras. Lleva el
// preset de color `fantasy` (el `filterFinal` del estilo viejo).
export const fantasia: CatalogGem = {
  id: 'fantasia',
  name: { es: 'Fantasía mágica', en: 'Magic fantasy', pt: 'Fantasia mágica' },
  description: {
    es: 'Concept art épico de alta fantasía: magia visible, luz volumétrica y colores dorados y púrpura.',
    en: 'Epic high-fantasy concept art: visible magic, volumetric light and gold and purple colors.',
    pt: 'Concept art épica de alta fantasia: magia visível, luz volumétrica e cores douradas e roxas.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.fantasy,
    CATALOG_TAGS.cinematic,
    CATALOG_TAGS.atmospheric,
    CATALOG_TAGS.vividColor,
  ],
  sections: {
    visualStyle: `Epic high-fantasy concept art painting: the look of premium fantasy book cover art and cinematic fantasy movie concept art, a highly detailed digital painting with rich painterly brushwork, dramatic volumetric lighting (magical god rays, atmospheric light beams), rich saturated magical colors (deep golds and royal purples, mystical blues and emerald greens), glowing magical effects, luminous magical particles and an ethereal glow, intricate ornate detail, painterly atmospheric haze with floating dust motes and magical sparkles, epic grand-scale composition with dramatic majestic framing, painted texture and a mystical, enchanted, awe-inspiring mood. Every frame looks like a still from an epic fantasy film or a premium fantasy book cover.`,
    dynamism: `Treatments available in this style: action, metaphor, object, place, group, memory, diagram and bubble.
At least 1 of every 3 scenes is explanatory or allusive (metaphor, object, place, diagram, bubble or memory), interleaved with the action scenes. Never three identical treatments in a row and never three identical locations in a row.
The protagonist appears in about 50 % of the scenes. In the other scenes the enchanted landscape, a magical object, a glowing rune diagram or a vision inside a magical orb tell the story.`,
    camera: `Start the scene text with "SCENE: " literally, in uppercase, followed by an epic shot type: "Epic wide cinematic fantasy shot of...", "Sweeping landscape fantasy shot of...", "Dramatic low-angle fantasy shot of...", "Intimate close-up fantasy portrait of...", "Heroic medium fantasy shot of...". Vary the shot type between consecutive scenes.`,
    rules: `- Prefix "magical", "fantasy" or "mystical" on the key nouns ("magical fantasy sorceress", "enchanted fantasy forest", "ancient mystical castle").
- Use generic archetypes only (a hooded sorceress, an elven archer, a dwarven warrior): no copyrighted names.
- Visible magic is MANDATORY in every scene: glowing runes, streams of light, crackling energy, floating orbs, magical particles.
- Dramatic volumetric lighting is MANDATORY: god rays, golden hour rays through trees, moonlight through clouds, light emanating from a magical object.
- Mystical atmosphere is MANDATORY: floating dust particles, magical sparkles, thin mist, drifting embers.
- Keep the scene text between 400 and 800 characters: the fixed opening and closing blocks of the style are added by the platform.`,
    promptStart:
      'An epic high-fantasy concept art painting, magical fantasy illustration in the style of premium fantasy book cover art and cinematic fantasy movie concept art with rich painterly detail and mystical magical atmosphere.',
    promptEnd:
      'STYLE: Pure epic fantasy concept art painting style, premium fantasy book illustration aesthetic, cinematic fantasy movie concept art, highly detailed digital painting, rich painterly brushwork, dramatic volumetric lighting, magical god rays, rich saturated magical colors, deep golds and royal purples, mystical blues and emerald greens, glowing magical effects, luminous magical particles, ethereal glow, painterly atmospheric haze, magical sparkles, epic grand scale composition, mystical enchanted mood. Looks like a frame from an epic fantasy film or premium fantasy book cover.',
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'fantasy',
  sampleCount: 4,
}
