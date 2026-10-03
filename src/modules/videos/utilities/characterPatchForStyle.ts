import { laneOf } from '@/modules/videos/utilities/formLane'
import { styleCharacterModeOf } from '@/modules/videos/utilities/formPayload'
import type { CreateFormValue } from '@/modules/videos/types/create'

type StyleChoice = Pick<CreateFormValue, 'styleSource' | 'customStyle'>

// Retiro y restauración automáticos de los personajes al cambiar de estilo
// (v1.31.2 del origen). Si el estilo nuevo escribe (o no lleva) el
// protagonista, la elección se RETIRA en vez de perderse; si un estilo vuelve
// a aceptarla y el lugar sigue vacío, vuelve sola. Una elección nueva del
// usuario siempre gana. El fijo que la gema anterior sembró no es una
// elección: se quita sin recibo. Un estilo del catálogo nuevo lleva un
// personaje como máximo (spec §8): lo que sobra se retira igual.
export function characterPatchForStyle(
  form: CreateFormValue,
  next: StyleChoice,
): Partial<CreateFormValue> {
  const patch = styleChangePatch(form, next)
  if (laneOf({ ...form, ...next }) !== 'catalog-gem') return patch
  return singleCharacterPatch(form, next, patch)
}

function styleChangePatch(
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

// Un estilo del catálogo con más de un personaje (traídos de Mi estilo o del
// catálogo viejo, que aceptan dos, o devueltos de un retiro): queda el
// protagonista —el personaje fijo del estilo, si está elegido; si no, el
// primero— y el resto se RETIRA, con el mismo recibo que el retiro de
// siempre. Al proyecto viajaría uno solo de todos modos (el carril de las
// gemas lleva un protagonista); así el formulario muestra lo que viaja.
function singleCharacterPatch(
  form: CreateFormValue,
  next: StyleChoice,
  patch: Partial<CreateFormValue>,
): Partial<CreateFormValue> {
  const characters = patch.characters ?? form.characters
  const fixedId = next.customStyle?.character?.defaultCharacterId
  const protagonist =
    characters.find((character) => character.characterId === fixedId) ??
    characters.at(0)
  if (!protagonist || characters.length <= 1) return patch

  return {
    ...patch,
    characters: [protagonist],
    withdrawnCharacters: characters.filter(
      (character) => character.characterId !== protagonist.characterId,
    ),
  }
}
