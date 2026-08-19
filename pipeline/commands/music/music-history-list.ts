import type { PipelineContext } from '../../runner/context.ts'
import type { MusicHistoryListResult } from '../../types/music.ts'
import { listHistoryEntries, musicHistoryRoot } from './music-history.ts'

// Lista el historial de música, más reciente primero. La búsqueda se filtra
// en la UI: el listado es local y chico.
export async function musicHistoryList(
  context: PipelineContext,
): Promise<MusicHistoryListResult> {
  const entries = await listHistoryEntries(musicHistoryRoot(context))
  return { entries }
}
