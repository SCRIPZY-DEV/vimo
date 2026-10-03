import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Blueprint Técnico: gema de Imperio Pro (30-blueprint-tecnico.md de estilos/, 4753
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const blueprintTecnico: CatalogGem = {
  id: 'blueprint-tecnico',
  name: {
    es: 'Blueprint Técnico',
    en: 'Technical Blueprint',
    pt: 'Blueprint Técnico',
  },
  description: {
    es: 'Plano técnico cian sobre azul prusia: proyección ortográfica, cotas con flechas y rejilla.',
    en: 'Cyan technical blueprint on Prussian blue: orthographic projection, arrowed dimensions and a grid.',
    pt: 'Planta técnica ciano sobre azul da Prússia: projeção ortográfica, cotas com setas e grade.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.blueprint,
    CATALOG_TAGS.technical,
    CATALOG_TAGS.engineering,
  ],
  sections: {
    visualStyle: `technical blueprint drawing aesthetic con trabajo de líneas en cian y blanco sobre papel azul prusiano profundo, proyección ortográfica precisa, líneas de cota con flechas, fondo con rejilla, marcas de anotación de ingeniería y estética de dibujo técnico.`,
    dynamism: `Varía el encuadre entre fragmentos consecutivos alternando obligatoriamente los tipos de plano indicados en 'camera' (sin repetir el mismo encuadre dos veces seguidas). Además, alterna entre composiciones: plano de lugar, detalle de objeto, escena con figuras, elemento simbólico y plano atmosférico (PROHIBIDO que dos prompts consecutivos compartan la misma composición).`,
    camera: `Alternar obligatoriamente entre Wide shot, Medium shot, Close-up, Extreme close-up, Low angle shot, Overhead shot y Insert shot de un objeto entre fragmentos consecutivos; PROHIBIDO repetir el mismo encuadre dos veces seguidas.`,
    rules: `Sin protagonista recurrente: este estilo NO tiene personaje recurrente; si aparece alguien, descríbelo entero en ese prompt y no des por hecho que se repite en el siguiente. El fondo no puede quedar sin describir y es siempre papel azul de plano técnico con rejilla milimetrada, repitiendo una descripción corta del lugar exactamente igual palabra por palabra en todos los prompts de esa misma escena. Si el fragmento menciona una cifra o una fecha, conviértela a DÍGITOS. En 1 de cada 5 prompts, añade 1 o 2 palabras del fragmento escritas TAL CUAL en el idioma del guion (NUNCA uses comillas para diálogos hablados). Cada prompt debe incluir al menos un recurso de dibujo técnico (p. ej., líneas de cota con flechas, vista despiezada, sección transversal, línea de guía punteada).`,
    promptEnd: `Style: technical blueprint drawing, cyan and white line work on deep prussian blue paper, precise orthographic projection, dimension lines with arrows, grid background, engineering annotation marks, drafting aesthetic.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 0,
}
