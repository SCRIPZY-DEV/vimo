import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// 2D Asiático: gema de Imperio Pro (17-2d-asiatico.md de estilos/, 3730
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const gem2dAsiatico: CatalogGem = {
  id: '2d-asiatico',
  name: { es: '2D Asiático', en: '2D Asian Ink', pt: '2D Asiático' },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.twoD,
    CATALOG_TAGS.ink,
    CATALOG_TAGS.watercolor,
  ],
  sections: {
    visualStyle: `Antique ink and watercolor illustration. The central subject is isolated and features fine, delicate outlines with natural proportions, keeping the center perfectly clean. The background consists of organic, faint grey ink washes forming subtle misty mountains or soft bamboo silhouettes strictly confined to the outer edges, blending into light cream aged paper. Strict muted earthy color palette limited to brown, beige, pale skin tones, grey, and sepia ONLY. Pure artwork, completely unmarked. Serene, elegant, minimalist aesthetic. --no red ink, red color, red stamps, seals, chops, calligraphy, characters, letters, text, signatures, watermarks, floating body parts, abstract symmetric blobs, anime, 3d`,
    dynamism: `Priorizar CONEXIÓN ABSOLUTA entre audio e imagen. Mantener CONTINUIDAD NARRATIVA impecable: si varios fragmentos seguidos hablan del mismo tema, los prompts deben mostrar el MISMO ENTORNO y cambiar SOLO el plano; si un fragmento es un conector gramatical cortado, MANTENER la escena del fragmento anterior (cero epilepsia visual). Usar B-Roll metafórico (bambú, rocas, agua) SOLO cuando el guion hable puramente de conceptos abstractos (lo blando, lo duro); si el fragmento habla de cosas físicas (dientes, lengua), ilustrar esas partes físicas explícitamente. Si el guion describe partes del cuerpo en varios fragmentos, asignarlas SIEMPRE al Personaje Principal y NO cambiar la edad ni el aspecto del sujeto (identidad constante).`,
    camera: `En cada prompt, INICIAR SIEMPRE con el plano cinematográfico.`,
    rules: `Mantener anatomía sana y estática: prohibido romper caras y evitar body horror. Prohibido usar la palabra “bone”; usar descripciones seguras como “pale teeth”. Si el guion dice “los dientes se caen”, representarlo como dientes naturalmente faltantes (p. ej., “an extreme close-up of the elderly sage's mouth, naturally missing some pale teeth, showing a healthy tongue”), sin piedras cayendo ni caras rotas. Cero epilepsia visual: no cambiar la escena cuando el fragmento es un conector cortado. Cualquier texto que aparezca dentro de la imagen (carteles/papeles/pantallas) debe estar en el IDIOMA del guion detectado por el sistema.`,
    promptEnd: `Antique ink and watercolor illustration, fine delicate outlines, natural proportions, peripheral vignette. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 4,
}
