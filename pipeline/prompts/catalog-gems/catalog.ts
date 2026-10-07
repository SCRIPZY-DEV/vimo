import type { CatalogGem } from '../../types/catalog.ts'
import { cartoon } from './cartoon.ts'
import { fantasia } from './fantasia.ts'
import { normal } from './normal.ts'
import { povStickman } from './pov-stickman.ts'
import { terror } from './terror.ts'
import { infograficoAmarillo } from './infografico-amarillo.ts'
import { gem2dStickman } from './2d-stickman.ts'
import { gem2dPersonaje1 } from './2d-personaje-1.ts'
import { stickmanCinematico } from './stickman-cinematico.ts'
import { gem3dRelatos } from './3d-relatos.ts'
import { gem2dBasicoExplicativo } from './2d-basico-explicativo.ts'
import { gem2dMono } from './2d-mono.ts'
import { gem2dEstilo } from './2d-estilo.ts'
import { gem2dCavernicola } from './2d-cavernicola.ts'
import { gem2dCrayon } from './2d-crayon.ts'
import { gem2dBola } from './2d-bola.ts'
import { gem2dPersonaje } from './2d-personaje.ts'
import { abstractoRojo } from './abstracto-rojo.ts'
import { realistaPersonaje } from './realista-personaje.ts'
import { realista } from './realista.ts'
import { gem2dAsiatico } from './2d-asiatico.ts'
import { gem2dComic } from './2d-comic.ts'
import { mistico } from './mistico.ts'
import { animeStorytime } from './anime-storytime.ts'
import { pixelRetro } from './pixel-retro.ts'
import { noirDetective } from './noir-detective.ts'
import { claymation } from './claymation.ts'
import { papercraft } from './papercraft.ts'
import { cyberpunkNeon } from './cyberpunk-neon.ts'
import { caricaturaEditorial } from './caricatura-editorial.ts'
import { documentalOscuro } from './documental-oscuro.ts'
import { cosmos } from './cosmos.ts'
import { infografiaAzul } from './infografia-azul.ts'
import { blueprintTecnico } from './blueprint-tecnico.ts'
import { collageRetro } from './collage-retro.ts'
import { terrorAnalogico } from './terror-analogico.ts'
import { naturalezaEpica } from './naturaleza-epica.ts'
import { mapaHistorico } from './mapa-historico.ts'

// El catálogo de Vimo en el orden de la pestaña (spec §8, plan E2 §5.2): las
// gemas de la casa primero y después las de Imperio Pro en el orden de su
// README. Un archivo por gema; el guard `check-catalog-gems.mjs` fija las
// reglas de contenido (ids, límites, modos, etiquetas y muestras).
export const CATALOG_GEMS: readonly CatalogGem[] = [
  normal,
  povStickman,
  cartoon,
  fantasia,
  terror,
  infograficoAmarillo,
  gem2dStickman,
  gem2dPersonaje1,
  stickmanCinematico,
  gem3dRelatos,
  gem2dBasicoExplicativo,
  gem2dMono,
  gem2dEstilo,
  gem2dCavernicola,
  gem2dCrayon,
  gem2dBola,
  gem2dPersonaje,
  abstractoRojo,
  realistaPersonaje,
  realista,
  gem2dAsiatico,
  gem2dComic,
  mistico,
  animeStorytime,
  pixelRetro,
  noirDetective,
  claymation,
  papercraft,
  cyberpunkNeon,
  caricaturaEditorial,
  documentalOscuro,
  cosmos,
  infografiaAzul,
  blueprintTecnico,
  collageRetro,
  terrorAnalogico,
  naturalezaEpica,
  mapaHistorico,
]

// Mapa por id para la búsqueda. Se consulta como propiedad PROPIA: con `in`,
// `toString` o `constructor` pasarían por ids del catálogo.
const GEMS_BY_ID: Record<string, CatalogGem> = Object.fromEntries(
  CATALOG_GEMS.map((gem) => [gem.id, gem]),
)

export function findCatalogGem(id: string): CatalogGem | undefined {
  return Object.hasOwn(GEMS_BY_ID, id) ? GEMS_BY_ID[id] : undefined
}
