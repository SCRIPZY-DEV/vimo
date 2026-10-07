import type { CATALOG_CHARACTER_STORAGE_KEY as APP_STORAGE_KEY } from '@/modules/videos/constants'
import type { CatalogCharacterStorage } from '@/modules/videos/types/styles'
import type { CatalogGem } from '@pipeline/types/catalog.ts'
import type {
  StyleCharacter,
  StyleCharacterMode,
} from '@pipeline/types/styles.ts'

// Qué modo de personaje eligió la persona en «Ver» para cada estilo del
// catálogo (plan E2 §5.5): `Record<catalogStyleId, StyleCharacter>` bajo una
// sola clave de `localStorage`. Es una comodidad: si el almacenamiento falla,
// el modo vale solo mientras dura el formulario. Módulo puro, sin imports de
// runtime: lo corre scripts/test/check-app-catalog-style.mjs con Node.

// Espejo de constants.ts. Node pelado no resuelve el alias `@/`, así que el
// valor se repite; la anotación con `typeof` obliga a que coincidan.
const STORAGE_KEY: typeof APP_STORAGE_KEY = 'vimo:catalog:character:v1'

const STYLE_CHARACTER_MODES: readonly StyleCharacterMode[] = [
  'own',
  'generic',
  'none',
]

// El modo de un estilo: el recordado si el estilo todavía lo permite; si no,
// el primero que permite (spec §8). Sin memoria, el modo con que salieron sus
// muestras (plan E2, P3), con la misma regla.
export function readCatalogCharacter(
  gem: CatalogGem,
  storage: CatalogCharacterStorage,
): StyleCharacter {
  const remembered = storedCharacter(readMemory(storage).get(gem.id))
  const character = remembered ?? { mode: gem.sampleMode }
  if (gem.allowedModes.includes(character.mode)) return character
  return { mode: gem.allowedModes.at(0) ?? 'generic' }
}

// Guarda el modo de un estilo sin tocar el de los demás. Sobre una memoria
// rota empieza de cero.
export function rememberCatalogCharacter(
  catalogStyleId: string,
  character: StyleCharacter,
  storage: CatalogCharacterStorage,
): void {
  const memory = readMemory(storage)
  memory.set(catalogStyleId, character)
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(memory)))
  } catch {
    // Sin almacenamiento (cuota llena, WebView sin storage) no se recuerda:
    // el modo sigue valiendo en el formulario y en «Ver».
  }
}

// Lectura tolerante: sin memoria, JSON roto, otra forma o un storage que
// lanza cuentan como vacía. Un Map de las propiedades PROPIAS: con un objeto,
// un id como `constructor` leería lo que hereda de Object.
function readMemory(storage: CatalogCharacterStorage): Map<string, unknown> {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return new Map()

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return new Map()
    return new Map<string, unknown>(Object.entries(parsed))
  } catch {
    return new Map()
  }
}

// Un modo guardado válido, o null. El personaje fijo solo acompaña a «Mi
// personaje» y nunca vacío: create-video-project rechaza las dos cosas
// (assertStyleCharacter).
function storedCharacter(value: unknown): StyleCharacter | null {
  if (typeof value !== 'object' || value === null || !('mode' in value))
    return null

  const mode = STYLE_CHARACTER_MODES.find((option) => option === value.mode)
  if (!mode) return null
  if (mode !== 'own') return { mode }

  const defaultCharacterId =
    'defaultCharacterId' in value ? value.defaultCharacterId : undefined
  if (typeof defaultCharacterId !== 'string' || !defaultCharacterId.trim())
    return { mode }
  return { mode, defaultCharacterId }
}
