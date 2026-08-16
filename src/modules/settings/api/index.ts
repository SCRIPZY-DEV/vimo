import { documentDir, join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { exists, mkdir, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import { openPath } from '@tauri-apps/plugin-opener'
import { LazyStore } from '@tauri-apps/plugin-store'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  DEFAULT_PROJECTS_FOLDER_NAME,
  PROJECTS_ROOT_STORE_KEY,
  SETTINGS_STORE_FILE,
  WRITE_PROBE_FILE_NAME,
} from '../constants'
import type { ChooseProjectsRootResult } from '../types/settings'

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
}
