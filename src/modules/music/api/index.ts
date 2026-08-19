import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import {
  pipelineErrorCode,
  runPipelineJob,
  startPipelineJob,
} from '@/modules/common/fetcher/pipeline'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  MUSIC_ERROR_MESSAGE_KEYS,
  UNKNOWN_MUSIC_ERROR_KEY,
} from '@/modules/music/constants'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type {
  ChooseMusicPayload,
  ChooseMusicResult,
  EvolinkCredits,
  MusicGenerationParams,
  MusicHistoryEntry,
  MusicHistoryListResult,
  SuggestMusicPromptResult,
} from '@pipeline/types/music.ts'

export const musicApi = {
  isNative() {
    return isNative()
  },
  async startGeneration(
    params: MusicGenerationParams,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('generate-music', params, onEvent)
  },
  async cancelJob(jobId: string): Promise<void> {
    return invoke('cancel_pipeline_job', { jobId })
  },
  async suggestPrompt(script: string): Promise<string> {
    const result = await runPipelineJob<SuggestMusicPromptResult>(
      'suggest-music-prompt',
      { script },
    )
    return result.prompt
  },
  async chooseMusic(payload: ChooseMusicPayload): Promise<MusicHistoryEntry> {
    const result = await runPipelineJob<ChooseMusicResult>(
      'choose-music',
      payload,
    )
    return result.entry
  },
  async getCredits(): Promise<EvolinkCredits> {
    return runPipelineJob<EvolinkCredits>('get-music-credits')
  },
  async listHistory(): Promise<MusicHistoryEntry[]> {
    const result =
      await runPipelineJob<MusicHistoryListResult>('music-history-list')
    return result.entries
  },
  async deleteHistoryEntry(id: string): Promise<void> {
    await runPipelineJob('music-history-delete', { id })
  },
  audioSource(path: string): string {
    return convertFileSrc(path)
  },
  errorMessageKey(error: unknown): string {
    const code = pipelineErrorCode(error)
    if (!code) return UNKNOWN_MUSIC_ERROR_KEY
    return MUSIC_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_MUSIC_ERROR_KEY
  },
}
