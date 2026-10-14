import type { SubcommandHandler } from '../../runner/subcommand.ts'
import { addLibraryVoiceCommand } from './add-library-voice.ts'
import { cloneVoiceCommand } from './clone-voice.ts'
import { deleteClonedVoiceCommand } from './delete-cloned-voice.ts'
import { generateVoiceCommand } from './generate-voice.ts'
import { getVoiceCredits } from './get-voice-credits.ts'
import { listVoices } from './list-voices.ts'
import { voiceHistoryDelete } from './voice-history-delete.ts'
import { voiceHistoryList } from './voice-history-list.ts'

// Subcomandos del dominio voces. Cada dominio exporta su propio mapa y
// main.ts los esparce en SUBCOMMANDS: agregar un dominio no toca los demás.
export const voicesSubcommands: Record<string, SubcommandHandler> = {
  'list-voices': listVoices,
  'generate-voice': generateVoiceCommand,
  'get-voice-credits': getVoiceCredits,
  'voice-history-list': voiceHistoryList,
  'voice-history-delete': voiceHistoryDelete,
  'add-library-voice': addLibraryVoiceCommand,
  'clone-voice': cloneVoiceCommand,
  'delete-cloned-voice': deleteClonedVoiceCommand,
}
