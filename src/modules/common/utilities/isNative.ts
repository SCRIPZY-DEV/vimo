import { isTauri } from '@tauri-apps/api/core'

export function isNative(): boolean {
  return isTauri()
}
