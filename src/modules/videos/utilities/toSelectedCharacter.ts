import {
  findPortraitPreview,
  findStylePreview,
} from '@/modules/videos/utilities/findStylePreview'
import type { SelectedCharacter } from '@/modules/videos/types/create'
import type { CharacterSummary } from '@pipeline/types/characters.ts'

// Un personaje de la biblioteca tal como lo guarda el formulario. Las dos
// imágenes se resuelven acá, una sola vez, porque significan cosas distintas:
// `previewPath` es la referencia de identidad de ESTE estilo (estricta) y
// `portraitPath` es solo la carita que se dibuja en pantalla.
export function toSelectedCharacter(
  character: CharacterSummary,
  previewStyleKey: string,
): SelectedCharacter {
  const preview = findStylePreview(character, previewStyleKey)
  const portrait = findPortraitPreview(character, previewStyleKey)

  return {
    characterId: character.id,
    name: character.name,
    description: character.description,
    previewPath: preview?.imagePath ?? null,
    portraitPath: portrait?.imagePath ?? null,
  }
}
