import { characterPortraitPath } from '@/modules/videos/utilities/findStylePreview'
import type { SelectedCharacter } from '@/modules/videos/types/create'
import type { CharacterSummary } from '@pipeline/types/characters.ts'

// Un personaje de la biblioteca tal como lo guarda el formulario: el modo lo
// decide el archivo (hay foto o no) y la carita se resuelve acá, una sola
// vez. La referencia que viaja al video no se guarda en el formulario: la
// copia el sidecar al crear el proyecto, y solo existe para un personaje con
// foto.
export function toSelectedCharacter(
  character: CharacterSummary,
  previewStyleKey: string,
): SelectedCharacter {
  return {
    characterId: character.id,
    name: character.name,
    description: character.description,
    mode: character.photoPath ? 'photo' : 'text',
    portraitPath: characterPortraitPath(character, previewStyleKey),
  }
}
