import type {
  CharacterPreview,
  CharacterSummary,
} from '@pipeline/types/characters.ts'

// La referencia de identidad de un personaje SIN foto es siempre el preview
// del estilo ACTUAL (id del catálogo o de galería): usar el de otro rompería
// la identidad entre escenas (regla E20 del origen). Sin preview, el personaje
// va sin referencia visual. Un personaje CON foto no pasa por acá: su
// referencia es la foto, en cualquier estilo (ADR-0033).
export function findStylePreview(
  character: CharacterSummary,
  previewStyleKey: string,
): CharacterPreview | undefined {
  return character.previews.find(
    (preview) => preview.styleId === previewStyleKey,
  )
}

// ¿Este personaje viaja con una imagen de referencia en este estilo? Con
// foto, siempre; sin foto, solo si tiene el preview del estilo.
export function hasStyleReference(
  character: CharacterSummary,
  previewStyleKey: string,
): boolean {
  if (character.photoPath) return true
  return findStylePreview(character, previewStyleKey) !== undefined
}

// La imagen con la que se RECONOCE al personaje en pantalla: su foto; si no,
// el preview de este estilo; si tampoco, cualquiera de los suyos. E20 manda
// sobre la referencia que se ENVÍA (esa sigue siendo estricta), no sobre lo
// que se ve en la app — dibujar un ícono vacío para alguien que sí tiene
// ilustraciones es un bug de vista.
export function characterPortraitPath(
  character: CharacterSummary,
  previewStyleKey: string,
): string | null {
  if (character.photoPath) return character.photoPath
  const preview =
    findStylePreview(character, previewStyleKey) ?? character.previews.at(0)
  return preview?.imagePath ?? null
}
