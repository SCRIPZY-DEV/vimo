import type { SubcommandHandler } from '../../runner/subcommand.ts'
import { characterCreate } from './character-create.ts'
import { characterDelete } from './character-delete.ts'
import { characterUpdate } from './character-update.ts'
import { charactersList } from './characters-list.ts'
import { generateCharacterPreview } from './generate-character-preview.ts'
import { suggestCharacterProfile } from './suggest-character-profile.ts'

export const charactersSubcommands: Record<string, SubcommandHandler> = {
  'characters-list': charactersList,
  'character-create': characterCreate,
  'character-update': characterUpdate,
  'character-delete': characterDelete,
  'suggest-character-profile': suggestCharacterProfile,
  'generate-character-preview': generateCharacterPreview,
}
