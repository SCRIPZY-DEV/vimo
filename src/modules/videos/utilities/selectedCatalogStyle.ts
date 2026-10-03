// Ruta relativa y con extensión, no `@/`: este módulo corre bajo un guard con
// Node pelado, que no resuelve el alias; los dos son puros y viven juntos.
import { localizedText } from './catalogLocale.ts'
import type { SelectedCustomStyle } from '@/modules/videos/types/styles'
import type { CatalogGem } from '@pipeline/types/catalog.ts'
import type { CharacterStyleId } from '@pipeline/types/characters.ts'
import type { StyleCharacter } from '@pipeline/types/styles.ts'

// Un estilo del catálogo nuevo en el formulario y en el proyecto (plan E2
// §5.4). Módulo puro: lo corren scripts/test/check-app-catalog-style.mjs y
// check-app-custom-style-payload.mjs con Node, sin bundler.

// Los 5 estilos del catálogo viejo. El `Record` obliga a que estén todos los
// CharacterStyleId; se consulta como propiedad PROPIA, para que un id como
// `constructor` no pase por heredado.
const LEGACY_STYLE_IDS: Record<CharacterStyleId, true> = {
  normal: true,
  pov_stickman: true,
  cartoon: true,
  fantasia: true,
  terror: true,
}

function isLegacyStyleId(id: string): id is CharacterStyleId {
  return Object.hasOwn(LEGACY_STYLE_IDS, id)
}

// La gema elegida como snapshot del formulario: viaja como una gema de
// plantilla de Mi estilo (secciones, versión, filtro y modo de personaje) más
// su id de catálogo, con el nombre en el idioma que la persona tiene puesto.
// Sin texto de gema vieja: `systemPrompt` vacío y sin planos, como una de
// plantilla.
export function selectedCatalogStyleFrom(
  gem: CatalogGem,
  language: string,
  character: StyleCharacter,
): SelectedCustomStyle {
  return {
    styleId: gem.id,
    catalogStyleId: gem.id,
    name: localizedText(gem.name, language),
    systemPrompt: '',
    shots: [],
    sections: gem.sections,
    templateVersion: gem.templateVersion,
    colorFilter: gem.colorFilter,
    character,
  }
}

// `options.styleId` de un proyecto del catálogo: el id heredado si la gema es
// uno de los 5; cualquier otra viaja con 'normal' (create-video-project exige
// las dos reglas).
export function catalogProjectStyleId(
  catalogStyleId: string,
): CharacterStyleId {
  if (isLegacyStyleId(catalogStyleId)) return catalogStyleId
  return 'normal'
}
