import { styleCharacterModeOf } from '@/modules/videos/utilities/formPayload'
import type { CreateFormValue } from '@/modules/videos/types/create'

type StyleChoice = Pick<CreateFormValue, 'styleSource' | 'customStyle'>

// Retiro y restauración automáticos de los personajes al cambiar de estilo
// (v1.31.2 del origen). Si el estilo nuevo escribe (o no lleva) el
// protagonista, la elección se RETIRA en vez de perderse; si un estilo vuelve
// a aceptarla y el lugar sigue vacío, vuelve sola. Una elección nueva del
// usuario siempre gana. El fijo que la gema anterior sembró no es una
// elección: se quita sin recibo.
export function characterPatchForStyle(
  form: CreateFormValue,
  next: StyleChoice,
): Partial<CreateFormValue> {
  const nextMode = styleCharacterModeOf({ ...form, ...next })
  const nextWrites = nextMode === 'generic' || nextMode === 'none'

  if (nextWrites) {
    if (form.characters.length === 0) return {}
    const previousFixedId =
      styleCharacterModeOf(form) === 'own'
        ? form.customStyle?.character?.defaultCharacterId
        : undefined
    const chosen = form.characters.filter(
      (character) => character.characterId !== previousFixedId,
    )
    if (chosen.length === 0) return { characters: [] }
    return { characters: [], withdrawnCharacters: chosen }
  }

  // Con un fijo propio la gema manda igual: lo retirado queda guardado para
  // el próximo estilo que acepte la elección.
  const nextFixedId =
    nextMode === 'own'
      ? next.customStyle?.character?.defaultCharacterId
      : undefined
  if (nextFixedId) return {}
  if (form.characters.length > 0 || form.withdrawnCharacters.length === 0)
    return {}
  return { characters: form.withdrawnCharacters, withdrawnCharacters: [] }
}
