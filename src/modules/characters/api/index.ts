import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import {
  pipelineErrorCode,
  runPipelineJob,
  startPipelineJob,
} from '@/modules/common/fetcher/pipeline'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  CHARACTERS_ERROR_MESSAGE_KEYS,
  UNKNOWN_CHARACTERS_ERROR_KEY,
} from '@/modules/characters/constants'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type {
  DesignStyleCharacterPayload,
  DesignStyleCharacterResult,
} from '@pipeline/types/styles.ts'
import type {
  CharacterCreatePayload,
  CharacterCreateResult,
  CharacterSummary,
  CharacterUpdatePayload,
  CharacterUpdateResult,
  CharactersListResult,
  GenerateCharacterPreviewPayload,
  SuggestCharacterProfilePayload,
  SuggestCharacterProfileResult,
} from '@pipeline/types/characters.ts'

export const charactersApi = {
  isNative() {
    return isNative()
  },
  async list(): Promise<CharacterSummary[]> {
    const result = await runPipelineJob<CharactersListResult>('characters-list')
    return result.entries
  },
  async create(payload: CharacterCreatePayload): Promise<CharacterSummary> {
    const result = await runPipelineJob<CharacterCreateResult>(
      'character-create',
      payload,
    )
    return result.entry
  },
  async update(payload: CharacterUpdatePayload): Promise<CharacterSummary> {
    const result = await runPipelineJob<CharacterUpdateResult>(
      'character-update',
      payload,
    )
    return result.entry
  },
  async remove(id: string): Promise<void> {
    await runPipelineJob('character-delete', { id })
  },
  async suggestProfile(
    payload: SuggestCharacterProfilePayload,
  ): Promise<SuggestCharacterProfileResult> {
    return runPipelineJob<SuggestCharacterProfileResult>(
      'suggest-character-profile',
      payload,
    )
  },
  async designWithStyle(
    payload: DesignStyleCharacterPayload,
  ): Promise<DesignStyleCharacterResult> {
    return runPipelineJob<DesignStyleCharacterResult>(
      'design-style-character',
      payload,
    )
  },
  async startPreview(
    payload: GenerateCharacterPreviewPayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('generate-character-preview', payload, onEvent)
  },
  async cancelJob(jobId: string): Promise<void> {
    return invoke('cancel_pipeline_job', { jobId })
  },
  imageSource(path: string): string {
    return convertFileSrc(path)
  },
  errorMessageKey(error: unknown): string {
    const code = pipelineErrorCode(error)
    if (!code) return UNKNOWN_CHARACTERS_ERROR_KEY
    return CHARACTERS_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_CHARACTERS_ERROR_KEY
  },
}
