import { convertFileSrc } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import {
  pipelineErrorCode,
  runPipelineJob,
} from '@/modules/common/fetcher/pipeline'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  AVATAR_REFERENCE_IMAGES_MAX,
  AVATARS_ERROR_MESSAGE_KEYS,
  PHOTO_EXTENSIONS,
  UNKNOWN_AVATARS_ERROR_KEY,
} from '@/modules/avatars/constants'
import type {
  AvatarAddPayload,
  AvatarAddResult,
  AvatarBalanceResult,
  AvatarCreatePhotoPayload,
  AvatarCreatePhotoResult,
  AvatarGenerateLookPayload,
  AvatarGenerateLookResult,
  AvatarRefreshResult,
  AvatarSetMainLookPayload,
  AvatarSetMainLookResult,
  AvatarStockGroupsPayload,
  AvatarStockGroupsResult,
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
  async listStockGroups(
    payload: AvatarStockGroupsPayload,
  ): Promise<AvatarStockGroupsResult> {
    return runPipelineJob<AvatarStockGroupsResult>(
      'avatar-stock-groups',
      payload,
    )
  },
  async listStockLooks(
    payload: AvatarStockLooksPayload,
  ): Promise<AvatarStockLooksResult> {
    return runPipelineJob<AvatarStockLooksResult>('avatar-stock-looks', payload)
  },
  async addAvatar(payload: AvatarAddPayload): Promise<AvatarSummary> {
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
  async setMainLook(payload: AvatarSetMainLookPayload): Promise<AvatarSummary> {
    const result = await runPipelineJob<AvatarSetMainLookResult>(
      'avatar-set-main-look',
      payload,
    )
    return result.entry
  },
  async generateLook(
    payload: AvatarGenerateLookPayload,
  ): Promise<AvatarGenerateLookResult> {
    return runPipelineJob<AvatarGenerateLookResult>(
      'avatar-generate-look',
      payload,
    )
  },
  async refresh(id: string): Promise<AvatarSummary> {
    const result = await runPipelineJob<AvatarRefreshResult>('avatar-refresh', {
      id,
    })
    return result.entry
  },
  // Nunca falla por HeyGen: sin clave o ante un error responde
  // `available: false` con el motivo (el saldo no tumba la vista).
  async balance(): Promise<AvatarBalanceResult> {
    return runPipelineJob<AvatarBalanceResult>('avatar-balance')
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
  // Imágenes de referencia de un look nuevo, también como rutas: hasta
  // AVATAR_REFERENCE_IMAGES_MAX (si se eligen más, sobran las últimas).
  async pickReferenceImages(): Promise<string[]> {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [{ name: 'image', extensions: PHOTO_EXTENSIONS }],
    })
    if (!Array.isArray(selected)) return []

    return selected.slice(0, AVATAR_REFERENCE_IMAGES_MAX)
  },
  imageSource(path: string): string {
    return convertFileSrc(path)
  },
  // El código del sidecar o de Rust (`avatar_not_found`, …), o null si el
  // error no vino de un job.
  errorCode(error: unknown): string | null {
    return pipelineErrorCode(error)
  },
  errorMessageKey(error: unknown): string {
    const code = pipelineErrorCode(error)
    if (!code) return UNKNOWN_AVATARS_ERROR_KEY
    return AVATARS_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_AVATARS_ERROR_KEY
  },
}
