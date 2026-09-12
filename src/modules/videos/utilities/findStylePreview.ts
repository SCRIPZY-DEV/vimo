import type {
  CharacterPreview,
  CharacterSummary,
} from '@pipeline/types/characters.ts'

// La referencia de identidad de un personaje SIN foto es siempre el preview
// del estilo ACTUAL (id del catálogo o de galería): usar el de otro rompería
// la identidad entre escenas (regla E20 del origen). Sin preview, el personaje
// va sin referencia visual y su identidad viaja como texto. Un personaje CON
// foto no pasa por acá: su referencia es la foto, en cualquier estilo
// (ADR-0033). Quién copia la referencia es el sidecar; la app solo elige qué
// carita mostrar.
export function findStylePreview(
  character: CharacterSummary,
  previewStyleKey: string,
): CharacterPreview | undefined {
  return character.previews.find(
    (preview) => preview.styleId === previewStyleKey,
  )
}

// La imagen con la que se RECONOCE al personaje en pantalla: su foto; si no,
// el preview de este estilo; si tampoco, cualquiera de los suyos. E20 manda
// sobre la referencia que se ENVÍA, no sobre lo que se ve en la app — dibujar
// un ícono vacío para alguien que sí tiene ilustraciones es un bug de vista.
export function characterPortraitPath(
  character: CharacterSummary,
  previewStyleKey: string,
): string | null {
  if (character.photoPath) return character.photoPath
  const preview =
    findStylePreview(character, previewStyleKey) ?? character.previews.at(0)
  return preview?.imagePath ?? null
}
