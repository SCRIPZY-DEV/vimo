import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// 2D Cavernícola: gema de Imperio Pro (10-2d-cavernicola.md de estilos/, 5189
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const gem2dCavernicola: CatalogGem = {
  id: '2d-cavernicola',
  name: { es: '2D Cavernícola', en: '2D Caveman', pt: '2D Caverna' },
  tags: [CATALOG_TAGS.twoD, CATALOG_TAGS.educational, CATALOG_TAGS.cleanLine],
  sections: {
    visualStyle: `Style: 2D flat animation style. Clean black outlines, flat simple colors, minimalist educational cartoon style.`,
    camera: `Varía los encuadres y tipos de toma en fragmentos consecutivos. Usa tomas tipo Medium shot y Wide shot para mostrar claramente los elementos; PROHIBIDO usar “Close-up” (primeros planos) y PROHIBIDO usar “Extreme Wide Shot”.`,
    rules: `Prohibido dejar fondos en blanco: siempre establece una descripción corta del lugar y MANTÉNLA EXACTAMENTE IGUAL palabra por palabra durante la misma escena. Muestra SIEMPRE el personaje completo (prohibido recortar partes del cuerpo como solo piernas o manos). Si el fragmento requiere personajes en contexto moderno o pasado, aplica las descripciones: Moderno: simple stick figure man with a large round head, white skin, a solid white torso wearing a black tie, thin black stick arms and stick legs. Pasado: simple stick figure caveman with a large round head, white skin, messy brown hair, a solid white torso wearing a brown fur tunic, thin black stick arms and stick legs. Números/fechas mencionados en el fragmento deben convertirse a dígitos (ej. “10”) y ponerse obligatoriamente. Añadir 1 o 2 palabras del fragmento actual en 1 de cada 5 prompts. Nunca uses comillas para diálogos hablados. Todo texto debe estar en el entorno como infografías o sobre fondos sólidos.`,
    promptEnd: `Style: 2D flat animation style. Clean black outlines, flat simple colors, minimalist educational cartoon style. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 4,
}
