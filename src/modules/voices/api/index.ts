import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  pipelineErrorCode,
  runPipelineJob,
  startPipelineJob,
} from '@/modules/common/fetcher/pipeline'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  DUBVOICE_DASHBOARD_URL,
  UNKNOWN_VOICE_ERROR_KEY,
  VOICE_ERROR_MESSAGE_KEYS,
} from '@/modules/voices/constants'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type {
  GenerateVoicePayload,
  ListVoicesPayload,
  ListVoicesResult,
  VoiceCreditsResult,
  VoiceHistoryEntry,
  VoiceHistoryListResult,
} from '@pipeline/types/voices.ts'

export const voicesApi = {
  isNative() {
    return isNative()
  },
  async listVoices(payload: ListVoicesPayload): Promise<ListVoicesResult> {
    return runPipelineJob<ListVoicesResult>('list-voices', payload)
  },
  async startGeneration(
    payload: GenerateVoicePayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('generate-voice', payload, onEvent)
  },
  async cancelJob(jobId: string): Promise<void> {
    return invoke('cancel_pipeline_job', { jobId })
  },
  async getCredits(): Promise<VoiceCreditsResult> {
    return runPipelineJob<VoiceCreditsResult>('get-voice-credits')
  },
  async listHistory(): Promise<VoiceHistoryEntry[]> {
    const result =
      await runPipelineJob<VoiceHistoryListResult>('voice-history-list')
    return result.entries
  },
  async deleteHistoryEntry(id: string): Promise<void> {
    await runPipelineJob('voice-history-delete', { id })
  },
  async openCloningDashboard(): Promise<void> {
    return openUrl(DUBVOICE_DASHBOARD_URL)
  },
  audioSource(path: string): string {
    return convertFileSrc(path)
  },
  errorMessageKey(error: unknown): string {
    const code = pipelineErrorCode(error)
    if (!code) return UNKNOWN_VOICE_ERROR_KEY
    return VOICE_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_VOICE_ERROR_KEY
  },
}
