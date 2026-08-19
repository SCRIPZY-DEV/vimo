import type { SubcommandHandler } from '../../runner/subcommand.ts'
import { chooseMusic } from './choose-music.ts'
import { generateMusicCommand } from './generate-music.ts'
import { getMusicCredits } from './get-music-credits.ts'
import { musicHistoryDelete } from './music-history-delete.ts'
import { musicHistoryList } from './music-history-list.ts'
import { suggestMusicPrompt } from './suggest-music-prompt.ts'

// Subcomandos del dominio música. Cada dominio exporta su propio mapa y
// main.ts los esparce en SUBCOMMANDS: agregar un dominio no toca los demás.
export const musicSubcommands: Record<string, SubcommandHandler> = {
  'suggest-music-prompt': suggestMusicPrompt,
  'generate-music': generateMusicCommand,
  'choose-music': chooseMusic,
  'get-music-credits': getMusicCredits,
  'music-history-list': musicHistoryList,
  'music-history-delete': musicHistoryDelete,
}
