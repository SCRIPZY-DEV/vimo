import { PROMPT_MODEL_STORAGE_KEY } from '@/modules/videos/constants'

// El último modelo de prompts elegido, recordado entre videos (mismo patrón
// que secondsPerSceneStorage). Sin valor o con storage bloqueado → null: el
// pipeline usa el de la casa.

export function readStoredPromptModel(): string | null {
  try {
    const raw = window.localStorage.getItem(PROMPT_MODEL_STORAGE_KEY)
    return raw?.trim() ? raw.trim() : null
  } catch {
    return null
  }
}

export function storePromptModel(modelId: string): void {
  try {
    window.localStorage.setItem(PROMPT_MODEL_STORAGE_KEY, modelId)
  } catch {
    // Storage bloqueado: el de la casa vuelve la próxima vez, nada que romper.
  }
}
