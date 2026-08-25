import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener'
import {
  pipelineErrorCode,
  runPipelineJob,
  startPipelineJob,
} from '@/modules/common/fetcher/pipeline'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  CREATE_ERROR_MESSAGE_KEYS,
  NARRATION_AUDIO_EXTENSIONS,
  UNKNOWN_CREATE_ERROR_KEY,
} from '@/modules/videos/constants'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type { CharactersListResult } from '@pipeline/types/characters.ts'
import type {
  ListVoicesPayload,
  ListVoicesResult,
} from '@pipeline/types/voices.ts'
import type {
  ConfirmScenesPayload,
  CreateVideoProjectPayload,
  CreateVideoProjectResult,
  ProbeTtsPayload,
  ProbeTtsResult,
  RunVideoPipelinePayload,
  UploadNarrationPayload,
  VideoProjectStatusResult,
} from '@pipeline/types/video-project.ts'

export const videosApi = {
  isNative() {
    return isNative()
  },
  async createProject(
    payload: CreateVideoProjectPayload,
  ): Promise<CreateVideoProjectResult> {
    return runPipelineJob<CreateVideoProjectResult>(
      'create-video-project',
      payload,
    )
  },
  async uploadNarration(payload: UploadNarrationPayload): Promise<void> {
    await runPipelineJob('upload-narration', payload)
  },
  async pickNarrationFile(): Promise<string | null> {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'audio', extensions: NARRATION_AUDIO_EXTENSIONS }],
    })
    return typeof selected === 'string' ? selected : null
  },
  async startPipeline(
    payload: RunVideoPipelinePayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('run-video-pipeline', payload, onEvent)
  },
  async confirmScenes(payload: ConfirmScenesPayload): Promise<void> {
    await runPipelineJob('confirm-scenes', payload)
  },
  async probeTts(payload: ProbeTtsPayload): Promise<ProbeTtsResult> {
    return runPipelineJob<ProbeTtsResult>('probe-tts', payload)
  },
  async projectStatus(projectId: string): Promise<VideoProjectStatusResult> {
    return runPipelineJob<VideoProjectStatusResult>('video-project-status', {
      projectId,
    })
  },
  async cancelJob(jobId: string): Promise<void> {
    return invoke('cancel_pipeline_job', { jobId })
  },
  async listVoices(payload: ListVoicesPayload): Promise<ListVoicesResult> {
    return runPipelineJob<ListVoicesResult>('list-voices', payload)
  },
  async listCharacters(): Promise<CharactersListResult> {
    return runPipelineJob<CharactersListResult>('characters-list')
  },
  async openVideo(path: string): Promise<void> {
    return openPath(path)
  },
  async revealVideo(path: string): Promise<void> {
    return revealItemInDir(path)
  },
  imageSource(path: string): string {
    return convertFileSrc(path)
  },
  videoSource(path: string): string {
    return convertFileSrc(path)
  },
  errorMessageKey(error: unknown): string {
    const code = pipelineErrorCode(error)
    if (!code) return UNKNOWN_CREATE_ERROR_KEY
    return CREATE_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_CREATE_ERROR_KEY
  },
}
