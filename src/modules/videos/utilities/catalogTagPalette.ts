import type { CatalogTagKey } from '@pipeline/prompts/catalog-gems/tags.ts'
import type { LocalizedText } from '@pipeline/types/catalog.ts'

// La paleta de etiquetas del catálogo que el admin elige en el modal (plan E3,
// P7). Espejo de CATALOG_TAGS (pipeline/prompts/catalog-gems/tags.ts): `src/`
// solo importa tipos de `pipeline/` (ADR-0010); el tipo `CatalogTagKey` obliga
// a tener las mismas claves y el guard check-app-catalog-admin.mjs fija que
// los textos coincidan uno por uno. Módulo puro: lo corre Node sin bundler.

function tag(es: string, en: string, pt: string): LocalizedText {
  return { es, en, pt }
}

export const CATALOG_TAG_PALETTE: Record<CatalogTagKey, LocalizedText> = {
  dynamism: tag('Dinamismo', 'Dynamism', 'Dinamismo'),
  fixedCharacter: tag('Personaje fijo', 'Fixed character', 'Personagem fixo'),
  twoD: tag('2D', '2D', '2D'),
  threeD: tag('3D', '3D', '3D'),
  cgi: tag('CGI', 'CGI', 'CGI'),
  cartoon: tag('Cartoon', 'Cartoon', 'Cartoon'),
  anime: tag('Anime', 'Anime', 'Anime'),
  celShaded: tag('Cel-shaded', 'Cel-shaded', 'Cel-shaded'),
  pixelArt: tag('Pixel art', 'Pixel art', 'Pixel art'),
  stopMotion: tag('Stop motion', 'Stop motion', 'Stop motion'),
  clay: tag('Plastilina', 'Clay', 'Massinha'),
  paper: tag('Papel', 'Paper', 'Papel'),
  diorama: tag('Diorama', 'Diorama', 'Diorama'),
  collage: tag('Collage', 'Collage', 'Colagem'),
  ink: tag('Tinta', 'Ink', 'Tinta'),
  watercolor: tag('Acuarela', 'Watercolor', 'Aquarela'),
  engraving: tag('Grabado', 'Engraving', 'Gravura'),
  doodle: tag('Doodle', 'Doodle', 'Doodle'),
  msPaint: tag('MS Paint', 'MS Paint', 'MS Paint'),
  cleanLine: tag('Trazo limpio', 'Clean line', 'Traço limpo'),
  photographic: tag('Fotográfico', 'Photographic', 'Fotográfico'),
  photorealistic: tag('Fotorrealista', 'Photorealistic', 'Fotorrealista'),
  realistic: tag('Realista', 'Realistic', 'Realista'),
  cinematic: tag('Cinematográfico', 'Cinematic', 'Cinematográfico'),
  documentary: tag('Documental', 'Documentary', 'Documentário'),
  infographic: tag('Infografía', 'Infographic', 'Infográfico'),
  blueprint: tag('Plano técnico', 'Blueprint', 'Planta técnica'),
  map: tag('Mapa', 'Map', 'Mapa'),
  caricature: tag('Caricatura', 'Caricature', 'Caricatura'),
  comic: tag('Cómic', 'Comic', 'Quadrinhos'),
  explainer: tag('Explainer', 'Explainer', 'Explainer'),
  storytime: tag('Storytime', 'Storytime', 'Storytime'),
  educational: tag('Educativo', 'Educational', 'Educativo'),
  tale: tag('Cuento', 'Tale', 'Conto'),
  humor: tag('Humor', 'Humor', 'Humor'),
  satirical: tag('Satírico', 'Satirical', 'Satírico'),
  horror: tag('Terror', 'Horror', 'Terror'),
  fantasy: tag('Fantasía', 'Fantasy', 'Fantasia'),
  mystery: tag('Misterio', 'Mystery', 'Mistério'),
  psychological: tag('Psicológico', 'Psychological', 'Psicológico'),
  noir: tag('Noir', 'Noir', 'Noir'),
  dark: tag('Oscuro', 'Dark', 'Escuro'),
  atmospheric: tag('Atmosférico', 'Atmospheric', 'Atmosférico'),
  abstract: tag('Abstracto', 'Abstract', 'Abstrato'),
  cyberpunk: tag('Cyberpunk', 'Cyberpunk', 'Cyberpunk'),
  futuristic: tag('Futurista', 'Futuristic', 'Futurista'),
  retro: tag('Retro', 'Retro', 'Retrô'),
  vintage: tag('Vintage', 'Vintage', 'Vintage'),
  analog: tag('Analógico', 'Analog', 'Analógico'),
  vhs: tag('VHS', 'VHS', 'VHS'),
  videoGame: tag('Videojuego', 'Video game', 'Videogame'),
  handmade: tag('Artesanal', 'Handmade', 'Artesanal'),
  alchemy: tag('Alquimia', 'Alchemy', 'Alquimia'),
  space: tag('Espacio', 'Space', 'Espaço'),
  science: tag('Ciencia', 'Science', 'Ciência'),
  nature: tag('Naturaleza', 'Nature', 'Natureza'),
  history: tag('Historia', 'History', 'História'),
  data: tag('Datos', 'Data', 'Dados'),
  corporate: tag('Corporativo', 'Corporate', 'Corporativo'),
  technical: tag('Técnico', 'Technical', 'Técnico'),
  engineering: tag('Ingeniería', 'Engineering', 'Engenharia'),
  blackAndWhite: tag('Blanco y negro', 'Black and white', 'Preto e branco'),
  redAndBlack: tag('Rojo y negro', 'Red and black', 'Vermelho e preto'),
  yellowBackground: tag('Fondo amarillo', 'Yellow background', 'Fundo amarelo'),
  mutedPalette: tag('Paleta apagada', 'Muted palette', 'Paleta suave'),
  grayPalette: tag('Paleta gris', 'Gray palette', 'Paleta cinza'),
  vividColor: tag('Color vivo', 'Vivid color', 'Cor viva'),
  warmLight: tag('Luz cálida', 'Warm light', 'Luz quente'),
  neon: tag('Neón', 'Neon', 'Neon'),
  parchment: tag('Pergamino', 'Parchment', 'Pergaminho'),
  scriptOutfit: tag(
    'Ropa según el guion',
    'Outfit from the script',
    'Roupa pelo roteiro',
  ),
  fullBody: tag('Cuerpo completo', 'Full body', 'Corpo inteiro'),
  bRoll: tag('B-roll', 'B-roll', 'B-roll'),
}

/** Las dos etiquetas que describen comportamiento: las pone y las saca la app según las secciones. */
export const DYNAMISM_TAG = CATALOG_TAG_PALETTE.dynamism
export const FIXED_CHARACTER_TAG = CATALOG_TAG_PALETTE.fixedCharacter

// Las etiquetas se comparan por su texto en español: salen de esta paleta o
// las escribe el admin, y el servidor rechaza dos iguales por `es`.
export function sameCatalogTag(a: LocalizedText, b: LocalizedText): boolean {
  return a.es === b.es
}

export function isBehaviorTag(tag: LocalizedText): boolean {
  return (
    sameCatalogTag(tag, DYNAMISM_TAG) ||
    sameCatalogTag(tag, FIXED_CHARACTER_TAG)
  )
}

/** La paleta sin las dos de comportamiento: lo que el admin elige a mano. */
export const CATALOG_TAG_CHOICES: readonly LocalizedText[] = Object.values(
  CATALOG_TAG_PALETTE,
).filter((tag) => !isBehaviorTag(tag))
