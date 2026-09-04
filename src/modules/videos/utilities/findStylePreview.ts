import type {
  CharacterPreview,
  CharacterSummary,
} from '@pipeline/types/characters.ts'

// La referencia de identidad es siempre el preview del estilo ACTUAL (id del
// catálogo o de galería): usar el de otro rompería la identidad entre escenas
// (regla E20 del origen). Sin preview, el personaje va sin referencia visual.
export function findStylePreview(
  character: CharacterSummary,
  previewStyleKey: string,
): CharacterPreview | undefined {
  return character.previews.find(
    (preview) => preview.styleId === previewStyleKey,
  )
}
