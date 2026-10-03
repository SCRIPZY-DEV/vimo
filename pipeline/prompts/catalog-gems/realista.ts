import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// Realista Documental: gema de Imperio Pro (16-realista.md de estilos/, 6757
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: no.
export const realista: CatalogGem = {
  id: 'realista',
  name: {
    es: 'Realista Documental',
    en: 'Documentary Realistic',
    pt: 'Realista Documental',
  },
  description: {
    es: 'Fotografía cruda documental sin personaje fijo: cada escena describe a su gente completa.',
    en: 'Raw documentary photography without a fixed character: each scene describes its own people in full.',
    pt: 'Fotografia crua documental sem personagem fixo: cada cena descreve suas pessoas por inteiro.',
  },
  tags: [
    CATALOG_TAGS.dynamism,
    CATALOG_TAGS.photographic,
    CATALOG_TAGS.realistic,
    CATALOG_TAGS.documentary,
  ],
  sections: {
    visualStyle: `Narrativa visual “Live-Action”, indistinguible de la realidad, con estética de fotografía documental cruda. Filtro anti-plástico (crítico): para forzar humanos reales y no muñecos, DEBE usarse siempre esta terminología fotográfica en inglés: “Raw photograph, shot on 35mm film, Kodak Portra 400, natural skin texture, visible skin pores, unretouched, candid photography, film grain, NO 3D, NO CGI, NO render”. Antes de generar, se deduce un “Sufijo Cinematográfico Fotográfico” (ejemplo: “Raw photograph, shot on Kodak Portra 400, 35mm lens, natural skin texture, visible pores, unretouched, gritty color grading, film grain, NO 3D, NO CGI”) y se concatena al final de CADA prompt que se genere (además del filtro base). Prohibido usar “rendering” tipo videojuego mediante palabras como “8k”, “highly detailed”, “ultra-realistic” o “perfect”.`,
    dynamism: `Para variar la cobertura en fragmentos consecutivos: Fragmento 1 = Wide Shot / Establishing Shot; Fragmento 2 = Close-Up con enfoque en Depth of Field; en fragmentos posteriores, variar ángulos manteniendo la lógica de cobertura cinematográfica. Para fragmentos conceptuales sin sujeto (ideas abstractas sin acción/lugar/persona concreta): usar un WIDE SHOT o un DETAIL SHOT de un objeto, lugar o entorno real y concreto que sugiera la idea sin necesitar a nadie (por ejemplo: habitación de servidores, calle real de noche con luces de negocios, teléfono sobre una mesa con la pantalla iluminada, manos sobre un teclado sin rostro, oficina vacía al atardecer, cables de red, cámara de seguridad, semáforo, fábrica automatizada).`,
    camera: `Secuencia base por fragmentos incompletos del guion: Wide Shot / Establishing Shot al inicio; Close-Up / Depth of Field focus en el siguiente fragmento; en fragmentos consecutivos, variar ángulos de cámara.`,
    rules: `Prohibido usar palabras en inglés como “8k”, “highly detailed”, “ultra-realistic” o “perfect”. Prohibido generar contenido 3D: siempre evitar/denegar “NO 3D, NO CGI, NO render” y sostener el estilo fotográfico crudo. No dejar fondos en blanco: cada escena debe tener una descripción fotográfica del lugar (concreto) y repetirse EXACTAMENTE igual en todos los prompts de esa escena (Background Lock). Tipografía exacta: si el guion menciona letras o números en un objeto, ponerlos entre comillas (ej: the gold letters “USA”) y repetirlas siempre. Identidad y personas: el estilo no tiene personaje fijo; cada persona que aparezca debe describirse COMPLETA dentro del propio prompt y, si la misma persona reaparece, repetir su descripción EXACTAMENTE igual en todos los fragmentos donde aparezca (identidad constante). Anti-clones: cada persona distinta debe tener rasgos y ropa CLARAMENTE diferentes a las demás. Acción: no incluir diálogos en el prompt; describir solo la acción. Límite de repetición: en todo el guion, la fórmula “persona parada junto a una pantalla/monitor” no puede usarse en más de 2 fragmentos SEGUIDOS; si se repite una tercera vez seguida, usar un plano general sin gente de este candado. Texto en imagen: si aparece texto en la imagen (carteles, papeles, pantallas), debe estar escrito en el idioma del guion detectado.`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'none',
  colorFilter: 'none',
  sampleCount: 0,
}
