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

// El retrato con el que se RECONOCE al personaje en pantalla: el de este
// estilo y, si no lo tiene, cualquiera de los suyos. E20 manda sobre la
// referencia que se ENVÍA (esa sigue siendo estricta: sin preview del estilo
// la identidad viaja como texto), no sobre lo que se ve en la app — dibujar
// un ícono vacío para alguien que sí tiene ilustraciones es un bug de vista.
export function findPortraitPreview(
  character: CharacterSummary,
  previewStyleKey: string,
): CharacterPreview | undefined {
  return (
    findStylePreview(character, previewStyleKey) ?? character.previews.at(0)
  )
}
