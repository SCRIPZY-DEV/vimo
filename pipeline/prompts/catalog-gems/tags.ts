import type { LocalizedText } from '../../types/catalog.ts'

// Paleta de etiquetas del catálogo (decisión P12 del plan de la Entrega 2).
// Una etiqueta le dice a la persona qué es el estilo y qué hace; el admin se
// la pone a la gema y la tarjeta la muestra. Viajan dentro de cada gema como
// texto en tres idiomas (igual que el nombre, P8), así que en la Entrega 3
// salen de la fila del catálogo remoto sin tocar la app. Esta paleta solo
// evita que dos gemas escriban la misma etiqueta de dos maneras: el guard
// `check-catalog-gems.mjs` fija los límites y la coherencia de las dos
// etiquetas que describen comportamiento (Dinamismo con la sección
// `dynamism`, Personaje fijo con la sección `character`).

/** Cuántas etiquetas admite una gema. */
export const CATALOG_TAG_LIMIT = 5
/** Largo máximo de cada traducción: tiene que entrar en un chip de la tarjeta. */
export const CATALOG_TAG_LABEL_LIMIT = 24

function tag(es: string, en: string, pt: string): LocalizedText {
  return { es, en, pt }
}

export const CATALOG_TAGS = {
  // Comportamiento (las fija el guard contra las secciones).
  dynamism: tag('Dinamismo', 'Dynamism', 'Dinamismo'),
  fixedCharacter: tag('Personaje fijo', 'Fixed character', 'Personagem fixo'),
  // Medio y técnica.
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
  // Género y tono.
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
  // Tema.
  space: tag('Espacio', 'Space', 'Espaço'),
  science: tag('Ciencia', 'Science', 'Ciência'),
  nature: tag('Naturaleza', 'Nature', 'Natureza'),
  history: tag('Historia', 'History', 'História'),
  data: tag('Datos', 'Data', 'Dados'),
  corporate: tag('Corporativo', 'Corporate', 'Corporativo'),
  technical: tag('Técnico', 'Technical', 'Técnico'),
  engineering: tag('Ingeniería', 'Engineering', 'Engenharia'),
  // Paleta y luz.
  blackAndWhite: tag('Blanco y negro', 'Black and white', 'Preto e branco'),
  redAndBlack: tag('Rojo y negro', 'Red and black', 'Vermelho e preto'),
  yellowBackground: tag('Fondo amarillo', 'Yellow background', 'Fundo amarelo'),
  mutedPalette: tag('Paleta apagada', 'Muted palette', 'Paleta suave'),
  grayPalette: tag('Paleta gris', 'Gray palette', 'Paleta cinza'),
  vividColor: tag('Color vivo', 'Vivid color', 'Cor viva'),
  warmLight: tag('Luz cálida', 'Warm light', 'Luz quente'),
  neon: tag('Neón', 'Neon', 'Neon'),
  parchment: tag('Pergamino', 'Parchment', 'Pergaminho'),
  // Cómo se arma la escena.
  scriptOutfit: tag(
    'Ropa según el guion',
    'Outfit from the script',
    'Roupa pelo roteiro',
  ),
  fullBody: tag('Cuerpo completo', 'Full body', 'Corpo inteiro'),
  bRoll: tag('B-roll', 'B-roll', 'B-roll'),
} as const satisfies Record<string, LocalizedText>

export type CatalogTagKey = keyof typeof CATALOG_TAGS
