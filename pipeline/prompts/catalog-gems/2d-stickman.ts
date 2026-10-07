import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// 2D Stickman: gema de Imperio Pro (03-2d-stickman.md de estilos/, 5774
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const gem2dStickman: CatalogGem = {
  id: '2d-stickman',
  name: { es: '2D Stickman', en: '2D Stickman', pt: '2D Stickman' },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.fixedCharacter,
    CATALOG_TAGS.twoD,
    CATALOG_TAGS.storytime,
    CATALOG_TAGS.celShaded,
  ],
  sections: {
    visualStyle: `Animación 2D Digital Estilo Storytime. Todo debe parecer DIBUJADO A MANO DIGITALMENTE (Flat 2D) y NUNCA sugerir 3D, CGI, plastilina o renders realistas. Estilo final de cada prompt: High-quality 2D digital illustration, flat vector art aesthetics, cel-shaded, comic book style, sharp thick outlines, hand-painted background, dramatic 2D shadows, NO 3D, NO CGI. También: 2D digital art con estética de vectores planos, cel-shaded, contornos gruesos, sombras 2D dramáticas; fondo pintado a mano.`,
    character: `A classic stickman, with a flat white circle head, expressive 2D face features (two dot eyes, simple eyebrows and a clear mouth) and simple black line limbs on a slim flat body. Outfit: a plain blue t-shirt and dark trousers, in flat colors.`,
    dynamism: `En fragmentos consecutivos, varía ángulos: Fragmento 1 usa Wide Shot/Medium Shot; Fragmento 2 usa Close-Up/Extreme Close-Up. Si el fragmento habla de un objeto o un extra, adapta el encuadre para incluir a [subject] en esa escena.`,
    camera: `Wide Shot / Medium Shot para el fragmento 1; Close-Up / Extreme Close-Up para el fragmento 2. Puede usarse un encuadre over-the-shoulder desde la perspectiva de [subject] mirando a un personaje secundario, con el secundario cerca de la puerta cuando aplique al fragmento.`,
    rules: `CRÍTICO: Bajo ninguna circunstancia generes descripciones que sugieran 3D, CGI, plastilina o renders realistas; todo debe ser Flat 2D dibujado a mano. El protagonista debe aparecer en todos los prompts con la etiqueta EXCLUSIVA [subject] y NUNCA debe describirse físicamente. Si el fragmento incluye personajes secundarios, en CADA prompt deben aparecer con esta fórmula exacta: "[ROL] stickman with a white round head, with [CABELLO O SOMBRERO DISTINTO AL PROTA], wearing[ROPA DE COLOR DISTINTO AL PROTA]"; debes mencionar explícitamente pelo/sombrero distinto y ropa con color distinto al del prota, y NUNCA usar descripciones perezosas. Fondo: prohibido dejar fondos en blanco; incluye una descripción corta del lugar y REPÍTELA EXACTAMENTE IGUAL en todos los prompts de esa misma escena. Tipografía: si el guion menciona letras o números en un objeto, ponlos entre comillas (p. ej., the gold letters "USA") y repite esas mismas comillas exactas; NUNCA uses comillas para diálogos hablados. Dinámica del contexto: rastrea la escena en el guion; evita pronombres ambiguos (como "él") y describe los objetos completos cada vez. No incluyas diálogos del guion dentro del prompt. Idioma en texto de imagen: al detectar el idioma del guion, cualquier texto que aparezca DENTRO de la imagen debe ir en el IDIOMA DEL GUION.`,
    promptEnd: `High-quality 2D digital illustration, flat vector art aesthetics, cel-shaded, comic book style, sharp thick outlines, hand-painted background, dramatic 2D shadows, NO 3D, NO CGI. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
