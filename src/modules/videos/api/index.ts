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
  LIBRARY_ERROR_MESSAGE_KEYS,
  NARRATION_AUDIO_EXTENSIONS,
  UNKNOWN_CREATE_ERROR_KEY,
} from '@/modules/videos/constants'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type { CharactersListResult } from '@pipeline/types/characters.ts'
import type {
  GenerateStyleSamplesPayload,
  StyleDeletePayload,
  StyleSavePayload,
  StyleSaveResult,
  StylesListResult,
} from '@pipeline/types/styles.ts'
import type {
  MusicGenerationParams,
  SuggestMusicPromptResult,
} from '@pipeline/types/music.ts'
import type {
  ListVoicesPayload,
  ListVoicesResult,
} from '@pipeline/types/voices.ts'
import type {
  ConfirmScenesPayload,
  SetPromptModelPayload,
  PreviewSceneCutsPayload,
  PreviewSceneCutsResult,
  CreateVideoProjectPayload,
  CreateVideoProjectResult,
  DeleteVideoProjectsResult,
  ExportClipsPayload,
  ListVideoProjectsResult,
  ProbeTtsPayload,
  ProbeTtsResult,
  RegenerateSceneImagesPayload,
  RenderVideoPayload,
  ReplaceNarrationPayload,
  RunVideoPipelinePayload,
  SceneChange,
  SetProjectMusicPayload,
  UpdateAudioMixPayload,
  UpdateScenesResult,
  UploadNarrationPayload,
  VideoProjectDetailResult,
  VideoProjectListItem,
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
  async setPromptModel(payload: SetPromptModelPayload): Promise<void> {
    await runPipelineJob('set-prompt-model', payload)
  },
  async previewSceneCuts(
    payload: PreviewSceneCutsPayload,
  ): Promise<PreviewSceneCutsResult> {
    return runPipelineJob<PreviewSceneCutsResult>('preview-scene-cuts', payload)
  },
  async probeTts(payload: ProbeTtsPayload): Promise<ProbeTtsResult> {
    return runPipelineJob<ProbeTtsResult>('probe-tts', payload)
  },
  async projectStatus(projectId: string): Promise<VideoProjectStatusResult> {
    return runPipelineJob<VideoProjectStatusResult>('video-project-status', {
      projectId,
    })
  },
  async listProjects(): Promise<VideoProjectListItem[]> {
    const result = await runPipelineJob<ListVideoProjectsResult>(
      'list-video-projects',
    )
    return result.projects
  },
  async deleteProjects(projectIds: string[]): Promise<number> {
    const result = await runPipelineJob<DeleteVideoProjectsResult>(
      'delete-video-projects',
      { projectIds },
    )
    return result.deleted
  },
  async projectDetail(projectId: string): Promise<VideoProjectDetailResult> {
    return runPipelineJob<VideoProjectDetailResult>('video-project-detail', {
      projectId,
    })
  },
  async updateScenes(
    projectId: string,
    changes: SceneChange[],
  ): Promise<UpdateScenesResult> {
    return runPipelineJob<UpdateScenesResult>('update-scenes', {
      projectId,
      changes,
    })
  },
  async startRegeneration(
    payload: RegenerateSceneImagesPayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('regenerate-scene-images', payload, onEvent)
  },
  async startRender(
    payload: RenderVideoPayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('render-video', payload, onEvent)
  },
  async startExportClips(
    payload: ExportClipsPayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('export-clips', payload, onEvent)
  },
  async startReplaceNarration(
    payload: ReplaceNarrationPayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('replace-narration', payload, onEvent)
  },
  async setProjectMusic(payload: SetProjectMusicPayload): Promise<void> {
    await runPipelineJob('set-project-music', payload)
  },
  async updateAudioMix(payload: UpdateAudioMixPayload): Promise<void> {
    await runPipelineJob('update-audio-mix', payload)
  },
  async generateProjectMusic(
    params: MusicGenerationParams,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('generate-music', params, onEvent)
  },
  async suggestMusicPrompt(script: string): Promise<string> {
    const result = await runPipelineJob<SuggestMusicPromptResult>(
      'suggest-music-prompt',
      { script },
    )
    return result.prompt
  },
  async openFolder(path: string): Promise<void> {
    return openPath(path)
  },
  async listCustomStyles(): Promise<StylesListResult> {
    return runPipelineJob('styles-list')
  },
  async saveCustomStyle(payload: StyleSavePayload): Promise<StyleSaveResult> {
    return runPipelineJob('style-save', payload)
  },
  async deleteCustomStyle(payload: StyleDeletePayload): Promise<void> {
    await runPipelineJob('style-delete', payload)
  },
  async generateStyleSamples(
    payload: GenerateStyleSamplesPayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('generate-style-samples', payload, onEvent)
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
  // `version` (mtime del sidecar) rompe la caché de convertFileSrc: la ruta
  // de una imagen regenerada no cambia, la URL sí tiene que cambiar.
  imageSource(path: string, version?: number): string {
    const url = convertFileSrc(path)
    return version === undefined ? url : `${url}?v=${version}`
  },
  videoSource(path: string, version?: number): string {
    const url = convertFileSrc(path)
    return version === undefined ? url : `${url}?v=${version}`
  },
  errorMessageKey(error: unknown): string {
    const code = pipelineErrorCode(error)
    if (!code) return UNKNOWN_CREATE_ERROR_KEY
    return LIBRARY_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_CREATE_ERROR_KEY
  },
}
