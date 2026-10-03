import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Realista: la gema de plantilla del estilo `normal` del carril viejo
// (`VISUAL_STYLES.normal`). El texto del redactor pasó por el agente y se
// ajustó a mano (plan E2, P11): las reglas de armado del prompt y el manejo
// del bloque de personaje del carril viejo quedaron afuera (el marco de Vimo
// teje al protagonista por código); el dinamismo traduce el contrato del
// director (spec §8), sin `diagram` ni `bubble` porque el estilo es
// fotográfico. El cierre literal de cada prompt pasa a `promptEnd`.
export const normal: CatalogGem = {
  id: 'normal',
  name: { es: 'Realista', en: 'Realistic', pt: 'Realista' },
  description: {
    es: 'Fotografía cinematográfica y realista de lo que cuenta el guion, con luz natural y grano de 35 mm.',
    en: 'Cinematic, realistic photography of what the script tells, with natural light and 35 mm grain.',
    pt: 'Fotografia cinematográfica e realista do que o roteiro conta, com luz natural e grão de 35 mm.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.realistic,
    CATALOG_TAGS.photographic,
    CATALOG_TAGS.cinematic,
    CATALOG_TAGS.documentary,
  ],
  sections: {
    visualStyle: `Natural cinematic realism: the frame of a documentary or film photographer that LITERALLY depicts what the narration describes. If it talks about animals, show animals; if it talks about a city, show that city; if it talks about a historical event, show a realistic depiction of that event. No imposed artistic style: clear, faithful, photorealistic imagery with a natural color palette, hyperdetailed textures, 35mm film grain, shallow depth of field and the look of documentary realism.
Each scene is one flowing paragraph, in this order: the shot and the main subject in action or state; the setting (a specific place, time of day and weather); the lighting (its natural source and its quality); one concrete cinematographic detail of camera or composition.`,
    dynamism: `Treatments available in this style: action, metaphor, object, place, group and memory. Never diagram and never bubble: this is photographic realism.
At least 1 of every 3 scenes is explanatory or allusive (metaphor, object, place or memory), interleaved with the action scenes. Never three identical treatments in a row and never three identical locations in a row.
The protagonist appears in about 50 % of the scenes. In the other scenes the environment, the objects, the aftermath of the action or anonymous people tell the story.`,
    camera: `Open every scene with a natural shot type: "Wide cinematic shot of...", "Medium shot of...", "Close-up of...", "Establishing shot of...", "Low-angle shot of...". Vary the shot type between consecutive scenes, and add one concrete detail of camera or composition per scene (a lens, a depth-of-field choice, a framing, a slight motion blur).`,
    rules: `- The main subject MUST match what the narration describes. Translate the IMAGE, not the language: if the narration mentions "un león en la sabana", the prompt is about a lion in the savannah, never a metaphorical or stylized version of it.
- Use generic descriptors: no real people by name, no copyrighted characters.
- Lighting always names its SOURCE and its QUALITY ("warm afternoon sunlight filtering through leaves", "overcast diffused daylight", "soft window light from the left", "blue hour twilight"). Never write just "good lighting" or "dark".
- Other people appear only when the narration describes them, written as anonymous people.
- Keep the scene text between 300 and 800 characters: the closing look anchor of the style is added by the platform.`,
    promptEnd:
      'Cinematic, photorealistic, natural color palette, hyperdetailed, 35mm film grain, shallow depth of field, documentary realism.',
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
