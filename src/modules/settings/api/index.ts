import { invoke } from '@tauri-apps/api/core'
import { documentDir, join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { exists, mkdir, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import { openUrl } from '@tauri-apps/plugin-opener'
import { relaunch } from '@tauri-apps/plugin-process'
import { LazyStore } from '@tauri-apps/plugin-store'
import { check } from '@tauri-apps/plugin-updater'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  AUTOMATIC_SCENE_COUNT,
  CONFIRM_SCENES_STORE_KEY,
  DEFAULT_PROJECTS_FOLDER_NAME,
  DEFAULT_SCENE_COUNT_STORE_KEY,
  INSTALLER_DOWNLOAD_URL,
  NO_PENDING_UPDATE_ERROR,
  PROJECTS_ROOT_STORE_KEY,
  PROMPT_MODEL_COMPACT_DEFAULT,
  PROMPT_MODEL_COMPACT_STORE_KEY,
  PROMPT_MODEL_ID_LIMIT,
  PROMPT_MODEL_STORE_KEY,
  SCENE_COUNT_MAX,
  SECONDS_PER_SCENE_DEFAULT,
  SECONDS_PER_SCENE_MAX,
  SECONDS_PER_SCENE_MIN,
  SECONDS_PER_SCENE_STORE_KEY,
  SETTINGS_STORE_FILE,
  UPDATE_JOB_RUNNING_ERROR,
  VOICE_VENDOR_STORE_KEY,
  WRITE_PROBE_FILE_NAME,
} from '../constants'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'
import type {
  ChooseProjectsRootResult,
  PromptModelDefaults,
  SceneDurationDefaults,
} from '../types/settings'
import type {
  AppUpdateInfo,
  PendingUpdate,
  UpdateDownloadProgress,
  UpdateInstallLocation,
} from '../types/updates'

const store = new LazyStore(SETTINGS_STORE_FILE)

// El update pendiente es un recurso de Rust: se retiene acá entre el chequeo
// y la instalación, y se libera (close) al reemplazarlo o al terminar.
let pendingUpdate: PendingUpdate | null = null
// El paquete ya bajó y pasó la firma: reintentar la instalación no vuelve a
// descargarlo.
let pendingUpdateDownloaded = false

async function releasePendingUpdate(): Promise<void> {
  if (pendingUpdate === null) return
  const previous = pendingUpdate
  pendingUpdate = null
  pendingUpdateDownloaded = false
  await previous.close()
}

function toAppUpdateInfo(update: PendingUpdate): AppUpdateInfo {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body?.trim() || null,
    date: update.date ?? null,
  }
}

async function ensureWritableDirectory(path: string): Promise<void> {
  if (!(await exists(path))) {
    await mkdir(path, { recursive: true })
  }
  const probe = await join(path, WRITE_PROBE_FILE_NAME)
  await writeTextFile(probe, 'vimo')
  await remove(probe)
}

async function defaultProjectsRoot(): Promise<string> {
  return join(await documentDir(), DEFAULT_PROJECTS_FOLDER_NAME)
}

async function persistProjectsRoot(path: string): Promise<void> {
  await store.set(PROJECTS_ROOT_STORE_KEY, path)
  await store.save()
}

// Rust da permiso al webview sobre la carpeta guardada y la de por defecto
// (ADR-0037): sin esto, una carpeta fuera de $HOME (otro disco, «Documentos»
// movida en Windows) no se puede validar ni mostrar sus imágenes.
async function syncProjectsRootScope(): Promise<void> {
  return invoke('sync_projects_root_scope')
}

// Un valor fuera de rango (store editado a mano, versión vieja) cae al rango
// válido en vez de romper el formulario de Crear.
function clampSceneCount(value: number): number {
  if (!Number.isFinite(value)) return AUTOMATIC_SCENE_COUNT
  return Math.min(
    Math.max(Math.trunc(value), AUTOMATIC_SCENE_COUNT),
    SCENE_COUNT_MAX,
  )
}

// Mismo criterio que clampSceneCount, para el carril de segundos.
function clampSecondsPerScene(value: number): number {
  if (!Number.isFinite(value)) return SECONDS_PER_SCENE_DEFAULT
  return Math.min(
    Math.max(Math.trunc(value), SECONDS_PER_SCENE_MIN),
    SECONDS_PER_SCENE_MAX,
  )
}

// null = el modelo de la casa. Sin whitelist contra el catálogo: un id
// retirado o desconocido lo degrada el pipeline al escribir (ADR-0020), acá
// solo se rechaza lo que no puede ser un id.
function normalizePromptModel(value: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length > PROMPT_MODEL_ID_LIMIT) return null
  return trimmed
}

// null = automático. Un valor que no es un vendor (store editado a mano,
// versión vieja) se trata como «no elegido», nunca rompe la vista.
function normalizeVoiceVendor(value: unknown): VoiceVendorId | null {
  if (value === 'dubvoice' || value === 'elevenlabs') return value
  return null
}

/**
 * Única capa del módulo que toca los plugins de Tauri (dialog/fs/store/opener/
 * updater/process), igual que un invoke() o una llamada HTTP se envolverían acá.
 */
export const settingsApi = {
  isNative() {
    return isNative()
  },
  async getProjectsRoot(): Promise<string> {
    const stored = await store.get<string>(PROJECTS_ROOT_STORE_KEY)
    return stored ?? defaultProjectsRoot()
  },
  async chooseProjectsRoot(): Promise<ChooseProjectsRootResult> {
    const current = await this.getProjectsRoot()
    const selected = await open({ directory: true, defaultPath: current })
    if (selected === null) {
      return null
    }
    // El dialog ya dio permiso a la elegida en esta sesión; el sync lo repite
    // desde el store para no depender de ese detalle del plugin.
    await ensureWritableDirectory(selected)
    await persistProjectsRoot(selected)
    await syncProjectsRootScope()
    return selected
  },
  async resetProjectsRoot(): Promise<string> {
    const path = await defaultProjectsRoot()
    // Primero el permiso: el default puede estar fuera de $HOME y la
    // validación fallaría antes de guardarlo.
    await syncProjectsRootScope()
    await ensureWritableDirectory(path)
    await persistProjectsRoot(path)
    return path
  },
  async openProjectsRoot(): Promise<void> {
    const path = await this.getProjectsRoot()
    await ensureWritableDirectory(path)
    // Se abre desde Rust: el scope de opener solo cubre $HOME y la carpeta
    // puede estar en otro disco.
    return invoke('open_projects_root')
  },
  async getDefaultSceneCount(): Promise<number> {
    const stored = await store.get<number>(DEFAULT_SCENE_COUNT_STORE_KEY)
    return clampSceneCount(stored ?? AUTOMATIC_SCENE_COUNT)
  },
  async setDefaultSceneCount(count: number): Promise<number> {
    const clamped = clampSceneCount(count)
    await store.set(DEFAULT_SCENE_COUNT_STORE_KEY, clamped)
    await store.save()
    return clamped
  },
  async getSceneDurationDefaults(): Promise<SceneDurationDefaults> {
    const seconds = await store.get<number>(SECONDS_PER_SCENE_STORE_KEY)
    const confirm = await store.get<boolean>(CONFIRM_SCENES_STORE_KEY)
    return {
      secondsPerScene: clampSecondsPerScene(
        seconds ?? SECONDS_PER_SCENE_DEFAULT,
      ),
      confirmScenes: confirm ?? true,
    }
  },
  async setSceneDurationDefaults(
    next: SceneDurationDefaults,
  ): Promise<SceneDurationDefaults> {
    const saved: SceneDurationDefaults = {
      secondsPerScene: clampSecondsPerScene(next.secondsPerScene),
      confirmScenes: next.confirmScenes,
    }
    await store.set(SECONDS_PER_SCENE_STORE_KEY, saved.secondsPerScene)
    await store.set(CONFIRM_SCENES_STORE_KEY, saved.confirmScenes)
    await store.save()
    return saved
  },
  async getPromptModelDefaults(): Promise<PromptModelDefaults> {
    const storedId = await store.get<string>(PROMPT_MODEL_STORE_KEY)
    const compact = await store.get<boolean>(PROMPT_MODEL_COMPACT_STORE_KEY)
    return {
      modelId: normalizePromptModel(storedId ?? null),
      compact: compact ?? PROMPT_MODEL_COMPACT_DEFAULT,
    }
  },
  async setPromptModelDefaults(
    next: PromptModelDefaults,
  ): Promise<PromptModelDefaults> {
    const saved: PromptModelDefaults = {
      modelId: normalizePromptModel(next.modelId),
      compact: next.compact,
    }
    await store.set(PROMPT_MODEL_STORE_KEY, saved.modelId)
    await store.set(PROMPT_MODEL_COMPACT_STORE_KEY, saved.compact)
    await store.save()
    return saved
  },
  async getVoiceVendor(): Promise<VoiceVendorId | null> {
    const stored = await store.get<unknown>(VOICE_VENDOR_STORE_KEY)
    return normalizeVoiceVendor(stored)
  },
  async setVoiceVendor(
    vendor: VoiceVendorId | null,
  ): Promise<VoiceVendorId | null> {
    const saved = normalizeVoiceVendor(vendor)
    if (saved === null) await store.delete(VOICE_VENDOR_STORE_KEY)
    else await store.set(VOICE_VENDOR_STORE_KEY, saved)
    await store.save()
    return saved
  },
  // Consulta latest.json (endpoint en tauri.conf.json) y compara con la
  // versión instalada. null = al día.
  async checkForUpdate(): Promise<AppUpdateInfo | null> {
    await releasePendingUpdate()
    const update = await check()
    if (update === null) return null
    pendingUpdate = update
    return toAppUpdateInfo(update)
  },
  // Dónde corre la app: el updater no puede reemplazarla desde el DMG montado
  // ni desde una copia de solo lectura de macOS.
  async getUpdateInstallLocation(): Promise<UpdateInstallLocation> {
    return invoke<UpdateInstallLocation>('get_update_install_location')
  },
  // Descarga el update del último chequeo y verifica su firma. Separado de
  // instalar para saber qué paso falló y no volver a bajarlo al reintentar.
  async downloadUpdate(
    onProgress: (progress: UpdateDownloadProgress) => void,
  ): Promise<void> {
    if (pendingUpdate === null) throw new Error(NO_PENDING_UPDATE_ERROR)
    if (pendingUpdateDownloaded) return
    let downloadedBytes = 0
    let totalBytes: number | null = null
    await pendingUpdate.download((event) => {
      if (event.event === 'Started') {
        totalBytes = event.data.contentLength ?? null
        onProgress({ downloadedBytes, totalBytes })
        return
      }
      if (event.event === 'Progress') {
        downloadedBytes += event.data.chunkLength
        onProgress({ downloadedBytes, totalBytes })
        return
      }
      onProgress({ downloadedBytes: totalBytes ?? downloadedBytes, totalBytes })
    })
    pendingUpdateDownloaded = true
  },
  // Instala lo descargado. En Windows el plugin cierra la app al lanzar el
  // instalador; en macOS resuelve y hay que llamar a relaunchApp(). Con un
  // video generándose no se instala: reiniciar lo cortaría y, en Windows, los
  // sidecars bloquean los archivos a reemplazar.
  async installUpdate(): Promise<void> {
    if (pendingUpdate === null) throw new Error(NO_PENDING_UPDATE_ERROR)
    const jobsRunning = await invoke<boolean>('has_running_pipeline_jobs')
    if (jobsRunning) throw new Error(UPDATE_JOB_RUNNING_ERROR)
    await pendingUpdate.install()
    await releasePendingUpdate()
  },
  // Deja el error en el archivo de log de la app: el plugin no lo registra.
  async reportUpdateInstallFailure(detail: string): Promise<void> {
    return invoke('report_update_install_failure', { detail })
  },
  async openInstallerDownload(): Promise<void> {
    return openUrl(INSTALLER_DOWNLOAD_URL)
  },
  async relaunchApp(): Promise<void> {
    return relaunch()
  },
}
