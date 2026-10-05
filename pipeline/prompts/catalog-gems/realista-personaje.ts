import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Realista Personaje: gema de Imperio Pro (15-realista-personaje.md de estilos/, 5765
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const realistaPersonaje: CatalogGem = {
  id: 'realista-personaje',
  name: {
    es: 'Realista Personaje',
    en: 'Realistic Character',
    pt: 'Realista Personagem',
  },
  tags: [
    CATALOG_TAGS.photographic,
    CATALOG_TAGS.realistic,
    CATALOG_TAGS.documentary,
  ],
  sections: {
    visualStyle: `Narrativa visual “Live-Action”, indistinguible de la realidad. Enfoque anti-plástico (filtro anti-plástico): usar SIEMPRE terminología fotográfica en inglés para forzar humanos reales y evitar muñecos de plástico: “Raw photograph, shot on 35mm film, Kodak Portra 400, natural skin texture, visible skin pores, unretouched, candid photography, film grain, NO 3D, NO CGI, NO render”. Estética fotográfica cruda/film: piel con textura y poros visibles, sin retoque, grano de película, fotografía espontánea/candid.`,
    camera: `Para fragmentos consecutivos, variar encuadres: Fragmento 1: Wide Shot / Establishing Shot. Fragmento 2: Close-Up con énfasis en Depth of Field (profundidad de campo) y enfoque. (Además, cuando aplique reconstrucción de fragmentos) usar Over-the-shoulder shot con shallow depth of field, desde la perspectiva de [subject].`,
    rules: `Prohibido usar palabras en inglés como “8k”, “highly detailed”, “ultra-realistic” o “perfect”. Cada prompt debe terminar concatenando el Sufijo Cinematográfico Fotográfico EXACTO deducido del tono del guion (concatenado al final de CADA prompt). El protagonista debe aparecer en TODOS los prompts usando exclusivamente la etiqueta [subject] (sin describirlo físicamente). Para cada secundario, usar la fórmula exacta: “a[ESPECIE/EDAD/ROL] with[RASGOS FÍSICOS IMPERFECTOS/VELLO FACIAL/CABELLO DISTINTO AL PROTA], wearing/having [ROPA DE COLOR DISTINTO AL PROTA]”. Prohibido dejar fondos en blanco: definir un lugar fotográfico y repetirlo EXACTAMENTE igual en todos los prompts de esa escena (Background Lock). Si el guion menciona letras o números en un objeto, deben ir entre comillas y repetirse siempre. No incluir diálogos en los prompts (describir acción, sin texto hablado). También: “IDIOMA DE TEXTOS EN IMAGEN” — cualquier texto visible dentro de la imagen debe ir en el idioma del guion, y cada prompt termina con la frase "If any text appears in the image, it must be written in [IDIOMA DEL GUION]." con el idioma del guion en el lugar del marcador.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
