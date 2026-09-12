import {
  characterPortraitPath,
  findStylePreview,
} from '@/modules/videos/utilities/findStylePreview'
import type { SelectedCharacter } from '@/modules/videos/types/create'
import type { CharacterSummary } from '@pipeline/types/characters.ts'

// Un personaje de la biblioteca tal como lo guarda el formulario. Las dos
// imágenes se resuelven acá, una sola vez, porque significan cosas distintas:
// `previewPath` es la referencia de identidad que viajaría (la foto, o el
// preview estricto de ESTE estilo) y `portraitPath` es solo la carita que se
// dibuja en pantalla.
export function toSelectedCharacter(
  character: CharacterSummary,
  previewStyleKey: string,
): SelectedCharacter {
  const referencePath = character.photoPath
    ? character.photoPath
    : (findStylePreview(character, previewStyleKey)?.imagePath ?? null)

  return {
    characterId: character.id,
    name: character.name,
    description: character.description,
    mode: character.photoPath ? 'photo' : 'text',
    previewPath: referencePath,
    portraitPath: characterPortraitPath(character, previewStyleKey),
  }
}
