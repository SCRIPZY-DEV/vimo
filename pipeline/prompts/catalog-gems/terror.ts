import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Terror: la gema de plantilla del estilo `terror` del carril viejo
// (`VISUAL_STYLES.terror`). Su seguridad de contenido propia (más específica
// que la regla de la plataforma) sigue en `rules`; el prólogo fijo es el
// inicio de cada prompt y el bloque STYLE, condensado a 600 caracteres, el
// final. Lleva el preset de color `horror-bw` (el `filterFinal` del estilo
// viejo).
export const terror: CatalogGem = {
  id: 'terror',
  name: { es: 'Terror', en: 'Horror', pt: 'Terror' },
  description: {
    es: 'Fotograma de terror psicológico en blanco y negro: una sola luz, niebla densa y sombras profundas.',
    en: 'A psychological horror film still in black and white: one light source, dense fog and deep shadows.',
    pt: 'Fotograma de terror psicológico em preto e branco: uma única luz, névoa densa e sombras profundas.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.horror,
    CATALOG_TAGS.dark,
    CATALOG_TAGS.atmospheric,
    CATALOG_TAGS.cinematic,
  ],
  sections: {
    visualStyle: `Dark atmospheric horror film still: a frame from a psychological horror movie, shot like cinematic gothic horror photography with heavy chiaroscuro lighting, deep black shadows covering most of the frame, one dramatic directional light, a desaturated muted dark palette of dominant blacks and deep cold blues with subtle dark crimson accents, dense atmospheric fog, floating dust particles, heavy film grain, a dark vignette around the edges and a claustrophobic composition. Sinister dread, eerie silence, a vintage horror cinema look with the feel of a dark gothic painting. Figures are gaunt, pale, hollow-eyed, expressionless or motionless: cloaked, silhouetted, shadowy. Places are abandoned, decaying, crumbling, overgrown, forgotten, dimly lit or pitch black, shadow-drenched. Horror is built with light, composition and atmosphere, never with graphic violence.`,
    dynamism: `Treatments available in this style: action, metaphor, object, place, group, memory, diagram and bubble.
At least 1 of every 3 scenes is explanatory or allusive (metaphor, object, place, diagram, bubble or memory), interleaved with the action scenes. Never three identical treatments in a row and never three identical locations in a row.
The protagonist appears in about 50 % of the scenes. In the other scenes the abandoned place, an eerie object, a faded photograph or a memory seen through fog tell the story.`,
    camera: `Start the scene text with "SCENE: " literally, in uppercase, followed by an unsettling shot type: "Wide low-angle horror shot of...", "Close-up unsettling shot of...", "Wide cinematic horror shot of...", "Medium horror shot of...", "Over-the-shoulder dread shot of...". Vary the shot type between consecutive scenes.`,
    rules: `- Prefix "dark", "shadowy", "eerie", "creepy", "horror" or "haunted" on the key nouns ("a dark abandoned horror house", "a long shadowy horror hallway", "a dark eerie horror forest").
- Subject adjectives: gaunt, pale, hollow-eyed, expressionless, motionless, cloaked figure, silhouetted figure, shadowy figure. Setting vocabulary of decay: abandoned, decaying, crumbling, overgrown, forgotten, rotting, dimly lit, pitch black, shadow-drenched.
- ONE SINGLE light source is MANDATORY in every scene: a single flickering bulb hanging from the ceiling, pale moonlight through a broken window, a distant flashlight beam cutting through darkness, a candle flame casting long shadows, cold blue light from an open doorway.
- One atmospheric element is MANDATORY: dense fog rolling along the floor, floating dust particles in the light beam, thin mist obscuring the background, darkness swallowing the edges.
- Content safety, always: never explicit gore, blood splatter, mutilation, viscera, detailed corpses, decomposition, children in peril, active violence (knives stabbing, attacks in progress), suicide, self-harm or hanging. Use instead hooded figures, dark silhouettes, abandoned places, decay, fog, a dim solitary light, eerie objects (old dolls, mirrors, ajar doors), expressions of fear or emptiness with no injury visible, stylized non-human creatures, occult symbols without glorification.
- Keep the scene text between 350 and 700 characters: the fixed opening and closing blocks of the style are added by the platform.`,
    promptStart:
      'A dark atmospheric horror film still, frame from a psychological horror movie, shot in the style of cinematic gothic horror photography with heavy shadows and unsettling mood.',
    promptEnd:
      'STYLE: Pure dark horror photography style, cinematic gothic horror film aesthetic, heavy chiaroscuro lighting, deep black shadows covering most of the frame, single dramatic directional light, desaturated muted dark color palette, dominant blacks and deep cold blues, subtle dark crimson accents, dense atmospheric fog, floating dust particles, heavy film grain, dark vignette around edges, claustrophobic horror composition, sinister dread atmosphere, eerie silent mood, vintage horror cinema look, dark gothic painting feel. Looks like a frame from a dark arthouse psychological horror film.',
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'horror-bw',
  sampleCount: 4,
}
