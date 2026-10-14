import { convertFileSrc } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { LazyStore } from '@tauri-apps/plugin-store'
import {
  pipelineErrorCode,
  runPipelineJob,
} from '@/modules/common/fetcher/pipeline'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  AVATAR_REFERENCE_IMAGES_MAX,
  AVATARS_ERROR_MESSAGE_KEYS,
  AVATARS_STORE_FILE,
  PHOTO_EXTENSIONS,
  STOCK_FAVORITES_STORE_KEY,
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
  AvatarHeygenDeletePayload,
  AvatarHeygenDeleteResult,
  AvatarRefreshResult,
  AvatarSetMainLookPayload,
  AvatarSetMainLookResult,
  AvatarStockGroupsPayload,
  AvatarStockGroupsResult,
  AvatarStockLooksPayload,
  AvatarStockLooksResult,
  AvatarStockTypesPayload,
  AvatarStockTypesResult,
  AvatarSummary,
  AvatarsListResult,
} from '@pipeline/types/avatar.ts'

// Lo que el módulo guarda en esta máquina (favoritos del stock), como los
// ajustes: el store de la app, que se carga al primer uso.
const store = new LazyStore(AVATARS_STORE_FILE)

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
  // Qué grupos públicos son de estudio y cuáles gemelos (entrega 2b): una
  // barrida gratis de HeyGen con caché de 24 h en el sidecar.
  async listStockTypes(
    payload: AvatarStockTypesPayload = {},
  ): Promise<AvatarStockTypesResult> {
    return runPipelineJob<AvatarStockTypesResult>('avatar-stock-types', payload)
  },
  // Favoritos del stock público (ids de grupo de HeyGen), guardados en esta
  // máquina. Lo guardado que no es una lista de textos cuenta como vacío.
  async readStockFavorites(): Promise<string[]> {
    const saved = await store.get<unknown>(STOCK_FAVORITES_STORE_KEY)
    if (!Array.isArray(saved)) return []
    return saved.filter((id): id is string => typeof id === 'string')
  },
  async writeStockFavorites(groupIds: string[]): Promise<void> {
    await store.set(STOCK_FAVORITES_STORE_KEY, groupIds)
    await store.save()
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
  // Borra de verdad un avatar propio de la cuenta de HeyGen, con todos sus
  // looks, y su entrada de la biblioteca si la tenía (entrega 2c). No se puede
  // deshacer: la interfaz lo confirma antes.
  async deleteFromHeyGen(
    payload: AvatarHeygenDeletePayload,
  ): Promise<AvatarHeygenDeleteResult> {
    return runPipelineJob<AvatarHeygenDeleteResult>(
      'avatar-heygen-delete',
      payload,
    )
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
