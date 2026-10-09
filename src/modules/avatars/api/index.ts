import { convertFileSrc } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import {
  pipelineErrorCode,
  runPipelineJob,
} from '@/modules/common/fetcher/pipeline'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  AVATARS_ERROR_MESSAGE_KEYS,
  PHOTO_EXTENSIONS,
  UNKNOWN_AVATARS_ERROR_KEY,
} from '@/modules/avatars/constants'
import type {
  AvatarAddPayload,
  AvatarAddResult,
  AvatarCreatePhotoPayload,
  AvatarCreatePhotoResult,
  AvatarRefreshResult,
  AvatarStockLooksPayload,
  AvatarStockLooksResult,
  AvatarSummary,
  AvatarsListResult,
} from '@pipeline/types/avatar.ts'

export const avatarsApi = {
  isNative() {
    return isNative()
  },
  async list(): Promise<AvatarSummary[]> {
    const result = await runPipelineJob<AvatarsListResult>('avatars-list')
    return result.entries
  },
  async listStockLooks(
    payload: AvatarStockLooksPayload,
  ): Promise<AvatarStockLooksResult> {
    return runPipelineJob<AvatarStockLooksResult>('avatar-stock-looks', payload)
  },
  async addLook(payload: AvatarAddPayload): Promise<AvatarSummary> {
    const result = await runPipelineJob<AvatarAddResult>('avatar-add', payload)
    return result.entry
  },
  async createFromPhoto(
    payload: AvatarCreatePhotoPayload,
  ): Promise<AvatarSummary> {
    const result = await runPipelineJob<AvatarCreatePhotoResult>(
      'avatar-create-photo',
      payload,
    )
    return result.entry
  },
  async refresh(id: string): Promise<AvatarSummary> {
    const result = await runPipelineJob<AvatarRefreshResult>('avatar-refresh', {
      id,
    })
    return result.entry
  },
  async remove(id: string): Promise<void> {
    await runPipelineJob('avatar-delete', { id })
  },
  // La foto se elige con el dialog nativo y viaja como RUTA (precedente:
  // personajes): el sidecar la lee, la valida y la sube. Nada de base64.
  async pickPhotoFile(): Promise<string | null> {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'image', extensions: PHOTO_EXTENSIONS }],
    })
    return typeof selected === 'string' ? selected : null
  },
  imageSource(path: string): string {
    return convertFileSrc(path)
  },
  errorMessageKey(error: unknown): string {
    const code = pipelineErrorCode(error)
    if (!code) return UNKNOWN_AVATARS_ERROR_KEY
    return AVATARS_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_AVATARS_ERROR_KEY
  },
}
