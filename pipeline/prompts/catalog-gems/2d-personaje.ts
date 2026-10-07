import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// 2D Personaje Pro: gema de Imperio Pro (13-2d-personaje.md de estilos/, 6790
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const gem2dPersonaje: CatalogGem = {
  id: '2d-personaje',
  name: {
    es: '2D Personaje Pro',
    en: '2D Character Pro',
    pt: '2D Personagem Pro',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.twoD,
    CATALOG_TAGS.storytime,
    CATALOG_TAGS.fullBody,
  ],
  sections: {
    visualStyle: `Animación 2D Digital Estilo Storytime. High-quality 2D digital illustration, flat vector art aesthetics, cel-shaded, comic book style, sharp thick outlines, hand-painted background, dramatic 2D shadows. Todo debe parecer DIBUJADO A MANO DIGITALMENTE (Flat 2D) y estar estrictamente prohibido que parezca 3D, CGI o renders realistas (NO 3D, NO CGI).`,
    dynamism: `El protagonista debe aparecer en TODOS los prompts. El protagonista debe etiquetarse exclusivamente como [subject] y NUNCA describirlo físicamente. Si el fragmento trata de un objeto o un extra, adaptar el encuadre para incluir a [subject]. Fondo: PROHIBIDO dejar fondos en blanco; incluso en close-ups, establecer una descripción corta del lugar y REPETIRLA EXACTAMENTE IGUAL en todos los prompts que ocurran en esa misma escena. Dinamismo/cámara: prohibido repetir el mismo ángulo/plano de cámara de forma seguida; forzar rotación drástica del encuadre en cada fragmento consecutivo (ejemplo: Wide Shot -> Medium Shot -> Close-Up -> Over-the-shoulder -> Full Shot). NUNCA usar pronombres ambiguos (como “él” o “ella”) y describir objetos/sujetos completos cada vez. No incluir diálogos en el prompt; describir la acción.`,
    camera: `Variedad obligatoria de planos entre fragmentos consecutivos: rotar drásticamente el encuadre (ejemplos de progresión como Wide Shot, Medium Shot, Close-Up, Over-the-shoulder, Full Shot). Cuando aplique, usar perspectiva de over-the-shoulder desde la mirada de [subject].`,
    rules: `Prohibido sugerir 3D, CGI o renders realistas; todo debe ser Flat 2D dibujado a mano. El estilo debe aplicar cel-shaded comic book, sharp thick outlines, hand-painted background y dramatic 2D shadows. Prohibido dejar fondos en blanco: el fondo debe describirse y bloquearse por escena, repitiéndose EXACTAMENTE igual en todos los prompts de esa escena. Prohibido repetir el mismo ángulo/plano consecutivamente. Prohibido usar descripciones perezosas para secundarios (no usar “the agent”, “the owl”, “the bird”): para CADA personaje secundario, usar OBLIGATORIAMENTE la fórmula exacta: "a[ESPECIE/ROL] with[RASGOS FÍSICOS/PLUMAJE/CABELLO DISTINTO AL PROTA], wearing/having [ROPA O COLOR DISTINTO AL PROTA]". La descripción del secundario debe incluir rasgos físicos/plumaje/cabello y ropa/color distintos al prota. Si el guion menciona letras o números en un objeto, ponerlos entre comillas (ej. the gold letters "USA") y repetir exactamente esas comillas siempre; NUNCA usar comillas para diálogos hablados. No usar diálogos en el prompt. Si aparece texto dentro de la imagen, debe estar en el IDIOMA DEL GUION.`,
    promptEnd: `High-quality 2D digital illustration, flat vector art aesthetics, cel-shaded, comic book style, sharp thick outlines, hand-painted background, dramatic 2D shadows, NO 3D, NO CGI. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
