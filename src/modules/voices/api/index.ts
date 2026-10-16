import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  pipelineErrorCode,
  runPipelineJob,
  startPipelineJob,
} from '@/modules/common/fetcher/pipeline'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  UNKNOWN_VOICE_ERROR_KEY,
  VOICE_CLONE_AUDIO_EXTENSIONS,
  VOICE_CLONING_URLS,
  VOICE_HISTORY_URLS,
  VOICE_ERROR_MESSAGE_KEYS,
} from '@/modules/voices/constants'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type {
  CloneVoicePayload,
  CloneVoiceResult,
  DeleteClonedVoicePayload,
  GenerateVoicePayload,
  ListVoicesPayload,
  ListVoicesResult,
  VoiceCreditsPayload,
  VoiceCreditsResult,
  VoiceHistoryEntry,
  VoiceHistoryListResult,
  VoiceVendorId,
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
  async getCredits(vendor: VoiceVendorId): Promise<VoiceCreditsResult> {
    const payload: VoiceCreditsPayload = { vendor }
    return runPipelineJob<VoiceCreditsResult>('get-voice-credits', payload)
  },
  async listHistory(): Promise<VoiceHistoryEntry[]> {
    const result =
      await runPipelineJob<VoiceHistoryListResult>('voice-history-list')
    return result.entries
  },
  async deleteHistoryEntry(id: string): Promise<void> {
    await runPipelineJob('voice-history-delete', { id })
  },
  // La muestra se elige con el diálogo nativo y viaja como ruta (precedente:
  // pickPhotoFile en characters): el sidecar la lee y valida de disco.
  async pickCloneSample(): Promise<string | null> {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'audio', extensions: VOICE_CLONE_AUDIO_EXTENSIONS }],
    })
    return typeof selected === 'string' ? selected : null
  },
  async cloneVoice(payload: CloneVoicePayload): Promise<CloneVoiceResult> {
    return runPipelineJob<CloneVoiceResult>('clone-voice', payload)
  },
  async deleteClonedVoice(payload: DeleteClonedVoicePayload): Promise<void> {
    await runPipelineJob('delete-cloned-voice', payload)
  },
  async openCloningDashboard(vendor: VoiceVendorId): Promise<void> {
    return openUrl(VOICE_CLONING_URLS[vendor])
  },
  async openHistoryPage(vendor: VoiceVendorId): Promise<void> {
    return openUrl(VOICE_HISTORY_URLS[vendor])
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
