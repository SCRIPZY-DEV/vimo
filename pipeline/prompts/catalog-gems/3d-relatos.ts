import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// 3D Relatos: gema de Imperio Pro (06-3d-relatos.md de estilos/, 5286
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const gem3dRelatos: CatalogGem = {
  id: '3d-relatos',
  name: { es: '3D Relatos', en: '3D Stories', pt: '3D Relatos' },
  description: {
    es: 'Personaje 3D estilizado con acabado CGI: luz cálida volumétrica, mucho detalle y textura.',
    en: 'A stylized 3D character with a CGI finish: warm volumetric light, rich detail and texture.',
    pt: 'Personagem 3D estilizado com acabamento CGI: luz quente volumétrica, muito detalhe e textura.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.threeD,
    CATALOG_TAGS.cgi,
    CATALOG_TAGS.warmLight,
  ],
  sections: {
    visualStyle: `stylized cinematic 3D character, high-end CGI, intricate details, warm volumetric lighting, elegant 3D art style, highly textured.`,
    dynamism: `En escenas, describe la emoción basándote en la anatomía del personaje. En fragmentos consecutivos, varía los ángulos de cámara (p. ej., Wide Shot en uno y Close-Up en otro) y PROHÍBE usar Extreme Wide Shot. Añade 1 o 2 palabras del fragmento actual en 1 de cada 5 prompts. Si el fragmento menciona un número/fecha, conviértelo a dígitos y ponlo obligatoriamente. Si aparece texto en la imagen, debe estar en el idioma del guion. NUNCA uses comillas para diálogos hablados; todo texto va sobre pizarras o papeles blancos.`,
    camera: `En los prompts de escena: usar tomas como Medium shot y Close-up según el fragmento; se permite Wide Shot. Varía los ángulos entre fragmentos consecutivos y PROHÍBE usar Extreme Wide Shot.`,
    rules: `RECONSTRUCCIÓN/IDIOMA: reconstruye la escena del guion guardado y evita pronombres ambiguos (como él o eso); describe objetos completos cada vez. SUJETO: nombra al protagonista con la etiqueta [subject]. Si el fragmento habla de un objeto o un extra, adapta el encuadre para incluir [subject]. EXCEPCIÓN: si el fragmento es SOLO de extras, NO incluyas [subject]. EXTRAS/ANTI-CLONES: si hay personajes secundarios, usa obligatoriamente la fórmula exacta: another character of the SAME kind and art style as [subject], with [RASGO/COLOR OPUESTO AL PROTA], [ROPA O DETALLE DISTINTO AL PROTA, si aplica]. REGLA DE ESPECIE: los extras son SIEMPRE del MISMO TIPO que [subject] (p. ej., si [subject] es una papa antropomorfa, los extras son papas antropomorfas de otros colores; JAMÁS aparece un humano realista si el protagonista no es humano). FONDO BLOQUEADO: PROHIBIDO dejar fondos en blanco; establece una descripción corta del lugar y manténla EXACTAMENTE IGUAL palabra por palabra durante la misma escena. TEXTOS: añade 1 o 2 palabras del fragmento actual en 1 de cada 5 prompts; los números/fechas van en dígitos y se deben poner obligatoriamente. No uses comillas para diálogos hablados. Todo texto va sobre pizarras o papeles blancos. Si aparece texto en la imagen, debe estar en el idioma del guion.`,
    promptEnd: `Style: stylized cinematic 3D character, high-end CGI, intricate details, warm volumetric lighting, elegant 3D art style, highly textured.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 0,
}
