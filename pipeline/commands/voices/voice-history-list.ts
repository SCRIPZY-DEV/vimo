import type { PipelineContext } from '../../runner/context.ts'
import type { VoiceHistoryListResult } from '../../types/voices.ts'
import { listHistoryEntries, voiceHistoryRoot } from './voice-history.ts'

// Lista el historial de voces, más reciente primero. La búsqueda se filtra
// en la UI: el listado es local y chico.
export async function voiceHistoryList(
  context: PipelineContext,
): Promise<VoiceHistoryListResult> {
  const entries = await listHistoryEntries(voiceHistoryRoot(context))
  return { entries }
}
