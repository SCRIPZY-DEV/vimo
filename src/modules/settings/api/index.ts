import { documentDir, join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { exists, mkdir, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import { openPath } from '@tauri-apps/plugin-opener'
import { LazyStore } from '@tauri-apps/plugin-store'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  AUTOMATIC_SCENE_COUNT,
  CONFIRM_SCENES_STORE_KEY,
  DEFAULT_PROJECTS_FOLDER_NAME,
  DEFAULT_SCENE_COUNT_STORE_KEY,
  PROJECTS_ROOT_STORE_KEY,
  PROMPT_MODEL_ID_LIMIT,
  PROMPT_MODEL_STORE_KEY,
  SCENE_COUNT_MAX,
  SECONDS_PER_SCENE_DEFAULT,
  SECONDS_PER_SCENE_MAX,
  SECONDS_PER_SCENE_MIN,
  SECONDS_PER_SCENE_STORE_KEY,
  SETTINGS_STORE_FILE,
  WRITE_PROBE_FILE_NAME,
} from '../constants'
import type {
  ChooseProjectsRootResult,
  SceneDurationDefaults,
} from '../types/settings'

const store = new LazyStore(SETTINGS_STORE_FILE)

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

/**
 * Única capa del módulo que toca los plugins de Tauri (dialog/fs/store/opener),
 * igual que un invoke() o una llamada HTTP se envolverían acá.
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
    await ensureWritableDirectory(selected)
    await persistProjectsRoot(selected)
    return selected
  },
  async resetProjectsRoot(): Promise<string> {
    const path = await defaultProjectsRoot()
    await ensureWritableDirectory(path)
    await persistProjectsRoot(path)
    return path
  },
  async openProjectsRoot(): Promise<void> {
    const path = await this.getProjectsRoot()
    await ensureWritableDirectory(path)
    return openPath(path)
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
  async getPromptModel(): Promise<string | null> {
    const stored = await store.get<string>(PROMPT_MODEL_STORE_KEY)
    return normalizePromptModel(stored ?? null)
  },
  async setPromptModel(modelId: string | null): Promise<string | null> {
    const normalized = normalizePromptModel(modelId)
    await store.set(PROMPT_MODEL_STORE_KEY, normalized)
    await store.save()
    return normalized
  },
}
