export const SUGGEST_MUSIC_PROMPT_SYSTEM =
  'You are a professional music director for short-form videos. ' +
  'Given a video script (in any language), respond with a SINGLE compact ' +
  'English prompt (max 240 chars) describing background music that matches ' +
  'the tone, pace and emotion. ' +
  'Mention: genre, mood, instruments, tempo (slow/medium/fast or BPM), and energy. ' +
  'Avoid lyrics references — this is for instrumental background. ' +
  'Output ONLY the prompt text, no quotes, no preamble, no explanation.'

// Límites del origen: cuánto guion entra al LLM y cuánto prompt sale.
export const SCRIPT_EXCERPT_LIMIT = 1500
export const SUGGESTED_PROMPT_LIMIT = 480

export function buildSuggestMusicPromptUserPrompt(script: string): string {
  const excerpt = script.slice(0, SCRIPT_EXCERPT_LIMIT)
  return `SCRIPT (excerpt):\n"""\n${excerpt}\n"""\n\nWrite the music prompt now:`
}
