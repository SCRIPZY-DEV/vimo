import type { MusicFormValue } from '@/modules/music/types/music'
import type { MusicGenerationParams } from '@pipeline/types/music.ts'

// Arma el payload del job desde el formulario.
export function musicFormToParams(
  value: MusicFormValue,
): MusicGenerationParams {
  return {
    prompt: value.prompt.trim(),
    instrumental: value.instrumental,
  }
}
