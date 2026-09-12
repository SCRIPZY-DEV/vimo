import { useCharacterCatalog } from '@/modules/videos/hooks/useCharacterCatalog'
import { styleCharacterModeOf } from '@/modules/videos/utilities/formPayload'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { CharacterSummary } from '@pipeline/types/characters.ts'
import type { StyleCharacterMode } from '@pipeline/types/styles.ts'

export interface StyleCharacterState {
  // null = estilo de catálogo: los chips del estilo no aplican.
  mode: StyleCharacterMode | null
  // El predeterminado de la gema (solo con «Mi personaje»): un PUNTERO a la
  // biblioteca, nunca una copia.
  fixedCharacterId: string | undefined
  fixedCharacter: CharacterSummary | undefined
  // El puntero todavía se está resolviendo contra la biblioteca.
  fixedLoading: boolean
  // El puntero ya no resuelve: el personaje se borró de la biblioteca.
  fixedMissing: boolean
  // La gema escribe (o no lleva) el protagonista: una elección del
  // formulario no se usaría.
  styleWritesCharacter: boolean
  // Hay una gema con texto que abrir en el editor. Sin texto el chip es un
  // cartel, nunca un botón muerto (origen: puedeEditarLaGema).
  canEditStyle: boolean
}

// Qué decidió la gema en uso sobre su protagonista (ADR-0020), resuelta
// contra la biblioteca. La sección de personaje dibuja sus chips con esto y
// el formulario bloquea el envío con lo mismo: una sola derivación.
export function useStyleCharacter(form: CreateFormValue): StyleCharacterState {
  const mode = styleCharacterModeOf(form)
  const fixedCharacterId =
    mode === 'own' ? form.customStyle?.character?.defaultCharacterId : undefined
  const { characters: catalog, isLoading } = useCharacterCatalog(
    Boolean(fixedCharacterId),
  )
  const fixedCharacter = fixedCharacterId
    ? catalog.find((character) => character.id === fixedCharacterId)
    : undefined

  return {
    mode,
    fixedCharacterId,
    fixedCharacter,
    fixedLoading: Boolean(fixedCharacterId) && isLoading,
    fixedMissing: Boolean(fixedCharacterId) && !isLoading && !fixedCharacter,
    styleWritesCharacter: mode === 'generic' || mode === 'none',
    canEditStyle:
      mode !== null && Boolean(form.customStyle?.systemPrompt.trim()),
  }
}
