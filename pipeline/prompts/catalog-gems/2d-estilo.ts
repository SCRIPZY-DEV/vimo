import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// 2D Storytime: gema de Imperio Pro (09-2d-estilo.md de estilos/, 8856
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const gem2dEstilo: CatalogGem = {
  id: '2d-estilo',
  name: { es: '2D Storytime', en: '2D Storytime', pt: '2D Storytime' },
  description: {
    es: 'Ilustración 2D cel-shaded tipo cómic, con fondos pintados a mano y sombras marcadas. Sin personaje fijo.',
    en: 'Comic-like cel-shaded 2D illustration with hand-painted backgrounds and strong shadows. No fixed character.',
    pt: 'Ilustração 2D cel-shaded tipo quadrinhos, com fundos pintados à mão e sombras marcadas. Sem personagem fixo.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.twoD,
    CATALOG_TAGS.storytime,
    CATALOG_TAGS.celShaded,
  ],
  sections: {
    visualStyle: `Animación 2D Digital Estilo Storytime. Todo debe parecer DIBUJADO A MANO DIGITALMENTE (Flat 2D). Estética de ilustración digital 2D de alta calidad tipo storytime: flat vector art aesthetics, cel-shaded, comic book style, sharp thick outlines (contornos gruesos y nítidos), hand-painted background (fondos pintados a mano) y dramatic 2D shadows (sombras 2D dramáticas). Prohibido sugerir 3D, CGI, plastilina o renders realistas; NO 3D y NO CGI.`,
    dynamism: `Este estilo NO tiene un personaje fijo: la historia también se cuenta con el entorno, los objetos y los detalles (sin narrador/presentador inventado). De cada CINCO prompts consecutivos, AL MENOS DOS deben ser planos SIN NINGUNA PERSONA visible. En esos prompts está PROHIBIDO mencionar personas, rostros, manos, siluetas, multitudes o partes del cuerpo; se muestran en su lugar: el objeto del fragmento, un detalle revelador, el lugar vacío, paisaje, cielo, calle, textura, documento, mapa, mecanismo o huella. En CADA uno de esos prompts sin personas, escribir la frase literal "No people are visible in the frame." justo después de describir la imagen.`,
    camera: `Cada prompt DEBE empezar por el nombre exacto del plano elegido de esta lista: "Extreme wide establishing shot", "Wide shot", "Full shot", "Medium shot", "Close-up", "Extreme close-up", "Over-the-shoulder shot", "Low angle shot", "High angle shot", "Top-down aerial shot", "Dutch angle shot". Rotación obligatoria: está PROHIBIDO repetir el mismo tipo de plano en dos prompts seguidos, y PROHIBIDO usar el mismo tipo de plano más de DOS veces dentro de cada grupo de cinco prompts. En cada grupo de cinco prompts debe haber COMO MÍNIMO un plano muy abierto (Extreme wide o Wide) y COMO MÍNIMO un plano muy cerrado (Close-up o Extreme close-up).`,
    rules: `ANTI-CLONES Y FÓRMULA ESTRICTA DE PERSONAJES: prohibido usar descripciones perezosas como "the agent", "the owl" o "the bird". Para CADA personaje que aparezca en la escena, usar OBLIGATORIAMENTE esta fórmula exacta: "a [ESPECIE/ROL] with [RASGOS FÍSICOS/PLUMAJE/CABELLO], wearing/having [ROPA O COLOR]". Si no se mencionan explícitamente rasgos físicos y colores para cada personaje, el sistema fallará. No incluir diálogos en el prompt; describir solo la acción.
BACKGROUND LOCK: prohibido dejar fondos en blanco, incluso en Close-Ups. Debe describirse un lugar corto (ej. "in a dimly lit vintage bedroom" o "in a stormy mountain peak") y repetirla REPETITIVAMENTE EXACTAMENTE IGUAL en todos los prompts que ocurran en esa misma escena.
TIPOGRAFÍA EXACTA: si el guion menciona letras o números en un objeto, ponerlos entre comillas (ej. the gold letters "USA") y repetir esas exactas comillas siempre. NUNCA usar comillas para diálogos hablados.
IDIOMA DE TEXTOS EN IMAGEN: aunque el prompt se redacta siempre en inglés, cualquier texto que aparezca dentro de la imagen debe ir en el IDIOMA DEL GUION.
PROHIBIDO: sugerir 3D, CGI, plastilina o renders realistas; todo debe mantenerse en estilo DIBUJADO A MANO DIGITALMENTE (Flat 2D).`,
    promptEnd: `High-quality 2D digital illustration, flat vector art aesthetics, cel-shaded, comic book style, sharp thick outlines, hand-painted background, dramatic 2D shadows, NO 3D, NO CGI. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 4,
}
