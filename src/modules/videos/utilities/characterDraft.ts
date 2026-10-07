import type { CharacterDraft } from '@/modules/videos/types/styles'
import type { StyleCharacter } from '@pipeline/types/styles.ts'

// Qué queda en el borrador del personaje de un estilo al cambiar su bloque
// (StyleCharacterBlock), en el modal de Mi estilo y en «Ver» del catálogo.
// Tres casos:
//  - Volver a «Mi personaje» desde otro modo sin elegir a nadie recupera el
//    personaje fijo que tenía: pasar por «Genérico» no lo pierde.
//  - Apagar el personaje fijo estando en «Mi personaje» lo olvida: volver más
//    tarde a ese modo ya no lo trae.
//  - Cualquier otro cambio se aplica tal cual y recuerda el último fijo (el
//    nuevo, si se eligió uno).
// Pura: la elección del predeterminado se guarda en el mismo gesto que la
// aplica, así que hay que conocer el borrador nuevo antes de que React lo
// pinte. Sin imports de runtime: la corre
// scripts/test/check-app-catalog-style.mjs con Node, sin bundler.
export function nextCharacterDraft(
  draft: CharacterDraft,
  next: StyleCharacter,
): CharacterDraft {
  const current = draft.character
  const returnsToOwn = next.mode === 'own' && current.mode !== 'own'
  // Volver a «Mi personaje» desde otro modo recupera el fijado que tenía.
  if (returnsToOwn && !next.defaultCharacterId && draft.lastDefaultCharacterId)
    return {
      ...draft,
      character: {
        mode: 'own',
        defaultCharacterId: draft.lastDefaultCharacterId,
      },
    }
  // Apagar el predeterminado estando en «Mi personaje» lo olvida.
  if (next.mode === 'own' && !next.defaultCharacterId && !returnsToOwn)
    return { character: next }
  return {
    character: next,
    lastDefaultCharacterId:
      next.defaultCharacterId ?? draft.lastDefaultCharacterId,
  }
}
