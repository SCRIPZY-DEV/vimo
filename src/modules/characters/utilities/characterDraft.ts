import { charactersApi } from '@/modules/characters/api'
import type { CharacterSummary } from '@pipeline/types/characters.ts'
import type {
  CharacterFormValue,
  PreviewView,
} from '@/modules/characters/types/characters'

export function toFormValue(character: CharacterSummary): CharacterFormValue {
  return {
    name: character.name,
    age: character.age ?? '',
    role: character.role ?? '',
    description: character.description,
  }
}

export function toPreviewViews(character: CharacterSummary): PreviewView[] {
  return character.previews.map((preview) => ({
    styleId: preview.styleId,
    url: charactersApi.imageSource(preview.imagePath),
    isNew: false,
  }))
}
