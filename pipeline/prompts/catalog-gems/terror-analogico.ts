import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Terror Analógico: gema de Imperio Pro (32-terror-analogico.md de estilos/, 4846
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const terrorAnalogico: CatalogGem = {
  id: 'terror-analogico',
  name: { es: 'Terror Analógico', en: 'Analog Horror', pt: 'Terror Analógico' },
  description: {
    es: 'Estética VHS degradada: líneas de escaneo, aberración cromática y tinte verdoso de cámara de seguridad.',
    en: 'Degraded VHS aesthetic: scan lines, chromatic aberration and a greenish security camera tint.',
    pt: 'Estética VHS degradada: linhas de varredura, aberração cromática e tom esverdeado de câmera de segurança.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.horror,
    CATALOG_TAGS.vhs,
    CATALOG_TAGS.analog,
  ],
  sections: {
    visualStyle: `analog horror VHS aesthetic, degraded 1990s videotape look, heavy scan lines and tracking distortion, chromatic aberration, washed out colors with a green sickly cast, timestamp overlay in the corner, low fidelity security camera feel.`,
    dynamism: `For consecutive fragments, apply the RECURSO VISUAL ROTATIVO: alternate between plano de lugar, detalle de objeto, escena con figuras, elemento simbólico y plano atmosférico (no two consecutive prompts may share the same composition).`,
    camera: `Vary the encuadre between consecutive fragments, alternating obligatoriamente between Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Overhead shot and Insert shot of an object. PROHIBIDO repetir el mismo encuadre dos veces seguidas.`,
    rules: `SIN PROTAGONISTA FIJO: no hay personaje recurrente; si aparece alguien, descríbelo entero en ese prompt y no asumas que se repite en el siguiente. FONDO BLOQUEADO: PROHIBIDO dejar el fondo sin describir; fija una descripción corta del lugar y REPÍTELA EXACTAMENTE IGUAL, palabra por palabra, en todos los prompts de esa misma escena (lugares cotidianos y vacíos: pasillos, aparcamientos, salones con la tele encendida, escaleras de servicio). TEXTOS Y NÚMEROS: si el fragmento menciona un número o una fecha, conviértelo a DÍGITOS y ponlo; añade 1 o 2 palabras del fragmento en 1 de cada 5 prompts, escritas TAL CUAL en el idioma del guion; NUNCA uses comillas para diálogos hablados. EL MIEDO ESTÁ EN LO NORMAL: la escena debe ser un lugar corriente con UN detalle fuera de sitio; PROHIBIDO monstruos, sangre, violencia o cuerpos.`,
    promptEnd: `Style: analog horror VHS aesthetic, degraded 1990s videotape look, heavy scan lines and tracking distortion, chromatic aberration, washed out colors with a green sickly cast, timestamp overlay in the corner, low fidelity security camera feel.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 4,
}
