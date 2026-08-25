export const MAX_PROMPT_CHARS = 3000

export const MIN_PROMPT_CHARS = 12

export function isValidPrompt(prompt?: string): prompt is string {
  const trimmed = (prompt ?? '').trim()
  return trimmed.length >= MIN_PROMPT_CHARS && /[a-zA-Z]/.test(trimmed)
}
