import type {
  CharacterPreview,
  CharacterStyleId,
  CharacterSummary,
} from '@pipeline/types/characters.ts'

// La referencia de identidad es siempre el preview del estilo ACTUAL: usar el
// de otro rompería la identidad entre escenas (regla E20 del origen), así que
// el sidecar rechaza el proyecto con character_preview_missing si no existe.
export function findStylePreview(
  character: CharacterSummary,
  styleId: CharacterStyleId,
): CharacterPreview | undefined {
  return character.previews.find((preview) => preview.styleId === styleId)
}
