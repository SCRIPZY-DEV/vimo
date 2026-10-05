import type { CatalogGem } from '../../types/catalog.ts'
import { GEM_TEMPLATE_VERSION } from '../../types/styles.ts'
import { CATALOG_TAGS } from './tags.ts'

// 2D Personaje: gema de Imperio Pro (04-2d-personaje-1.md de estilos/, 15
// caracteres) reconstruida por el agente el 2026-10-02 y revisada a mano
// (plan E2, tarea O2). Personaje fijo en el origen: sí.
export const gem2dPersonaje1: CatalogGem = {
  id: '2d-personaje-1',
  name: { es: '2D Personaje', en: '2D Character', pt: '2D Personagem' },
  tags: [
    CATALOG_TAGS.fixedCharacter,
    CATALOG_TAGS.twoD,
    CATALOG_TAGS.explainer,
    CATALOG_TAGS.scriptOutfit,
    CATALOG_TAGS.mutedPalette,
  ],
  sections: {
    visualStyle: `2D digital vector cartoon illustration, clean bold black outlines of even thickness, flat colors with soft cel shading, muted desaturated palette, modern educational explainer animation look, high resolution.`,
    character: `A white-headed cartoon man, with an oversized, perfectly round, pure white blank head shaped like a smooth circle, no ears and no skin tone. His face has two large round black eyes with small white highlights, thin curved black eyebrows and a small simple curved line for a mouth with a calm friendly expression. On top of the round head there is short spiky white hair drawn as clean black-outlined tufts. His body is slim and human-proportioned, noticeably smaller in scale than his big head. Outfit: simple white cartoon gloves with rounded fingers, a plain shirt and trousers in flat muted colors.`,
    camera: `Varía los ángulos de cámara en fragmentos consecutivos alternando obligatoriamente entre: Medium shot, Close-up, Extreme close-up, Low angle shot, Over the shoulder shot, Overhead top-down shot, Wide shot. PROHIBIDO usar Extreme Wide Shot. Cuando el fragmento mencione un objeto (celular, puerta, taza, papel, llaves), usa un encuadre cerrado sobre las manos y el objeto.`,
    rules: `PROHIBIDO dejar fondos en blanco: establece una descripción corta del lugar y manténla EXACTAMENTE IGUAL palabra por palabra durante la misma escena. Si el fragmento es SOLO de extras, no incluyas a [subject]; si hay objeto/extra, inclúyelo adaptando el encuadre para incluirlo a [subject]. Los extras deben ser humanos normales con cabeza humana, cabello y tono de piel realistas; JAMÁS pueden parecerse al protagonista (no cabeza blanca redonda, no cabello blanco puntiagudo, no guantes blancos, no las mismas prendas, accesorios o colores principales). Usa obligatoriamente la fórmula exacta: another [TIPO DE PERSONAJE] with [RASGO/CABELLO OPUESTO AL PROTA: brown, dark, blonde or gray hair and human skin tone], wearing [ROPA DISTINTA AL PROTA: prendas y colores que no coincidan con su atuendo]. Añade 1 o 2 palabras del fragmento actual en 1 de cada 5 prompts, escritas TAL CUAL en el idioma del guion; números/fechas conviértelos a dígitos y ponlos obligatoriamente. NUNCA uses comillas para diálogos hablados. Todo texto debe ir sobre pizarras, papeles blancos o pantallas holográficas translúcidas azules. Describe la emoción coherente con cejas negras finas y curvas, ojos negros grandes y redondos y la línea curva de boca (alegría arriba, preocupación abajo). DINAMISMO/VARIEDAD: alterna obligatoriamente la posición del protagonista (centrado / en una esquina observando desde una puerta / de perfil / en primer plano lateral), alterna cantidad de personajes en cuadro (solo, con 1 persona, con un grupo de 5 o más) y alterna iluminación y paleta ambiental (azul frío de oficina, crema cálido de hogar, rosa-naranja de atardecer, gris neutro corporativo, blanco luminoso de estudio) cada vez que el guion cambie de escena. ANTI-MONOTONÍA: PROHIBIDO que dos prompts consecutivos compartan el mismo recurso visual, la misma composición y la misma ubicación del protagonista en el encuadre; rota obligatoriamente sin repetir hasta agotar los recursos: (1) gran pantalla holográfica translúcida azul con diagrama de cerebro humano gris-azul, nodos naranjas brillantes, engranajes, bombilla y flechas negras conectadas, con título arriba; (2) tarjetas cuadradas de iconos translúcidos flotando (nube de lluvia, gota triste, reloj despertador rojo sonando, burbuja de pensamiento con signos de interrogación); (3) comparación en pantalla dividida por una línea vertical fina (izquierda caótica/tensa, derecha calmada/luminosa, misma persona); (4) objetos volando con líneas de movimiento mientras el protagonista permanece inmóvil y sereno en el centro; (5) ondas de red neuronal brillantes azul y magenta con nodos e iconos flotantes y una palabra clave tenue al fondo; (6) gran burbuja de pensamiento blanca con un cerebro gris y flechas rojas o azules suaves y pequeños iconos de caras; (7) bocadillos de texto grandes sólidos (rosa, verde, magenta) con palabras en mayúsculas y signos de interrogación negros gigantes; (8) paneles holográficos de reconocimiento facial con mallas y flechas azules conectando; (9) escena íntima de dos personas frente a frente en una mesa pequeña sin tecnología con luz cálida; (10) escena exterior con cielo de atardecer naranja y morado, farolas encendidas, siluetas urbanas y peatones desenfocados pasando.`,
    promptEnd: `Style: 2D digital vector cartoon illustration, clean bold black outlines of even thickness, flat colors with soft cel shading, muted desaturated palette, modern educational explainer animation look, high resolution. If any text appears in the image, it must be written in [IDIOMA DEL GUION].`,
  },
  templateVersion: GEM_TEMPLATE_VERSION,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'none',
  sampleCount: 4,
}
