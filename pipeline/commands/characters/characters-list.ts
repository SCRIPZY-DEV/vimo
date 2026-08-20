import type { PipelineContext } from '../../runner/context.ts'
import type { CharactersListResult } from '../../types/characters.ts'
import { charactersRoot, listCharacterEntries } from './character-library.ts'

// Lista la biblioteca de personajes, más reciente primero. La búsqueda se
// filtra en la UI: el listado es local y chico.
export async function charactersList(
  context: PipelineContext,
): Promise<CharactersListResult> {
  const entries = await listCharacterEntries(charactersRoot(context))
  return { entries }
}
