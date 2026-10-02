import type {
  CharacterPreview,
  CharacterSummary,
} from '@pipeline/types/characters.ts'

// El preview de un personaje SIN foto en el estilo ACTUAL (id del catálogo o
// de galería). Es solo para verlo: su identidad viaja siempre como texto
// (enmienda del 2026-10-02 a la ADR-0021). Un personaje CON foto no pasa por
// acá: su referencia es la foto, en cualquier estilo (ADR-0033).
export function findStylePreview(
  character: CharacterSummary,
  previewStyleKey: string,
): CharacterPreview | undefined {
  return character.previews.find(
    (preview) => preview.styleId === previewStyleKey,
  )
}

// La imagen con la que se RECONOCE al personaje en pantalla: su foto; si no,
// el preview de este estilo; si tampoco, cualquiera de los suyos. Dibujar un
// ícono vacío para alguien que sí tiene ilustraciones es un bug de vista.
export function characterPortraitPath(
  character: CharacterSummary,
  previewStyleKey: string,
): string | null {
  if (character.photoPath) return character.photoPath
  const preview =
    findStylePreview(character, previewStyleKey) ?? character.previews.at(0)
  return preview?.imagePath ?? null
}
