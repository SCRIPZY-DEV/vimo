import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// POV Stickman: la gema de plantilla del estilo `pov_stickman` del carril
// viejo (`VISUAL_STYLES.pov_stickman`). El muñeco vive en `character` (spec
// §8): en el modo genérico se teje por código en cada escena, así que el
// texto de la escena ya no repite sus seis elementos obligatorios. Las reglas
// del muñeco (los demás muñecos iguales, la ropa según la historia) van en
// `rules`. `character` abre con el rol antes de la primera coma («A stickman
// doll, …»): de ahí saca el tejedor «the stickman doll», y su `Outfit:` es una
// ropa base concreta (la de cada escena la pone la regla de vestuario del
// marco, no este texto, que se pega tal cual en cada prompt).
// El inicio y el final fijos son solo de ESTILO y condicionales («any person
// is a stickman doll»): se pegan en todas las escenas, también en las que el
// dinamismo deja sin protagonista y en el modo cinemático, y el prólogo y el
// bloque STYLE del carril viejo describían al muñeco en cada imagen (el carril
// viejo reescribía esas escenas con un molde «NO stickman doll»).
export const povStickman: CatalogGem = {
  id: 'pov_stickman',
  name: { es: 'POV Stickman', en: 'POV Stickman', pt: 'POV Stickman' },
  description: {
    es: 'Muñeco de palitos de cabeza blanca y guantes, vestido según cada escena, en mundos simples y coloridos.',
    en: 'A white-headed stick figure with gloves, dressed for each scene, in simple colorful worlds.',
    pt: 'Boneco de palitos de cabeça branca e luvas, vestido para cada cena, em mundos simples e coloridos.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.fixedCharacter,
    CATALOG_TAGS.twoD,
    CATALOG_TAGS.storytime,
    CATALOG_TAGS.cleanLine,
  ],
  sections: {
    visualStyle: `Simple, natural stickman illustration for short narrated stories. Every person in the picture is a stickman doll: a round white head with a simple face, arms and legs drawn as single thin black lines, white Mickey Mouse-style gloves and white rounded shoes, clean lines, well proportioned, friendly and expressive. The world around them is drawn plainly and colorfully (a hotel, a beach, a school, a park, a kitchen, a forest, a battlefield), clearly readable, with soft shading on the background.`,
    character: `A stickman doll, with a round white head and a simple face of two small black dot eyes and an expressive mouth. Arms are single thin black lines connected at the shoulders; legs are single thin black lines connected at the hips. Outfit: a plain blue short-sleeved shirt, dark gray trousers, white Mickey Mouse-style gloves at the end of each arm and white rounded shoes at the end of each leg.`,
    dynamism: `Treatments available in this style: action, metaphor, object, place, group, memory, diagram and bubble.
At least 1 of every 3 scenes is explanatory or allusive (metaphor, object, place, diagram, bubble or memory), interleaved with the action scenes. Never three identical treatments in a row and never three identical locations in a row.
The protagonist stickman appears in about 50 % of the scenes. In the other scenes the setting, the objects, a simple diagram or other stickman dolls tell the story.`,
    camera: `Mostly medium and wide shots that show the whole stickman doll and the place he is in; a close-up only when a key object or an expression carries the moment. Vary the framing between consecutive scenes.`,
    rules: `- Other characters in a scene are other stickman dolls with the same look (round white heads, line limbs, white gloves and white shoes) but with their own clothing that fits THEIR role in the scene.
- Clothing always matches what the story describes for that moment (a chef's apron in a kitchen, a winter coat in the snow, a wedding dress at a wedding, a doctor's coat at a hospital); never default to a t-shirt and shorts unless the scene is casual, summery or sporty.
- Describe the action and the setting in plain natural language: where the stickman is, what he is doing, who or what is around him.
- Keep the scene text between 300 and 600 characters: the fixed opening and closing phrases of the style are added by the platform.`,
    promptStart: 'A simple, friendly stickman-style drawing with clean lines.',
    promptEnd:
      'Simple stickman drawing style: any person is a stickman doll with a round white head, a face of two black dot eyes and an expressive mouth, single thin black line limbs, white Mickey Mouse-style gloves and white rounded shoes, wearing clothing that fits the scene; clean lines, friendly and expressive. The setting is colorful and clearly drawn, with soft shading on the background.',
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
